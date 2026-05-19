// Agent Company 런타임을 실제 tmux 없이 검증한다.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { ROLE_DEFINITIONS } from "../src/roles.ts";
import { AgentCompanyRuntime } from "../src/runtime.ts";
import type { CommandResult, CommandRunner } from "../src/types.ts";

const execFileAsync = promisify(execFile);

const ROLE_REFERENCE_SNIPPETS: Record<string, string> = {
  "service-planner": "사용자의 모호한 목표를 실행 가능한 제품 문제",
  "researcher": "시장, 사용자, 경쟁 제품, 기술 선택지를 근거 중심으로 조사",
  "ui-ux-designer": "구현자가 바로 화면을 만들 수 있게 한다",
  "architect": "시스템 구조, 모듈 경계, 데이터 흐름, 구현 순서",
  "fullstack-developer": "대표가 승인한 범위의 구현을 맡고",
  "qa-engineer": "품질 판단을 돕는다",
  "release-manager": "릴리즈 노트, 배포 전 체크리스트, 롤백 방법",
  "knowledge-manager": "재개 가능한 형태로 정리한다",
};

class FakeRunner implements CommandRunner {
  calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
  hasSession = false;
  failOfficeStart = false;
  failOfficeStop = false;
  failTmuxPaste = false;
  throwOfficeStart = false;
  throwOfficeStop = false;

  async run(command: string, args: string[], options: { cwd?: string } = {}): Promise<CommandResult> {
    this.calls.push({ command, args, cwd: options.cwd });

    if (command.endsWith("start-office.sh")) {
      if (this.throwOfficeStart) {
        throw new Error("office start script could not be spawned");
      }
      return this.failOfficeStart
        ? fail("office failed to start")
        : ok("Agent Company office running at http://127.0.0.1:49152/\n");
    }

    if (command.endsWith("stop-office.sh")) {
      if (this.throwOfficeStop) {
        throw new Error("office stop script could not be spawned");
      }
      return this.failOfficeStop
        ? fail("office failed to stop")
        : ok("Stopped Agent Company office server pid 123.\n");
    }

    if (command === "git" && args.includes("worktree") && args.includes("add")) {
      const worktreePath = args[args.length - 1];
      await mkdir(worktreePath, { recursive: true });
      await writeFile(path.join(worktreePath, ".git"), "gitdir: fake\n", "utf8");
      return ok();
    }

    if (command === "git" && args.includes("rev-parse")) {
      return ok("true\n");
    }

    if (command === "tmux" && args[0] === "has-session") {
      return this.hasSession ? ok() : fail("no session");
    }

    if (command === "tmux" && args[0] === "new-session") {
      this.hasSession = true;
      return ok();
    }

    if (command === "tmux" && args[0] === "kill-session") {
      this.hasSession = false;
      return ok();
    }

    if (command === "tmux") {
      if (this.failTmuxPaste && args[0] === "paste-buffer") {
        return fail("target pane did not accept pasted task");
      }
      return ok();
    }

    return ok();
  }
}

test("startCompany creates state, worktrees, and tmux windows", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);

  const config = await runtime.startCompany({ project_path: dir });

  assert.equal(config.projectPath, dir);
  assert.equal(Object.keys(config.roles).length, 8);
  assert.ok(config.sessionName.startsWith("agent-company-"));
  assert.ok(runner.calls.some((call) => call.command === "tmux" && call.args[0] === "new-session"));
  assert.ok(runner.calls.some((call) => call.command === "tmux" && call.args[0] === "new-window"));
  assert.ok(runner.calls.some((call) =>
    call.command.endsWith("start-office.sh") &&
    call.args.includes("--project-dir") &&
    call.args.includes(dir)
  ));

  const board = JSON.parse(await readFile(path.join(dir, ".agent-company", "board.json"), "utf8"));
  assert.deepEqual(board.tasks, []);

  await cleanup(dir);
});

test("startCompany records dashboard startup failure without blocking company startup", async () => {
  const { dir, runner } = await makeRuntime();
  runner.failOfficeStart = true;
  const runtime = new AgentCompanyRuntime(runner);

  const config = await runtime.startCompany({ project_path: dir });

  assert.equal(config.projectPath, dir);
  assert.ok(runner.calls.some((call) => call.command.endsWith("start-office.sh")));
  const errorPath = path.join(dir, ".agent-company", "office", "auto-start-error.json");
  const errorRecord = JSON.parse(await readFile(errorPath, "utf8"));
  assert.equal(errorRecord.status, "failed");
  assert.match(errorRecord.error, /office failed to start/);

  const status = await runtime.companyStatus(dir);
  assert.equal(status.officeDashboard.status, "failed");
  assert.match(status.officeDashboard.error ?? "", /office failed to start/);

  await cleanup(dir);
});

