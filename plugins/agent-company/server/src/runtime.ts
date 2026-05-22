// Agent Company v2의 파일 상태와 로컬 토론 서버를 관리한다.
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultCommandRunner } from "./command-runner.ts";
import {
  appendDecisionRecord,
  appendMeetingMessage,
  clearServerPid,
  closeMeetingRecord,
  computeConsensus,
  createMeetingRecord,
  ensureCompanyState,
  isProcessRunning,
  listMeetingMetadata,
  loadCompanyConfig,
  readLegacyState,
  readMeetingMessages,
  readMeetingRecord,
  readRecentDecisions,
  readServerState,
  readServerToken,
  resolveProjectPath,
  statePaths,
  writeJson,
} from "./state.ts";
import type {
  CloseMeetingInput,
  CommandRunner,
  CompanyConfig,
  CompanyStatus,
  CreateMeetingInput,
  DecisionRecord,
  DiscussionServerState,
  MeetingMessage,
  MeetingConnection,
  MeetingStatusInput,
  MeetingStatusResult,
  PostMessageInput,
  RecordDecisionInput,
  StartCompanyInput,
} from "./types.ts";

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DISCUSSION_SERVER = path.join(SOURCE_DIR, "discussion-server.ts");

export class AgentCompanyRuntime {
  private runner: CommandRunner;

  constructor(runner: CommandRunner = new DefaultCommandRunner()) {
    this.runner = runner;
  }

  async startCompany(input: StartCompanyInput): Promise<CompanyConfig> {
    const projectPath = resolveProjectPath(input.project_path);
    const config = await ensureCompanyState(projectPath);
    await this.startDiscussionServer(projectPath);
    return config;
  }

  async companyStatus(projectPathInput?: string): Promise<CompanyStatus> {
    const projectPath = resolveProjectPath(projectPathInput ?? process.cwd());
    const config = await loadCompanyConfig(projectPath);
    const meetings = await listMeetingMetadata(projectPath);
    return {
      config,
      server: await readServerState(projectPath),
      activeMeetings: meetings.filter((meeting) => meeting.status === "open"),
      recentMeetings: meetings.slice(0, 10),
      recentDecisions: await readRecentDecisions(projectPath, 10),
      legacyState: await readLegacyState(projectPath),
    };
  }

  async createMeeting(input: CreateMeetingInput, projectPathInput?: string): Promise<MeetingStatusResult> {
    const projectPath = resolveProjectPath(input.project_path ?? projectPathInput ?? process.cwd());
    await loadCompanyConfig(projectPath);
    const meeting = await createMeetingRecord({
      projectPath,
      title: input.title,
      goal: input.goal,
      participants: input.participants,
      consensusPolicy: input.consensus_policy,
    });
    const messages: MeetingMessage[] = [];
    return {
      meeting,
      messages,
      nextSequence: 1,
      consensus: computeConsensus(meeting, messages),
      connection: await this.meetingConnection(projectPath, meeting.id),
    };
  }

  async meetingStatus(input: MeetingStatusInput, projectPathInput?: string): Promise<MeetingStatusResult> {
    const projectPath = resolveProjectPath(input.project_path ?? projectPathInput ?? process.cwd());
    const meeting = await readMeetingRecord(projectPath, input.meeting_id);
    const afterSequence = normalizeSequence(input.after_sequence);
    const messages = await readMeetingMessages(projectPath, meeting.id, afterSequence);
    const allMessages = afterSequence > 0 ? await readMeetingMessages(projectPath, meeting.id) : messages;
    return {
      meeting,
      messages,
      nextSequence: allMessages.length + 1,
      consensus: computeConsensus(meeting, allMessages),
    };
  }

  async postMessage(input: PostMessageInput, projectPathInput?: string): Promise<MeetingMessage> {
    const projectPath = resolveProjectPath(input.project_path ?? projectPathInput ?? process.cwd());
    return appendMeetingMessage({
      projectPath,
      meetingId: input.meeting_id,
      role: input.role,
      kind: input.kind,
      message: input.message,
      position: input.position,
    });
  }

  async closeMeeting(input: CloseMeetingInput, projectPathInput?: string): Promise<MeetingStatusResult> {
    const projectPath = resolveProjectPath(input.project_path ?? projectPathInput ?? process.cwd());
    const meeting = await closeMeetingRecord({
      projectPath,
      meetingId: input.meeting_id,
      summary: input.summary,
      consensus: input.consensus,
      unresolvedQuestions: input.unresolved_questions,
      nextActions: input.next_actions,
    });
    const messages = await readMeetingMessages(projectPath, meeting.id);
    return {
      meeting,
      messages,
      nextSequence: messages.length + 1,
      consensus: computeConsensus(meeting, messages),
    };
  }

  async recordDecision(input: RecordDecisionInput, projectPathInput?: string): Promise<DecisionRecord> {
    const projectPath = resolveProjectPath(input.project_path ?? projectPathInput ?? process.cwd());
    await loadCompanyConfig(projectPath);
    return appendDecisionRecord({
      projectPath,
      meetingId: input.meeting_id,
      summary: input.summary,
      rationale: input.rationale,
      riskLevel: input.risk_level,
    });
  }

  async stopCompany(projectPathInput?: string): Promise<{ server: DiscussionServerState; stopped: boolean }> {
    const projectPath = resolveProjectPath(projectPathInput ?? process.cwd());
    const state = await readServerState(projectPath);
    const serverIsCurrentProcess = state.pid === process.pid;
    if (state.pid && state.status === "running") {
      if (!serverIsCurrentProcess) {
        process.kill(state.pid, "SIGTERM");
        await waitUntilStopped(state.pid, 2000);
      }
      await clearServerPid(projectPath);
    }
    return {
      server: await readServerState(projectPath),
      stopped: state.status !== "running" || !state.pid || serverIsCurrentProcess || !isProcessRunning(state.pid),
    };
  }

  private async startDiscussionServer(projectPath: string): Promise<void> {
    const current = await readServerState(projectPath);
    if (current.status === "running") {
      return;
    }

    const result = await this.runner.run(process.execPath, [
      "--experimental-strip-types",
      DISCUSSION_SERVER,
      "--project-dir",
      projectPath,
      "--host",
      "127.0.0.1",
      "--port",
      "auto",
      "--daemon",
    ]);

    if (result.code === 0) {
      return;
    }

    const paths = statePaths(projectPath);
    await writeJson(paths.serverInfoPath, {
      error: result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`,
      createdAt: new Date().toISOString(),
    });
    throw new Error(`Agent Company discussion server failed to start: ${result.stderr || result.stdout}`);
  }

  private async meetingConnection(projectPath: string, meetingId: string): Promise<MeetingConnection> {
    const server = await readServerState(projectPath);
    if (server.status !== "running" || !server.url) {
      throw new Error("Agent Company discussion server is not running");
    }
    return {
      url: server.url,
      tokenHeader: "X-Agent-Company-Token",
      token: await readServerToken(projectPath),
      meetingUrl: `${server.url}/api/meetings/${encodeURIComponent(meetingId)}`,
      messagesUrl: `${server.url}/api/meetings/${encodeURIComponent(meetingId)}/messages`,
    };
  }
}

function normalizeSequence(value: number | undefined): number {
  if (value === undefined) {
    return 0;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("after_sequence must be a non-negative integer");
  }
  return value;
}

async function waitUntilStopped(pid: number, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return;
    }
    await sleep(100);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
