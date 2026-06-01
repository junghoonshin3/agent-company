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

## 2026-05-23 round-based meeting protocol

- [x] Record the implementation plan, checklist, and context notes.
- [x] Update CEO and employee-facing protocol guidance for round-based discussion.
- [x] Expose conditional and missing participants in consensus snapshots.
- [x] Update viewer/test/validation coverage for the new consensus semantics.
- [x] Run verification commands and fix failures.
- [x] Commit the logical change.

## 2026-05-23 adversarial meeting protocol

- [x] Inspect current CEO skill, meeting protocol, delegation routing, role manuals, and validation coverage.
- [x] Record the implementation plan, checklist, and context notes.
- [x] Add adversarial discussion rules to the CEO skill.
- [x] Update meeting and delegation protocols with opposition and failure-condition requirements.
- [x] Update employee role completion criteria.
- [x] Add validation coverage for adversarial meeting guidance.
- [x] Run verification commands and fix failures.
- [x] Commit the logical change.

## 2026-05-23 runtime discussion sufficiency

- [x] Inspect consensus snapshot type, computeConsensus, viewer rendering, and tests.
- [x] Record the implementation plan, checklist, and context notes.
- [x] Add runtime discussion sufficiency fields and reached gating.
- [x] Update viewer, README, and validation coverage.
- [x] Add tests for insufficient and sufficient discussion.
- [x] Run verification commands and fix failures.
- [x] Commit the logical change.

## 2026-05-25 README meeting dashboard demo

- [x] Record the implementation plan, checklist, and context notes.
- [x] Run an actual Agent Company employee meeting for the demo source.
- [x] Capture the meeting viewer without exposing the local token.
- [x] Create `plugins/agent-company/assets/agent-company-meeting-demo.gif`.
- [x] Embed the demo GIF in the root README.
- [x] Run focused verification.
- [x] Commit the logical change.

## 2026-05-25 Notion resume Agent Company update

- [x] Record the implementation plan, checklist, and context notes.
- [x] Connect Notion MCP to Codex with OAuth.
- [x] Read the target Notion resume page through MCP.
- [x] Add the Agent Company project content to the resume.
- [x] Verify the edited Notion page content.

## 2026-05-25 Notion resume self introduction polish

- [x] Record the implementation plan, checklist, and context notes.
- [x] Read the current Notion resume self-introduction.
- [x] Rewrite ambiguous phrasing into recruiter-readable strengths.
- [x] Verify the edited Notion page content.

## 2026-05-25 Notion resume verified skills cleanup

- [x] Record the implementation plan, checklist, and context notes.
- [x] Verify the actual Pause it deployment workflow and Fastlane setup.
- [x] Update self-introduction deployment wording.
- [x] Update Pause it deployment role and achievement wording.
- [x] Replace uncertain backend/Node.js stack items with confirmed AI agent tooling items.
- [x] Verify the edited Notion page content.

## 2026-05-27 Agent Company deep discussion skill

- [x] Inspect current skill, README files, meeting protocol, and validation script.
- [x] Record the implementation plan, checklist, and context notes.
- [x] Add the `deep-discussion` skill with all-agree termination rules.
- [x] Document the new `$agent-company:deep-discussion` invocation.
- [x] Add validation coverage for the new skill and all-agree policy.
- [x] Run verification commands and fix failures.
- [x] Commit the logical change.

## 2026-05-27 README deep discussion feature section

- [x] Inspect current README coverage for deep discussion.
- [x] Record the implementation plan, checklist, and context notes.
- [x] Add a dedicated root README feature section.
- [x] Run focused validation.
- [x] Commit, push, open PR, and merge through PR.

## 2026-06-01 remote main refresh

- [x] Inspect current local and remote branch state.
- [x] Record the implementation plan, checklist, and context notes.
- [x] Run verification commands.
- [x] Commit the workflow notes if verification passes.
- [x] Push current `main` to `origin/main`.
- [x] Confirm local and remote branch state after push.
