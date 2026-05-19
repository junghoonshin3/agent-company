// 역할별 작업 목록을 오피스 캐릭터 상태로 변환한다.
import type { OfficeTask, RoleActivityStatus, RoleId, TaskStatus } from "./officeTypes";

const ACTIVE_TASK_STATUSES: TaskStatus[] = ["delegated", "queued"];

export function getRoleActivityStatus(role: RoleId, tasks: OfficeTask[]): RoleActivityStatus {
  const roleTasks = tasks.filter((task) => task.role === role);
  if (roleTasks.length === 0) {
    return "idle";
  }

  if (roleTasks.some((task) => ACTIVE_TASK_STATUSES.includes(task.status))) {
    return "working";
  }

  const latestTask = [...roleTasks].sort((left, right) => {
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  })[0];

  if (latestTask.status === "blocked") {
    return "blocked";
  }

  if (latestTask.status === "failed") {
    return "failed";
  }

  if (latestTask.status === "completed") {
    return "done";
  }

  return "idle";
}

export function getLatestRoleTask(role: RoleId, tasks: OfficeTask[]): OfficeTask | undefined {
  return tasks
    .filter((task) => task.role === role)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

export function getRecentRoleTasks(role: RoleId, tasks: OfficeTask[], limit: number): OfficeTask[] {
  return tasks
    .filter((task) => task.role === role)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, Math.max(0, limit));
}
