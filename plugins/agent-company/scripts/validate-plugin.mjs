// Agent Company v2 플러그인의 manifest와 런타임 구조를 검증한다.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(root, "plugins", "agent-company");
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
assert.ok(mcp.mcpServers?.["agent-company"], "plugins/agent-company/.mcp.json must define mcpServers.agent-company");
assert.equal(mcp.mcpServers["agent-company"].command, "node");
assert.deepEqual(mcp.mcpServers["agent-company"].args.slice(0, 2), [
  "--experimental-strip-types",
  "./server/src/mcp-server.ts",
]);

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.equal(packageJson.version, "0.2.0");
assert.equal(packageJson.scripts.test, "node --experimental-strip-types --test plugins/agent-company/server/test/*.test.ts");
assert.equal(packageJson.scripts.validate, "node plugins/agent-company/scripts/validate-plugin.mjs");
assert.equal(packageJson.scripts.check, "npm run validate && npm test");
for (const script of Object.values(packageJson.scripts)) {
  assert.doesNotMatch(String(script), /agent-office|vite|office/);
}
assert.ok(!packageJson.dependencies || Object.keys(packageJson.dependencies).length === 0);

const skill = await readFile(path.join(pluginRoot, "skills", "company", "SKILL.md"), "utf8");
assert.match(skill, /CEO Plan Mode/);
assert.match(skill, /Do not describe yourself as a gateway/);
assert.match(skill, /Codex native sub-agents/);
assert.match(skill, /create_meeting/);
assert.match(skill, /meeting_status/);
assert.match(skill, /post_message/);
assert.match(skill, /close_meeting/);
assert.match(skill, /X-Agent-Company-Token/);
for (const term of forbiddenRuntimeTerms) {
  assert.doesNotMatch(skill, new RegExp(term), `skill must not reference ${term}`);
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

const discussionServer = await readFile(path.join(pluginRoot, "server", "src", "discussion-server.ts"), "utf8");
assert.match(discussionServer, /createServer/);
assert.match(discussionServer, /messagesMatch = url\.pathname\.match/);
assert.match(discussionServer, /X-Agent-Company-Token|x-agent-company-token/);
assert.match(discussionServer, /--daemon/);

const server = await readFile(path.join(pluginRoot, "server", "src", "mcp-server.ts"), "utf8");
for (const toolName of requiredMcpTools) {
  assert.match(server, new RegExp(`name: "${toolName}"`), `mcp-server.ts missing ${toolName}`);
}
for (const term of ["delegate_task", "wait_for_task", "collect_result", "send_peer_message"]) {
  assert.doesNotMatch(server, new RegExp(term), `mcp-server.ts must not expose ${term}`);
}

const readme = await readFile(path.join(pluginRoot, "README.md"), "utf8");
assert.match(readme, /Codex native sub-agents/);
assert.match(readme, /\.agent-company\/v2/);
assert.match(readme, /The old tmux task tools were removed in v2/);

const roleFiles = await readdir(path.join(pluginRoot, "references", "roles"));
for (const fileName of roleFiles.filter((file) => file.endsWith(".md"))) {
  const content = await readFile(path.join(pluginRoot, "references", "roles", fileName), "utf8");
  assert.match(content, /## 역할 목적/);
  assert.match(content, /## 작업 절차/);
  assert.match(content, /## 품질 기준/);
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
  for (const entry of entries) {
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
