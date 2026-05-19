#!/usr/bin/env -S node --experimental-strip-types
// Agent Company MCP 런타임을 터미널에서 제어하는 CLI다.
import { AgentCompanyRuntime } from "./runtime.ts";
import { isRoleId, isTaskType } from "./roles.ts";
import type { RoleId, TaskType } from "./types.ts";

const runtime = new AgentCompanyRuntime();
const [, , command, ...args] = process.argv;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main(): Promise<void> {
  switch (command) {
    case "start": {
      const projectPath = args[0] ?? process.cwd();
      print(await runtime.startCompany({ project_path: projectPath }));
      return;
    }
    case "status": {
      print(await runtime.companyStatus(args[0] ?? process.cwd()));
      return;
    }
    case "delegate": {
      const [projectPath, role, title, instructions, outputOrTaskType, taskTypeArg] = args;
      if (!projectPath || !role || !title || !instructions) {
        usage();
        process.exit(2);
      }
      if (!isRoleId(role)) {
        throw new Error(`Unknown role: ${role}`);
      }
      const taskType = normalizeDelegateTaskType(outputOrTaskType, taskTypeArg);
      const expectedOutput = !outputOrTaskType || (!taskTypeArg && isTaskType(outputOrTaskType))
        ? "역할에 맞는 Markdown 결과를 작성한다."
        : outputOrTaskType;
      print(await runtime.delegateTask(
        {
          role,
          title,
          instructions,
          expected_output: expectedOutput,
          task_type: taskType,
        },
        projectPath,
      ));
      return;
    }
    case "wait": {
      const [projectPath, taskId, timeout] = args;
      if (!projectPath || !taskId) {
        usage();
        process.exit(2);
      }
      print(await runtime.waitForTask(
        { task_id: taskId, timeout_sec: timeout ? Number(timeout) : undefined },
        projectPath,
      ));
      return;
    }
    case "task-status": {
      const [projectPath, taskId, previewChars] = args;
      if (!projectPath || !taskId) {
        usage();
        process.exit(2);
      }
      print(await runtime.taskStatus(
        { task_id: taskId, preview_chars: previewChars ? Number(previewChars) : undefined },
        projectPath,
      ));
      return;
    }
    case "collect": {
      const [projectPath, taskId] = args;
      if (!projectPath || !taskId) {
        usage();
        process.exit(2);
      }
      print(await runtime.collectResult({ task_id: taskId }, projectPath));
      return;
    }
    case "meeting": {
      const [
        projectPath,
        title,
        participantsArg,
        summary,
        decisionsArg,
        openQuestionsArg,
        nextActionsArg,
        discussionIdArg,
      ] = args;
      if (!projectPath || !title || !participantsArg || !summary) {
        usage();
        process.exit(2);
      }
      print(await runtime.recordMeeting(
        {
          title,
          participants: parseParticipants(participantsArg),
          summary,
          decisions: parseList(decisionsArg),
          open_questions: parseList(openQuestionsArg),
          next_actions: parseList(nextActionsArg),
          discussion_id: discussionIdArg,
        },
        projectPath,
      ));
      return;
    }
    case "discussion-start": {
      const [projectPath, title, question, participantsArg, context, expectedDecision] = args;
      if (!projectPath || !title || !question || !participantsArg || context === undefined || !expectedDecision) {
        usage();
        process.exit(2);
      }
      print(await runtime.startDiscussion(
        {
          title,
          question,
          participants: parseParticipants(participantsArg),
          context,
          expected_decision: expectedDecision,
        },
        projectPath,
      ));
      return;
    }
    case "discussion-round": {
      const [projectPath, discussionId, round, taskIdsArg, summary] = args;
      if (!projectPath || !discussionId || !round || taskIdsArg === undefined || !summary) {
        usage();
        process.exit(2);
      }
      print(await runtime.appendDiscussionRound(
        {
          discussion_id: discussionId,
          round,
          task_ids: parseList(taskIdsArg),
          summary,
        },
        projectPath,
      ));
      return;
    }
    case "discussion-close": {
      const [
        projectPath,
        discussionId,
        conclusion,
        agreementsArg,
        disagreementsArg,
        decision,
        nextActionsArg,
        meetingId,
        decisionId,
      ] = args;
      if (
        !projectPath ||
        !discussionId ||
        !conclusion ||
        agreementsArg === undefined ||
        disagreementsArg === undefined ||
        !decision ||
        nextActionsArg === undefined
      ) {
        usage();
        process.exit(2);
      }
      print(await runtime.closeDiscussion(
        {
          discussion_id: discussionId,
          conclusion,
          agreements: parseList(agreementsArg),
          disagreements: parseList(disagreementsArg),
          decision,
          next_actions: parseList(nextActionsArg),
          meeting_id: meetingId,
          decision_id: decisionId,
        },
        projectPath,
      ));
      return;
    }
    case "peer-message": {
      const [
        projectPath,
        fromRoleArg,
        toRoleArg,
        title,
        message,
        discussionIdArg,
        taskIdArg,
        inReplyToArg,
      ] = args;
      if (!projectPath || !fromRoleArg || !toRoleArg || !title || !message) {
        usage();
        process.exit(2);
      }
      print(await runtime.sendPeerMessage(
        {
          from_role: parseRole(fromRoleArg),
          to_role: parseRole(toRoleArg),
          title,
          message,
          discussion_id: parseOptionalArg(discussionIdArg),
          task_id: parseOptionalArg(taskIdArg),
          in_reply_to: parseOptionalArg(inReplyToArg),
        },
        projectPath,
      ));
      return;
    }
    case "stop": {
      print(await runtime.stopCompany(args[0] ?? process.cwd()));
      return;
    }
    default:
      usage();
      process.exit(command ? 2 : 0);
  }
}

