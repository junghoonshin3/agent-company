# Context Notes

## 2026-05-21

- User clarified via deep interview that the CEO must be a separate persistent tmux agent, not the current Codex session acting informally as CEO.
- Desired flow is user -> current Codex gateway -> persistent CEO -> worker agents -> CEO result -> current Codex relay.
- CEO should use the same task contract as other roles: `.agent-company/inbox/ceo/<task>.md`, `.agent-company/outbox/<task_id>/result.md`, and `done.json`.
- CEO must have direct `companyctl` control over delegation, waiting, collection, meetings, discussions, peer messages, and decisions.
- Current worktree has a pre-existing untracked `examples/` directory. This implementation should not modify or clean it up.
- Chosen default: add `ceo` as a normal role id with `defaultTaskType: "general"` instead of introducing a new task type.
- Implementation adds `ceo` as the first role so `startCompany` opens the CEO tmux window as the base session window, then opens the worker windows.
- CEO gets `companyctl` control instructions in the bootstrap prompt. Runtime does not hard-ban `delegate_task(role: "ceo")` because the gateway still needs that path to submit user requests.
- Added `companyctl decision` because MCP had `record_decision`, but a tmux-resident CEO needs the terminal command too.
- Plugin version is bumped to `0.1.8` because installed `0.1.7` caches would not include the persistent CEO entrypoint.
- Verification passed with `npm run validate`, `npm test`, `npm run test:agent-office`, `npm run build:agent-office`, `git diff --check`, and final `npm run check`.
