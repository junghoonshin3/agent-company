# Agent Company

Agent Company is a repo-local Codex plugin for running a CEO-led product team with Codex native sub-agents and a project-local discussion server.

The current Codex session acts as CEO. The CEO first proposes a plan for user approval, then starts only the necessary employee agents. Employees discuss through a local HTTP meeting server with adversarial initial position, response, revision, and final consensus rounds, and the CEO records the consensus, decision, verification, risks, and next action.

For explicit no-fixed-round debate, users can call `$agent-company:deep-discussion <goal>`. That skill keeps the same runtime and approval model, but the CEO only closes the meeting after every required participant's final consensus position is `agree`.

## Components

- `skills/company/SKILL.md` defines the CEO Plan Mode workflow.
- `skills/deep-discussion/SKILL.md` defines the explicit no-fixed-round discussion mode with all-participant `agree` termination.
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

`start_company` starts or recovers the project-local discussion server on `127.0.0.1` with an automatically selected port. Employees use HTTP with the token returned by `create_meeting`, and users can open the returned `viewerUrl` to watch the current meeting in a read-only browser timeline.

Multi-participant meetings require employees to reference another participant's message sequence or id and raise a substantive challenge, failure condition, or conditional objection before final consensus. Conditional agreement remains visible in the consensus snapshot through `conditionalParticipants`, so the CEO must preserve the stated conditions before closing the meeting.

The runtime also exposes structural discussion sufficiency through `discussionSatisfied` and `discussionInsufficientParticipants`. If every participant posts `agree` or `conditional` without a qualifying reply round, `consensus.reached` remains false and the viewer shows the rebuttal-insufficient state.

In deep discussion mode, the CEO must apply a stricter rule than the runtime's general consensus snapshot. `conditional` does not count as completion, even if `consensus.reached` would be true in the standard flow. The meeting remains open until every required participant reaches final `agree`, or the CEO stops to ask the user about an unresolved choice.

Supported employee endpoints:

```text
GET /api/meetings/<meeting_id>
GET /api/meetings/<meeting_id>/messages?after_sequence=<n>
POST /api/meetings/<meeting_id>/messages
```

Supported viewer endpoint:

```text
GET /meetings/<meeting_id>?token=<token>
```

Every API endpoint except `/health` requires the `X-Agent-Company-Token` header.
The viewer endpoint uses the `token` query parameter because browsers cannot attach the employee API header when opening a URL directly.

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
