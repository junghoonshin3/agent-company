// Agent Company MCP 도구를 JSON-RPC stdio 서버로 노출한다.
import { ROLE_DEFINITIONS, TASK_TYPES } from "./roles.ts";
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
        serverInfo: { name: "agent-company", version: "0.1.7" },
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
    case "delegate_task":
      return runtime.delegateTask(args, projectPath(args));
    case "wait_for_task":
      return runtime.waitForTask(args, projectPath(args));
    case "task_status":
      return runtime.taskStatus(args, projectPath(args));
    case "collect_result":
      return runtime.collectResult(args, projectPath(args));
    case "record_decision":
      return runtime.recordDecision(args, projectPath(args));
    case "record_meeting":
      return runtime.recordMeeting(args, projectPath(args));
    case "start_discussion":
      return runtime.startDiscussion(args, projectPath(args));
    case "append_discussion_round":
      return runtime.appendDiscussionRound(args, projectPath(args));
    case "close_discussion":
      return runtime.closeDiscussion(args, projectPath(args));
    case "send_peer_message":
      return runtime.sendPeerMessage(args, projectPath(args));
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

const TOOL_DEFINITIONS = [
  {
    name: "start_company",
    description: "Start the tmux-based Agent Company office for a project path.",
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
    description: "Read the Agent Company config, board, recent meetings, recent discussions, recent peer messages, and tmux session name.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
      },
    },
  },
  {
    name: "delegate_task",
    description: "Create an inbox task and send it to a tmux worker role.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        role: {
          type: "string",
          enum: ROLE_DEFINITIONS.map((role) => role.id),
        },
        title: { type: "string" },
        instructions: { type: "string" },
        expected_output: { type: "string" },
        task_type: { type: "string", enum: TASK_TYPES },
      },
      required: ["role", "title", "instructions", "expected_output"],
    },
  },
  {
    name: "wait_for_task",
    description: "Wait until a worker writes done.json for a task.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        task_id: { type: "string" },
        timeout_sec: { type: "number" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "task_status",
    description: "Inspect one delegated task without mutating board state.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        task_id: { type: "string" },
        preview_chars: { type: "number" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "collect_result",
    description: "Read result.md and done.json for a completed worker task.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        task_id: { type: "string" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "record_decision",
    description: "Append a CEO decision to .agent-company/decisions.md.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        summary: { type: "string" },
        rationale: { type: "string" },
        risk_level: { type: "string", enum: ["low", "medium", "high"] },
        discussion_id: { type: "string" },
      },
      required: ["summary", "rationale", "risk_level"],
    },
  },
  {
    name: "record_meeting",
    description: "Write meeting notes to .agent-company/meetings/ and return the saved note metadata.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        title: { type: "string" },
        participants: {
          type: "array",
          items: {
            type: "string",
            enum: ROLE_DEFINITIONS.map((role) => role.id),
          },
        },
        summary: { type: "string" },
        decisions: { type: "array", items: { type: "string" } },
        open_questions: { type: "array", items: { type: "string" } },
        next_actions: { type: "array", items: { type: "string" } },
        discussion_id: { type: "string" },
      },
      required: ["title", "participants", "summary", "decisions", "open_questions", "next_actions"],
    },
  },
  {
    name: "start_discussion",
    description: "Create a file-backed discussion record for an important CEO decision.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        title: { type: "string" },
        question: { type: "string" },
        participants: {
          type: "array",
          items: {
            type: "string",
            enum: ROLE_DEFINITIONS.map((role) => role.id),
          },
        },
        context: { type: "string" },
        expected_decision: { type: "string" },
      },
      required: ["title", "question", "participants", "context", "expected_decision"],
    },
  },
  {
    name: "append_discussion_round",
    description: "Append one discussion round summary to a discussion record.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        discussion_id: { type: "string" },
        round: {
          anyOf: [
            { type: "number", enum: [1, 2, 3] },
            {
              type: "string",
              enum: ["1", "2", "3", "round1", "round2", "round3"],
            },
          ],
        },
        task_ids: { type: "array", items: { type: "string" } },
        summary: { type: "string" },
      },
      required: ["discussion_id", "round", "task_ids", "summary"],
    },
  },
  {
    name: "close_discussion",
    description: "Close a discussion with the CEO conclusion, agreements, disagreements, decision, and next actions.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        discussion_id: { type: "string" },
        conclusion: { type: "string" },
        agreements: { type: "array", items: { type: "string" } },
        disagreements: { type: "array", items: { type: "string" } },
        decision: { type: "string" },
        next_actions: { type: "array", items: { type: "string" } },
        meeting_id: { type: "string" },
        decision_id: { type: "string" },
      },
      required: ["discussion_id", "conclusion", "agreements", "disagreements", "decision", "next_actions"],
    },
  },
  {
    name: "send_peer_message",
    description: "Send a file-backed peer message from one Agent Company role to another role.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
        from_role: {
          type: "string",
          enum: ROLE_DEFINITIONS.map((role) => role.id),
        },
        to_role: {
          type: "string",
          enum: ROLE_DEFINITIONS.map((role) => role.id),
        },
        title: { type: "string" },
        message: { type: "string" },
        discussion_id: { type: "string" },
        task_id: { type: "string" },
        in_reply_to: { type: "string" },
      },
      required: ["from_role", "to_role", "title", "message"],
    },
  },
  {
    name: "stop_company",
    description: "Stop the tmux session for this Agent Company.",
    inputSchema: {
      type: "object",
      properties: {
        project_path: { type: "string" },
      },
    },
  },
];
