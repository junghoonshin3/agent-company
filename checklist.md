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

## 2026-05-22 balanced delegation progress reporting

- [x] Add balanced Fast/Standard/Full operating guidance to the gateway skill and CEO protocols.
- [x] Standardize interim progress and final report formats.
- [x] Add progress timing metadata to `task_status`.
- [x] Add tests and validation checks for the new guidance and metadata.
- [x] Run focused verification.
- [x] Commit the logical change.

## 2026-05-22 Agent Company v2 core runtime redesign

- [x] Record the implementation plan, checklist, and context notes.
- [x] Replace tmux/worktree runtime types with v2 company, meeting, message, decision, and server types.
- [x] Implement the project-local discussion server and v2 runtime state flow.
- [x] Replace the MCP surface with v2 tools.
- [x] Rewrite the company skill, README, manifest, validation, and role/protocol guidance for CEO Plan Mode.
- [x] Remove tmux scripts, companyctl, Office UI, and Office package scripts.
- [x] Update runtime tests for v2 startup, auth, meeting messages, consensus, decisions, status, and shutdown.
- [x] Run verification commands and fix failures.
- [x] Commit the logical change.

## 2026-05-22 parallel employee spawn guidance

- [x] Record the implementation plan, checklist, and context notes.
- [x] Update the company skill so selected employees are spawned before waiting on any one employee.
- [x] Add validation coverage for the parallel spawn guidance.
- [x] Run focused verification.
- [x] Commit the logical change.

## 2026-05-22 branch cleanup and README refresh

- [x] Inspect current branches, remote branches, worktrees, and README state.
- [x] Record the implementation plan, checklist, and context notes.
- [x] Rewrite root README for Agent Company v2.
- [x] Remove main-external local worktrees and branches.
- [x] Remove main-external remote branches.
- [x] Run verification.
- [x] Commit and push the logical change.

## 2026-05-22 README v2-only cleanup

- [x] Inspect the current root README and related plugin README references.
- [x] Record the implementation plan, checklist, and context notes.
- [x] Remove root README content that explains non-v2 behavior or legacy exclusions.
- [x] Run documentation/runtime validation.
- [x] Commit the logical change.

## 2026-05-22 responsible role meeting selection

- [x] Inspect CEO skill, delegation routing, CEO role manual, README, and validation script.
- [x] Record the implementation plan, checklist, and context notes.
- [x] Add responsible role selection guidance to the CEO skill.
- [x] Update delegation and CEO role protocols with the same participant criteria.
- [x] Reflect the participant criteria in the root README.
- [x] Add validation coverage for the new guidance.
- [x] Run verification commands and fix failures.
- [x] Commit the logical change.

## 2026-05-23 current meeting browser viewer

- [x] Record the implementation plan, checklist, and context notes.
- [x] Add `viewerUrl` to meeting connection types and runtime output.
- [x] Add token-protected single-meeting dashboard route to the discussion server.
- [x] Add tests for viewer URL generation, dashboard auth, and dashboard HTML.
- [x] Update README, plugin README, company skill, and validation checks.
- [x] Verify with automated checks and browser view.
- [x] Commit the logical change.

## 2026-05-23 mandatory viewerUrl sharing

- [x] Inspect the company skill and validation coverage.
- [x] Record the implementation context.
- [x] Update the company skill so CEO always shares `viewerUrl` after `create_meeting`.
- [x] Add validation coverage for the mandatory sharing rule.
- [x] Run verification.
- [ ] Commit the logical change.