test("startCompany records dashboard startup exceptions without blocking company startup", async () => {
  const { dir, runner } = await makeRuntime();
  runner.throwOfficeStart = true;
  const runtime = new AgentCompanyRuntime(runner);

  const config = await runtime.startCompany({ project_path: dir });

  assert.equal(config.projectPath, dir);
  const errorPath = path.join(dir, ".agent-company", "office", "auto-start-error.json");
  const errorRecord = JSON.parse(await readFile(errorPath, "utf8"));
  assert.equal(errorRecord.status, "failed");
  assert.match(errorRecord.error, /could not be spawned/);

  const status = await runtime.companyStatus(dir);
  assert.equal(status.officeDashboard.status, "failed");
  assert.match(status.officeDashboard.error ?? "", /could not be spawned/);

  await cleanup(dir);
});

test("companyStatus reports running office dashboard metadata", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  const officeDir = path.join(dir, ".agent-company", "office");
  await writeFile(path.join(officeDir, "server.pid"), `${process.pid}\n`, "utf8");
  await writeFile(path.join(officeDir, "server-info.json"), `${JSON.stringify({
    url: "http://127.0.0.1:49152/",
    networkUrls: ["http://192.168.0.26:49152/"],
    pid: process.pid,
  }, null, 2)}\n`, "utf8");

  const status = await runtime.companyStatus(dir);

  assert.equal(status.officeDashboard.status, "running");
  assert.equal(status.officeDashboard.url, "http://127.0.0.1:49152/");
  assert.deepEqual(status.officeDashboard.networkUrls, ["http://192.168.0.26:49152/"]);
  assert.equal(status.officeDashboard.pid, process.pid);
  assert.ok(status.officeDashboard.logPath.endsWith("server.log"));

  await cleanup(dir);
});

test("startCompany bootstraps each worker with only its role reference and shared contracts", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);

  await runtime.startCompany({ project_path: dir });

  const commandsByWindow = new Map<string, string>();
  for (const call of runner.calls) {
    if (call.command !== "tmux" || (call.args[0] !== "new-session" && call.args[0] !== "new-window")) {
      continue;
    }
    const windowName = call.args[call.args.indexOf("-n") + 1];
    commandsByWindow.set(windowName, call.args[call.args.length - 1]);
  }

  for (const role of ROLE_DEFINITIONS) {
    const command = commandsByWindow.get(role.windowName);
    assert.ok(command, `missing tmux command for ${role.id}`);
    assert.match(command, new RegExp(escapeRegex(role.referencePath)));
    assert.match(command, new RegExp(escapeRegex(ROLE_REFERENCE_SNIPPETS[role.id])));
    assert.match(command, /references\/protocols\/delegation-routing\.md/);
    assert.match(command, /references\/protocols\/approval\.md/);
    assert.match(command, /references\/protocols\/output-contracts\.md/);
    assert.match(command, /references\/protocols\/workspaces\.md/);
    assert.match(command, /peer-message/);
    assert.match(command, new RegExp(`${role.id} <target_role>`));

    for (const otherRole of ROLE_DEFINITIONS) {
      if (otherRole.id === role.id) {
        continue;
      }
      assert.doesNotMatch(command, new RegExp(escapeRegex(ROLE_REFERENCE_SNIPPETS[otherRole.id])));
    }
  }

  await cleanup(dir);
});

