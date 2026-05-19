// Agent Company 내장 오피스 대시보드와 상태 API를 제공하는 HTTP 서버다.
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { readOfficeState } from "../../office/server/companyState.ts";
import { createOfficeStateEventHub } from "../../office/server/stateEvents.ts";

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(SOURCE_DIR, "../..");
const DIST_DIR = path.join(PLUGIN_ROOT, "office", "dist");
const INDEX_HTML = path.join(DIST_DIR, "index.html");
const STATE_DIR_NAME = ".agent-company";
const OFFICE_STATE_DIR_NAME = "office";
const DEFAULT_HOST = "127.0.0.1";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

interface ServerOptions {
  projectDir: string;
  host: string;
  port: number;
}

const options = parseArgs(process.argv.slice(2));
const stateDir = path.join(options.projectDir, STATE_DIR_NAME);
const officeStateDir = path.join(stateDir, OFFICE_STATE_DIR_NAME);
const pidPath = path.join(officeStateDir, "server.pid");
const infoPath = path.join(officeStateDir, "server-info.json");
const stateEventHub = createOfficeStateEventHub(options.projectDir);

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  await ensureProjectDirectory(options.projectDir);
  await ensureBuildOutput();
  await fs.mkdir(officeStateDir, { recursive: true });

  const server = createServer((request, response) => {
    void handleRequest(request, response).catch((error) => {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unknown office server error",
      });
    });
  });

  await listen(server, options.host, options.port);
  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : options.port;
  const url = `http://${formatHostForUrl(options.host)}:${resolvedPort}/`;

  await writeServerInfo(url, resolvedPort);
  console.log(`Agent Company office dashboard: ${url}`);

  const shutdown = () => {
    stateEventHub.close();
    server.close(() => {
      void fs.rm(pidPath, { force: true }).finally(() => {
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (requestUrl.pathname === "/api/company/state") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    sendJson(response, 200, await readOfficeState(options.projectDir));
    return;
  }

  if (requestUrl.pathname === "/api/company/events") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    await stateEventHub.handle(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed");
    return;
  }

  await serveStaticAsset(request, response, requestUrl.pathname);
}

async function serveStaticAsset(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<void> {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const staticPath = path.resolve(DIST_DIR, relativePath);
  if (!isInsideDirectory(DIST_DIR, staticPath)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  const filePath = await resolveStaticFile(staticPath, request);
  if (!filePath) {
    sendText(response, 404, "Not found");
    return;
  }

  const contentType = MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream";
  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", filePath === INDEX_HTML ? "no-store" : "public, max-age=31536000, immutable");
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

async function resolveStaticFile(staticPath: string, request: IncomingMessage): Promise<string | null> {
  try {
    const stats = await fs.stat(staticPath);
    if (stats.isDirectory()) {
      const indexPath = path.join(staticPath, "index.html");
      const indexStats = await fs.stat(indexPath);
      return indexStats.isFile() ? indexPath : null;
    }
    return stats.isFile() ? staticPath : null;
  } catch (error) {
    if (!isNotFound(error)) {
      throw error;
    }
  }

  const acceptsHtml = request.headers.accept?.includes("text/html") ?? false;
  return acceptsHtml || !path.extname(staticPath) ? INDEX_HTML : null;
}

async function listen(server: ReturnType<typeof createServer>, host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      reject(error);
    };
    server.once("error", onError);
    server.listen({ host, port }, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

async function writeServerInfo(url: string, port: number): Promise<void> {
  await fs.writeFile(pidPath, `${process.pid}\n`, "utf8");
  await fs.writeFile(infoPath, `${JSON.stringify({
    url,
    host: options.host,
    port,
    pid: process.pid,
    projectDir: options.projectDir,
    distDir: DIST_DIR,
    networkUrls: getNetworkUrls(options.host, port),
    startedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
}

async function ensureProjectDirectory(projectDir: string): Promise<void> {
  const stats = await fs.stat(projectDir);
  if (!stats.isDirectory()) {
    throw new Error(`Project path is not a directory: ${projectDir}`);
  }
}

async function ensureBuildOutput(): Promise<void> {
  try {
    await fs.access(INDEX_HTML);
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(`Missing Agent Company office build at ${INDEX_HTML}. Run npm run build:agent-office first.`);
    }
    throw error;
  }
}

function parseArgs(args: string[]): ServerOptions {
  let projectDir: string | undefined;
  let host = DEFAULT_HOST;
  let port = 0;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--project-dir":
        projectDir = readValue(args, index, arg);
        index += 1;
        break;
      case "--host":
        host = readValue(args, index, arg);
        index += 1;
        break;
      case "--port": {
        const value = readValue(args, index, arg);
        port = value === "auto" ? 0 : parsePort(value);
        index += 1;
        break;
      }
      case "--help":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!projectDir) {
    throw new Error("--project-dir is required");
  }

  return {
    projectDir: path.resolve(projectDir),
    host,
    port,
  };
}

function readValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(body)}\n`);
}

function sendText(response: ServerResponse, statusCode: number, body: string): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(`${body}\n`);
}

function isInsideDirectory(parent: string, child: string): boolean {
  const relativePath = path.relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function formatHostForUrl(host: string): string {
  if (host === "0.0.0.0" || host === "::") {
    return "127.0.0.1";
  }
  return host.includes(":") ? `[${host}]` : host;
}

function getNetworkUrls(host: string, port: number): string[] {
  if (host !== "0.0.0.0" && host !== "::") {
    return [];
  }

  const urls = new Set<string>();
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.internal || address.family !== "IPv4") {
        continue;
      }
      urls.add(`http://${address.address}:${port}/`);
    }
  }
  return [...urls].sort();
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function usage(): void {
  console.log("Usage: office-server.ts --project-dir <project_path> [--host 127.0.0.1|0.0.0.0] [--port auto]");
}
