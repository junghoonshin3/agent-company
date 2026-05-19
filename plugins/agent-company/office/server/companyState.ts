// .agent-company 파일 상태를 대시보드 API 응답으로 정규화한다.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ROLE_IDS, TASK_STATUSES } from "../src/officeTypes.ts";
import type { OfficeMeeting, OfficeMeetingRoleClaim, OfficeRole, OfficeState, OfficeTask, RoleId, TaskStatus, TaskType } from "../src/officeTypes.ts";

const STATE_DIR_NAME = ".agent-company";
const RECENT_MEETING_LIMIT = 5;
const FALLBACK_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const CLAIM_TASK_WINDOW_MS = 4 * 60 * 60 * 1000;
const CLAIM_TASK_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MIN_TOPIC_OVERLAP = 2;
const PROJECT_TOPIC_TOKENS = new Set(["agent", "mobile", "office", "todo"]);

const DEFAULT_ROLE_META: Record<RoleId, { title: string; windowName: string }> = {
  "service-planner": { title: "서비스 기획자", windowName: "planner" },
  researcher: { title: "리서치 담당자", windowName: "research" },
  "ui-ux-designer": { title: "UI/UX 디자이너", windowName: "ui-ux" },
  architect: { title: "프로젝트 아키텍트", windowName: "architect" },
  "fullstack-developer": { title: "풀스택 개발자", windowName: "developer" },
  "qa-engineer": { title: "QA 엔지니어", windowName: "qa" },
  "release-manager": { title: "릴리즈 담당자", windowName: "release" },
  "knowledge-manager": { title: "기록·지식관리 담당자", windowName: "knowledge" },
};

const TASK_TYPES: TaskType[] = [
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

type JsonObject = Record<string, unknown>;

export async function readOfficeState(projectPathInput: string): Promise<OfficeState> {
  const projectPath = path.resolve(projectPathInput);
  const stateDir = path.join(projectPath, STATE_DIR_NAME);
  const [config, board] = await Promise.all([
    readJsonObject(path.join(stateDir, "config.json")),
    readJsonObject(path.join(stateDir, "board.json")),
  ]);
  const tasks = await normalizeTasks(board, stateDir);
  const recentMeetings = await readRecentMeetings(stateDir, tasks);

  return {
    generatedAt: new Date().toISOString(),
    projectPath: readString(config.projectPath) ?? projectPath,
    roles: normalizeRoles(config),
    tasks,
    recentMeetings,
  };
}

export function normalizeRoles(config: JsonObject): OfficeRole[] {
  const roles = readRecord(config.roles);
  if (!roles) {
    return [];
  }

  return ROLE_IDS.flatMap((roleId) => {
    const rawRole = readRecord(roles[roleId]);
    if (!rawRole) {
      return [];
    }

    return {
      id: roleId,
      title: readString(rawRole.title) ?? DEFAULT_ROLE_META[roleId].title,
      windowName: readString(rawRole.windowName) ?? DEFAULT_ROLE_META[roleId].windowName,
    };
  });
}

export async function normalizeTasks(board: JsonObject, stateDir: string): Promise<OfficeTask[]> {
  const rawTasks = Array.isArray(board.tasks) ? board.tasks : [];
  const normalizedTasks = await Promise.all(rawTasks.map((rawTask) => normalizeTask(rawTask, stateDir)));

  return normalizedTasks
    .filter((task): task is OfficeTask => task !== null)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

async function normalizeTask(rawTask: unknown, stateDir: string): Promise<OfficeTask | null> {
  const task = readRecord(rawTask);
  if (!task) {
    return null;
  }

  const id = readString(task.id);
  const role = readRoleId(task.role);
  if (!id || !role) {
    return null;
  }

  const donePath = resolveDonePath(task, stateDir, id);
  const done = donePath ? await readJsonObject(donePath) : {};
  const status = readTaskStatus(done.status) ?? readTaskStatus(task.status) ?? "failed";
  const completedAt = readString(task.completedAt) ?? readString(done.completedAt);
  const createdAt = readString(task.createdAt) ?? readString(task.updatedAt) ?? completedAt ?? FALLBACK_TIMESTAMP;
  const updatedAt = readString(task.updatedAt) ?? completedAt ?? createdAt;
  const summary = readSummary(done);
  const taskType = readTaskType(task.taskType);

  return {
    id,
    role,
    title: readString(task.title) ?? id,
    status,
    ...(taskType ? { taskType } : {}),
    createdAt,
    updatedAt,
    ...(completedAt ? { completedAt } : {}),
    ...(summary ? { summary } : {}),
  };
}

async function readRecentMeetings(stateDir: string, tasks: OfficeTask[]): Promise<OfficeMeeting[]> {
  const meetingsDir = path.join(stateDir, "meetings");
  let entries: string[];
  try {
    entries = await fs.readdir(meetingsDir);
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }

  const meetings = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".md"))
      .map(async (entry) => {
        const meetingPath = path.join(meetingsDir, entry);
        const [content, stats] = await Promise.all([
          fs.readFile(meetingPath, "utf8"),
          fs.stat(meetingPath),
        ]);
        const id = path.basename(entry, ".md");
        const title = parseMarkdownTitle(content) ?? id;
        const createdAt = parseCreatedAt(content) ?? stats.mtime.toISOString();
        const participants = parseParticipants(content);
        const summary = parseMarkdownSection(content, "Summary");
        return {
          id,
          title,
          participants,
          decisions: parseMarkdownListSection(content, "Decisions"),
          nextActions: parseMarkdownListSection(content, "Next Actions"),
          roleClaims: deriveMeetingRoleClaims({ title, createdAt, participants }, tasks),
          ...(summary ? { summary } : {}),
          createdAt,
        };
      }),
  );

  return meetings
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, RECENT_MEETING_LIMIT);
}