test("delegateTask writes inbox and sends a tmux message", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  const task = await runtime.delegateTask(
    {
      role: "service-planner",
      title: "Draft MVP scope",
      instructions: "사용자 목표를 MVP 범위로 정리한다.",
      expected_output: "Markdown PRD summary.",
    },
    dir,
  );

  const inbox = await readFile(task.inboxPath, "utf8");
  assert.equal(task.taskType, "planning");
  assert.match(inbox, /Draft MVP scope/);
  assert.match(inbox, /Task Type: planning/);
  assert.match(inbox, /Role Reference: references\/roles\/service-planner\.md/);
  assert.match(inbox, /Applicable Playbook: references\/protocols\/task-playbooks\.md#planning/);
  assert.match(inbox, /Completion Contract/);
  assert.match(inbox, /## 문제 정의/);
  assert.ok(runner.calls.some((call) => call.command === "tmux" && call.args[0] === "paste-buffer"));

  const board = JSON.parse(await readFile(path.join(dir, ".agent-company", "board.json"), "utf8"));
  assert.equal(board.tasks[0].id, task.id);
  assert.equal(board.tasks[0].status, "delegated");
  assert.equal(board.tasks[0].taskType, "planning");

  await cleanup(dir);
});

test("delegateTask marks task failed when tmux delivery fails", async () => {
  const { dir, runner } = await makeRuntime();
  runner.failTmuxPaste = true;
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  await assert.rejects(
    runtime.delegateTask(
      {
        role: "service-planner",
        title: "Draft blocked scope",
        instructions: "전달 실패 상태를 검증한다.",
        expected_output: "Planning report.",
      },
      dir,
    ),
    /target pane did not accept pasted task/,
  );

  const board = JSON.parse(await readFile(path.join(dir, ".agent-company", "board.json"), "utf8"));
  assert.equal(board.tasks.length, 1);
  assert.equal(board.tasks[0].status, "failed");
  assert.match(board.tasks[0].validationErrors.join("\n"), /Task dispatch failed/);

  const persisted = JSON.parse(
    await readFile(path.join(dir, ".agent-company", "tasks", `${board.tasks[0].id}.json`), "utf8"),
  );
  assert.equal(persisted.status, "failed");
  assert.match(persisted.validationErrors.join("\n"), /target pane did not accept pasted task/);

  await cleanup(dir);
});

test("sendPeerMessage records a file-backed message and notifies the target role", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  const config = await runtime.startCompany({ project_path: dir });

  const message = await runtime.sendPeerMessage(
    {
      from_role: "service-planner",
      to_role: "architect",
      title: "Clarify module boundary",
      message: "API shape needs an architecture check.",
      discussion_id: "discussion-1",
      task_id: "task-1",
      in_reply_to: "message-0",
    },
    dir,
  );

  assert.equal(message.fromRole, "service-planner");
  assert.equal(message.toRole, "architect");
  assert.equal(message.discussionId, "discussion-1");
  assert.ok(message.path.endsWith(".json"));
  assert.ok(message.markdownPath.endsWith(".md"));
  assert.ok(message.inboxPath.endsWith(".peer.md"));

  const persisted = JSON.parse(await readFile(message.path, "utf8"));
  assert.equal(persisted.id, message.id);
  assert.equal(persisted.taskId, "task-1");

  const markdown = await readFile(message.markdownPath, "utf8");
  assert.match(markdown, /From: 서비스 기획자 \(service-planner\)/);
  assert.match(markdown, /To: 프로젝트 아키텍트 \(architect\)/);
  assert.match(markdown, /Discussion ID: discussion-1/);
  assert.match(await readFile(message.inboxPath, "utf8"), /API shape needs an architecture check/);

  const board = JSON.parse(await readFile(path.join(dir, ".agent-company", "board.json"), "utf8"));
  assert.deepEqual(board.tasks, []);

  const target = `${config.sessionName}:architect`;
  assert.ok(runner.calls.some((call) =>
    call.command === "tmux" && call.args[0] === "paste-buffer" && call.args.includes(target)
  ));

  const status = await runtime.companyStatus(dir);
  assert.equal(status.recentPeerMessages[0].id, message.id);
  assert.equal(status.recentPeerMessages[0].fromRole, "service-planner");
  assert.equal(status.recentPeerMessages[0].toRole, "architect");

  await cleanup(dir);
});

test("sendPeerMessage rejects invalid peer message inputs", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  await assert.rejects(
    runtime.sendPeerMessage(
      {
        from_role: "architect",
        to_role: "architect",
        title: "Self note",
        message: "This should not be a peer message.",
      },
      dir,
    ),
    /from_role and to_role must be different/,
  );

  await assert.rejects(
    runtime.sendPeerMessage(
      {
        from_role: "unknown-role" as any,
        to_role: "architect",
        title: "Unknown",
        message: "Invalid sender.",
      },
      dir,
    ),
    /Unknown role: unknown-role/,
  );

  await assert.rejects(
    runtime.sendPeerMessage(
      {
        from_role: "service-planner",
        to_role: "architect",
        title: "",
        message: "Missing title.",
      },
      dir,
    ),
    /title is required/,
  );

  await cleanup(dir);
});

test("delegateTask accepts an explicit task_type", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  const task = await runtime.delegateTask(
    {
      role: "fullstack-developer",
      title: "Run release checks",
      instructions: "릴리즈 전 검증 관점을 정리한다.",
      expected_output: "Release readiness notes.",
      task_type: "release",
    },
    dir,
  );

  const inbox = await readFile(task.inboxPath, "utf8");
  assert.equal(task.taskType, "release");
  assert.match(inbox, /Task Type: release/);
  assert.match(inbox, /실제 배포를 실행하지 않는다/);

  await cleanup(dir);
});

