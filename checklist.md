# Checklist

- [x] Confirm current Agent Company routing and worktree state.
- [x] Add the `ceo` role to runtime types, role definitions, and validation.
- [x] Add the CEO role manual and bootstrap control instructions.
- [x] Add `companyctl decision` so the CEO can record decisions from tmux.
- [x] Update the facilitator skill and docs to make current Codex a gateway.
- [x] Update Office dashboard role typing, fallback metadata, and labels.
- [x] Update tests for CEO startup, bootstrapping, task completion, CLI control, and dashboard display.
- [x] Rebuild Office dashboard assets.
- [x] Run verification commands and fix failures.
- [x] Commit the logical change.

## 2026-05-21 tmux task dispatch reliability

- [x] Reproduce the stuck state in the active CEO pane.
- [x] Identify the dispatch path that leaves multi-line pasted text in Codex TUI composer.
- [x] Replace multi-line `tmux paste-buffer` task notices with single-line literal `send-keys -l` composer input.
- [x] Update dispatch failure tests for literal input delivery.
- [x] Apply the same hotfix to the active plugin cache.
- [x] Run source runtime tests and plugin validation.

## 2026-05-21 tmux composer submit acknowledgement

- [x] Replace `Enter` submit with `C-m` submit plus short acknowledgement checks.
- [x] Fail task dispatch when the Codex TUI composer still shows the task prompt after retries.
- [x] Add runtime tests for retry and stuck-composer failure.
- [x] Apply the source fix to the active installed plugin cache.
- [x] Run verification commands.
- [x] Commit the logical change.
