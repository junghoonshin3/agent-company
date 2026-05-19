# Agent Company

Agent Company is a repo-local Codex plugin that lets a facilitation workflow coordinate a tmux office of persistent Codex TUI workers through a TypeScript MCP server.

## Components

- `skills/company/SKILL.md` defines the CEO workflow.
- `.mcp.json` exposes the TypeScript MCP server.
- `server/src/` contains the file-backed runtime, tmux control, and MCP JSON-RPC stdio server.
- `skills/company/scripts/companyctl` runs the same runtime from a terminal.
- `office/` contains the built-in read-only Kanban/Dot Office dashboard.
- `references/` contains role manuals, task playbooks, and operating protocols.

## Runtime State

Target projects receive a `.agent-company/` directory with task files, worker inboxes, outboxes, meeting notes, discussion records, peer messages, decisions, and a board file. Role worktrees are created beside the target repo under `.<repo-name>-agent-company-worktrees/`.

Delegated task files include task type, role reference, applicable playbook, and completion gate details. Completed tasks are validated against `done.json` metadata and role-specific `result.md` headings before the board is updated.

Important product, architecture, UX, release, and major scope judgments use owner-role routing first. The facilitator delegates focused written review only to the roles whose ownership is involved, then persists meaningful outcomes as meeting notes, decisions, or discussion records when an explicit discussion artifact is useful.

Employees can send narrow direct peer messages with `companyctl peer-message` or the `send_peer_message` MCP tool. Peer messages are file-backed under `.agent-company/messages/`, copied into the target employee inbox as `.peer.md`, and delivered to the target tmux window. They are not board tasks and do not require `done.json`.

## Built-In Office Dashboard

`start_company` starts or recovers the plugin-owned dashboard automatically after the tmux office is ready. The dashboard is read-only and reports live Kanban state from the target project's `.agent-company` files.

Build the plugin-owned dashboard assets if `office/dist/index.html` is missing or stale.

```sh
npm run build:agent-office
```

Read the running local dashboard URL from `company_status().officeDashboard.url`. The server runs in the background by default and writes `server-info.json`, `server.pid`, `server.log`, and any `auto-start-error.json` under `/path/to/project/.agent-company/office/`.

Use the start script only for manual recovery or restart.

```sh
plugins/agent-company/skills/company/scripts/start-office.sh --project-dir /path/to/project
```

For a phone or another device on the same LAN, restart the dashboard on all interfaces and use one of the `networkUrls` written to `server-info.json` and returned by `company_status().officeDashboard.networkUrls`.

```sh
plugins/agent-company/skills/company/scripts/start-office.sh --project-dir /path/to/project --host 0.0.0.0
```

Use `--foreground` to keep the server attached to the current terminal. `stop_company` attempts to stop the dashboard automatically, and manual cleanup is available with:

```sh
plugins/agent-company/skills/company/scripts/stop-office.sh --project-dir /path/to/project
```

The embedded server serves `office/dist` directly and exposes `GET /api/company/state` plus `GET /api/company/events`. If `office/dist/index.html` is missing, run `npm run build:agent-office` first.

## Codex Plugin Reload

The plugin-local `.mcp.json` uses Codex's canonical `mcpServers` key. If a Codex session or installed plugin cache was created from an older plugin version, Agent Company MCP tools may not appear until the local plugin is reinstalled, the plugin cache is refreshed, or a new Codex session starts.

Version `0.1.1` can remain stale in `~/.codex/plugins/cache/agentinc-local/agent-company/0.1.1` with the older `Content-Length` framed MCP server. Version `0.1.2` can remain stale without automatic dashboard startup, version `0.1.3` can remain stale without worker stall failure recording, version `0.1.4` can remain stale without owner-role routing rules, and version `0.1.5` can remain stale without the dashboard startup/reporting guidance and LAN URL metadata. If `codex mcp get agent-company` points at an older cache version, reinstall the local plugin so the active MCP cwd points at `0.1.6`, then start a new Codex session before checking for Agent Company tools.

## Safety

The facilitator may delegate planning, implementation, QA, and release preparation. Deployment, destructive deletion, cost-incurring actions, external publication, credential changes, and major direction changes require explicit user approval.