function parseParticipants(value: string): RoleId[] {
  return value.split(",").map((role) => {
    const participant = role.trim();
    return parseRole(participant || role);
  });
}

function parseRole(value: string): RoleId {
  if (!isRoleId(value)) {
    throw new Error(`Unknown role: ${value}`);
  }
  return value;
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function parseList(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) {
    return [];
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("JSON list argument must be an array");
    }
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  }
  return trimmed.split("|").map((item) => item.trim()).filter(Boolean);
}

function parseOptionalArg(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

function normalizeDelegateTaskType(
  outputOrTaskType: string | undefined,
  taskTypeArg: string | undefined,
): TaskType | undefined {
  if (taskTypeArg !== undefined) {
    return parseTaskType(taskTypeArg);
  }
  if (outputOrTaskType !== undefined && isTaskType(outputOrTaskType)) {
    return outputOrTaskType;
  }
  return undefined;
}

function parseTaskType(value: string | undefined): TaskType | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isTaskType(value)) {
    throw new Error(`Unknown task_type: ${value}`);
  }
  return value;
}

function usage(): void {
  console.log(`Usage:
  companyctl start [project_path]
  companyctl status [project_path]
  companyctl delegate <project_path> <role> <title> <instructions> [expected_output] [task_type]
  companyctl wait <project_path> <task_id> [timeout_sec]
  companyctl task-status <project_path> <task_id> [preview_chars]
  companyctl collect <project_path> <task_id>
  companyctl meeting <project_path> <title> <participants_csv> <summary> [decisions] [open_questions] [next_actions] [discussion_id]
  companyctl discussion-start <project_path> <title> <question> <participants_csv> <context> <expected_decision>
  companyctl discussion-round <project_path> <discussion_id> <round> <task_ids> <summary>
  companyctl discussion-close <project_path> <discussion_id> <conclusion> <agreements> <disagreements> <decision> <next_actions> [meeting_id] [decision_id]
  companyctl peer-message <project_path> <from_role> <to_role> <title> <message> [discussion_id] [task_id] [in_reply_to]
  companyctl stop [project_path]`);
}
