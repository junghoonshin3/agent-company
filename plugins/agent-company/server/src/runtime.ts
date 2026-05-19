// tmux 기반 Agent Company의 파일 상태와 직원 세션을 관리한다.
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultCommandRunner, requireSuccessful } from "./command-runner.ts";
import {
  buildBootstrapPrompt,
  getRole,
  isTaskType,
  readTaskPlaybook,
  ROLE_DEFINITIONS,
  TASK_PLAYBOOK_PATH,
} from "./roles.ts";
import type {
  AppendDiscussionRoundInput,
  Board,
  CloseDiscussionInput,
  CollectResultInput,
  CommandResult,
  CommandRunner,
  CompanyConfig,
  CompanyStatus,
  DelegateTaskInput,
  DiscussionMetadata,
  DiscussionRecord,
  DiscussionRound,
  DiscussionRoundName,
  DiscussionStatus,
  MeetingMetadata,
  MeetingRecord,
  OfficeDashboardState,
  PeerMessageMetadata,
  PeerMessageRecord,
  RecordDecisionInput,
  RecordMeetingInput,
  RoleDefinition,
  RoleId,
  RoleState,
  SendPeerMessageInput,
  StartCompanyInput,
  StartDiscussionInput,
  TaskStatus,
  TaskStatusInput,
  TaskStatusResult,
  TaskRecord,
  TaskType,
  WaitForTaskInput,
} from "./types.ts";

const STATE_DIR_NAME = ".agent-company";
const WORKTREE_DIR_SUFFIX = "-agent-company-worktrees";
const OFFICE_STATE_DIR_NAME = "office";
const AUTO_START_ERROR_FILE = "auto-start-error.json";
const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(SOURCE_DIR, "../..");
const START_OFFICE_SCRIPT = path.join(PLUGIN_ROOT, "skills", "company", "scripts", "start-office.sh");
const STOP_OFFICE_SCRIPT = path.join(PLUGIN_ROOT, "skills", "company", "scripts", "stop-office.sh");

export class AgentCompanyRuntime {
  private runner: CommandRunner;

  constructor(runner: CommandRunner = new DefaultCommandRunner()) {
    this.runner = runner;
  }

