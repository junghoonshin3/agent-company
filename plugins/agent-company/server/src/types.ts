// Agent Company 런타임에서 공유하는 타입을 정의한다.
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

export type TaskStatus = "queued" | "delegated" | "completed" | "blocked" | "failed";

export type TaskType =
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

export type DiscussionStatus =
  | "opened"
  | "round1"
  | "round2"
  | "round3"
  | "closed";

export type DiscussionRoundName =
  | "round1"
  | "round2"
  | "round3";

export interface RoleDefinition {
  id: RoleId;
  title: string;
  windowName: string;
  sandbox: "read-only" | "workspace-write";
  approvalPolicy: "on-request" | "never";
  writable: boolean;
  useSearch?: boolean;
  referencePath: string;
  defaultTaskType: TaskType;
  requiredResultHeadings: string[];
}

export interface CompanyConfig {
  projectPath: string;
  stateDir: string;
  sessionName: string;
  worktreeRoot: string;
  roles: Record<RoleId, RoleState>;
  createdAt: string;
  updatedAt: string;
}

export interface RoleState {
  id: RoleId;
  title: string;
  windowName: string;
  worktreePath: string;
  inboxDir: string;
  sandbox: string;
}

export interface TaskRecord {
  id: string;
  role: RoleId;
  title: string;
  instructions: string;
  expectedOutput: string;
  taskType?: TaskType;
  status: TaskStatus;
  inboxPath: string;
  outboxDir: string;
  resultPath: string;
  donePath: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  validationErrors?: string[];
}

export interface TaskStatusFiles {
  resultExists: boolean;
  doneExists: boolean;
  resultBytes?: number;
  doneBytes?: number;
}

export interface TaskStatusResult {
  task: TaskRecord;
  computedStatus: TaskStatus;
  files: TaskStatusFiles;
  done?: unknown;
  doneError?: string;
  summary?: string;
  blockedNeeds?: string;
  resultPreview?: string;
  resultPreviewTruncated: boolean;
  validationErrors?: string[];
}

export interface Board {
  tasks: TaskRecord[];
  updatedAt: string;
}

export interface MeetingRecord {
  id: string;
  title: string;
  participants: RoleId[];
  summary: string;
  decisions: string[];
  openQuestions: string[];
  nextActions: string[];
  discussionId?: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingMetadata {
  id: string;
  title: string;
  participants: RoleId[];
  discussionId?: string;
  path: string;
  createdAt: string;
}

export interface DiscussionRound {
  round: DiscussionRoundName;
  taskIds: string[];
  summary: string;
  path: string;
  createdAt: string;
}

export interface DiscussionRecord {
  id: string;
  title: string;
  question: string;
  participants: RoleId[];
  context: string;
  expectedDecision: string;
  status: DiscussionStatus;
  rounds: DiscussionRound[];
  path: string;
  roundsDir: string;
  createdAt: string;
  updatedAt: string;
  conclusion?: string;
  agreements?: string[];
  disagreements?: string[];
  decision?: string;
  nextActions?: string[];
  meetingId?: string;
  decisionId?: string;
  closedAt?: string;
}

export interface DiscussionMetadata {
  id: string;
  title: string;
  question: string;
  participants: RoleId[];
  status: DiscussionStatus;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface PeerMessageRecord {
  id: string;
  fromRole: RoleId;
  toRole: RoleId;
  title: string;
  message: string;
  discussionId?: string;
  taskId?: string;
  inReplyTo?: string;
  path: string;
  markdownPath: string;
  inboxPath: string;
  createdAt: string;
}

export interface PeerMessageMetadata {
  id: string;
  fromRole: RoleId;
  toRole: RoleId;
  title: string;
  discussionId?: string;
  taskId?: string;
  inReplyTo?: string;
  path: string;
  markdownPath: string;
  inboxPath: string;
  createdAt: string;
}

export interface CompanyStatus {
  config: CompanyConfig;
  board: Board;
  recentMeetings: MeetingMetadata[];
  recentDiscussions: DiscussionMetadata[];
  recentPeerMessages: PeerMessageMetadata[];
  officeDashboard: OfficeDashboardState;
  tmuxSession: string;
}

export type OfficeDashboardStatus = "running" | "stopped" | "failed" | "unknown";

export interface OfficeDashboardState {
  status: OfficeDashboardStatus;
  infoPath: string;
  logPath: string;
  pidPath: string;
  errorPath: string;
  url?: string;
  networkUrls?: string[];
  pid?: number;
  error?: string;
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

export interface DelegateTaskInput {
  role: RoleId;
  title: string;
  instructions: string;
  expected_output: string;
  task_type?: TaskType;
}

export interface WaitForTaskInput {
  task_id: string;
  timeout_sec?: number;
}

export interface TaskStatusInput {
  task_id: string;
  preview_chars?: number;
}

export interface CollectResultInput {
  task_id: string;
}

export interface RecordDecisionInput {
  summary: string;
  rationale: string;
  risk_level: RiskLevel;
  discussion_id?: string;
}

export interface RecordMeetingInput {
  title: string;
  participants: RoleId[];
  summary: string;
  decisions: string[];
  open_questions: string[];
  next_actions: string[];
  discussion_id?: string;
}

export interface StartDiscussionInput {
  title: string;
  question: string;
  participants: RoleId[];
  context: string;
  expected_decision: string;
}

export interface AppendDiscussionRoundInput {
  discussion_id: string;
  round: DiscussionRoundName | number | string;
  task_ids: string[];
  summary: string;
}

export interface CloseDiscussionInput {
  discussion_id: string;
  conclusion: string;
  agreements: string[];
  disagreements: string[];
  decision: string;
  next_actions: string[];
  meeting_id?: string;
  decision_id?: string;
}

export interface SendPeerMessageInput {
  from_role: RoleId;
  to_role: RoleId;
  title: string;
  message: string;
  discussion_id?: string;
  task_id?: string;
  in_reply_to?: string;
}
