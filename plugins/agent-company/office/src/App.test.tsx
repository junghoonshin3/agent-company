// Agent Office 대시보드의 주요 상호작용을 검증한다.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { OfficeState } from "./officeTypes";

describe("App dashboard interactions", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => makeOfficeState(),
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders live state events and prioritizes active work", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-05-19T08:00:00.000Z"));
    vi.stubGlobal("EventSource", MockEventSource);
    render(<App />);

    expect(MockEventSource.instances[0].url).toBe("/api/company/events");

    await act(async () => {
      MockEventSource.instances[0].emit("state", new MessageEvent("state", {
        data: JSON.stringify(makeOfficeState()),
      }));
    });

    expect(screen.getByText("실시간 연결됨")).toBeTruthy();
    expect(screen.getByLabelText("현재 작업 중 수").textContent).toBe("1");
    expect(screen.getByText("현재 작업 중")).toBeTruthy();
    expect(screen.getAllByText("진행 중 작업").length).toBeGreaterThan(1);
    expect(screen.getAllByText("진행 10분째").length).toBeGreaterThan(1);
  });

  it("falls back to polling when live events fail", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    render(<App />);

    await act(async () => {
      MockEventSource.instances[0].emit("error", new Event("error"));
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    expect(MockEventSource.instances[0].closed).toBe(true);
    expect(await screen.findByText("폴링으로 동기화 중")).toBeTruthy();
  });

  it("filters Kanban columns by role activity status", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole("button", { name: /전체\s*3/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /작업 중\s*1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /완료\s*1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /대기\s*1/ })).toBeTruthy();
    expect(screen.getByLabelText("최근 작업 수").textContent).toBe("2");

    await user.click(screen.getByRole("button", { name: /작업 중\s*1/ }));
    expect(getVisibleColumnRoleIds()).toEqual(["service-planner"]);

    await user.click(screen.getByRole("button", { name: /완료\s*1/ }));
    expect(getVisibleColumnRoleIds()).toEqual(["qa-engineer"]);

    await user.click(screen.getByRole("button", { name: /실패\s*0/ }));
    expect(getVisibleColumnRoleIds()).toEqual([]);
    expect(screen.getByText("선택한 진행상황의 에이전트가 없습니다.")).toBeTruthy();
  });

  it("expands recent meetings with agent claims and conclusion flow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /mobile-todo v2 기능 회의/ }));

    expect(screen.getByText("에이전트 주장")).toBeTruthy();
    expect(screen.getAllByText("서비스 기획자").length).toBeGreaterThan(1);
    expect(screen.getByText("편집 가능한 기본기를 주장했습니다.")).toBeTruthy();
    expect(screen.getAllByText("QA 엔지니어").length).toBeGreaterThan(1);
    expect(screen.getByText("회귀 위험을 먼저 검증해야 한다고 봤습니다.")).toBeTruthy();
    expect(screen.getByText("결론 흐름")).toBeTruthy();
    expect(screen.getByText("인라인 수정과 실행취소를 v2 후보로 둔다.")).toBeTruthy();
    expect(screen.getByText("구현 전에 검증 기준을 확정한다.")).toBeTruthy();
  });
});

function getVisibleColumnRoleIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".kanban-column"))
    .map((column) => column.dataset.roleId ?? "");
}

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  closed = false;
  private readonly listeners = new Map<string, EventListener[]>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, event: Event | MessageEvent): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function makeOfficeState(): OfficeState {
  return {
    generatedAt: "2026-05-19T08:00:00.000Z",
    projectPath: "/project",
    roles: [
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
      {
        id: "architect",
        title: "프로젝트 아키텍트",
        windowName: "architect",
      },
    ],
    tasks: [
      {
        id: "working-task",
        role: "service-planner",
        title: "진행 중 작업",
        status: "queued",
        createdAt: "2026-05-19T07:50:00.000Z",
        updatedAt: "2026-05-19T07:59:00.000Z",
        summary: "진행 중입니다.",
      },
      {
        id: "done-task",
        role: "qa-engineer",
        title: "완료 작업",
        status: "completed",
        createdAt: "2026-05-19T07:40:00.000Z",
        updatedAt: "2026-05-19T07:58:00.000Z",
        summary: "완료됐습니다.",
      },
    ],
    recentMeetings: [
      {
        id: "meeting-1",
        title: "mobile-todo v2 기능 회의",
        createdAt: "2026-05-19T07:50:00.000Z",
        participants: ["service-planner", "qa-engineer"],
        summary: "각 역할이 v2 후보와 검증 기준을 검토했다.",
        decisions: ["인라인 수정과 실행취소를 v2 후보로 둔다."],
        nextActions: ["구현 전에 검증 기준을 확정한다."],
        roleClaims: [
          {
            role: "service-planner",
            roleTitle: "서비스 기획자",
            summary: "편집 가능한 기본기를 주장했습니다.",
            recorded: true,
            sourceTaskId: "planner-task",
            sourceTaskTitle: "v2 기능 범위",
          },
          {
            role: "qa-engineer",
            roleTitle: "QA 엔지니어",
            summary: "회귀 위험을 먼저 검증해야 한다고 봤습니다.",
            recorded: true,
            sourceTaskId: "qa-task",
            sourceTaskTitle: "v2 QA 검토",
          },
        ],
      },
    ],
  };
}