  async startCompany(input: StartCompanyInput): Promise<CompanyConfig> {
    const projectPath = path.resolve(input.project_path);
    await assertDirectory(projectPath);

    const stateDir = path.join(projectPath, STATE_DIR_NAME);
    await ensureStateDirectories(stateDir);

    const sessionName = makeSessionName(projectPath);
    const worktreeRoot = await this.getWorktreeRoot(projectPath);
    await fs.mkdir(worktreeRoot, { recursive: true });

    const roleStates: Partial<Record<RoleId, RoleState>> = {};
    for (const role of ROLE_DEFINITIONS) {
      const worktreePath = await this.ensureRoleWorktree(projectPath, worktreeRoot, role);
      const inboxDir = path.join(stateDir, "inbox", role.id);
      await fs.mkdir(inboxDir, { recursive: true });
      roleStates[role.id] = {
        id: role.id,
        title: role.title,
        windowName: role.windowName,
        worktreePath,
        inboxDir,
        sandbox: role.sandbox,
      };
    }

    const config: CompanyConfig = {
      projectPath,
      stateDir,
      sessionName,
      worktreeRoot,
      roles: roleStates as Record<RoleId, RoleState>,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await writeJson(path.join(stateDir, "config.json"), config);
    await initializeBoard(stateDir);
    await initializeDecisions(stateDir);
    await this.startTmuxOffice(config);
    await this.startOfficeDashboard(config);
    return config;
  }

  async companyStatus(projectPathInput?: string): Promise<CompanyStatus> {
    const config = await this.loadConfig(projectPathInput);
    const board = await readBoard(config.stateDir);
    const recentMeetings = await readRecentMeetings(config.stateDir);
    const recentDiscussions = await readRecentDiscussions(config.stateDir);
    const recentPeerMessages = await readRecentPeerMessages(config.stateDir);
    const officeDashboard = await readOfficeDashboardState(config.stateDir);
    return {
      config,
      board,
      recentMeetings,
      recentDiscussions,
      recentPeerMessages,
      officeDashboard,
      tmuxSession: config.sessionName,
    };
  }

  async delegateTask(input: DelegateTaskInput, projectPathInput?: string): Promise<TaskRecord> {
    const role = getRole(input.role);
    const config = await this.loadConfig(projectPathInput);
    const taskType = normalizeTaskType(input.task_type, role);
    const id = `${dateStamp()}-${input.role}-${randomUUID().slice(0, 8)}`;
    const outboxDir = path.join(config.stateDir, "outbox", id);
    const inboxPath = path.join(config.stateDir, "inbox", role.id, `${id}.md`);
    const task: TaskRecord = {
      id,
      role: role.id,
      title: input.title,
      instructions: input.instructions,
      expectedOutput: input.expected_output,
      taskType,
      status: "delegated",
      inboxPath,
      outboxDir,
      resultPath: path.join(outboxDir, "result.md"),
      donePath: path.join(outboxDir, "done.json"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await fs.mkdir(path.dirname(inboxPath), { recursive: true });
    await fs.mkdir(outboxDir, { recursive: true });
    await fs.writeFile(inboxPath, await renderTaskFile(task, role), "utf8");
    await writeJson(path.join(config.stateDir, "tasks", `${id}.json`), task);
    await upsertBoardTask(config.stateDir, task);
    try {
      await this.sendTaskToRole(config, role, task);
    } catch (error) {
      await this.markTaskFailed(config.stateDir, task, [
        `Task dispatch failed before the worker acknowledged it: ${errorMessage(error)}`,
      ]);
      throw error;
    }
    return task;
  }

  async waitForTask(input: WaitForTaskInput, projectPathInput?: string): Promise<TaskRecord> {
    const config = await this.loadConfig(projectPathInput);
    const task = await this.loadTask(config.stateDir, input.task_id);
    const timeoutMs = normalizeWaitTimeoutMs(input.timeout_sec);
    const pollMs = waitPollIntervalMs(timeoutMs);
    const started = Date.now();

    while (Date.now() - started <= timeoutMs) {
      if (await exists(task.donePath)) {
        return await this.markTaskFromDone(config.stateDir, task);
      }
      await sleep(pollMs);
    }

    return await this.markTaskFailed(config.stateDir, task, [
      `wait_for_task timed out after ${formatTimeoutSeconds(timeoutMs)} waiting for done.json.`,
    ]);
  }

  async taskStatus(input: TaskStatusInput, projectPathInput?: string): Promise<TaskStatusResult> {
    const config = await this.loadConfig(projectPathInput);
    const task = await this.loadTask(config.stateDir, input.task_id);
    const previewChars = normalizePreviewChars(input.preview_chars);
    const resultExists = await exists(task.resultPath);
    const doneExists = await exists(task.donePath);
    const resultBytes = resultExists ? (await fs.stat(task.resultPath)).size : undefined;
    const doneBytes = doneExists ? (await fs.stat(task.donePath)).size : undefined;
    const result: TaskStatusResult = {
      task,
      computedStatus: task.status,
      files: {
        resultExists,
        doneExists,
        resultBytes,
        doneBytes,
      },
      resultPreviewTruncated: false,
    };

    if (doneExists) {
      const validation = await validateTaskCompletion(task);
      result.computedStatus = validation.computedStatus;
      result.done = validation.done;
      result.doneError = validation.doneError;
      result.summary = validation.summary;
      result.blockedNeeds = validation.blockedNeeds;
      result.validationErrors = nonEmptyErrors(validation.validationErrors);
    } else {
      result.validationErrors = nonEmptyErrors(task.validationErrors ?? []);
    }

    if (resultExists && previewChars > 0) {
      const content = await fs.readFile(task.resultPath, "utf8");
      result.resultPreview = content.slice(0, previewChars);
      result.resultPreviewTruncated = content.length > previewChars;
    }

    return result;
  }

  async collectResult(input: CollectResultInput, projectPathInput?: string): Promise<{
    task: TaskRecord;
    result: string;
    done: unknown;
  }> {
    const config = await this.loadConfig(projectPathInput);
    const task = await this.loadTask(config.stateDir, input.task_id);
    const refreshed = await this.markTaskFromDone(config.stateDir, task);
    const result = await readTextIfExists(refreshed.resultPath) ?? "";
    const done = await readDoneValue(refreshed.donePath);
    return { task: refreshed, result, done };
  }

  async recordDecision(input: RecordDecisionInput, projectPathInput?: string): Promise<{ path: string }> {
    const config = await this.loadConfig(projectPathInput);
    const decisionPath = path.join(config.stateDir, "decisions.md");
    const entry = [
      "",
      `## ${nowIso()} [${input.risk_level}]`,
      "",
      ...(input.discussion_id ? [`Discussion ID: ${input.discussion_id}`, ""] : []),
      `Summary: ${input.summary}`,
      "",
      `Rationale: ${input.rationale}`,
      "",
    ].join("\n");
    await fs.appendFile(decisionPath, entry, "utf8");
    return { path: decisionPath };
  }

  async recordMeeting(input: RecordMeetingInput, projectPathInput?: string): Promise<MeetingRecord> {
    const config = await this.loadConfig(projectPathInput);
    const title = requireNonEmpty(input.title, "title");
    const summary = requireNonEmpty(input.summary, "summary");
    const participants = normalizeParticipants(input.participants);
    const decisions = normalizeStringArray(input.decisions, "decisions");
    const openQuestions = normalizeStringArray(input.open_questions, "open_questions");
    const nextActions = normalizeStringArray(input.next_actions, "next_actions");
    const discussionId = normalizeOptionalId(input.discussion_id, "discussion_id");
    const createdAt = nowIso();
    const id = `${dateStamp()}-${slugify(title)}-${randomUUID().slice(0, 6)}`;
    const meetingPath = path.join(config.stateDir, "meetings", `${id}.md`);
    const record: MeetingRecord = {
      id,
      title,
      participants,
      summary,
      decisions,
      openQuestions,
      nextActions,
      discussionId,
      path: meetingPath,
      createdAt,
      updatedAt: createdAt,
    };

    await fs.mkdir(path.dirname(meetingPath), { recursive: true });
    await fs.writeFile(meetingPath, renderMeetingFile(record), "utf8");
    return record;
  }

  async startDiscussion(input: StartDiscussionInput, projectPathInput?: string): Promise<DiscussionRecord> {
    const config = await this.loadConfig(projectPathInput);
    const title = requireNonEmpty(input.title, "title");
    const question = requireNonEmpty(input.question, "question");
    const participants = normalizeParticipants(input.participants);
    const context = normalizeText(input.context, "context");
    const expectedDecision = requireNonEmpty(input.expected_decision, "expected_decision");
    const createdAt = nowIso();
    const id = `${dateStamp()}-${slugify(title, "discussion")}-${randomUUID().slice(0, 6)}`;
    const discussionDir = path.join(config.stateDir, "discussions", id);
    const roundsDir = path.join(discussionDir, "rounds");
    const record: DiscussionRecord = {
      id,
      title,
      question,
      participants,
      context,
      expectedDecision,
      status: "opened",
      rounds: [],
      path: path.join(discussionDir, "discussion.json"),
      roundsDir,
      createdAt,
      updatedAt: createdAt,
    };

    await fs.mkdir(roundsDir, { recursive: true });
    await writeJson(record.path, record);
    return record;
  }

  async appendDiscussionRound(
    input: AppendDiscussionRoundInput,
    projectPathInput?: string,
  ): Promise<DiscussionRecord> {
    const config = await this.loadConfig(projectPathInput);
    const discussionId = requireNonEmpty(input.discussion_id, "discussion_id");
    const record = await this.loadDiscussion(config.stateDir, discussionId);
    if (record.status === "closed") {
      throw new Error(`Discussion ${discussionId} is already closed`);
    }

    const round = normalizeDiscussionRound(input.round);
    assertNextDiscussionRound(record, round);
    const summary = requireNonEmpty(input.summary, "summary");
    const taskIds = normalizeStringArray(input.task_ids, "task_ids");
    const roundRecord: DiscussionRound = {
      round,
      taskIds,
      summary,
      path: path.join(record.roundsDir, `${round}.md`),
      createdAt: nowIso(),
    };
    const updated: DiscussionRecord = {
      ...record,
      status: round,
      rounds: [...record.rounds, roundRecord],
      updatedAt: nowIso(),
    };

    await fs.mkdir(record.roundsDir, { recursive: true });
    await fs.writeFile(roundRecord.path, renderDiscussionRoundFile(updated, roundRecord), "utf8");
    await writeJson(updated.path, updated);
    return updated;
  }

  async closeDiscussion(input: CloseDiscussionInput, projectPathInput?: string): Promise<DiscussionRecord> {
    const config = await this.loadConfig(projectPathInput);
    const discussionId = requireNonEmpty(input.discussion_id, "discussion_id");
    const record = await this.loadDiscussion(config.stateDir, discussionId);
    if (record.status === "closed") {
      throw new Error(`Discussion ${discussionId} is already closed`);
    }
    if (record.status !== "round3") {
      throw new Error(`Discussion ${discussionId} must reach round3 before closing`);
    }

    const closedAt = nowIso();
    const updated: DiscussionRecord = {
      ...record,
      status: "closed",
      conclusion: requireNonEmpty(input.conclusion, "conclusion"),
      agreements: normalizeStringArray(input.agreements, "agreements"),
      disagreements: normalizeStringArray(input.disagreements, "disagreements"),
      decision: requireNonEmpty(input.decision, "decision"),
      nextActions: normalizeStringArray(input.next_actions, "next_actions"),
      meetingId: normalizeOptionalId(input.meeting_id, "meeting_id"),
      decisionId: normalizeOptionalId(input.decision_id, "decision_id"),
      closedAt,
      updatedAt: closedAt,
    };

    await writeJson(updated.path, updated);
    return updated;
  }

  async sendPeerMessage(input: SendPeerMessageInput, projectPathInput?: string): Promise<PeerMessageRecord> {
    const config = await this.loadConfig(projectPathInput);
    const fromRole = getRole(input.from_role);
    const toRole = getRole(input.to_role);
    if (fromRole.id === toRole.id) {
      throw new Error("from_role and to_role must be different");
    }

    const title = requireNonEmpty(input.title, "title");
    const message = requireNonEmpty(input.message, "message");
    const discussionId = normalizeOptionalId(input.discussion_id, "discussion_id");
    const taskId = normalizeOptionalId(input.task_id, "task_id");
    const inReplyTo = normalizeOptionalId(input.in_reply_to, "in_reply_to");
    const createdAt = nowIso();
    const id = `${dateStamp()}-${fromRole.id}-to-${toRole.id}-${randomUUID().slice(0, 6)}`;
    const messageDir = path.join(config.stateDir, "messages");
    const markdownPath = path.join(messageDir, `${id}.md`);
    const inboxPath = path.join(config.stateDir, "inbox", toRole.id, `${id}.peer.md`);
    const record: PeerMessageRecord = {
      id,
      fromRole: fromRole.id,
      toRole: toRole.id,
      title,
      message,
      discussionId,
      taskId,
      inReplyTo,
      path: path.join(messageDir, `${id}.json`),
      markdownPath,
      inboxPath,
      createdAt,
    };

    const rendered = renderPeerMessageFile(record, fromRole, toRole);
    await fs.mkdir(messageDir, { recursive: true });
    await fs.mkdir(path.dirname(inboxPath), { recursive: true });
    await writeJson(record.path, record);
    await fs.writeFile(markdownPath, rendered, "utf8");
    await fs.writeFile(inboxPath, rendered, "utf8");
    await this.sendPeerMessageToRole(config, fromRole, toRole, record);
    return record;
  }

  async stopCompany(projectPathInput?: string): Promise<{ sessionName: string; stopped: boolean }> {
    const config = await this.loadConfig(projectPathInput);
    await this.stopOfficeDashboard(config);
    const result = await this.runner.run("tmux", ["has-session", "-t", config.sessionName]);
    if (result.code !== 0) {
      return { sessionName: config.sessionName, stopped: false };
    }
    await requireSuccessful(this.runner, "tmux", ["kill-session", "-t", config.sessionName]);
    return { sessionName: config.sessionName, stopped: true };
  }

  private async startOfficeDashboard(config: CompanyConfig): Promise<void> {
    const paths = officeDashboardPaths(config.stateDir);
    await fs.mkdir(paths.dir, { recursive: true });
    await fs.rm(paths.errorPath, { force: true });

    const args = ["--project-dir", config.projectPath, "--host", "127.0.0.1", "--port", "auto"];
    let result: CommandResult;
    try {
      result = await this.runner.run(START_OFFICE_SCRIPT, args);
    } catch (error) {
      await writeJson(paths.errorPath, {
        status: "failed",
        command: START_OFFICE_SCRIPT,
        args,
        error: errorMessage(error),
        createdAt: nowIso(),
      });
      return;
    }

    if (result.code === 0) {
      return;
    }

    await writeJson(paths.errorPath, {
      status: "failed",
      command: START_OFFICE_SCRIPT,
      args,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`,
      createdAt: nowIso(),
    });
  }

  private async stopOfficeDashboard(config: CompanyConfig): Promise<void> {
    const paths = officeDashboardPaths(config.stateDir);
    const args = ["--project-dir", config.projectPath];
    let result: CommandResult;
    try {
      result = await this.runner.run(STOP_OFFICE_SCRIPT, args);
    } catch (error) {
      await writeJson(paths.errorPath, {
        status: "failed",
        command: STOP_OFFICE_SCRIPT,
        args,
        error: errorMessage(error),
        createdAt: nowIso(),
      });
      return;
    }

    if (result.code === 0) {
      return;
    }

    await writeJson(paths.errorPath, {
      status: "failed",
      command: STOP_OFFICE_SCRIPT,
      args,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`,
      createdAt: nowIso(),
    });
  }

  private async loadConfig(projectPathInput?: string): Promise<CompanyConfig> {
    const projectPath = path.resolve(projectPathInput ?? process.cwd());
    const configPath = path.join(projectPath, STATE_DIR_NAME, "config.json");
    return JSON.parse(await fs.readFile(configPath, "utf8"));
  }

  private async loadTask(stateDir: string, taskId: string): Promise<TaskRecord> {
    return JSON.parse(await fs.readFile(path.join(stateDir, "tasks", `${taskId}.json`), "utf8"));
  }

  private async loadDiscussion(stateDir: string, discussionId: string): Promise<DiscussionRecord> {
    const discussionPath = path.join(stateDir, "discussions", discussionId, "discussion.json");
    if (!(await exists(discussionPath))) {
      throw new Error(`Discussion ${discussionId} does not exist`);
    }
    return JSON.parse(await fs.readFile(discussionPath, "utf8"));
  }

  private async markTaskFromDone(stateDir: string, task: TaskRecord): Promise<TaskRecord> {
    if (!(await exists(task.donePath))) {
      throw new Error(`Task ${task.id} has no done.json yet`);
    }
    const validation = await validateTaskCompletion(task);
    const refreshed: TaskRecord = {
      ...task,
      status: validation.computedStatus,
      completedAt: task.completedAt ?? nowIso(),
      updatedAt: nowIso(),
      validationErrors: nonEmptyErrors(validation.validationErrors),
    };
    await writeJson(path.join(stateDir, "tasks", `${task.id}.json`), refreshed);
    await upsertBoardTask(stateDir, refreshed);
    return refreshed;
  }

  private async markTaskFailed(
    stateDir: string,
    task: TaskRecord,
    validationErrors: string[],
  ): Promise<TaskRecord> {
    const refreshed: TaskRecord = {
      ...task,
      status: "failed",
      completedAt: task.completedAt ?? nowIso(),
      updatedAt: nowIso(),
      validationErrors,
    };
    await writeJson(path.join(stateDir, "tasks", `${task.id}.json`), refreshed);
    await upsertBoardTask(stateDir, refreshed);
    return refreshed;
  }

  private async getWorktreeRoot(projectPath: string): Promise<string> {
    const repoName = path.basename(projectPath);
    return path.resolve(projectPath, "..", `.${repoName}${WORKTREE_DIR_SUFFIX}`);
  }

  private async ensureRoleWorktree(
    projectPath: string,
    worktreeRoot: string,
    role: RoleDefinition,
  ): Promise<string> {
    const worktreePath = path.join(worktreeRoot, role.id);
    if (await exists(path.join(worktreePath, ".git"))) {
      return worktreePath;
    }

    const branch = `agent-company/${role.id}`;
    const result = await this.runner.run(
      "git",
      ["-C", projectPath, "worktree", "add", "-B", branch, worktreePath],
    );

    if (result.code === 0) {
      return worktreePath;
    }

    const isGit = await this.runner.run("git", ["-C", projectPath, "rev-parse", "--is-inside-work-tree"]);
    if (isGit.code !== 0) {
      return projectPath;
    }

    throw new Error(result.stderr.trim() || `Could not create worktree for ${role.id}`);
  }

  private async startTmuxOffice(config: CompanyConfig): Promise<void> {
    const hasSession = await this.runner.run("tmux", ["has-session", "-t", config.sessionName]);
    if (hasSession.code === 0) {
      return;
    }

    const firstRole = ROLE_DEFINITIONS[0];
    await requireSuccessful(this.runner, "tmux", [
      "new-session",
      "-d",
      "-s",
      config.sessionName,
      "-n",
      firstRole.windowName,
      await this.codexCommandForRole(firstRole, config),
    ]);

    for (const role of ROLE_DEFINITIONS.slice(1)) {
      await requireSuccessful(this.runner, "tmux", [
        "new-window",
        "-t",
        config.sessionName,
        "-n",
        role.windowName,
        await this.codexCommandForRole(role, config),
      ]);
    }
  }

  private async codexCommandForRole(role: RoleDefinition, config: CompanyConfig): Promise<string> {
    const roleState = config.roles[role.id];
    const args = [
      "codex",
      "--cd",
      shellQuote(roleState.worktreePath),
      "--sandbox",
      role.sandbox,
      "--add-dir",
      shellQuote(config.stateDir),
      "--ask-for-approval",
      role.approvalPolicy,
      "--no-alt-screen",
    ];
    if (role.useSearch) {
      args.push("--search");
    }
    args.push(shellQuote(await buildBootstrapPrompt(role, config.stateDir, config.projectPath)));
    return args.join(" ");
  }

  private async sendTaskToRole(config: CompanyConfig, role: RoleDefinition, task: TaskRecord): Promise<void> {
    const target = `${config.sessionName}:${role.windowName}`;
    const message = [
      `작업 배정: ${task.title}`,
      `작업 파일: ${task.inboxPath}`,
      `결과 위치: ${task.outboxDir}`,
      "작업 파일을 읽고 완료 시 result.md와 done.json을 작성하세요.",
      "역할 경계 밖 소스 수정은 하지 마세요.",
    ].join("\n");
    const bufferName = `agent-company-${task.id}`;
    await requireSuccessful(this.runner, "tmux", ["set-buffer", "-b", bufferName, message]);
    await requireSuccessful(this.runner, "tmux", ["paste-buffer", "-t", target, "-b", bufferName]);
    await requireSuccessful(this.runner, "tmux", ["send-keys", "-t", target, "Enter"]);
  }

  private async sendPeerMessageToRole(
    config: CompanyConfig,
    fromRole: RoleDefinition,
    toRole: RoleDefinition,
    message: PeerMessageRecord,
  ): Promise<void> {
    const target = `${config.sessionName}:${toRole.windowName}`;
    const notice = [
      `동료 메시지: ${message.title}`,
      `보낸 역할: ${fromRole.title} (${fromRole.id})`,
      `메시지 파일: ${message.inboxPath}`,
      ...(message.discussionId ? [`Discussion ID: ${message.discussionId}`] : []),
      ...(message.taskId ? [`Task ID: ${message.taskId}`] : []),
      ...(message.inReplyTo ? [`In Reply To: ${message.inReplyTo}`] : []),
      "메시지 파일을 읽고 필요하면 companyctl peer-message로 답장하세요.",
    ].join("\n");
    const bufferName = `agent-company-peer-${message.id}`;
    await requireSuccessful(this.runner, "tmux", ["set-buffer", "-b", bufferName, notice]);
    await requireSuccessful(this.runner, "tmux", ["paste-buffer", "-t", target, "-b", bufferName]);
    await requireSuccessful(this.runner, "tmux", ["send-keys", "-t", target, "Enter"]);
  }
}

async function assertDirectory(dir: string): Promise<void> {
  const stat = await fs.stat(dir);
  if (!stat.isDirectory()) {
    throw new Error(`${dir} is not a directory`);
  }
}

async function ensureStateDirectories(stateDir: string): Promise<void> {
  for (const child of ["tasks", "inbox", "outbox", "logs", "meetings", "discussions", "messages"]) {
    await fs.mkdir(path.join(stateDir, child), { recursive: true });
  }
}

async function initializeBoard(stateDir: string): Promise<void> {
  const boardPath = path.join(stateDir, "board.json");
  if (!(await exists(boardPath))) {
    await writeJson(boardPath, { tasks: [], updatedAt: nowIso() });
  }
}

async function initializeDecisions(stateDir: string): Promise<void> {
  const decisionPath = path.join(stateDir, "decisions.md");
  if (!(await exists(decisionPath))) {
    await fs.writeFile(decisionPath, "# Agent Company Decisions\n", "utf8");
  }
}

async function readBoard(stateDir: string): Promise<Board> {
  return JSON.parse(await fs.readFile(path.join(stateDir, "board.json"), "utf8"));
}

async function readRecentMeetings(stateDir: string): Promise<MeetingMetadata[]> {
  const meetingsDir = path.join(stateDir, "meetings");
  if (!(await exists(meetingsDir))) {
    return [];
  }

  const entries = await fs.readdir(meetingsDir, { withFileTypes: true });
  const meetings = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => readMeetingMetadata(path.join(meetingsDir, entry.name))),
  );

  return meetings
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
}

async function readMeetingMetadata(filePath: string): Promise<MeetingMetadata> {
  const content = await fs.readFile(filePath, "utf8");
  const stat = await fs.stat(filePath);
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(filePath, ".md");
  const createdAt = content.match(/^Created:\s+(.+)$/m)?.[1]?.trim() || stat.mtime.toISOString();
  const discussionId = content.match(/^Discussion ID:\s+(.+)$/m)?.[1]?.trim();
  const participants = (content.match(/^Participants:\s+(.+)$/m)?.[1] ?? "")
    .split(",")
    .map((participant) => participant.trim())
    .filter((participant): participant is RoleId => isRoleIdValue(participant));

  return {
    id: path.basename(filePath, ".md"),
    title,
    participants,
    discussionId,
    path: filePath,
    createdAt,
  };
}

async function readRecentDiscussions(stateDir: string): Promise<DiscussionMetadata[]> {
  const discussionsDir = path.join(stateDir, "discussions");
  if (!(await exists(discussionsDir))) {
    return [];
  }

  const entries = await fs.readdir(discussionsDir, { withFileTypes: true });
  const discussions = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const record = JSON.parse(
          await fs.readFile(path.join(discussionsDir, entry.name, "discussion.json"), "utf8"),
        ) as DiscussionRecord;
        return {
          id: record.id,
          title: record.title,
          question: record.question,
          participants: record.participants,
          status: record.status,
          path: record.path,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };
      }),
  );

  return discussions
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
}

