# Agent Company

Agent Company is a repo-local Codex plugin for running a CEO-led product team with Codex native sub-agents and a project-local discussion server.

The current Codex session acts as CEO. The CEO first proposes a plan for user approval, then starts only the necessary employee agents. Employees discuss through a local HTTP meeting server, and the CEO records the consensus, decision, verification, risks, and next action.

## Components

- `skills/company/SKILL.md` defines the CEO Plan Mode workflow.
- `.mcp.json` exposes the TypeScript MCP server.
- `server/src/` contains v2 state management, the MCP JSON-RPC stdio server, and the local discussion HTTP server.
- `references/` contains role manuals and operating protocols.

## Runtime State

Target projects receive a `.agent-company/v2/` directory with:

- `config.json` for v2 company metadata.
- `server/` for local discussion server metadata, pid, log, and token.
- `meetings/<meeting_id>/meeting.json` for meeting metadata.
- `meetings/<meeting_id>/messages.jsonl` for employee and CEO messages.
- `decisions.jsonl` for CEO decisions.

Existing `.agent-company` v1 files are treated as read-only legacy records. Agent Company v2 does not migrate or delete them.

## Discussion Server

`start_company` starts or recovers the project-local discussion server on `127.0.0.1` with an automatically selected port. Employees use HTTP with the token returned by `create_meeting`.

Supported employee endpoints:

```text
GET /api/meetings/<meeting_id>
GET /api/meetings/<meeting_id>/messages?after_sequence=<n>
POST /api/meetings/<meeting_id>/messages
```

Every endpoint except `/health` requires the `X-Agent-Company-Token` header.

## MCP Tools

- `start_company`
- `company_status`
- `create_meeting`
- `meeting_status`
- `post_message`
- `close_meeting`
- `record_decision`
- `stop_company`

The old tmux task tools were removed in v2.

## Safety

Agent Company v2 requires explicit user approval before employee execution. Deployment, destructive deletion, cost-incurring actions, external publication, credential changes, pushing to remote, and major product direction changes also require explicit approval.
