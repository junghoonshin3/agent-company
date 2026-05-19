// 역할 상태 매핑 규칙을 검증한다.
import { describe, expect, it } from "vitest";
import type { OfficeTask, RoleId, TaskStatus } from "./officeTypes";
import { getLatestRoleTask, getRecentRoleTasks, getRoleActivityStatus } from "./status";

describe("getRoleActivityStatus", () => {
  it("returns idle when the role has no tasks", () => {
    expect(getRoleActivityStatus("architect", [])).toBe("idle");
  });

  it("returns working when any delegated or queued task exists", () => {
    const tasks = [
      makeTask("old", "qa-engineer", "completed", "2026-05-19T00:00:00.000Z"),
      makeTask("new", "qa-engineer", "queued", "2026-05-19T01:00:00.000Z"),
    ];

    expect(getRoleActivityStatus("qa-engineer", tasks)).toBe("working");
  });

  it("maps the latest finished task status when there is no active task", () => {
    const tasks = [
      makeTask("old", "service-planner", "completed", "2026-05-19T00:00:00.000Z"),
      makeTask("new", "service-planner", "blocked", "2026-05-19T01:00:00.000Z"),
    ];

    expect(getRoleActivityStatus("service-planner", tasks)).toBe("blocked");
  });

  it("keeps failed and completed as failed and done", () => {
    expect(getRoleActivityStatus("researcher", [
      makeTask("failed", "researcher", "failed", "2026-05-19T02:00:00.000Z"),
    ])).toBe("failed");
    expect(getRoleActivityStatus("fullstack-developer", [
      makeTask("done", "fullstack-developer", "completed", "2026-05-19T02:00:00.000Z"),
    ])).toBe("done");
  });
});

describe("getLatestRoleTask", () => {
  it("returns the most recently updated task for a role", () => {
    const latest = makeTask("latest", "ui-ux-designer", "completed", "2026-05-19T03:00:00.000Z");
    const tasks = [
      makeTask("older", "ui-ux-designer", "completed", "2026-05-19T01:00:00.000Z"),
      latest,
    ];

    expect(getLatestRoleTask("ui-ux-designer", tasks)).toEqual(latest);
  });
});

describe("getRecentRoleTasks", () => {
  it("returns the latest tasks for one role up to the requested limit", () => {
    const tasks = [
      makeTask("old", "ui-ux-designer", "completed", "2026-05-19T01:00:00.000Z"),
      makeTask("other-role", "qa-engineer", "completed", "2026-05-19T04:00:00.000Z"),
      makeTask("newest", "ui-ux-designer", "delegated", "2026-05-19T03:00:00.000Z"),
      makeTask("middle", "ui-ux-designer", "blocked", "2026-05-19T02:00:00.000Z"),
    ];

    expect(getRecentRoleTasks("ui-ux-designer", tasks, 2).map((task) => task.id)).toEqual([
      "newest",
      "middle",
    ]);
  });

  it("returns no tasks when the requested limit is zero", () => {
    expect(getRecentRoleTasks("architect", [
      makeTask("task", "architect", "completed", "2026-05-19T01:00:00.000Z"),
    ], 0)).toEqual([]);
  });
});

function makeTask(id: string, role: RoleId, status: TaskStatus, updatedAt: string): OfficeTask {
  return {
    id,
    role,
    title: id,
    status,
    createdAt: updatedAt,
    updatedAt,
  };
}