async function readRecentPeerMessages(stateDir: string): Promise<PeerMessageMetadata[]> {
  const messagesDir = path.join(stateDir, "messages");
  if (!(await exists(messagesDir))) {
    return [];
  }

  const entries = await fs.readdir(messagesDir, { withFileTypes: true });
  const messages = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const record = JSON.parse(
          await fs.readFile(path.join(messagesDir, entry.name), "utf8"),
        ) as PeerMessageRecord;
        return {
          id: record.id,
          fromRole: record.fromRole,
          toRole: record.toRole,
          title: record.title,
          discussionId: record.discussionId,
          taskId: record.taskId,
          inReplyTo: record.inReplyTo,
          path: record.path,
          markdownPath: record.markdownPath,
          inboxPath: record.inboxPath,
          createdAt: record.createdAt,
        };
      }),
  );

  return messages
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
}

async function readOfficeDashboardState(stateDir: string): Promise<OfficeDashboardState> {
  const paths = officeDashboardPaths(stateDir);
  const [info, errorRecord, pid] = await Promise.all([
    readJsonIfExists(paths.infoPath),
    readJsonIfExists(paths.errorPath),
    readPidIfExists(paths.pidPath),
  ]);

  if (pid && isProcessRunning(pid)) {
    return {
      status: "running",
      infoPath: paths.infoPath,
      logPath: paths.logPath,
      pidPath: paths.pidPath,
      errorPath: paths.errorPath,
      pid,
      ...(readString(info?.url) ? { url: readString(info?.url) } : {}),
      ...networkUrlsFromInfo(info),
    };
  }

  if (isRecord(errorRecord)) {
    return {
      status: "failed",
      infoPath: paths.infoPath,
      logPath: paths.logPath,
      pidPath: paths.pidPath,
      errorPath: paths.errorPath,
      ...(pid ? { pid } : {}),
      ...(readString(info?.url) ? { url: readString(info?.url) } : {}),
      ...networkUrlsFromInfo(info),
      error: readString(errorRecord.error) ?? readString(errorRecord.stderr) ?? "Agent Company office failed to start.",
    };
  }

  if (pid || info) {
    return {
      status: "unknown",
      infoPath: paths.infoPath,
      logPath: paths.logPath,
      pidPath: paths.pidPath,
      errorPath: paths.errorPath,
      ...(pid ? { pid } : {}),
      ...(readString(info?.url) ? { url: readString(info?.url) } : {}),
      ...networkUrlsFromInfo(info),
      error: "Agent Company office state files exist, but the server process is not running.",
    };
  }

  return {
    status: "stopped",
    infoPath: paths.infoPath,
    logPath: paths.logPath,
    pidPath: paths.pidPath,
    errorPath: paths.errorPath,
  };
}

