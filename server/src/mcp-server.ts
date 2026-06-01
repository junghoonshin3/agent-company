// Agent Company v2 MCP 도구를 JSON-RPC stdio 서버로 노출한다.
import { ROLE_DEFINITIONS } from "./roles.ts";
import { AgentCompanyRuntime } from "./runtime.ts";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

const runtime = new AgentCompanyRuntime();
let inputBuffer = "";
let activeProjectPath: string | undefined;

process.stdin.on("data", (chunk) => {
  inputBuffer += chunk.toString("utf8");
  drainMessages().catch((error) => {
    writeLog(`MCP drain error: ${error.stack || error.message}`);
  });
});

async function drainMessages(): Promise<void> {
  while (true) {
    const parsed = readMessageLine(inputBuffer);
    if (!parsed) {
      return;
    }
    inputBuffer = inputBuffer.slice(parsed.bytesRead);
    if (!parsed.line) {
      continue;
    }
    await handleRequest(JSON.parse(parsed.line));
  }
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  if (request.id === undefined || request.id === null) {
    return;
  }

  try {
    if (request.method === "initialize") {
      writeResponse(request.id, {
        protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "agent-company", version: "0.2.0" },
      });
      return;
    }

    if (request.method === "tools/list") {
      writeResponse(request.id, { tools: TOOL_DEFINITIONS });
      return;
    }

    if (request.method === "tools/call") {
      const name = request.params?.name;
      const args = request.params?.arguments ?? {};
      const result = await callTool(name, args);
      writeResponse(request.id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
      return;
    }

    writeError(request.id, -32601, `Unknown method: ${request.method}`);
  } catch (error) {
    writeResponse(request.id, {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    });
  }
}

async function callTool(name: string, args: any): Promise<unknown> {
  switch (name) {
    case "start_company": {
      const result = await runtime.startCompany(args);
      activeProjectPath = result.projectPath;
      return result;
    }
    case "company_status":
      return runtime.companyStatus(projectPath(args));
    case "create_meeting":
      return runtime.createMeeting(args, projectPath(args));
    case "meeting_status":
      return runtime.meetingStatus(args, projectPath(args));
    case "post_message":
      return runtime.postMessage(args, projectPath(args));
    case "close_meeting":
      return runtime.closeMeeting(args, projectPath(args));
    case "record_decision":
      return runtime.recordDecision(args, projectPath(args));
    case "stop_company": {
      const result = await runtime.stopCompany(projectPath(args));
      activeProjectPath = undefined;
      return result;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function projectPath(args: any): string {
  const value = args.project_path ?? activeProjectPath;
  if (!value) {
    throw new Error("project_path is required before start_company has been called");
  }
  return value;
}

function readMessageLine(buffer: string): { line: string; bytesRead: number } | null {
  const newlineIndex = buffer.indexOf("\n");
  if (newlineIndex === -1) {
    return null;
  }
  return {
    line: buffer.slice(0, newlineIndex).trim(),
    bytesRead: newlineIndex + 1,
  };
}

function writeResponse(id: string | number, result: unknown): void {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function writeError(id: string | number, code: number, message: string): void {
  writeMessage({ jsonrpc: "2.0", id, error: { code, message } });
}

function writeMessage(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function writeLog(message: string): void {
  process.stderr.write(`${message}\n`);
}

const ROLE_ENUM = ROLE_DEFINITIONS.map((role) => role.id);
const MESSAGE_KIND_ENUM = ["statement", "reply", "consensus", "question", "result", "system"];
const CONSENSUS_POSITION_ENUM = ["agree", "conditional", "disagree", "needs-user"];

const TOOL_DEFINITIONS = [
  {
    name: "start_company",
    description: "Initialize Agent Company v2 state and start the project-local discussion server.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
      },
      required: ["project_path"],
    },
  },
  {
    name: "company_status",
    description: "Read Agent Company v2 config, server state, active meetings, recent decisions, and legacy state metadata.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
      },
    },
  },
  {
    name: "create_meeting",
    description: "Create a v2 employee discussion meeting with explicit participants and a consensus policy.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        title: { type: "string" },
        goal: { type: "string" },
        participants: { type: "array", items: { type: "string", enum: ROLE_ENUM } },
        consensus_policy: { type: "string" },
      },
      required: ["title", "goal", "participants"],
    },
  },
  {
    name: "meeting_status",
    description: "Read a meeting, messages after an optional sequence, and the current consensus snapshot.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        meeting_id: { type: "string" },
        after_sequence: { type: "number" },
      },
      required: ["meeting_id"],
    },
  },
  {
    name: "post_message",
    description: "Append a CEO or employee message to a v2 meeting.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        meeting_id: { type: "string" },
        role: { type: "string", enum: ROLE_ENUM },
        kind: { type: "string", enum: MESSAGE_KIND_ENUM },
        message: { type: "string" },
        position: { type: "string", enum: CONSENSUS_POSITION_ENUM },
      },
      required: ["meeting_id", "role", "message"],
    },
  },
  {
    name: "close_meeting",
    description: "Close a meeting with the CEO summary, consensus statement, unresolved questions, and next actions.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        meeting_id: { type: "string" },
        summary: { type: "string" },
        consensus: { type: "string" },
        unresolved_questions: { type: "array", items: { type: "string" } },
        next_actions: { type: "array", items: { type: "string" } },
      },
      required: ["meeting_id", "summary", "consensus"],
    },
  },
  {
    name: "record_decision",
    description: "Record a CEO decision under .agent-company/v2/decisions.jsonl.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        meeting_id: { type: "string" },
        summary: { type: "string" },
        rationale: { type: "string" },
        risk_level: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["summary", "rationale", "risk_level"],
    },
  },
  {
    name: "stop_company",
    description: "Stop the Agent Company v2 discussion server for the active project.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
      },
    },
  },
];
