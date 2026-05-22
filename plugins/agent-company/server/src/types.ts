// Agent Company v2 런타임에서 공유하는 상태 타입을 정의한다.
export type RoleId =
  | "ceo"
  | "service-planner"
  | "researcher"
  | "ui-ux-designer"
  | "architect"
  | "fullstack-developer"
  | "qa-engineer"
  | "release-manager"
  | "knowledge-manager";

export type TaskCategory =
  | "planning"
  | "research"
  | "design"
  | "architecture"
  | "implementation"
  | "qa"
  | "release"
  | "knowledge"
  | "general";

export type RiskLevel = "low" | "medium" | "high";
export type ServerStatus = "running" | "stopped" | "failed" | "unknown";
export type MeetingStatus = "open" | "closed";
export type MessageKind = "statement" | "reply" | "consensus" | "question" | "result" | "system";
export type ConsensusPosition = "agree" | "conditional" | "disagree" | "needs-user";

export interface RoleDefinition {
  id: RoleId;
  title: string;
  referencePath: string;
  category: TaskCategory;
  canEdit: boolean;
  useSearch?: boolean;
}

export interface RoleState {
  id: RoleId;
  title: string;
  referencePath: string;
  category: TaskCategory;
  canEdit: boolean;
  useSearch?: boolean;
}

export interface CompanyConfig {
  version: "2";
  projectPath: string;
  legacyStateDir: string;
  stateDir: string;
  roles: RoleState[];
  createdAt: string;
  updatedAt: string;
}

export interface LegacyState {
  exists: boolean;
  configPath?: string;
  boardPath?: string;
}

export interface DiscussionServerState {
  status: ServerStatus;
  infoPath: string;
  pidPath: string;
  logPath: string;
  tokenPath: string;
  url?: string;
  pid?: number;
  error?: string;
}

export interface CompanyStatus {
  config: CompanyConfig;
  server: DiscussionServerState;
  activeMeetings: MeetingMetadata[];
  recentMeetings: MeetingMetadata[];
  recentDecisions: DecisionRecord[];
  legacyState: LegacyState;
}

export interface MeetingRecord {
  id: string;
  title: string;
  goal: string;
  participants: RoleId[];
  status: MeetingStatus;
  consensusPolicy: string;
  path: string;
  messagesPath: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  summary?: string;
  consensus?: string;
  unresolvedQuestions?: string[];
  nextActions?: string[];
}

export interface MeetingMetadata {
  id: string;
  title: string;
  goal: string;
  participants: RoleId[];
  status: MeetingStatus;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  summary?: string;
  consensus?: string;
}

export interface MeetingMessage {
  id: string;
  meetingId: string;
  sequence: number;
  role: RoleId;
  kind: MessageKind;
  message: string;
  position?: ConsensusPosition;
  createdAt: string;
}

export interface ConsensusSnapshot {
  requiredParticipants: RoleId[];
  positions: Partial<Record<RoleId, ConsensusPosition>>;
  reached: boolean;
  blockers: RoleId[];
}

export interface MeetingConnection {
  url: string;
  tokenHeader: "X-Agent-Company-Token";
  token: string;
  meetingUrl: string;
  messagesUrl: string;
}

export interface MeetingStatusResult {
  meeting: MeetingRecord;
  messages: MeetingMessage[];
  nextSequence: number;
  consensus: ConsensusSnapshot;
  connection?: MeetingConnection;
}

export interface DecisionRecord {
  id: string;
  meetingId?: string;
  summary: string;
  rationale: string;
  riskLevel: RiskLevel;
  createdAt: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface CommandRunner {
  run(command: string, args: string[], options?: { cwd?: string }): Promise<CommandResult>;
}

export interface StartCompanyInput {
  project_path: string;
}

export interface CreateMeetingInput {
  project_path?: string;
  title: string;
  goal: string;
  participants: RoleId[];
  consensus_policy?: string;
}

export interface MeetingStatusInput {
  project_path?: string;
  meeting_id: string;
  after_sequence?: number;
}

export interface PostMessageInput {
  project_path?: string;
  meeting_id: string;
  role: RoleId;
  kind?: MessageKind;
  message: string;
  position?: ConsensusPosition;
}

export interface CloseMeetingInput {
  project_path?: string;
  meeting_id: string;
  summary: string;
  consensus: string;
  unresolved_questions?: string[];
  next_actions?: string[];
}

export interface RecordDecisionInput {
  project_path?: string;
  meeting_id?: string;
  summary: string;
  rationale: string;
  risk_level: RiskLevel;
}
