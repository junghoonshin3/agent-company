// Agent Company v2 직원 회의용 로컬 HTTP 서버를 실행한다.
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { openSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendMeetingMessage,
  computeConsensus,
  ensureCompanyState,
  ensureServerToken,
  listMeetingMetadata,
  loadCompanyConfig,
  readMeetingMessages,
  readMeetingRecord,
  readRecentDecisions,
  readServerState,
  readServerToken,
  resolveProjectPath,
  statePaths,
  writeJson,
  writeServerInfo,
} from "./state.ts";
import type { MessageKind, ConsensusPosition, RoleId } from "./types.ts";

interface ServerOptions {
  projectPath: string;
  host: string;
  port: number;
}

interface CliOptions {
  projectPath: string;
  host: string;
  port: number;
  daemon: boolean;
  foreground: boolean;
}

export async function startDiscussionHttpServer(options: ServerOptions): Promise<Server> {
  await ensureCompanyState(options.projectPath);
  await ensureServerToken(options.projectPath);
  const token = await readServerToken(options.projectPath);

  const server = createServer((request, response) => {
    handleRequest(options.projectPath, token, request, response).catch((error) => {
      writeJsonResponse(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Discussion server did not expose a TCP address");
  }
  await writeServerInfo(options.projectPath, {
    url: `http://${options.host}:${address.port}`,
    pid: process.pid,
  });

  return server;
}

async function handleRequest(
  projectPath: string,
  token: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (method === "GET" && url.pathname === "/health") {
    writeJsonResponse(response, 200, { ok: true });
    return;
  }

  if (!isAuthorized(request, token)) {
    writeJsonResponse(response, 401, { error: "Missing or invalid Agent Company token." });
    return;
  }

  if (method === "GET" && url.pathname === "/api/company/state") {
    const config = await loadCompanyConfig(projectPath);
    const meetings = await listMeetingMetadata(projectPath);
    writeJsonResponse(response, 200, {
      config,
      activeMeetings: meetings.filter((meeting) => meeting.status === "open"),
      recentMeetings: meetings.slice(0, 10),
      recentDecisions: await readRecentDecisions(projectPath, 10),
    });
    return;
  }

  const meetingMatch = url.pathname.match(/^\/api\/meetings\/([^/]+)$/);
  if (method === "GET" && meetingMatch) {
    const meeting = await readMeetingRecord(projectPath, decodeURIComponent(meetingMatch[1]));
    const messages = await readMeetingMessages(projectPath, meeting.id);
    writeJsonResponse(response, 200, {
      meeting,
      messages,
      nextSequence: messages.length + 1,
      consensus: computeConsensus(meeting, messages),
    });
    return;
  }

  const messagesMatch = url.pathname.match(/^\/api\/meetings\/([^/]+)\/messages$/);
  if (method === "GET" && messagesMatch) {
    const meeting = await readMeetingRecord(projectPath, decodeURIComponent(messagesMatch[1]));
    const afterSequence = Number(url.searchParams.get("after_sequence") ?? 0);
    const messages = await readMeetingMessages(projectPath, meeting.id, Number.isFinite(afterSequence) ? afterSequence : 0);
    writeJsonResponse(response, 200, {
      meeting,
      messages,
      nextSequence: messages.length > 0 ? messages[messages.length - 1].sequence + 1 : 1,
      consensus: computeConsensus(meeting, await readMeetingMessages(projectPath, meeting.id)),
    });
    return;
  }

  if (method === "POST" && messagesMatch) {
    const meetingId = decodeURIComponent(messagesMatch[1]);
    const body = await readJsonBody<{ role: RoleId; kind?: MessageKind; message: string; position?: ConsensusPosition }>(request);
    const message = await appendMeetingMessage({
      projectPath,
      meetingId,
      role: body.role,
      kind: body.kind,
      message: body.message,
      position: body.position,
    });
    writeJsonResponse(response, 201, message);
    return;
  }

  writeJsonResponse(response, 404, { error: "Not found" });
}

function isAuthorized(request: IncomingMessage, token: string): boolean {
  return request.headers["x-agent-company-token"] === token;
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk.toString("utf8");
  }
  if (!raw.trim()) {
    throw new Error("Request body is required");
  }
  return JSON.parse(raw) as T;
}

function writeJsonResponse(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

async function runCli(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.daemon) {
    await startDaemon(options);
    return;
  }
  if (!options.foreground) {
    usage();
    process.exit(2);
  }
  const server = await startDiscussionHttpServer(options);
  const shutdown = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await fs.rm(statePaths(options.projectPath).serverPidPath, { force: true });
    process.exit(0);
  };
  process.on("SIGTERM", () => {
    shutdown().catch(() => process.exit(1));
  });
  process.on("SIGINT", () => {
    shutdown().catch(() => process.exit(1));
  });
}

async function startDaemon(options: CliOptions): Promise<void> {
  await ensureCompanyState(options.projectPath);
  const state = await readServerState(options.projectPath);
  if (state.status === "running") {
    process.stdout.write(`Agent Company discussion server already running at ${state.url}\n`);
    return;
  }

  const paths = statePaths(options.projectPath);
  await fs.mkdir(paths.serverDir, { recursive: true });
  const logFd = openSync(paths.serverLogPath, "a");
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    fileURLToPath(import.meta.url),
    "--project-dir",
    options.projectPath,
    "--host",
    options.host,
    "--port",
    String(options.port),
    "--foreground",
  ], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();

  const started = Date.now();
  while (Date.now() - started < 5000) {
    const nextState = await readServerState(options.projectPath);
    if (nextState.status === "running") {
      process.stdout.write(`Agent Company discussion server running at ${nextState.url}\n`);
      return;
    }
    await sleep(100);
  }

  await writeJson(paths.serverInfoPath, {
    pid: child.pid,
    error: "Discussion server did not report readiness.",
    createdAt: new Date().toISOString(),
  });
  throw new Error(`Discussion server did not report readiness. Log: ${paths.serverLogPath}`);
}

function parseArgs(args: string[]): CliOptions {
  let projectPath = process.cwd();
  let host = "127.0.0.1";
  let port = 0;
  let daemon = false;
  let foreground = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--project-dir") {
      projectPath = resolveProjectPath(requireArg(args[++index], arg));
    } else if (arg === "--host") {
      host = requireArg(args[++index], arg);
    } else if (arg === "--port") {
      const raw = requireArg(args[++index], arg);
      port = raw === "auto" ? 0 : Number(raw);
      if (!Number.isInteger(port) || port < 0) {
        throw new Error("--port must be auto or a positive integer");
      }
    } else if (arg === "--daemon") {
      daemon = true;
    } else if (arg === "--foreground") {
      foreground = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { projectPath, host, port, daemon, foreground };
}

function requireArg(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function usage(): void {
  process.stderr.write([
    "Usage: discussion-server.ts --project-dir <project_path> [--host 127.0.0.1] [--port auto] --daemon",
    "       discussion-server.ts --project-dir <project_path> [--host 127.0.0.1] [--port 0] --foreground",
    "",
  ].join("\n"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