test("taskStatus reports a delegated task without result files", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const task = await runtime.delegateTask(
    {
      role: "service-planner",
      title: "Inspect status",
      instructions: "상태 조회를 검증한다.",
      expected_output: "Status report.",
    },
    dir,
  );

  const status = await runtime.taskStatus({ task_id: task.id }, dir);

  assert.equal(status.computedStatus, "delegated");
  assert.equal(status.files.doneExists, false);
  assert.equal(status.files.resultExists, false);
  assert.equal(status.resultPreview, undefined);
  assert.equal(status.resultPreviewTruncated, false);

  await cleanup(dir);
});

test("taskStatus previews blocked worker output without mutating board state", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const task = await runtime.delegateTask(
    {
      role: "qa-engineer",
      title: "Inspect blocked status",
      instructions: "차단 상태 조회를 검증한다.",
      expected_output: "Blocked report.",
    },
    dir,
  );
  await writeFile(task.resultPath, "# Blocked\n\nApproval is required before continuing.\n", "utf8");
  await writeFile(
    task.donePath,
    JSON.stringify({ status: "blocked", summary: "Approval required", needs: "사용자 승인" }),
    "utf8",
  );

  const status = await runtime.taskStatus({ task_id: task.id, preview_chars: 12 }, dir);

  assert.equal(status.computedStatus, "blocked");
  assert.equal(status.files.doneExists, true);
  assert.equal(status.files.resultExists, true);
  assert.equal(status.summary, "Approval required");
  assert.equal(status.blockedNeeds, "사용자 승인");
  assert.equal(status.resultPreview, "# Blocked\n\nA");
  assert.equal(status.resultPreviewTruncated, true);

  const board = JSON.parse(await readFile(path.join(dir, ".agent-company", "board.json"), "utf8"));
  assert.equal(board.tasks[0].status, "delegated");

  await cleanup(dir);
});

test("taskStatus reports malformed done metadata without completing the task", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const task = await runtime.delegateTask(
    {
      role: "researcher",
      title: "Inspect malformed done",
      instructions: "깨진 완료 메타데이터를 검증한다.",
      expected_output: "Malformed metadata report.",
    },
    dir,
  );
  await writeFile(task.resultPath, "# Result\n", "utf8");
  await writeFile(task.donePath, "{not json", "utf8");

  const status = await runtime.taskStatus({ task_id: task.id }, dir);

  assert.equal(status.computedStatus, "failed");
  assert.equal(status.files.doneExists, true);
  assert.equal(status.files.resultExists, true);
  assert.match(status.doneError ?? "", /JSON/);
  assert.match(status.validationErrors?.join("\n") ?? "", /done\.json must be valid JSON/);
  assert.equal(status.resultPreview, "# Result\n");

  const board = JSON.parse(await readFile(path.join(dir, ".agent-company", "board.json"), "utf8"));
  assert.equal(board.tasks[0].status, "delegated");

  await cleanup(dir);
});

test("collectResult marks a fake worker result as completed", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const task = await runtime.delegateTask(
    {
      role: "qa-engineer",
      title: "Review quality",
      instructions: "품질 리스크를 검토한다.",
      expected_output: "QA report.",
    },
    dir,
  );

  await writeFile(task.resultPath, qaResult("No blockers."), "utf8");
  await writeFile(task.donePath, JSON.stringify({ status: "completed", summary: "No blockers" }), "utf8");

  const collected = await runtime.collectResult({ task_id: task.id }, dir);

  assert.equal(collected.task.status, "completed");
  assert.equal(collected.task.validationErrors, undefined);
  assert.match(collected.result, /## 테스트 관점/);

  const board = JSON.parse(await readFile(path.join(dir, ".agent-company", "board.json"), "utf8"));
  assert.equal(board.tasks[0].status, "completed");

  await cleanup(dir);
});

