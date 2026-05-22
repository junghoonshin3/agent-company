// Agent Company v2 코어 런타임과 토론 서버를 검증한다.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { startDiscussionHttpServer } from "../src/discussion-server.ts";
import { AgentCompanyRuntime } from "../src/runtime.ts";
import {
  createMeetingRecord,
  readServerState,
  readServerToken,
  statePaths,
  writeServerInfo,
} from "../src/state.ts";
import type { CommandResult, CommandRunner } from "../src/types.ts";

class FakeRunner implements CommandRunner {
  calls: Array<{ command: string; args: string[]; cwd?: string }> = [];
  failStart = false;

  async run(command: string, args: string[], options: { cwd?: string } = {}): Promise<CommandResult> {
    this.calls.push({ command, args, cwd: options.cwd });
    if (args.some((arg) => arg.endsWith("discussion-server.ts"))) {
      const projectPath = args[args.indexOf("--project-dir") + 1];
      if (this.failStart) {
        return { stdout: "", stderr: "discussion server failed", code: 1 };
      }
      await writeServerInfo(projectPath, {
        url: "http://127.0.0.1:49152",
        pid: process.pid,
      });
      return { stdout: "started\n", stderr: "", code: 0 };
    }
    return { stdout: "", stderr: "", code: 0 };
  }
}

test("startCompany creates v2 state and starts the discussion server", async () => {
  const { dir, runtime, runner } = await makeRuntime();

  const config = await runtime.startCompany({ project_path: dir });

  assert.equal(config.version, "2");
  assert.equal(config.projectPath, dir);
  assert.equal(config.stateDir, path.join(dir, ".agent-company", "v2"));
  assert.equal(config.roles.length, 9);
  assert.ok(config.roles.some((role) => role.id === "ceo"));
  assert.ok(runner.calls.some((call) => call.args.includes("--daemon")));

  const status = await runtime.companyStatus(dir);
  assert.equal(status.server.status, "running");
  assert.equal(status.server.url, "http://127.0.0.1:49152");
  assert.equal(status.activeMeetings.length, 0);
  assert.equal(status.legacyState.exists, true);

  const token = await readFile(statePaths(dir).serverTokenPath, "utf8");
  assert.ok(token.trim().length > 20);

  await cleanup(dir);
});

test("meeting messages track consensus and decisions", async () => {
  const { dir, runtime } = await makeRuntime();
  await runtime.startCompany({ project_path: dir });

  const created = await runtime.createMeeting({
    title: "v2 scope decision",
    goal: "토론 서버 기반 Agent Company v2 범위를 합의한다.",
    participants: ["service-planner", "architect"],
  }, dir);

  assert.equal(created.meeting.status, "open");
  assert.equal(created.connection?.tokenHeader, "X-Agent-Company-Token");
  assert.match(created.connection?.messagesUrl ?? "", /\/api\/meetings\/.+\/messages$/);

  await runtime.postMessage({
    meeting_id: created.meeting.id,
    role: "service-planner",
    kind: "statement",
    message: "기획 관점에서는 코어 런타임을 첫 범위로 제한해야 한다.",
  }, dir);
  await runtime.postMessage({
    meeting_id: created.meeting.id,
    role: "service-planner",
    kind: "consensus",
    message: "코어 런타임 우선에 동의한다.",
    position: "agree",
  }, dir);
  await runtime.postMessage({
    meeting_id: created.meeting.id,
    role: "architect",
    kind: "consensus",
    message: "HTTP 회의 서버를 포함한다는 조건으로 동의한다.",
    position: "conditional",
  }, dir);

  const status = await runtime.meetingStatus({ meeting_id: created.meeting.id }, dir);
  assert.equal(status.messages.length, 3);
  assert.equal(status.nextSequence, 4);
  assert.equal(status.consensus.reached, true);
  assert.deepEqual(status.consensus.blockers, []);

  const closed = await runtime.closeMeeting({
    meeting_id: created.meeting.id,
    summary: "코어 런타임부터 구현한다.",
    consensus: "참가자 모두 코어 런타임 우선에 합의했다.",
    next_actions: ["v2 MCP 도구 구현"],
  }, dir);
  assert.equal(closed.meeting.status, "closed");
  assert.equal(closed.meeting.summary, "코어 런타임부터 구현한다.");

  const decision = await runtime.recordDecision({
    meeting_id: created.meeting.id,
    summary: "tmux를 제거하고 토론 서버를 기본 런타임으로 쓴다.",
    rationale: "사용자가 기대한 직접 토론 경험에 더 가깝다.",
    risk_level: "medium",
  }, dir);
  assert.equal(decision.riskLevel, "medium");

  const company = await runtime.companyStatus(dir);
  assert.equal(company.recentDecisions[0].id, decision.id);
  assert.equal(company.recentMeetings[0].status, "closed");

  await cleanup(dir);
});

test("discussion HTTP server requires token and records employee messages", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-company-v2-"));
  const server = await startDiscussionHttpServer({ projectPath: dir, host: "127.0.0.1", port: 0 });
  try {
    const serverState = await readServerState(dir);
    assert.equal(serverState.status, "running");
    assert.ok(serverState.url);
    const token = await readServerToken(dir);
    const meeting = await createMeetingRecord({
      projectPath: dir,
      title: "HTTP auth",
      goal: "토큰 인증을 확인한다.",
      participants: ["qa-engineer"],
    });

    const messagesUrl = `${serverState.url}/api/meetings/${meeting.id}/messages`;
    const unauthorized = await fetch(messagesUrl);
    assert.equal(unauthorized.status, 401);

    const created = await fetch(messagesUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-company-token": token,
      },
      body: JSON.stringify({
        role: "qa-engineer",
        kind: "consensus",
        message: "토큰 인증이 동작한다.",
        position: "agree",
      }),
    });
    assert.equal(created.status, 201);
    const message = await created.json();
    assert.equal(message.sequence, 1);

    const listed = await fetch(messagesUrl, {
      headers: { "x-agent-company-token": token },
    });
    assert.equal(listed.status, 200);
    const body = await listed.json();
    assert.equal(body.messages.length, 1);
    assert.equal(body.consensus.reached, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test("stopCompany clears a running server pid", async () => {
  const { dir, runtime } = await makeRuntime();
  await runtime.startCompany({ project_path: dir });

  const stopped = await runtime.stopCompany(dir);

  assert.equal(stopped.stopped, true);
  assert.equal(stopped.server.status, "unknown");

  await cleanup(dir);
});

async function makeRuntime(): Promise<{ dir: string; runtime: AgentCompanyRuntime; runner: FakeRunner }> {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-company-v2-"));
  const runner = new FakeRunner();
  return { dir, runtime: new AgentCompanyRuntime(runner), runner };
}

async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
