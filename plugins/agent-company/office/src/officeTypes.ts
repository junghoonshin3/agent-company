// Agent Company 오피스 대시보드의 공유 타입을 정의한다.
export const ROLE_IDS = [
  "service-planner",
  "researcher",
  "ui-ux-designer",
  "architect",
  "fullstack-developer",
  "qa-engineer",
  "release-manager",
  "knowledge-manager",
] as const;

export type RoleId = (typeof ROLE_IDS)[number];

export const TASK_STATUSES = ["queued", "delegated", "completed", "blocked", "failed"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

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

export type RoleActivityStatus = "idle" | "working" | "done" | "blocked" | "failed";

export interface OfficeState {
  generatedAt: string;
  projectPath: string;
  roles: OfficeRole[];
  tasks: OfficeTask[];
  recentMeetings: OfficeMeeting[];
}

export interface OfficeRole {
  id: RoleId;
  title: string;
  windowName: string;
}

export interface OfficeTask {
  id: string;
  role: RoleId;
  title: string;
  status: TaskStatus;
  taskType?: TaskType;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  summary?: string;
}

export interface OfficeMeeting {
  id: string;
  title: string;
  createdAt: string;
  participants: RoleId[];
  decisions: string[];
  nextActions: string[];
  roleClaims: OfficeMeetingRoleClaim[];
  summary?: string;
}

export interface OfficeMeetingRoleClaim {
  role: RoleId;
  roleTitle: string;
  summary: string;
  recorded: boolean;
  sourceTaskId?: string;
  sourceTaskTitle?: string;
}