test("collectResult marks completed output without required headings as failed", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const task = await runtime.delegateTask(
    {
      role: "service-planner",
      title: "Validate headings",
      instructions: "필수 heading 검증을 확인한다.",
      expected_output: "Planning result.",
    },
    dir,
  );

  await writeFile(task.resultPath, "## 문제 정의\n\n범위만 작성했다.\n", "utf8");
  await writeFile(task.donePath, JSON.stringify({ status: "completed", summary: "Partial result" }), "utf8");

  const collected = await runtime.collectResult({ task_id: task.id }, dir);

  assert.equal(collected.task.status, "failed");
  assert.match(collected.task.validationErrors?.join("\n") ?? "", /## 권장 범위/);

  const board = JSON.parse(await readFile(path.join(dir, ".agent-company", "board.json"), "utf8"));
  assert.equal(board.tasks[0].status, "failed");
  assert.match(board.tasks[0].validationErrors.join("\n"), /## 성공 기준/);

  await cleanup(dir);
});

test("collectResult fails completion when summary is missing", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const task = await runtime.delegateTask(
    {
      role: "service-planner",
      title: "Validate summary",
      instructions: "summary 누락 검증을 확인한다.",
      expected_output: "Planning result.",
    },
    dir,
  );

  await writeFile(task.resultPath, servicePlannerResult(), "utf8");
  await writeFile(task.donePath, JSON.stringify({ status: "completed" }), "utf8");

  const collected = await runtime.collectResult({ task_id: task.id }, dir);

  assert.equal(collected.task.status, "failed");
  assert.match(collected.task.validationErrors?.join("\n") ?? "", /summary must not be empty/);

  await cleanup(dir);
});

test("waitForTask fails blocked completion without needs", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const task = await runtime.delegateTask(
    {
      role: "researcher",
      title: "Validate blocked needs",
      instructions: "needs 누락 검증을 확인한다.",
      expected_output: "Research result.",
    },
    dir,
  );

  await writeFile(task.resultPath, "## 확인된 사실\n\n없음.\n", "utf8");
  await writeFile(task.donePath, JSON.stringify({ status: "blocked", summary: "Need access" }), "utf8");

  const waited = await runtime.waitForTask({ task_id: task.id, timeout_sec: 1 }, dir);

  assert.equal(waited.status, "failed");
  assert.match(waited.validationErrors?.join("\n") ?? "", /blocked done\.json must include non-empty needs/);

  await cleanup(dir);
});

test("waitForTask marks timed out tasks as failed", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const task = await runtime.delegateTask(
    {
      role: "researcher",
      title: "Never completes",
      instructions: "완료 파일이 없는 작업의 타임아웃을 검증한다.",
      expected_output: "Research result.",
    },
    dir,
  );

  const waited = await runtime.waitForTask({ task_id: task.id, timeout_sec: 0.03 }, dir);

  assert.equal(waited.status, "failed");
  assert.match(waited.validationErrors?.join("\n") ?? "", /timed out after 0\.030s/);
  assert.ok(waited.completedAt);

  const board = JSON.parse(await readFile(path.join(dir, ".agent-company", "board.json"), "utf8"));
  assert.equal(board.tasks[0].status, "failed");
  assert.match(board.tasks[0].validationErrors.join("\n"), /waiting for done\.json/);

  await cleanup(dir);
});

test("collectResult fails completion when result.md is empty", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const task = await runtime.delegateTask(
    {
      role: "knowledge-manager",
      title: "Validate empty result",
      instructions: "빈 result.md 검증을 확인한다.",
      expected_output: "Knowledge result.",
    },
    dir,
  );

  await writeFile(task.resultPath, "\n\n", "utf8");
  await writeFile(task.donePath, JSON.stringify({ status: "completed", summary: "Empty result" }), "utf8");

  const collected = await runtime.collectResult({ task_id: task.id }, dir);

  assert.equal(collected.task.status, "failed");
  assert.match(collected.task.validationErrors?.join("\n") ?? "", /result\.md must not be empty/);

  await cleanup(dir);
});

test("taskStatus computes validation errors without mutating board state", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const task = await runtime.delegateTask(
    {
      role: "release-manager",
      title: "Inspect invalid release result",
      instructions: "읽기 전용 검증을 확인한다.",
      expected_output: "Release result.",
    },
    dir,
  );

  await writeFile(task.resultPath, "## 릴리즈 노트\n\n요약.\n", "utf8");
  await writeFile(task.donePath, JSON.stringify({ status: "completed", summary: "Release ready" }), "utf8");

  const status = await runtime.taskStatus({ task_id: task.id }, dir);

  assert.equal(status.computedStatus, "failed");
  assert.match(status.validationErrors?.join("\n") ?? "", /## 배포 체크리스트/);

  const board = JSON.parse(await readFile(path.join(dir, ".agent-company", "board.json"), "utf8"));
  assert.equal(board.tasks[0].status, "delegated");
  assert.equal(board.tasks[0].validationErrors, undefined);

  await cleanup(dir);
});

