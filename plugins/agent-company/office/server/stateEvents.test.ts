// Agent Office SSE 상태 이벤트 헬퍼를 검증한다.
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { OfficeState } from "../src/officeTypes";
import { createOfficeStateEventHub, formatServerSentEvent, shouldBroadcastForStatePath } from "./stateEvents";

describe("stateEvents", () => {
  it("formats named server-sent events", () => {
    expect(formatServerSentEvent("state", { ok: true })).toBe("event: state\ndata: {\"ok\":true}\n\n");
  });

  it("filters relevant state file paths", () => {
    expect(shouldBroadcastForStatePath("board.json")).toBe(true);
    expect(shouldBroadcastForStatePath("tasks/task.json")).toBe(true);
    expect(shouldBroadcastForStatePath("outbox/task/done.json")).toBe(true);
    expect(shouldBroadcastForStatePath("meetings/meeting.md")).toBe(true);
    expect(shouldBroadcastForStatePath("office/server.log")).toBe(false);
  });

  it("sends initial state and removes closed clients", async () => {
    const request = new EventEmitter();
    const response = new MockResponse();
    const hub = createOfficeStateEventHub("/project", {
      heartbeatMs: 0,
      readState: async () => makeOfficeState("2026-05-19T08:00:00.000Z"),
      watch: false,
    });

    await hub.handle(request as never, response as never);

    expect(response.statusCode).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(response.writes.join("")).toContain("event: state");
    expect(response.writes.join("")).toContain("\"generatedAt\":\"2026-05-19T08:00:00.000Z\"");
    expect(hub.clientCount()).toBe(1);

    request.emit("close");
    expect(hub.clientCount()).toBe(0);
    hub.close();
  });

  it("broadcasts refreshed state to connected clients", async () => {
    const request = new EventEmitter();
    const response = new MockResponse();
    let generatedAt = "2026-05-19T08:00:00.000Z";
    const hub = createOfficeStateEventHub("/project", {
      heartbeatMs: 0,
      readState: async () => makeOfficeState(generatedAt),
      watch: false,
    });

    await hub.handle(request as never, response as never);
    generatedAt = "2026-05-19T08:00:01.000Z";
    await hub.broadcastState();

    expect(response.writes.join("")).toContain("\"generatedAt\":\"2026-05-19T08:00:01.000Z\"");
    request.emit("close");
    hub.close();
  });
});

class MockResponse {
  statusCode = 0;
  readonly headers = new Map<string, string>();
  readonly writes: string[] = [];
  ended = false;

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }

  flushHeaders(): void {
    return undefined;
  }

  write(chunk: string): boolean {
    this.writes.push(chunk);
    return true;
  }

  end(): void {
    this.ended = true;
  }
}

function makeOfficeState(generatedAt: string): OfficeState {
  return {
    generatedAt,
    projectPath: "/project",
    roles: [],
    tasks: [],
    recentMeetings: [],
  };
}