async function readJsonObject(filePath: string): Promise<JsonObject> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    return readRecord(parsed) ?? {};
  } catch (error) {
    if (isNotFound(error)) {
      return {};
    }
    throw error;
  }
}

function resolveDonePath(task: JsonObject, stateDir: string, id: string): string {
  const rawDonePath = readString(task.donePath);
  if (rawDonePath) {
    return path.isAbsolute(rawDonePath) ? rawDonePath : path.join(stateDir, rawDonePath);
  }

  const outboxDir = readString(task.outboxDir);
  if (outboxDir) {
    return path.join(path.isAbsolute(outboxDir) ? outboxDir : path.join(stateDir, outboxDir), "done.json");
  }

  return path.join(stateDir, "outbox", id, "done.json");
}

function readSummary(done: JsonObject): string | undefined {
  return readString(done.summary) ?? readString(done.blockedNeeds) ?? readString(done.blocked_needs);
}

function parseMarkdownTitle(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function parseCreatedAt(content: string): string | undefined {
  const match = content.match(/^Created:\s*(.+)$/m);
  return match?.[1]?.trim();
}

function parseParticipants(content: string): RoleId[] {
  const match = content.match(/^Participants:\s*(.+)$/m);
  if (!match) {
    return [];
  }

  return match[1]
    .split(",")
    .map((participant) => readRoleId(participant.trim()))
    .filter((participant): participant is RoleId => Boolean(participant));
}

function parseMarkdownSection(content: string, heading: string): string | undefined {
  const lines = content.split(/\r?\n/);
  const headingLine = `## ${heading}`;
  const startIndex = lines.findIndex((line) => line.trim() === headingLine);
  if (startIndex < 0) {
    return undefined;
  }

  const sectionLines: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      break;
    }
    sectionLines.push(lines[index]);
  }

  return sectionLines.join("\n").trim() || undefined;
}

function parseMarkdownListSection(content: string, heading: string): string[] {
  const section = parseMarkdownSection(content, heading);
  if (!section) {
    return [];
  }

  return section
    .split(/\r?\n/)
    .map((line) => line.match(/^-\s+(.+)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item) && item !== "None");
}

function deriveMeetingRoleClaims(
  meeting: Pick<OfficeMeeting, "title" | "createdAt" | "participants">,
  tasks: OfficeTask[],
): OfficeMeetingRoleClaim[] {
  return meeting.participants.map((role) => {
    const sourceTask = findSourceTaskForMeetingRole(meeting, role, tasks);

    return {
      role,
      roleTitle: DEFAULT_ROLE_META[role].title,
      summary: sourceTask?.summary ?? "회의 전 같은 주제의 개별 작업 요약을 찾지 못했습니다.",
      recorded: Boolean(sourceTask?.summary),
      ...(sourceTask ? { sourceTaskId: sourceTask.id, sourceTaskTitle: sourceTask.title } : {}),
    };
  });
}

function findSourceTaskForMeetingRole(
  meeting: Pick<OfficeMeeting, "title" | "createdAt">,
  role: RoleId,
  tasks: OfficeTask[],
): OfficeTask | undefined {
  const meetingTime = Date.parse(meeting.createdAt);
  if (Number.isNaN(meetingTime)) {
    return undefined;
  }

  return tasks
    .filter((task) => task.role === role && Boolean(task.summary))
    .map((task) => {
      const taskTime = Date.parse(task.completedAt ?? task.updatedAt);
      const distanceMs = meetingTime - taskTime;
      const topicOverlap = countTopicOverlap(meeting.title, task.title);

      return { task, distanceMs, topicOverlap };
    })
    .filter(({ distanceMs, topicOverlap }) => (
      distanceMs >= -CLAIM_TASK_FUTURE_TOLERANCE_MS
      && distanceMs <= CLAIM_TASK_WINDOW_MS
      && topicOverlap >= MIN_TOPIC_OVERLAP
    ))
    .sort((left, right) => (
      right.topicOverlap - left.topicOverlap
      || Math.abs(left.distanceMs) - Math.abs(right.distanceMs)
    ))[0]?.task;
}

function countTopicOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokenizeTopic(left));
  const rightTokens = new Set(tokenizeTopic(right));
  let count = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      count += 1;
    }
  }

  return count;
}

function tokenizeTopic(value: string): string[] {
  return value
    .toLocaleLowerCase("ko-KR")
    .split(/[^0-9a-z가-힣]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !PROJECT_TOPIC_TOKENS.has(token));
}

function readRoleId(value: unknown): RoleId | undefined {
  return typeof value === "string" && ROLE_IDS.includes(value as RoleId) ? value as RoleId : undefined;
}

function readTaskStatus(value: unknown): TaskStatus | undefined {
  return typeof value === "string" && TASK_STATUSES.includes(value as TaskStatus) ? value as TaskStatus : undefined;
}

function readTaskType(value: unknown): TaskType | undefined {
  return typeof value === "string" && TASK_TYPES.includes(value as TaskType) ? value as TaskType : undefined;
}

function readRecord(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as JsonObject;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
