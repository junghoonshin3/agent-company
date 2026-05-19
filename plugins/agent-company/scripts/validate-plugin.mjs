// Agent Company 플러그인의 manifest와 marketplace 구조를 검증한다.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(root, "plugins", "agent-company");
const officeRoot = path.join(pluginRoot, "office");
const requiredRoleSections = [
  "## 역할 목적",
  "## 언제 호출되는가",
  "## 입력 확인",
  "## 작업 절차",
  "## 핸드오프 경계",
  "## result.md 템플릿",
  "## 차단 조건",
  "## 품질 기준",
  "## 완료 체크리스트",
  "## 금지 사항",
];
const roleRequirements = {
  "service-planner.md": ["## 문제 정의", "## 권장 범위", "## 성공 기준", "## 확인 질문"],
  "researcher.md": ["## 확인된 사실", "## 추정", "## 후보 평가", "## 리스크"],
  "ui-ux-designer.md": ["## 사용자 흐름", "## 화면 구조", "## 상호작용", "## 접근성"],
  "architect.md": ["## 권장 구조", "## 데이터 흐름", "## 리스크", "## 구현 순서"],
  "fullstack-developer.md": ["## 변경 요약", "## 변경 파일", "## 검증", "## 남은 리스크"],
  "qa-engineer.md": ["## 테스트 관점", "## 수동 확인", "## 자동 검증", "## 차단 이슈"],
  "release-manager.md": ["## 릴리즈 노트", "## 배포 체크리스트", "## 롤백", "## 승인 필요 항목"],
  "knowledge-manager.md": ["## 결정사항", "## 근거", "## 열린 질문", "## 다음 액션"],
};
const taskTypes = [
  "planning",
  "research",
  "design",
  "architecture",
  "implementation",
  "qa",
  "release",
  "knowledge",
  "general",
];
const requiredMcpTools = [
  "start_company",
  "company_status",
  "delegate_task",
  "record_meeting",
  "start_discussion",
  "send_peer_message",
];