test("recordDecision appends decisions and stopCompany kills active tmux session", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  const decision = await runtime.recordDecision(
    {
      summary: "Use tmux workers",
      rationale: "상주 Codex TUI 직원 경험이 중요하다.",
      risk_level: "medium",
    },
    dir,
  );
  const decisions = await readFile(decision.path, "utf8");
  assert.match(decisions, /Use tmux workers/);

  const stopped = await runtime.stopCompany(dir);
  assert.equal(stopped.stopped, true);
  assert.equal(runner.hasSession, false);
  assert.ok(runner.calls.some((call) => call.command.endsWith("stop-office.sh") && call.args.includes(dir)));

  await cleanup(dir);
});

test("stopCompany records dashboard stop exceptions and still kills active tmux session", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  runner.throwOfficeStop = true;
  const stopped = await runtime.stopCompany(dir);

  assert.equal(stopped.stopped, true);
  assert.equal(runner.hasSession, false);
  const errorPath = path.join(dir, ".agent-company", "office", "auto-start-error.json");
  const errorRecord = JSON.parse(await readFile(errorPath, "utf8"));
  assert.equal(errorRecord.status, "failed");
  assert.match(errorRecord.error, /could not be spawned/);

  await cleanup(dir);
});

test("recordMeeting writes minutes and companyStatus returns recent meeting metadata", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  const meeting = await runtime.recordMeeting(
    {
      title: "Todo MVP scoping",
      participants: ["service-planner", "qa-engineer"],
      summary: "간단한 모바일 TODO 앱 범위를 확정했다.",
      decisions: ["정적 HTML 앱으로 구현한다."],
      open_questions: [],
      next_actions: ["개발자에게 구현을 위임한다."],
    },
    dir,
  );

  const minutes = await readFile(meeting.path, "utf8");
  assert.match(minutes, /Todo MVP scoping/);
  assert.match(minutes, /Participants: service-planner, qa-engineer/);
  assert.match(minutes, /정적 HTML 앱으로 구현한다/);

  const status = await runtime.companyStatus(dir);
  assert.equal(status.recentMeetings[0].id, meeting.id);
  assert.equal(status.recentMeetings[0].title, "Todo MVP scoping");
  assert.deepEqual(status.recentMeetings[0].participants, ["service-planner", "qa-engineer"]);

  await cleanup(dir);
});

test("recordMeeting rejects missing required meeting fields", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  await assert.rejects(
    runtime.recordMeeting(
      {
        title: "",
        participants: ["service-planner"],
        summary: "요약",
        decisions: [],
        open_questions: [],
        next_actions: [],
      },
      dir,
    ),
    /title is required/,
  );

  await assert.rejects(
    runtime.recordMeeting(
      {
        title: "회의",
        participants: [],
        summary: "요약",
        decisions: [],
        open_questions: [],
        next_actions: [],
      },
      dir,
    ),
    /participants must include at least one role/,
  );

  await cleanup(dir);
});

test("discussion flow records rounds, closes, and appears in companyStatus", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  const discussion = await runtime.startDiscussion(
    {
      title: "Architecture direction",
      question: "Should the runtime persist discussions?",
      participants: ["service-planner", "architect", "knowledge-manager"],
      context: "중요 판단은 근거가 남아야 한다.",
      expected_decision: "토론 저장소 채택 여부를 결정한다.",
    },
    dir,
  );

  assert.equal(discussion.status, "opened");
  assert.ok(discussion.path.endsWith(path.join(discussion.id, "discussion.json")));
  assert.ok(discussion.roundsDir.endsWith(path.join(discussion.id, "rounds")));

  const round1 = await runtime.appendDiscussionRound(
    {
      discussion_id: discussion.id,
      round: 1,
      task_ids: ["task-planner", "task-architect"],
      summary: "각 역할이 독립 의견을 냈다.",
    },
    dir,
  );
  assert.equal(round1.status, "round1");
  assert.equal(round1.rounds.length, 1);
  assert.deepEqual(round1.rounds[0].taskIds, ["task-planner", "task-architect"]);
  assert.match(await readFile(round1.rounds[0].path, "utf8"), /round1/);

  const round2 = await runtime.appendDiscussionRound(
    {
      discussion_id: discussion.id,
      round: "round2",
      task_ids: ["task-planner-r2", "task-architect-r2"],
      summary: "상호 반박과 리스크 보완을 기록했다.",
    },
    dir,
  );
  assert.equal(round2.status, "round2");

  const round3 = await runtime.appendDiscussionRound(
    {
      discussion_id: discussion.id,
      round: "3",
      task_ids: ["task-knowledge-r3"],
      summary: "합의점과 이견을 정리했다.",
    },
    dir,
  );
  assert.equal(round3.status, "round3");

  const closed = await runtime.closeDiscussion(
    {
      discussion_id: discussion.id,
      conclusion: "파일 기반 discussion record를 채택한다.",
      agreements: ["토론은 재현 가능한 파일 상태로 남긴다."],
      disagreements: ["없음."],
      decision: "파일 기반 토론 저장소를 런타임 기능으로 추가한다.",
      next_actions: ["MCP와 CLI에 도구를 노출한다."],
      meeting_id: "meeting-1",
      decision_id: "decision-1",
    },
    dir,
  );

  assert.equal(closed.status, "closed");
  assert.equal(closed.conclusion, "파일 기반 discussion record를 채택한다.");
  assert.deepEqual(closed.agreements, ["토론은 재현 가능한 파일 상태로 남긴다."]);
  assert.equal(closed.meetingId, "meeting-1");
  assert.equal(closed.decisionId, "decision-1");

  const persisted = JSON.parse(await readFile(closed.path, "utf8"));
  assert.equal(persisted.status, "closed");
  assert.equal(persisted.rounds.length, 3);

  const status = await runtime.companyStatus(dir);
  assert.equal(status.recentDiscussions[0].id, discussion.id);
  assert.equal(status.recentDiscussions[0].status, "closed");
  assert.deepEqual(status.recentDiscussions[0].participants, [
    "service-planner",
    "architect",
    "knowledge-manager",
  ]);

  await cleanup(dir);
});

