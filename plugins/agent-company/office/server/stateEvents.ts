// Agent Office 상태 변경을 SSE 이벤트로 전달한다.
import { watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { OfficeState } from "../src/officeTypes.ts";
import { readOfficeState } from "./companyState.ts";

const STATE_DIR_NAME = ".agent-company";
const DEFAULT_DEBOUNCE_MS = 120;
const DEFAULT_HEARTBEAT_MS = 15000;
const FALLBACK_POLL_MS = 1500;

interface OfficeStateEventHubOptions {
  debounceMs?: number;
  heartbeatMs?: number;
  readState?: (projectPath: string) => Promise<OfficeState>;
  watch?: boolean;
}

interface ClientRecord {
  response: ServerResponse;
  heartbeatId?: NodeJS.Timeout;
}

export interface OfficeStateEventHub {
  broadcastState: () => Promise<void>;
  close: () => void;
  clientCount: () => number;
  handle: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
}

export function createOfficeStateEventHub(
  projectPath: string,
  options: OfficeStateEventHubOptions = {},
): OfficeStateEventHub {
  const clients = new Map<ServerResponse, ClientRecord>();
  const readState = options.readState ?? readOfficeState;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const shouldWatch = options.watch ?? true;
  let watcher: FSWatcher | null = null;
  let fallbackPollId: NodeJS.Timeout | null = null;
  let debounceId: NodeJS.Timeout | null = null;
  let isBroadcasting = false;
  let shouldBroadcastAgain = false;

  async function broadcastState(): Promise<void> {
    if (clients.size === 0) {
      return;
    }

    if (isBroadcasting) {
      shouldBroadcastAgain = true;
      return;
    }

    isBroadcasting = true;
    try {
      const state = await readState(projectPath);
      writeToClients(formatServerSentEvent("state", state));
    } catch (error) {
      writeToClients(formatServerSentEvent("error", {
        message: error instanceof Error ? error.message : "Unknown office state error",
      }));
    } finally {
      isBroadcasting = false;
    }

    if (shouldBroadcastAgain) {
      shouldBroadcastAgain = false;
      await broadcastState();
    }
  }

  function scheduleBroadcast(): void {
    if (clients.size === 0) {
      return;
    }

    if (debounceId) {
      clearTimeout(debounceId);
    }

    debounceId = setTimeout(() => {
      debounceId = null;
      void broadcastState();
    }, debounceMs);
  }

  function ensureWatcher(): void {
    if (!shouldWatch || watcher || fallbackPollId) {
      return;
    }

    const stateDir = path.join(projectPath, STATE_DIR_NAME);
    try {
      watcher = watch(stateDir, { recursive: true }, (_eventType, filename) => {
        if (shouldBroadcastForStatePath(filename)) {
          scheduleBroadcast();
        }
      });
      watcher.on("error", () => {
        closeWatcher();
        ensureFallbackPoll();
      });
    } catch {
      closeWatcher();
      ensureFallbackPoll();
    }
  }

  function ensureFallbackPoll(): void {
    if (fallbackPollId) {
      return;
    }

    fallbackPollId = setInterval(() => {
      void broadcastState();
    }, FALLBACK_POLL_MS);
  }

  function closeWatcher(): void {
    watcher?.close();
    watcher = null;
  }

  function closeFallbackPoll(): void {
    if (fallbackPollId) {
      clearInterval(fallbackPollId);
      fallbackPollId = null;
    }
  }

  function removeClient(response: ServerResponse): void {
    const record = clients.get(response);
    if (!record) {
      return;
    }

    if (record.heartbeatId) {
      clearInterval(record.heartbeatId);
    }
    clients.delete(response);

    if (clients.size === 0) {
      closeWatcher();
      closeFallbackPoll();
      if (debounceId) {
        clearTimeout(debounceId);
        debounceId = null;
      }
    }
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();

    const heartbeatId = heartbeatMs > 0
      ? setInterval(() => {
        writeToClient(response, ": heartbeat\n\n");
      }, heartbeatMs)
      : undefined;

    clients.set(response, { response, heartbeatId });
    ensureWatcher();
    request.on("close", () => removeClient(response));
    await broadcastState();
  }

  function close(): void {
    closeWatcher();
    closeFallbackPoll();
    if (debounceId) {
      clearTimeout(debounceId);
      debounceId = null;
    }
    for (const response of Array.from(clients.keys())) {
      removeClient(response);
      response.end();
    }
  }

  function writeToClients(chunk: string): void {
    for (const { response } of clients.values()) {
      writeToClient(response, chunk);
    }
  }

  function writeToClient(response: ServerResponse, chunk: string): void {
    try {
      response.write(chunk);
    } catch {
      removeClient(response);
    }
  }

  return {
    broadcastState,
    close,
    clientCount: () => clients.size,
    handle,
  };
}

export function formatServerSentEvent(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function shouldBroadcastForStatePath(filename: string | Buffer | null): boolean {
  if (!filename) {
    return true;
  }

  const normalizedPath = String(filename).replace(/\\/g, "/");
  return (
    normalizedPath === "board.json" ||
    normalizedPath === "config.json" ||
    normalizedPath.startsWith("tasks/") ||
    normalizedPath.startsWith("outbox/") ||
    normalizedPath.startsWith("meetings/")
  );
}
