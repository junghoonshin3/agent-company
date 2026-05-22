// Agent Company v2의 파일 기반 회사 상태를 읽고 쓴다.
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ROLE_DEFINITIONS, getRole } from "./roles.ts";
import type {
  CompanyConfig,
  ConsensusPosition,
  ConsensusSnapshot,
  DecisionRecord,
  DiscussionServerState,
  LegacyState,
  MeetingMessage,
  MeetingMetadata,
  MeetingRecord,
  MessageKind,
  RiskLevel,
  RoleId,
} from "./types.ts";

export const LEGACY_STATE_DIR_NAME = ".agent-company";
export const V2_STATE_DIR_NAME = "v2";
export const DEFAULT_CONSENSUS_POLICY =
  "모든 필수 참가자가 agree 또는 conditional 입장을 남기면 합의로 본다.";

export function resolveProjectPath(projectPathInput: string): string {
  return path.resolve(projectPathInput);
}

export function statePaths(projectPath: string) {
  const legacyStateDir = path.join(projectPath, LEGACY_STATE_DIR_NAME);
  const stateDir = path.join(legacyStateDir, V2_STATE_DIR_NAME);
  const serverDir = path.join(stateDir, "server");
  return {
    projectPath,
    legacyStateDir,
    stateDir,
    configPath: path.join(stateDir, "config.json"),
    meetingsDir: path.join(stateDir, "meetings"),
    decisionsPath: path.join(stateDir, "decisions.jsonl"),
    serverDir,
    serverInfoPath: path.join(serverDir, "server-info.json"),
    serverPidPath: path.join(serverDir, "server.pid"),
    serverLogPath: path.join(serverDir, "server.log"),
    serverTokenPath: path.join(serverDir, "server.token"),
  };
}

