// @vitest-environment node
// 파일 기반 Agent Company 상태 정규화를 검증한다.
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readOfficeState } from "./companyState";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("readOfficeState", () => {
  it("normalizes roles, tasks, done summaries, and recent meetings", async () => {
    const projectPath = await makeFixtureProject();
    const state = await readOfficeState(projectPath);

    expect(state.projectPath).toBe(projectPath);
    expect(state.roles).toEqual([
      {
        id: "service-planner",
        title: "서비스 기획자",
        windowName: "planner",
      },
      {
        id: "qa-engineer",
        title: "QA 엔지니어",
        windowName: "qa",
      },
    ]);
    expect(state.tasks).toEqual([
      {
        id: "task-2",
        role: "qa-engineer",
        title: "QA 검토",
        status: "blocked",
        taskType: "qa",
        createdAt: "2026-05-19T03:00:00.000Z",
        updatedAt: "2026-05-19T03:00:00.000Z",
        summary: "테스트 계정이 필요합니다.",
      },
      {
        id: "task-1",
        role: "service-planner",
        title: "범위 정리",
        status: "completed",
        taskType: "planning",
        createdAt: "2026-05-19T02:00:00.000Z",
        updatedAt: "2026-05-19T02:00:00.000Z",
        completedAt: "2026-05-19T02:00:00.000Z",
        summary: "MVP 범위를 확정했습니다.",
      },
    ]);
    expect(state.recentMeetings).toEqual([
      {
        id: "20260519T020000Z-newer",
        title: "범위 정리 QA 검토 회의",
        participants: ["service-planner", "qa-engineer"],
        decisions: ["MVP 범위를 유지한다."],
        nextActions: ["구현 전에 QA 기준을 반영한다."],
        roleClaims: [
          {
            role: "service-planner",
            roleTitle: "서비스 기획자",
            summary: "MVP 범위를 확정했습니다.",
            recorded: true,
            sourceTaskId: "task-1",
            sourceTaskTitle: "범위 정리",
          },
          {
            role: "qa-engineer",
            roleTitle: "QA 엔지니어",
            summary: "테스트 계정이 필요합니다.",
            recorded: true,
            sourceTaskId: "task-2",
            sourceTaskTitle: "QA 검토",
          },
        ],
        summary: "서비스 기획자와 QA 엔지니어가 범위와 검증 기준을 확인했다.",
        createdAt: "2026-05-19T03:05:00.000Z",
      },
      {
        id: "20260519T010000Z-older",
        title: "이전 회의",
        participants: [],
        decisions: [],
        nextActions: [],
        roleClaims: [],
        createdAt: "2026-05-19T01:00:00.000Z",
      },
    ]);
  });
});

async function makeFixtureProject(): Promise<string> {
  const projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "agent-office-"));
  tempRoots.push(projectPath);
  const stateDir = path.join(projectPath, ".agent-company");
  await fs.mkdir(path.join(stateDir, "outbox", "task-1"), { recursive: true });
  await fs.mkdir(path.join(stateDir, "outbox", "task-2"), { recursive: true });
  await fs.mkdir(path.join(stateDir, "meetings"), { recursive: true });

  await writeJson(path.join(stateDir, "config.json"), {
    projectPath,
    roles: {
      "service-planner": {
        id: "service-planner",
        title: "서비스 기획자",
        windowName: "planner",
      },
      "qa-engineer": {
        id: "qa-engineer",
        title: "QA 엔지니어",
        windowName: "qa",
      },
    },
  });
  await writeJson(path.join(stateDir, "board.json"), {
    tasks: [
      {
        id: "task-1",
        role: "service-planner",
        title: "범위 정리",
        status: "delegated",
        taskType: "planning",
        donePath: path.join(stateDir, "outbox", "task-1", "done.json"),
        updatedAt: "2026-05-19T02:00:00.000Z",
        completedAt: "2026-05-19T02:00:00.000Z",
      },
      {
        id: "task-2",
        role: "qa-engineer",
        title: "QA 검토",
        status: "delegated",
        taskType: "qa",
        donePath: path.join(stateDir, "outbox", "task-2", "done.json"),
        updatedAt: "2026-05-19T03:00:00.000Z",
      },
    ],
  });
  await writeJson(path.join(stateDir, "outbox", "task-1", "done.json"), {
    status: "completed",
    summary: "MVP 범위를 확정했습니다.",
  });
  await writeJson(path.join(stateDir, "outbox", "task-2", "done.json"), {
    status: "blocked",
    blocked_needs: "테스트 계정이 필요합니다.",
  });
  await fs.writeFile(path.join(stateDir, "meetings", "20260519T010000Z-older.md"), [
    "# 이전 회의",
    "",
    "Created: 2026-05-19T01:00:00.000Z",
    "",
  ].join("\n"), "utf8");
  await fs.writeFile(path.join(stateDir, "meetings", "20260519T020000Z-newer.md"), [
    "# 범위 정리 QA 검토 회의",
    "",
    "Created: 2026-05-19T03:05:00.000Z",
    "Participants: service-planner, qa-engineer",
    "",
    "## Summary",
    "",
    "서비스 기획자와 QA 엔지니어가 범위와 검증 기준을 확인했다.",
    "",
    "## Decisions",
    "",
    "- MVP 범위를 유지한다.",
    "",
    "## Next Actions",
    "",
    "- 구현 전에 QA 기준을 반영한다.",
  ].join("\n"), "utf8");

  return projectPath;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
