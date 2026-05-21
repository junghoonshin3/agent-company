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

## 2026-05-21 tmux task dispatch reliability

- Runlini Agent Company task `20260521T090133Z-ceo-48294588` stayed `delegated` for about 10 minutes because `delegate_task` created the inbox/outbox and pasted the notice into the CEO Codex TUI, but the notice remained in the composer and was never submitted.
- Root cause is the runtime's assumption that `tmux paste-buffer` of a multi-line notice followed by `send-keys Enter` reliably submits Codex TUI input. In Codex CLI 0.132.0, the multi-line pasted notice can remain as draft composer text, so the runtime records no dispatch failure and `wait_for_task` waits for a `done.json` that cannot be produced.
- `C-j` did not submit the stuck composer draft either, so the fix should avoid multi-line pasted composer input instead of swapping one submit key for another.
- The runtime now sends task and peer-message notices as one-line composer strings with `tmux send-keys -l`, then sends `Enter`. The task file still contains the full structured instructions; the pane notice only needs to point the role at the file and outbox.
- The same hotfix was applied to the installed cache at `/Users/junghoon/.codex/plugins/cache/agentinc-local/agent-company/0.1.8` because the active MCP server reads plugin code from that cache.
- Source verification passed with `npm test` and `npm run validate`. Running the whole cache test file directly from the cache still fails in cache-layout-only CLI path tests that expect a repo-root `plugins/agent-company/...` prefix, but the edited runtime tests pass before those path-only failures and the source repo test suite is the authoritative verification.

## 2026-05-21 tmux composer submit acknowledgement

- User clarified that the worker prompts were still sitting in the Codex TUI composer until they manually pressed Enter. The prior single-line notice hotfix was insufficient because the runtime still treated `send-keys Enter` as fire-and-forget.
- The runtime now submits with `C-m`, pauses briefly, inspects the pane, and retries when the task or peer-message notice still appears as an unhandled composer prompt.
- If retries still leave the prompt visible, `delegateTask` fails through the existing dispatch failure path so the board does not sit indefinitely in `delegated`.
- The verified source fix was copied to the active installed cache at `/Users/junghoon/.codex/plugins/cache/agentinc-local/agent-company/0.1.8/server/src/runtime.ts`.
- Verification passed with `npm run check`, covering plugin validation, 34 server tests, Office typecheck, 16 Office tests, Office static validation, and Office build.