const plugin = JSON.parse(await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
assert.equal(plugin.name, "agent-company");
assert.equal(plugin.version, "0.1.6");
assert.equal(plugin.skills, "./skills/");
assert.equal(plugin.mcpServers, "./.mcp.json");
assert.equal(plugin.interface.displayName, "Agent Company");

const mcp = JSON.parse(await readFile(path.join(pluginRoot, ".mcp.json"), "utf8"));
assert.ok(!("mcp_servers" in mcp), "plugins/agent-company/.mcp.json must not use legacy mcp_servers key");
assert.ok(mcp.mcpServers?.["agent-company"], "plugins/agent-company/.mcp.json must define mcpServers.agent-company");
assert.equal(mcp.mcpServers["agent-company"].command, "node");
assert.deepEqual(mcp.mcpServers["agent-company"].args.slice(0, 2), [
  "--experimental-strip-types",
  "./server/src/mcp-server.ts",
]);

const marketplace = JSON.parse(await readFile(path.join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
assert.equal(marketplace.name, "agentinc-local");
const entry = marketplace.plugins.find((candidate) => candidate.name === "agent-company");
assert.ok(entry);
assert.equal(entry.source.path, "./plugins/agent-company");
assert.equal(entry.policy.installation, "AVAILABLE");
assert.equal(entry.policy.authentication, "ON_INSTALL");

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
assert.equal(packageJson.scripts["dev:agent-office"], "vite --host 127.0.0.1 plugins/agent-company/office");
assert.equal(packageJson.scripts["build:agent-office"], "vite build plugins/agent-company/office");
assert.equal(packageJson.scripts["typecheck:agent-office"], "tsc -p plugins/agent-company/office/tsconfig.json --noEmit");
assert.equal(packageJson.scripts["test:agent-office:unit"], "vitest run --root plugins/agent-company/office --config vite.config.ts");
assert.match(packageJson.scripts["test:agent-office"], /plugins\/agent-company\/office\/validate\.mjs/);
for (const script of Object.values(packageJson.scripts)) {
  assert.ok(!String(script).includes("examples/agent-office"), "package scripts must not reference examples/agent-office");
}

const skill = await readFile(path.join(pluginRoot, "skills", "company", "SKILL.md"), "utf8");
assert.match(skill, /name: company/);
assert.match(skill, /start_company/);
assert.match(skill, /record_meeting/);
assert.match(skill, /task_status/);
assert.match(skill, /Role Routing/);
assert.match(skill, /delegation-routing\.md/);
assert.match(skill, /focused written review/);
assert.match(skill, /start_discussion/);
assert.match(skill, /append_discussion_round/);
assert.match(skill, /close_discussion/);
assert.match(skill, /send_peer_message/);
assert.match(skill, /facilitator/);
assert.match(skill, /starts automatically when `start_company\(project_path\)`/);
assert.match(skill, /officeDashboard\.url/);
assert.match(skill, /officeDashboard\.networkUrls/);
assert.match(skill, /--host 0\.0\.0\.0/);
assert.match(skill, /auto-start-error\.json/);
assert.match(skill, /start-office\.sh/);
assert.match(skill, /stop-office\.sh/);
assert.match(skill, /--project-dir/);

const runtime = await readFile(path.join(pluginRoot, "server", "src", "runtime.ts"), "utf8");
assert.match(runtime, /START_OFFICE_SCRIPT/);
assert.match(runtime, /STOP_OFFICE_SCRIPT/);
assert.match(runtime, /startOfficeDashboard\(config\)/);
assert.match(runtime, /stopOfficeDashboard\(config\)/);
assert.match(runtime, /auto-start-error\.json/);
assert.match(runtime, /officeDashboard/);
assert.match(runtime, /networkUrlsFromInfo/);

const types = await readFile(path.join(pluginRoot, "server", "src", "types.ts"), "utf8");
assert.match(types, /officeDashboard: OfficeDashboardState/);
assert.match(types, /OfficeDashboardStatus = "running" \| "stopped" \| "failed" \| "unknown"/);
assert.match(types, /networkUrls\?: string\[\]/);

const server = await readFile(path.join(pluginRoot, "server", "src", "mcp-server.ts"), "utf8");
assert.match(server, /record_meeting/);
assert.match(server, /task_status/);
assert.match(server, /task_type/);
assert.match(server, /start_discussion/);
assert.match(server, /append_discussion_round/);
assert.match(server, /close_discussion/);
assert.match(server, /send_peer_message/);

const officeServer = await readFile(path.join(pluginRoot, "server", "src", "office-server.ts"), "utf8");
assert.match(officeServer, /createServer/);
assert.match(officeServer, /readOfficeState/);
assert.match(officeServer, /createOfficeStateEventHub/);
assert.match(officeServer, /\/api\/company\/state/);
assert.match(officeServer, /\/api\/company\/events/);
assert.match(officeServer, /office", "dist"/);
assert.match(officeServer, /server-info\.json/);
assert.match(officeServer, /server\.pid/);
assert.match(officeServer, /networkInterfaces/);
assert.match(officeServer, /networkUrls/);
assert.match(officeServer, /Run npm run build:agent-office first/);

const startOffice = await readFile(path.join(pluginRoot, "skills", "company", "scripts", "start-office.sh"), "utf8");
assert.match(startOffice, /--project-dir <project_path>/);
assert.match(startOffice, /0\.0\.0\.0/);
assert.match(startOffice, /--foreground/);
assert.match(startOffice, /server-info\.json/);
assert.match(startOffice, /server\.pid/);
assert.match(startOffice, /server\.log/);
assert.match(startOffice, /office\/dist\/index\.html/);

const stopOffice = await readFile(path.join(pluginRoot, "skills", "company", "scripts", "stop-office.sh"), "utf8");
assert.match(stopOffice, /--project-dir <project_path>/);
assert.match(stopOffice, /server-info\.json/);
assert.match(stopOffice, /server\.pid/);

const officeValidate = await readFile(path.join(officeRoot, "validate.mjs"), "utf8");
assert.match(officeValidate, /plugins\/agent-company\/office/);
assert.match(officeValidate, /examples\/agent-office/);

const officeViteConfig = await readFile(path.join(officeRoot, "vite.config.ts"), "utf8");
assert.match(officeViteConfig, /readOfficeState\(projectRoot\)/);
assert.match(officeViteConfig, /createOfficeStateEventHub\(projectRoot\)/);
assert.match(officeViteConfig, /\/api\/company\/events/);
assert.match(officeViteConfig, /path\.resolve\(appDir, "\.\.\/\.\.\/\.\."\)/);

const officeIndex = await readFile(path.join(officeRoot, "index.html"), "utf8");
assert.match(officeIndex, /id="root"/);
assert.match(officeIndex, /src="\/src\/main\.tsx"/);

const officeDistIndex = await readFile(path.join(officeRoot, "dist", "index.html"), "utf8");
assert.match(officeDistIndex, /assets\/index-/);
const officeDistAssets = await readdir(path.join(officeRoot, "dist", "assets"));
assert.ok(officeDistAssets.some((asset) => asset.endsWith(".js")), "office dist must include a bundled JavaScript asset");
assert.ok(officeDistAssets.some((asset) => asset.endsWith(".css")), "office dist must include a bundled CSS asset");

const meetingProtocol = await readFile(path.join(pluginRoot, "references", "protocols", "meeting.md"), "utf8");
assert.match(meetingProtocol, /필요한 직원에게만/);
assert.match(meetingProtocol, /역할 검토 흐름/);
assert.match(meetingProtocol, /소유 역할/);
assert.match(meetingProtocol, /협업 역할/);
assert.match(meetingProtocol, /기록·지식관리 담당자/);
assert.match(meetingProtocol, /직원 직접 메시지/);
assert.match(meetingProtocol, /회의 진행자와 최종 보고자/);

const delegationRouting = await readFile(
  path.join(pluginRoot, "references", "protocols", "delegation-routing.md"),
  "utf8",
);
assert.match(delegationRouting, /## 역할 소유권/);
assert.match(delegationRouting, /## 핸드오프 순서/);
assert.match(delegationRouting, /## 실패와 타임아웃 처리/);
assert.match(delegationRouting, /delegate_task/);
assert.match(delegationRouting, /wait_for_task/);
for (const roleTitle of [
  "서비스 기획자",
  "리서치 담당자",
  "UI\/UX 디자이너",
  "프로젝트 아키텍트",
  "풀스택 개발자",
  "QA 엔지니어",
  "릴리즈 담당자",
  "기록·지식관리 담당자",
]) {
  assert.match(delegationRouting, new RegExp(roleTitle));
}

for (const [fileName, requiredHeadings] of Object.entries(roleRequirements)) {
  const content = await readFile(path.join(pluginRoot, "references", "roles", fileName), "utf8");
  for (const section of requiredRoleSections) {
    assert.ok(content.includes(section), `${fileName} missing section ${section}`);
  }
  for (const heading of requiredHeadings) {
    assert.ok(content.includes(heading), `${fileName} missing result heading ${heading}`);
  }
}

const taskPlaybooks = await readFile(path.join(pluginRoot, "references", "protocols", "task-playbooks.md"), "utf8");
for (const taskType of taskTypes) {
  assert.ok(taskPlaybooks.includes(`## ${taskType}`), `task-playbooks.md missing ${taskType}`);
}

await runMcpSmokeTest(mcp.mcpServers["agent-company"]);

console.log("plugin validation passed");

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
