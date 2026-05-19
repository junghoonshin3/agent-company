// Agent Company 내장 오피스 대시보드의 정적 구조와 안전 가드를 검증한다.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(appDir, "../../..");

const readAppFile = (relativePath) => readFile(path.join(appDir, relativePath), "utf8");

const [html, css, packageJson, app, main, api, status, types, server, stateEvents, viteConfig] = await Promise.all([
  readAppFile("index.html"),
  readAppFile("styles.css"),
  readFile(path.join(repoDir, "package.json"), "utf8"),
  readAppFile("src/App.tsx"),
  readAppFile("src/main.tsx"),
  readAppFile("src/api.ts"),
  readAppFile("src/status.ts"),
  readAppFile("src/officeTypes.ts"),
  readAppFile("server/companyState.ts"),
  readAppFile("server/stateEvents.ts"),
  readAppFile("vite.config.ts"),
]);

const source = [html, css, app, main, api, status, types, server, stateEvents, viteConfig].join("\n");
const parsedPackage = JSON.parse(packageJson);

for (const selector of [
  'id="root"',
  'type="module"',
  'src="/src/main.tsx"',
]) {
  assert.ok(html.includes(selector), `missing HTML hook: ${selector}`);
}

for (const required of [
  '"dev:agent-office"',
  '"build:agent-office"',
  '"typecheck:agent-office"',
  '"test:agent-office"',
  "vite",
  "react",
  "typescript",
  "vitest",
]) {
  assert.ok(packageJson.includes(required), `missing package wiring: ${required}`);
}
assert.equal(parsedPackage.scripts["dev:agent-office"], "vite --host 127.0.0.1 plugins/agent-company/office");
assert.equal(parsedPackage.scripts["build:agent-office"], "vite build plugins/agent-company/office");
assert.equal(parsedPackage.scripts["typecheck:agent-office"], "tsc -p plugins/agent-company/office/tsconfig.json --noEmit");
assert.equal(parsedPackage.scripts["test:agent-office:unit"], "vitest run --root plugins/agent-company/office --config vite.config.ts");
assert.ok(!packageJson.includes("examples/agent-office"), "package scripts must not reference examples/agent-office");

for (const required of [
  'id="office-dashboard"',
  'id="office-floor"',
  'id="role-grid"',
  'id="active-work"',
  'id="task-kanban"',
  'id="meeting-list"',
  "POLL_INTERVAL_MS = 1500",
  "CLOCK_INTERVAL_MS = 30000",
  "ROLE_TASK_LIMIT = 3",
  'ACTIVE_TASK_STATUSES: OfficeTask["status"][] = ["delegated", "queued"]',
  "type KanbanStatusFilter = RoleActivityStatus | \"all\"",
  "KANBAN_FILTER_OPTIONS",
  "ActiveWorkPanel",
  "ActiveTaskCard",
  "현재 작업 중",
  "getSyncStatusLabel",
  "formatElapsedTime",
  'aria-label="칸반 진행상황 필터"',
  "kanban-filter-button--active",
  "visibleRoleStatuses",
  "kanban-filter-empty",
  "data-role-id={role.id}",
  "data-role-status={status}",
  "getRoleActivityStatus(role.id",
  "getRecentRoleTasks(role.id",
  "RoleKanbanColumn key={role.id} role={role} status={status}",
  "data-task-status={task.status}",
  "expandedMeetingId",
  "MeetingRow",
  "aria-expanded={isExpanded}",
  "에이전트 주장",
  "결론 흐름",
]) {
  assert.ok(app.includes(required), `missing app behavior: ${required}`);
}

for (const required of [
  'fetch("/api/company/state"',
  'new EventSource("/api/company/events")',
  'Accept: "application/json"',
  "subscribeToOfficeState",
]) {
  assert.ok(api.includes(required), `missing API client behavior: ${required}`);
}

for (const required of [
  'ACTIVE_TASK_STATUSES: TaskStatus[] = ["delegated", "queued"]',
  'return "working"',
  'return "blocked"',
  'return "failed"',
  'return "done"',
  'return "idle"',
  "getRecentRoleTasks",
]) {
  assert.ok(status.includes(required), `missing status mapping behavior: ${required}`);
}

for (const required of [
  "export interface OfficeState",
  "generatedAt: string",
  "projectPath: string",
  "recentMeetings: OfficeMeeting[]",
  "createdAt: string",
  "roleClaims: OfficeMeetingRoleClaim[]",
  "export interface OfficeMeetingRoleClaim",
  'export type RoleActivityStatus = "idle" | "working" | "done" | "blocked" | "failed"',
]) {
  assert.ok(types.includes(required), `missing office type contract: ${required}`);
}

for (const required of [
  'STATE_DIR_NAME = ".agent-company"',
  '../src/officeTypes.ts',
  'readJsonObject(path.join(stateDir, "config.json"))',
  'readJsonObject(path.join(stateDir, "board.json"))',
  'readRecentMeetings(stateDir, tasks)',
  "resolveDonePath(task, stateDir, id)",
  "readSummary(done)",
  "parseMarkdownSection(content, \"Summary\")",
  "parseMarkdownListSection(content, \"Decisions\")",
  "deriveMeetingRoleClaims",
  "countTopicOverlap",
]) {
  assert.ok(server.includes(required), `missing state API normalization: ${required}`);
}

for (const required of [
  "createOfficeStateEventHub",
  "formatServerSentEvent",
  "shouldBroadcastForStatePath",
  "text/event-stream; charset=utf-8",
  "event: ${eventName}",
  "data: ${JSON.stringify(data)}",
  'STATE_DIR_NAME = ".agent-company"',
]) {
  assert.ok(stateEvents.includes(required), `missing SSE event behavior: ${required}`);
}

for (const required of [
  'server.middlewares.use("/api/company/state"',
  'server.middlewares.use("/api/company/events"',
  "createOfficeStateEventHub(projectRoot)",
  "readOfficeState(projectRoot)",
  "agentOfficeStateApi()",
  'path.resolve(appDir, "../../..")',
]) {
  assert.ok(viteConfig.includes(required), `missing Vite API middleware: ${required}`);
}

for (const forbidden of [/https?:\/\//, /\bcdn\b/i, /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /dangerouslySetInnerHTML/]) {
  assert.equal(forbidden.test(source), false, `forbidden pattern found: ${forbidden}`);
}

for (const required of [
  ".office-floor",
  ".role-grid",
  ".role-desk",
  ".active-work-panel",
  ".active-work-list",
  ".active-task-card",
  ".active-task-times",
  ".kanban-board",
  ".kanban-filter",
  ".kanban-filter-button",
  ".kanban-filter-button--active",
  ".kanban-filter-empty",
  ".kanban-column",
  ".kanban-card",
  ".kanban-card-elapsed",
  ".sync-dot--live",
  ".sync-dot--polling",
  ".meeting-trigger",
  ".meeting-detail",
  ".meeting-claim-list",
  ".meeting-decision-list",
  ".pixel-worker",
  ".pixel-head",
  ".pixel-body",
  ".pixel-desk",
  ".pixel-monitor",
  ".status-badge--working",
  ".status-badge--blocked",
  ".status-badge--failed",
  "@media (max-width: 620px)",
  "overflow-wrap: anywhere",
]) {
  assert.ok(css.includes(required), `missing CSS guard: ${required}`);
}

console.log("agent office validation passed");