test("discussion methods reject invalid inputs and out-of-order flow", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  await assert.rejects(
    runtime.startDiscussion(
      {
        title: "",
        question: "질문",
        participants: ["service-planner"],
        context: "",
        expected_decision: "결정",
      },
      dir,
    ),
    /title is required/,
  );

  await assert.rejects(
    runtime.startDiscussion(
      {
        title: "토론",
        question: "질문",
        participants: [],
        context: "",
        expected_decision: "결정",
      },
      dir,
    ),
    /participants must include at least one role/,
  );

  await assert.rejects(
    runtime.startDiscussion(
      {
        title: "토론",
        question: "질문",
        participants: ["unknown-role" as any],
        context: "",
        expected_decision: "결정",
      },
      dir,
    ),
    /Unknown participant role/,
  );

  await assert.rejects(
    runtime.appendDiscussionRound(
      {
        discussion_id: "missing",
        round: 1,
        task_ids: [],
        summary: "요약",
      },
      dir,
    ),
    /Discussion missing does not exist/,
  );

  const discussion = await runtime.startDiscussion(
    {
      title: "순서 검증",
      question: "라운드 순서를 강제해야 하는가?",
      participants: ["architect"],
      context: "",
      expected_decision: "순서 정책",
    },
    dir,
  );

  await assert.rejects(
    runtime.appendDiscussionRound(
      {
        discussion_id: discussion.id,
        round: 2,
        task_ids: [],
        summary: "순서를 건너뛰었다.",
      },
      dir,
    ),
    /expected next round round1/,
  );

  await assert.rejects(
    runtime.closeDiscussion(
      {
        discussion_id: discussion.id,
        conclusion: "결론",
        agreements: [],
        disagreements: [],
        decision: "결정",
        next_actions: [],
      },
      dir,
    ),
    /must reach round3/,
  );

  await cleanup(dir);
});

test("recordMeeting and recordDecision can link a discussion id", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });

  const meeting = await runtime.recordMeeting(
    {
      title: "Discussion closeout",
      participants: ["knowledge-manager"],
      summary: "토론을 정리했다.",
      decisions: ["기록한다."],
      open_questions: [],
      next_actions: [],
      discussion_id: "discussion-123",
    },
    dir,
  );
  const decision = await runtime.recordDecision(
    {
      summary: "Adopt discussion flow",
      rationale: "중요 판단의 근거를 남긴다.",
      risk_level: "low",
      discussion_id: "discussion-123",
    },
    dir,
  );

  assert.match(await readFile(meeting.path, "utf8"), /Discussion ID: discussion-123/);
  assert.match(await readFile(decision.path, "utf8"), /Discussion ID: discussion-123/);

  const status = await runtime.companyStatus(dir);
  assert.equal(status.recentMeetings[0].discussionId, "discussion-123");

  await cleanup(dir);
});

test("MCP source exposes discussion and peer message tools", async () => {
  const server = await readFile(path.resolve("plugins/agent-company/server/src/mcp-server.ts"), "utf8");

  assert.match(server, /start_discussion/);
  assert.match(server, /append_discussion_round/);
  assert.match(server, /close_discussion/);
  assert.match(server, /send_peer_message/);
});

