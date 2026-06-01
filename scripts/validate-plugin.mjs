// Agent Company v2 플러그인의 manifest와 런타임 구조를 검증한다.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = root;
const requiredMcpTools = [
  "start_company",
  "company_status",
  "create_meeting",
  "meeting_status",
  "post_message",
  "close_meeting",
  "record_decision",
  "stop_company",
];
const forbiddenRuntimeTerms = [
  "tmux",
  "worktree",
  "officeDashboard",
  "delegate_task",
  "wait_for_task",
  "send_peer_message",
  "start_discussion",
  "append_discussion_round",
];

const plugin = JSON.parse(await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
assert.equal(plugin.name, "agent-company");
assert.equal(plugin.version, "0.2.0");
assert.equal(plugin.skills, "./skills/");
assert.equal(plugin.mcpServers, "./.mcp.json");
assert.equal(plugin.interface.displayName, "Agent Company");
assert.match(plugin.description, /sub-agents/);
assert.doesNotMatch(JSON.stringify(plugin), /tmux|Kanban/);

const mcp = JSON.parse(await readFile(path.join(pluginRoot, ".mcp.json"), "utf8"));
assert.ok(mcp.mcpServers?.["agent-company"], ".mcp.json must define mcpServers.agent-company");
assert.equal(mcp.mcpServers["agent-company"].command, "node");
assert.deepEqual(mcp.mcpServers["agent-company"].args.slice(0, 2), [
  "--experimental-strip-types",
  "./server/src/mcp-server.ts",
]);

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.equal(packageJson.version, "0.2.0");
assert.equal(packageJson.scripts.test, "node --experimental-strip-types --test server/test/*.test.ts");
assert.equal(packageJson.scripts.validate, "node scripts/validate-plugin.mjs");
assert.equal(packageJson.scripts.check, "npm run validate && npm test");
for (const script of Object.values(packageJson.scripts)) {
  assert.doesNotMatch(String(script), /agent-office|vite|office/);
}
assert.ok(!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0);

const skill = await readFile(path.join(pluginRoot, "skills", "company", "SKILL.md"), "utf8");
assert.match(skill, /CEO Plan Mode/);
assert.match(skill, /Do not describe yourself as a gateway/);
assert.match(skill, /Codex native sub-agents/);
assert.match(skill, /Spawn all selected employee sub-agents before waiting/);
assert.match(skill, /spawn-wait-spawn sequence/);
assert.match(skill, /multi-target wait/);
assert.match(skill, /Responsible Role Selection/);
assert.match(skill, /owned requirement/);
assert.match(skill, /Do not invite roles for general review/);
assert.match(skill, /Round-Based Discussion/);
assert.match(skill, /adversarial but constructive/);
assert.match(skill, /strongest counterargument/);
assert.match(skill, /failure condition/);
assert.match(skill, /substantive challenge/);
assert.match(skill, /Initial position round/);
assert.match(skill, /Response round/);
assert.match(skill, /Revision round/);
assert.match(skill, /Final consensus round/);
assert.match(skill, /message sequence or message id/);
assert.match(skill, /conditionalParticipants/);
assert.match(skill, /discussionSatisfied/);
assert.match(skill, /discussionInsufficientParticipants/);
assert.match(skill, /create_meeting/);
assert.match(skill, /meeting_status/);
assert.match(skill, /post_message/);
assert.match(skill, /close_meeting/);
assert.match(skill, /X-Agent-Company-Token/);
assert.match(skill, /viewerUrl/);
assert.match(skill, /Immediately share the read-only browser `viewerUrl`/);
assert.match(skill, /URL contains a local meeting token/);
for (const term of forbiddenRuntimeTerms) {
  assert.doesNotMatch(skill, new RegExp(term), `skill must not reference ${term}`);
}

const deepDiscussionSkill = await readFile(
  path.join(pluginRoot, "skills", "deep-discussion", "SKILL.md"),
  "utf8",
);
assert.match(deepDiscussionSkill, /name: deep-discussion/);
assert.match(deepDiscussionSkill, /\$agent-company:deep-discussion/);
assert.match(deepDiscussionSkill, /Deep Discussion mode/);
assert.match(deepDiscussionSkill, /no pre-set round limit/);
assert.match(deepDiscussionSkill, /all required participants posting final `agree`/);
assert.match(deepDiscussionSkill, /`conditional`, `disagree`, and `needs-user` never count as completion/);
assert.match(deepDiscussionSkill, /runtime may mark `consensus\.reached` true/);
assert.match(deepDiscussionSkill, /Every required participant's latest consensus position is `agree`/);
assert.match(deepDiscussionSkill, /discussionSatisfied/);
assert.match(deepDiscussionSkill, /discussionInsufficientParticipants/);
assert.match(deepDiscussionSkill, /conditionalParticipants/);
assert.match(deepDiscussionSkill, /create_meeting/);
assert.match(deepDiscussionSkill, /meeting_status/);
assert.match(deepDiscussionSkill, /viewerUrl/);
for (const term of forbiddenRuntimeTerms) {
  assert.doesNotMatch(deepDiscussionSkill, new RegExp(term), `deep discussion skill must not reference ${term}`);
}

const runtime = await readFile(path.join(pluginRoot, "server", "src", "runtime.ts"), "utf8");
assert.match(runtime, /startDiscussionServer/);
assert.match(runtime, /createMeeting/);
assert.match(runtime, /meetingStatus/);
assert.match(runtime, /postMessage/);
assert.match(runtime, /closeMeeting/);
for (const term of forbiddenRuntimeTerms) {
  assert.doesNotMatch(runtime, new RegExp(term), `runtime must not reference ${term}`);
}

const types = await readFile(path.join(pluginRoot, "server", "src", "types.ts"), "utf8");
assert.match(types, /MeetingRecord/);
assert.match(types, /MeetingMessage/);
assert.match(types, /MeetingConnection/);
assert.match(types, /DiscussionServerState/);
assert.match(types, /LegacyState/);
assert.match(types, /viewerUrl/);
assert.match(types, /conditionalParticipants/);
assert.match(types, /missingParticipants/);
assert.match(types, /discussionSatisfied/);
assert.match(types, /discussionInsufficientParticipants/);

const discussionServer = await readFile(path.join(pluginRoot, "server", "src", "discussion-server.ts"), "utf8");
assert.match(discussionServer, /createServer/);
assert.match(discussionServer, /messagesMatch = url\.pathname\.match/);
assert.match(discussionServer, /X-Agent-Company-Token|x-agent-company-token/);
assert.match(discussionServer, /--daemon/);
assert.match(discussionServer, /viewerMatch = url\.pathname\.match/);
assert.match(discussionServer, /renderMeetingViewerHtml/);

const server = await readFile(path.join(pluginRoot, "server", "src", "mcp-server.ts"), "utf8");
for (const toolName of requiredMcpTools) {
  assert.match(server, new RegExp(`name: "${toolName}"`), `mcp-server.ts missing ${toolName}`);
}
for (const term of ["delegate_task", "wait_for_task", "collect_result", "send_peer_message"]) {
  assert.doesNotMatch(server, new RegExp(term), `mcp-server.ts must not expose ${term}`);
}

const readme = await readFile(path.join(pluginRoot, "README.md"), "utf8");
assert.match(readme, /Codex native sub-agent/);
assert.match(readme, /\.agent-company\/v2/);
assert.match(readme, /\$agent-company:deep-discussion/);
assert.match(readme, /참가자 전원이 최종 `agree`/);
assert.match(readme, /`conditional` 처리/);
assert.match(readme, /viewerUrl/);
assert.match(readme, /초기 입장, 상호 반박, 입장 수정, 최종 합의 라운드/);
assert.match(readme, /적대적 라운드 기반 회의/);
assert.match(readme, /최강 반대 가설과 실패 조건/);
assert.match(readme, /조건부 동의 조건/);
assert.match(readme, /conditionalParticipants/);
assert.match(readme, /discussionSatisfied/);
assert.match(readme, /discussionInsufficientParticipants/);
assert.match(readme, /반박 부족/);

const delegationRouting = await readFile(
  path.join(pluginRoot, "references", "protocols", "delegation-routing.md"),
  "utf8",
);
assert.match(delegationRouting, /요구사항 책임 소유자 기반의 최소 조합/);
assert.match(delegationRouting, /역할 소유권 표를 참가자 선택 기준으로 사용한다/);
assert.match(delegationRouting, /관성적 전체 호출/);
assert.match(delegationRouting, /CEO 단독 처리 불가 이유/);
assert.match(delegationRouting, /브리핑, 초기 입장, 상호 반박, 입장 수정, 최종 합의 라운드/);
assert.match(delegationRouting, /메시지 sequence 또는 id/);
assert.match(delegationRouting, /생산적 반대/);
assert.match(delegationRouting, /반박 없는 즉시 동의/);

const ceoRole = await readFile(path.join(pluginRoot, "references", "roles", "ceo.md"), "utf8");
assert.match(ceoRole, /요구사항 책임 소유자 기반의 최소 조합/);
assert.match(ceoRole, /단순 참고나 관성적 검토/);
assert.match(ceoRole, /상호 반박, 입장 수정, 최종 합의 라운드/);
assert.match(ceoRole, /조건부 참가자/);
assert.match(ceoRole, /반박 없는 즉시 동의/);
assert.match(ceoRole, /discussionSatisfied/);

const meetingProtocol = await readFile(path.join(pluginRoot, "references", "protocols", "meeting.md"), "utf8");
assert.match(meetingProtocol, /## 라운드/);
assert.match(meetingProtocol, /## Deep Discussion 모드/);
assert.match(meetingProtocol, /\$agent-company:deep-discussion/);
assert.match(meetingProtocol, /참가자 전원의 최종 `agree`/);
assert.match(meetingProtocol, /`conditional`, `disagree`, `needs-user`는 종료 조건으로 인정하지 않는다/);
assert.match(meetingProtocol, /`consensus\.reached`가 `conditional`을 포함해 true/);
assert.match(meetingProtocol, /메시지 sequence 또는 id/);
assert.match(meetingProtocol, /conditionalParticipants/);
assert.match(meetingProtocol, /discussionSatisfied/);
assert.match(meetingProtocol, /discussionInsufficientParticipants/);
assert.match(meetingProtocol, /생산적 반대/);
assert.match(meetingProtocol, /최강 반대 가설/);
assert.match(meetingProtocol, /즉시 전원 동의/);

const outputContracts = await readFile(path.join(pluginRoot, "references", "protocols", "output-contracts.md"), "utf8");
assert.match(outputContracts, /상호 반박 메시지/);
assert.match(outputContracts, /참조한 메시지 sequence 또는 id/);
assert.match(outputContracts, /최강 반대 가설/);
assert.match(outputContracts, /주요 전제에 대한 반박/);

const roleFiles = await readdir(path.join(pluginRoot, "references", "roles"));
for (const fileName of roleFiles.filter((file) => file.endsWith(".md"))) {
  const content = await readFile(path.join(pluginRoot, "references", "roles", fileName), "utf8");
  assert.match(content, /## 역할 목적/);
  assert.match(content, /## 작업 절차/);
  assert.match(content, /## 품질 기준/);
  if (fileName !== "ceo.md") {
    assert.match(content, /참조한 다른 직원 메시지/);
    assert.match(content, /실질 반박/);
  }
}

const pluginFiles = await collectFiles(pluginRoot);
for (const filePath of pluginFiles) {
  const relative = path.relative(pluginRoot, filePath);
  assert.doesNotMatch(relative, /^office\//, "Office UI files must be removed in v2");
  if (relative.endsWith(".ts") || relative.endsWith(".md") || relative.endsWith(".json")) {
    const content = await readFile(filePath, "utf8");
    if (relative !== "README.md") {
      assert.doesNotMatch(content, /Kanban|Dot Office/, `${relative} must not reference old Office UI`);
    }
  }
}

await runMcpSmokeTest(mcp.mcpServers["agent-company"]);

console.log("plugin validation passed");

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  const ignoredEntries = new Set([
    ".git",
    ".agent-company",
    ".agents",
    "node_modules",
    "plugins",
    "plan.md",
    "checklist.md",
    "context-notes.md",
  ]);
  for (const entry of entries) {
    if (ignoredEntries.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function runMcpSmokeTest(serverConfig) {
  const child = spawn(serverConfig.command, serverConfig.args, {
    cwd: pluginRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutBuffer = "";
  let stderr = "";
  const responses = new Map();

  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`MCP smoke test timed out${stderr ? `: ${stderr}` : ""}`));
      child.kill("SIGTERM");
    }, 5000);

    const finish = () => {
      if (responses.has(1) && responses.has(2)) {
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf8");
      try {
        while (true) {
          const parsed = readMcpMessageLine(stdoutBuffer);
          if (!parsed) {
            break;
          }
          stdoutBuffer = stdoutBuffer.slice(parsed.bytesRead);
          if (!parsed.line) {
            continue;
          }
          const message = JSON.parse(parsed.line);
          responses.set(message.id, message);
        }
        finish();
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      if (responses.has(1) && responses.has(2)) {
        return;
      }
      clearTimeout(timeout);
      reject(new Error(`MCP smoke test server exited before responding: code=${code} signal=${signal}`));
    });
  });

  child.stdin.write(writeMcpMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "validate-plugin", version: "0.0.0" },
    },
  }));
  child.stdin.write(writeMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));

  try {
    await ready;
  } finally {
    child.kill("SIGTERM");
  }

  const initialize = responses.get(1);
  assert.equal(initialize?.result?.serverInfo?.name, "agent-company");
  assert.equal(initialize?.result?.serverInfo?.version, "0.2.0");

  const tools = responses.get(2)?.result?.tools;
  assert.ok(Array.isArray(tools), "tools/list must return a tools array");
  const toolNames = new Set(tools.map((tool) => tool.name));
  for (const toolName of requiredMcpTools) {
    assert.ok(toolNames.has(toolName), `tools/list missing ${toolName}`);
  }
}

function writeMcpMessage(payload) {
  return `${JSON.stringify(payload)}\n`;
}

function readMcpMessageLine(buffer) {
  const newlineIndex = buffer.indexOf("\n");
  if (newlineIndex === -1) {
    return null;
  }
  return {
    line: buffer.slice(0, newlineIndex).trim(),
    bytesRead: newlineIndex + 1,
  };
}