export async function ensureCompanyState(projectPath: string): Promise<CompanyConfig> {
  await assertDirectory(projectPath);
  const paths = statePaths(projectPath);
  await fs.mkdir(paths.meetingsDir, { recursive: true });
  await fs.mkdir(paths.serverDir, { recursive: true });
  await ensureFile(paths.decisionsPath, "");

  const existing = await readJsonIfExists<CompanyConfig>(paths.configPath);
  const now = nowIso();
  const config: CompanyConfig = {
    version: "2",
    projectPath,
    legacyStateDir: paths.legacyStateDir,
    stateDir: paths.stateDir,
    roles: ROLE_DEFINITIONS.map((role) => ({ ...role })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await writeJson(paths.configPath, config);
  await ensureServerToken(projectPath);
  return config;
}

export async function loadCompanyConfig(projectPath: string): Promise<CompanyConfig> {
  const paths = statePaths(projectPath);
  const config = await readJsonIfExists<CompanyConfig>(paths.configPath);
  if (!config) {
    throw new Error(`Agent Company v2 is not started for ${projectPath}`);
  }
  return config;
}

export async function readLegacyState(projectPath: string): Promise<LegacyState> {
  const paths = statePaths(projectPath);
  const configPath = path.join(paths.legacyStateDir, "config.json");
  const boardPath = path.join(paths.legacyStateDir, "board.json");
  const exists = await pathExists(paths.legacyStateDir);
  return {
    exists,
    ...((await pathExists(configPath)) ? { configPath } : {}),
    ...((await pathExists(boardPath)) ? { boardPath } : {}),
  };
}

export async function ensureServerToken(projectPath: string): Promise<string> {
  const paths = statePaths(projectPath);
  await fs.mkdir(paths.serverDir, { recursive: true });
  if (await pathExists(paths.serverTokenPath)) {
    const existing = (await fs.readFile(paths.serverTokenPath, "utf8")).trim();
    if (existing) {
      return existing;
    }
  }
  const token = randomUUID().replace(/-/g, "");
  await fs.writeFile(paths.serverTokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  return token;
}

export async function readServerToken(projectPath: string): Promise<string> {
  const paths = statePaths(projectPath);
  const token = (await fs.readFile(paths.serverTokenPath, "utf8")).trim();
  if (!token) {
    throw new Error("Agent Company discussion server token is empty");
  }
  return token;
}

export async function readServerState(projectPath: string): Promise<DiscussionServerState> {
  const paths = statePaths(projectPath);
  const [info, pid] = await Promise.all([
    readJsonIfExists<{ url?: string; pid?: number; error?: string }>(paths.serverInfoPath),
    readPidIfExists(paths.serverPidPath),
  ]);
  const running = pid ? isProcessRunning(pid) : false;
  const base = {
    infoPath: paths.serverInfoPath,
    pidPath: paths.serverPidPath,
    logPath: paths.serverLogPath,
    tokenPath: paths.serverTokenPath,
    ...(info?.url ? { url: info.url } : {}),
    ...(pid ? { pid } : {}),
  };
  if (running) {
    return { status: "running", ...base };
  }
  if (info?.error) {
    return { status: "failed", ...base, error: info.error };
  }
  if (pid || info) {
    return {
      status: "unknown",
      ...base,
      error: "Discussion server state files exist, but the process is not running.",
    };
  }
  return { status: "stopped", ...base };
}

export async function writeServerInfo(projectPath: string, info: { url: string; pid: number }): Promise<void> {
  const paths = statePaths(projectPath);
  await fs.mkdir(paths.serverDir, { recursive: true });
  await writeJson(paths.serverInfoPath, {
    url: info.url,
    pid: info.pid,
    createdAt: nowIso(),
  });
  await fs.writeFile(paths.serverPidPath, `${info.pid}\n`, "utf8");
}

export async function clearServerPid(projectPath: string): Promise<void> {
  const paths = statePaths(projectPath);
  await fs.rm(paths.serverPidPath, { force: true });
}

export async function createMeetingRecord(input: {
  projectPath: string;
  title: string;
  goal: string;
  participants: RoleId[];
  consensusPolicy?: string;
}): Promise<MeetingRecord> {
  const paths = statePaths(input.projectPath);
  const title = requireNonEmpty(input.title, "title");
  const goal = requireNonEmpty(input.goal, "goal");
  const participants = normalizeParticipants(input.participants);
  const createdAt = nowIso();
  const id = `${dateStamp()}-${slugify(title)}-${randomUUID().slice(0, 6)}`;
  const meetingDir = path.join(paths.meetingsDir, id);
  const record: MeetingRecord = {
    id,
    title,
    goal,
    participants,
    status: "open",
    consensusPolicy: input.consensusPolicy?.trim() || DEFAULT_CONSENSUS_POLICY,
    path: path.join(meetingDir, "meeting.json"),
    messagesPath: path.join(meetingDir, "messages.jsonl"),
    createdAt,
    updatedAt: createdAt,
  };
  await fs.mkdir(meetingDir, { recursive: true });
  await writeJson(record.path, record);
  await ensureFile(record.messagesPath, "");
  return record;
}

export async function readMeetingRecord(projectPath: string, meetingId: string): Promise<MeetingRecord> {
  const paths = statePaths(projectPath);
  const recordPath = path.join(paths.meetingsDir, requireNonEmpty(meetingId, "meeting_id"), "meeting.json");
  const record = await readJsonIfExists<MeetingRecord>(recordPath);
  if (!record) {
    throw new Error(`Meeting ${meetingId} does not exist`);
  }
  return record;
}

export async function appendMeetingMessage(input: {
  projectPath: string;
  meetingId: string;
  role: RoleId;
  kind?: MessageKind;
  message: string;
  position?: ConsensusPosition;
}): Promise<MeetingMessage> {
  const role = getRole(input.role);
  const meeting = await readMeetingRecord(input.projectPath, input.meetingId);
  if (meeting.status !== "open") {
    throw new Error(`Meeting ${meeting.id} is closed`);
  }
  if (!meeting.participants.includes(role.id) && role.id !== "ceo") {
    throw new Error(`${role.id} is not a participant in meeting ${meeting.id}`);
  }
  const messages = await readMeetingMessages(input.projectPath, input.meetingId);
  const createdAt = nowIso();
  const record: MeetingMessage = {
    id: `${meeting.id}-m${messages.length + 1}-${randomUUID().slice(0, 6)}`,
    meetingId: meeting.id,
    sequence: messages.length + 1,
    role: role.id,
    kind: normalizeMessageKind(input.kind),
    message: requireNonEmpty(input.message, "message"),
    ...(input.position ? { position: normalizeConsensusPosition(input.position) } : {}),
    createdAt,
  };
  await fs.appendFile(meeting.messagesPath, `${JSON.stringify(record)}\n`, "utf8");
  await writeJson(meeting.path, { ...meeting, updatedAt: createdAt });
  return record;
}

export async function readMeetingMessages(
  projectPath: string,
  meetingId: string,
  afterSequence = 0,
): Promise<MeetingMessage[]> {
  const meeting = await readMeetingRecord(projectPath, meetingId);
  if (!(await pathExists(meeting.messagesPath))) {
    return [];
  }
  const raw = await fs.readFile(meeting.messagesPath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MeetingMessage)
    .filter((message) => message.sequence > afterSequence);
}

export async function closeMeetingRecord(input: {
  projectPath: string;
  meetingId: string;
  summary: string;
  consensus: string;
  unresolvedQuestions?: string[];
  nextActions?: string[];
}): Promise<MeetingRecord> {
  const meeting = await readMeetingRecord(input.projectPath, input.meetingId);
  if (meeting.status === "closed") {
    return meeting;
  }
  const closedAt = nowIso();
  const updated: MeetingRecord = {
    ...meeting,
    status: "closed",
    closedAt,
    updatedAt: closedAt,
    summary: requireNonEmpty(input.summary, "summary"),
    consensus: requireNonEmpty(input.consensus, "consensus"),
    unresolvedQuestions: normalizeStringArray(input.unresolvedQuestions),
    nextActions: normalizeStringArray(input.nextActions),
  };
  await writeJson(updated.path, updated);
  return updated;
}

export async function listMeetingMetadata(projectPath: string): Promise<MeetingMetadata[]> {
  const paths = statePaths(projectPath);
  if (!(await pathExists(paths.meetingsDir))) {
    return [];
  }
  const entries = await fs.readdir(paths.meetingsDir, { withFileTypes: true });
  const meetings = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readMeetingRecord(projectPath, entry.name)),
  );
  return meetings
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(meetingMetadata);
}

export function computeConsensus(meeting: MeetingRecord, messages: MeetingMessage[]): ConsensusSnapshot {
  const positions: Partial<Record<RoleId, ConsensusPosition>> = {};
  for (const message of messages) {
    if (message.position && meeting.participants.includes(message.role)) {
      positions[message.role] = message.position;
    }
  }
  const blockers = meeting.participants.filter((participant) => {
    const position = positions[participant];
    return position === "disagree" || position === "needs-user";
  });
  const reached = meeting.participants.every((participant) => {
    const position = positions[participant];
    return position === "agree" || position === "conditional";
  });
  return { requiredParticipants: meeting.participants, positions, reached, blockers };
}

export async function appendDecisionRecord(input: {
  projectPath: string;
  meetingId?: string;
  summary: string;
  rationale: string;
  riskLevel: RiskLevel;
}): Promise<DecisionRecord> {
  const paths = statePaths(input.projectPath);
  const record: DecisionRecord = {
    id: `${dateStamp()}-decision-${randomUUID().slice(0, 6)}`,
    ...(input.meetingId ? { meetingId: input.meetingId } : {}),
    summary: requireNonEmpty(input.summary, "summary"),
    rationale: requireNonEmpty(input.rationale, "rationale"),
    riskLevel: normalizeRiskLevel(input.riskLevel),
    createdAt: nowIso(),
  };
  await fs.mkdir(path.dirname(paths.decisionsPath), { recursive: true });
  await fs.appendFile(paths.decisionsPath, `${JSON.stringify(record)}\n`, "utf8");
  return record;
}

export async function readRecentDecisions(projectPath: string, limit = 5): Promise<DecisionRecord[]> {
  const paths = statePaths(projectPath);
  if (!(await pathExists(paths.decisionsPath))) {
    return [];
  }
  const raw = await fs.readFile(paths.decisionsPath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DecisionRecord)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export function meetingMetadata(record: MeetingRecord): MeetingMetadata {
  return {
    id: record.id,
    title: record.title,
    goal: record.goal,
    participants: record.participants,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.closedAt ? { closedAt: record.closedAt } : {}),
    ...(record.summary ? { summary: record.summary } : {}),
    ...(record.consensus ? { consensus: record.consensus } : {}),
  };
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

async function assertDirectory(dir: string): Promise<void> {
  const stat = await fs.stat(dir);
  if (!stat.isDirectory()) {
    throw new Error(`${dir} is not a directory`);
  }
}

async function ensureFile(filePath: string, content: string): Promise<void> {
  if (await pathExists(filePath)) {
    return;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function readPidIfExists(filePath: string): Promise<number | undefined> {
  if (!(await pathExists(filePath))) {
    return undefined;
  }
  const value = Number((await fs.readFile(filePath, "utf8")).trim());
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function normalizeParticipants(participants: RoleId[]): RoleId[] {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error("participants must include at least one role");
  }
  return [...new Set(participants.map((participant) => getRole(participant).id))];
}

function normalizeMessageKind(kind: MessageKind | undefined): MessageKind {
  const value = kind ?? "statement";
  if (!["statement", "reply", "consensus", "question", "result", "system"].includes(value)) {
    throw new Error(`Unknown message kind: ${String(kind)}`);
  }
  return value;
}

function normalizeConsensusPosition(position: ConsensusPosition): ConsensusPosition {
  if (!["agree", "conditional", "disagree", "needs-user"].includes(position)) {
    throw new Error(`Unknown consensus position: ${String(position)}`);
  }
  return position;
}

function normalizeRiskLevel(value: RiskLevel): RiskLevel {
  if (!["low", "medium", "high"].includes(value)) {
    throw new Error(`Unknown risk_level: ${String(value)}`);
  }
  return value;
}

function normalizeStringArray(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function requireNonEmpty(value: string | undefined, name: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw new Error(`${name} is required`);
  }
  return normalized;
}

function dateStamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "meeting";
}