test("companyctl discussion commands update runtime state", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const cliPath = path.resolve("plugins/agent-company/server/src/companyctl.ts");

  const started = await runCompanyctl(cliPath, [
    "discussion-start",
    dir,
    "Release debate",
    "Should we ship now?",
    "service-planner,qa-engineer",
    "Release context",
    "Ship decision",
  ]);
  assert.equal(started.status, "opened");

  const round1 = await runCompanyctl(cliPath, [
    "discussion-round",
    dir,
    started.id,
    "1",
    "planner-task|qa-task",
    "First review summary",
  ]);
  assert.equal(round1.status, "round1");

  await runCompanyctl(cliPath, [
    "discussion-round",
    dir,
    started.id,
    "2",
    JSON.stringify(["planner-r2", "qa-r2"]),
    "Second review summary",
  ]);
  await runCompanyctl(cliPath, [
    "discussion-round",
    dir,
    started.id,
    "3",
    "knowledge-r3",
    "Final review summary",
  ]);
  const closed = await runCompanyctl(cliPath, [
    "discussion-close",
    dir,
    started.id,
    "Closeout conclusion",
    JSON.stringify(["Agree to ship after tests"]),
    "Known release risk",
    "Ship after QA passes",
    "Run QA|Prepare notes",
    "meeting-2",
    "decision-2",
  ]);

  assert.equal(closed.status, "closed");
  assert.deepEqual(closed.nextActions, ["Run QA", "Prepare notes"]);
  assert.equal(closed.meetingId, "meeting-2");
  assert.equal(closed.decisionId, "decision-2");

  await cleanup(dir);
});

test("companyctl peer-message command records a peer message", async () => {
  const { dir, runner } = await makeRuntime();
  const runtime = new AgentCompanyRuntime(runner);
  await runtime.startCompany({ project_path: dir });
  const cliPath = path.resolve("plugins/agent-company/server/src/companyctl.ts");
  const binDir = path.join(dir, "bin");
  await mkdir(binDir);
  await writeFile(path.join(binDir, "tmux"), "#!/bin/sh\nexit 0\n", "utf8");
  await chmod(path.join(binDir, "tmux"), 0o755);

  const message = await runCompanyctl(cliPath, [
    "peer-message",
    dir,
    "service-planner",
    "architect",
    "Clarify API",
    "Please review the boundary.",
    "discussion-cli",
    "task-cli",
    "message-cli",
  ], { PATH: `${binDir}:${process.env.PATH ?? ""}` });

  assert.equal(message.fromRole, "service-planner");
  assert.equal(message.toRole, "architect");
  assert.equal(message.discussionId, "discussion-cli");
  assert.equal(message.taskId, "task-cli");
  assert.equal(message.inReplyTo, "message-cli");
  assert.match(await readFile(message.markdownPath, "utf8"), /Please review the boundary/);

  const status = await runtime.companyStatus(dir);
  assert.equal(status.recentPeerMessages[0].id, message.id);

  await cleanup(dir);
});

async function makeRuntime(): Promise<{ dir: string; runner: FakeRunner }> {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-company-test-"));
  return { dir, runner: new FakeRunner() };
}

async function runCompanyctl(cliPath: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<any> {
  const result = await execFileAsync(
    process.execPath,
    ["--experimental-strip-types", cliPath, ...args],
    { env: { ...process.env, ...env } },
  );
  return JSON.parse(result.stdout);
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  const worktreeRoot = path.resolve(dir, "..", `.${path.basename(dir)}-agent-company-worktrees`);
  await rm(worktreeRoot, { recursive: true, force: true });
}

function servicePlannerResult(): string {
  return [
    "## 문제 정의",
    "",
    "문제를 정의했다.",
    "",
    "## 권장 범위",
    "",
    "작은 범위를 권장한다.",
    "",
    "## 성공 기준",
    "",
    "검증 가능한 기준을 둔다.",
    "",
    "## 확인 질문",
    "",
    "없음.",
    "",
  ].join("\n");
}

function qaResult(body: string): string {
  return [
    "## 테스트 관점",
    "",
    body,
    "",
    "## 수동 확인",
    "",
    "확인 완료.",
    "",
    "## 자동 검증",
    "",
    "검증 완료.",
    "",
    "## 차단 이슈",
    "",
    "없음.",
    "",
  ].join("\n");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ok(stdout = ""): CommandResult {
  return { stdout, stderr: "", code: 0 };
}

function fail(stderr: string): CommandResult {
  return { stdout: "", stderr, code: 1 };
}