function officeDashboardPaths(stateDir: string) {
  const dir = path.join(stateDir, OFFICE_STATE_DIR_NAME);
  return {
    dir,
    infoPath: path.join(dir, "server-info.json"),
    logPath: path.join(dir, "server.log"),
    pidPath: path.join(dir, "server.pid"),
    errorPath: path.join(dir, AUTO_START_ERROR_FILE),
  };
}

function networkUrlsFromInfo(info: unknown): { networkUrls?: string[] } {
  if (!isRecord(info) || !Array.isArray(info.networkUrls)) {
    return {};
  }

  const networkUrls = info.networkUrls
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item));
  return networkUrls.length > 0 ? { networkUrls } : {};
}

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown> | undefined> {
  if (!(await exists(filePath))) {
    return undefined;
  }

  const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  return isRecord(parsed) ? parsed : undefined;
}

async function readPidIfExists(filePath: string): Promise<number | undefined> {
  if (!(await exists(filePath))) {
    return undefined;
  }

  const value = Number((await fs.readFile(filePath, "utf8")).trim());
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function upsertBoardTask(stateDir: string, task: TaskRecord): Promise<void> {
  const board = await readBoard(stateDir);
  const nextTasks = board.tasks.filter((candidate) => candidate.id !== task.id);
  nextTasks.push(task);
  await writeJson(path.join(stateDir, "board.json"), {
    tasks: nextTasks,
    updatedAt: nowIso(),
  });
}

async function renderTaskFile(task: TaskRecord, role: RoleDefinition): Promise<string> {
  const taskType = task.taskType ?? role.defaultTaskType;
  const playbook = await readTaskPlaybook(taskType);
  return [
    `# ${task.title}`,
    "",
    `Task ID: ${task.id}`,
    `Role: ${role.title} (${role.id})`,
    `Task Type: ${taskType}`,
    `Role Reference: ${role.referencePath}`,
    `Applicable Playbook: ${TASK_PLAYBOOK_PATH}#${taskType}`,
    `Created: ${task.createdAt}`,
    "",
    "## Instructions",
    "",
    task.instructions,
    "",
    "## Expected Output",
    "",
    task.expectedOutput,
    "",
    "## Applicable Playbook",
    "",
    playbook,
    "",
    "## Completion Contract",
    "",
    `- Write the main result to ${task.resultPath}.`,
    `- Write completion metadata to ${task.donePath}.`,
    "- done.json must be an object with status `completed`, `blocked`, or `failed`.",
    "- summary must always be non-empty.",
    "- If blocked by approval or ambiguity, use {\"status\":\"blocked\",\"summary\":\"...\",\"needs\":\"...\"}.",
    `- completed result.md must include these headings: ${role.requiredResultHeadings.join(", ")}.`,
    "- Do not deploy, push, delete user work, publish externally, or incur cost without explicit user approval.",
    "",
  ].join("\n");
}

type DoneStatus = "completed" | "blocked" | "failed";

interface CompletionValidation {
  computedStatus: TaskStatus;
  validationErrors: string[];
  done?: unknown;
  doneError?: string;
  summary?: string;
  blockedNeeds?: string;
}

function normalizeTaskType(value: unknown, role: RoleDefinition): TaskType {
  if (value === undefined) {
    return role.defaultTaskType;
  }
  if (typeof value === "string" && isTaskType(value)) {
    return value;
  }
  throw new Error(`Unknown task_type: ${String(value)}`);
}

async function validateTaskCompletion(task: TaskRecord): Promise<CompletionValidation> {
  const validationErrors: string[] = [];
  const result = await readTextIfExists(task.resultPath);
  if (result === undefined) {
    validationErrors.push("result.md is required.");
  } else if (result.trim().length === 0) {
    validationErrors.push("result.md must not be empty.");
  }

  const parsedDone = await parseDoneFile(task.donePath);
  if (parsedDone.doneError) {
    validationErrors.push(`done.json must be valid JSON: ${parsedDone.doneError}`);
    return {
      computedStatus: "failed",
      validationErrors,
      done: parsedDone.done,
      doneError: parsedDone.doneError,
    };
  }

  const done = parsedDone.done;
  if (!isRecord(done)) {
    validationErrors.push("done.json must be a JSON object.");
    return { computedStatus: "failed", validationErrors, done };
  }

  const status = done.status;
  if (!isDoneStatusValue(status)) {
    validationErrors.push("done.json status must be one of completed, blocked, failed.");
  }

  const summary = typeof done.summary === "string" ? done.summary.trim() : "";
  if (summary.length === 0) {
    validationErrors.push("done.json summary must not be empty.");
  }

  const blockedNeeds = typeof done.needs === "string" ? done.needs.trim() : "";
  if (status === "blocked" && blockedNeeds.length === 0) {
    validationErrors.push("blocked done.json must include non-empty needs.");
  }

  if (status === "completed" && result !== undefined && result.trim().length > 0) {
    const role = getRole(task.role);
    for (const heading of role.requiredResultHeadings) {
      if (!hasMarkdownHeading(result, heading)) {
        validationErrors.push(`result.md missing required heading: ${heading}`);
      }
    }
  }

  return {
    computedStatus: validationErrors.length === 0 && isDoneStatusValue(status) ? status : "failed",
    validationErrors,
    done,
    summary: summary || undefined,
    blockedNeeds: blockedNeeds || undefined,
  };
}

async function parseDoneFile(donePath: string): Promise<{ done?: unknown; doneError?: string }> {
  const raw = await fs.readFile(donePath, "utf8");
  try {
    return { done: JSON.parse(raw) };
  } catch (error) {
    return { done: raw, doneError: error instanceof Error ? error.message : String(error) };
  }
}

async function readDoneValue(donePath: string): Promise<unknown> {
  const parsed = await parseDoneFile(donePath);
  return parsed.done;
}

async function readTextIfExists(filePath: string): Promise<string | undefined> {
  if (!(await exists(filePath))) {
    return undefined;
  }
  return fs.readFile(filePath, "utf8");
}

function nonEmptyErrors(errors: string[]): string[] | undefined {
  return errors.length > 0 ? errors : undefined;
}

function hasMarkdownHeading(content: string, heading: string): boolean {
  const pattern = new RegExp(`^${escapeRegex(heading)}(?:\\s+#+)?\\s*$`, "m");
  return pattern.test(content);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderMeetingFile(record: MeetingRecord): string {
  return [
    `# ${record.title}`,
    "",
    `Meeting ID: ${record.id}`,
    ...(record.discussionId ? [`Discussion ID: ${record.discussionId}`] : []),
    `Created: ${record.createdAt}`,
    `Participants: ${record.participants.join(", ")}`,
    "",
    "## Summary",
    "",
    record.summary,
    "",
    "## Decisions",
    "",
    renderList(record.decisions),
    "",
    "## Open Questions",
    "",
    renderList(record.openQuestions),
    "",
    "## Next Actions",
    "",
    renderList(record.nextActions),
    "",
  ].join("\n");
}

function renderDiscussionRoundFile(record: DiscussionRecord, round: DiscussionRound): string {
  return [
    `# ${record.title} ${round.round}`,
    "",
    `Discussion ID: ${record.id}`,
    `Round: ${round.round}`,
    `Created: ${round.createdAt}`,
    `Task IDs: ${round.taskIds.join(", ") || "None"}`,
    "",
    "## Question",
    "",
    record.question,
    "",
    "## Summary",
    "",
    round.summary,
    "",
  ].join("\n");
}

function renderPeerMessageFile(
  record: PeerMessageRecord,
  fromRole: RoleDefinition,
  toRole: RoleDefinition,
): string {
  return [
    `# ${record.title}`,
    "",
    `Message ID: ${record.id}`,
    `From: ${fromRole.title} (${fromRole.id})`,
    `To: ${toRole.title} (${toRole.id})`,
    `Created: ${record.createdAt}`,
    ...(record.discussionId ? [`Discussion ID: ${record.discussionId}`] : []),
    ...(record.taskId ? [`Task ID: ${record.taskId}`] : []),
    ...(record.inReplyTo ? [`In Reply To: ${record.inReplyTo}`] : []),
    "",
    "## Message",
    "",
    record.message,
    "",
  ].join("\n");
}

function renderList(items: string[]): string {
  if (items.length === 0) {
    return "- None";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function makeSessionName(projectPath: string): string {
  const hash = createHash("sha1").update(projectPath).digest("hex").slice(0, 8);
  const safeName = path.basename(projectPath).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32);
  return `agent-company-${safeName}-${hash}`;
}

function dateStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function slugify(value: string, fallback = "meeting"): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function requireNonEmpty(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function normalizeParticipants(value: unknown): RoleId[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("participants must include at least one role");
  }
  return value.map((participant) => {
    if (typeof participant !== "string" || !isRoleIdValue(participant)) {
      throw new Error(`Unknown participant role: ${String(participant)}`);
    }
    return participant;
  });
}

function normalizeText(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value.trim();
}

function normalizeStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  return value.map((item) => requireNonEmpty(item, name));
}

function normalizeOptionalId(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireNonEmpty(value, name);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function normalizeDiscussionRound(value: unknown): DiscussionRoundName {
  if (value === 1 || value === "1" || value === "round1") {
    return "round1";
  }
  if (value === 2 || value === "2" || value === "round2") {
    return "round2";
  }
  if (value === 3 || value === "3" || value === "round3") {
    return "round3";
  }
  throw new Error("round must be one of 1, 2, 3, round1, round2, round3");
}

function assertNextDiscussionRound(record: DiscussionRecord, round: DiscussionRoundName): void {
  const nextRoundByStatus: Record<DiscussionStatus, DiscussionRoundName | undefined> = {
    opened: "round1",
    round1: "round2",
    round2: "round3",
    round3: undefined,
    closed: undefined,
  };
  const expected = nextRoundByStatus[record.status];
  if (expected !== round) {
    throw new Error(`Discussion ${record.id} expected next round ${expected ?? "none"}, got ${round}`);
  }
}

function isRoleIdValue(value: string): value is RoleId {
  return ROLE_DEFINITIONS.some((role) => role.id === value);
}

function isDoneStatusValue(value: unknown): value is DoneStatus {
  return value === "completed" ||
    value === "blocked" ||
    value === "failed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePreviewChars(value: unknown): number {
  if (value === undefined) {
    return 1200;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("preview_chars must be a non-negative number");
  }
  return Math.min(Math.trunc(value), 20000);
}

function normalizeWaitTimeoutMs(value: unknown): number {
  if (value === undefined) {
    return 300_000;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("timeout_sec must be a positive number");
  }
  return Math.max(1, Math.ceil(value * 1000));
}

function waitPollIntervalMs(timeoutMs: number): number {
  return Math.min(1000, Math.max(25, Math.floor(timeoutMs / 10)));
}

function formatTimeoutSeconds(timeoutMs: number): string {
  const seconds = timeoutMs / 1000;
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(3)}s`;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
