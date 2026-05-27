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

## 2026-05-22 balanced delegation progress reporting

- User chose a balanced operating model for slow CEO delegation: automatically select Fast, Standard, or Full based on risk instead of always doing broad meetings.
- Confirmed scope is core flow only: gateway/CEO guidance, wait/status policy, and report templates. Office dashboard UI and existing record migrations are out of scope.
- Interim progress report cadence is first report within 15 seconds, then every 45 seconds or whenever status changes.
- Final report format should be standard and short: operating mode, participant table, decision, verification, remaining risk, and next action.
- Implementation should preserve `wait_for_task` timeout behavior because it currently marks timed-out tasks failed; progress reporting should favor non-mutating `task_status` polling.
- Implemented the policy in the gateway skill, CEO manual, delegation routing, and meeting protocol.
- Added `elapsedMs` and `updatedAgoMs` to `task_status` responses so progress reports can include age information without mutating board state.
- Verification passed with `npm test` and `npm run validate`.

## 2026-05-22 Agent Company v2 core runtime redesign

- Deep interview reset the product direction away from the current gateway -> tmux CEO -> tmux workers model.
- v2 default is plugin CEO behavior in the current Codex session. The visible actor should be CEO, not gateway.
- Worker execution should use Codex native sub-agents. The local environment has `codex-cli 0.133.0` and `multi_agent stable true`, but v2 should document feature availability rather than claim an exact minimum version.
- Direct worker discussion should be implemented through a project-local discussion server. Workers read and post messages directly through HTTP, while CEO observes and summarizes.
- The discussion server should be project-persistent, not per-task temporary, and should bind to `127.0.0.1` by default.
- Records should be minimal. Keep meeting logs, worker results, decisions, consensus state, and final reports under `.agent-company/v2`.
- Existing `.agent-company` v1 records should remain read-only legacy data. Do not migrate or delete them.
- Code edits by worker agents should be patch proposals from separate agent workspaces, reviewed and integrated by CEO.
- The first implementation milestone is the core runtime only. The old Office/Kanban UI should be removed now, and a v2 meeting view can be built later.
- Implemented v2 under `.agent-company/v2` with JSON config, JSONL decisions, per-meeting metadata, per-meeting messages, and server metadata.
- The MCP surface is now `start_company`, `company_status`, `create_meeting`, `meeting_status`, `post_message`, `close_meeting`, `record_decision`, and `stop_company`.
- `create_meeting` returns HTTP connection details including URL, meeting URL, messages URL, token header, and token so employee sub-agents can read and post directly.
- Removed tmux scripts, `companyctl`, tmux runtime dispatch, worktree creation, Office server, Office UI source, Office dist assets, and Office package scripts.
- Verification passed with `npm run validate`, `npm test` with local bind approval, `npm run check` with local bind approval, and `git diff --check`.

## 2026-05-22 parallel employee spawn guidance

- User noticed employee sub-agents were effectively handled sequentially because the v2 skill only said to spawn selected employees, without saying to spawn all employees before waiting.
- The intended default is parallel execution: after `create_meeting`, CEO should start all selected employee sub-agents first, then monitor meeting messages and available multi-target waits together.
- Sequential execution remains allowed only when a later employee explicitly depends on an earlier result.
- Verification passed with `npm run validate` and `npm test` after rerunning `npm test` with local bind approval. The first sandboxed `npm test` failed because `127.0.0.1` listen returned `EPERM`.

## 2026-05-22 branch cleanup and README refresh

- User explicitly asked to remove every branch except main, rewrite README.md, commit, and push.
- Current main and origin/main both point at `646c6a9` before this work.
- Local main-external branches include old Agent Company role branches plus `develop`, feature branches, and `fix/implementation-wait-policy-0.1.7`.
- Remote main-external branches are `origin/develop` and `origin/fix/implementation-wait-policy-0.1.7`.
- Root README is stale v1 documentation that still describes tmux, Office dashboard, and delegate_task tooling. It should be replaced with v2 Codex native sub-agent and local discussion server documentation.
- Removed role worktrees with `git worktree remove --force` after confirming the user wanted all non-main branches removed. Most role worktrees had stale `.agents/plugins/marketplace.json` and `.DS_Store` changes that were discarded with the worktree removal.
- Deleted all local branches except `main`, then deleted remote branches `origin/develop` and `origin/fix/implementation-wait-policy-0.1.7`.
- Verification passed with `npm run validate`, `npm test` with local bind approval, and `git diff --check`.

## 2026-05-22 README v2-only cleanup

- User clarified that README.md can simply remove content unrelated to v2.
- Scope is the root `README.md`; `plugins/agent-company/README.md` was inspected as related context but should not be changed unless needed for validation.
- The root README is already v2-oriented, so the cleanup should remove historical exclusions and legacy/v1 handling notes rather than rewrite the document.
- Removed the root README's tmux/worktree/Kanban/Office exclusion sentence, v1 legacy runtime sentence, and `company_status` legacy wording.
- Verification passed with no stale keyword matches in root README, `npm run validate`, and `git diff --check`.

## 2026-05-22 responsible role meeting selection

- User wants the CEO agent to include only agents responsible for the user's requirements in meetings.
- Plan is documentation and validation only. Do not change MCP APIs, meeting schemas, or `create_meeting(participants)`.
- Participant selection should be based on requirement responsibility, not broad consultation. Each selected role needs a requirement ownership reason and a reason the CEO should not handle it alone.
- QA, release, and knowledge roles may still be selected by CEO judgment when their owned risk is material, but the plan must state that risk.
- Active plugin cache should not be edited as part of this change.
- Implemented the policy in the CEO skill, delegation routing protocol, CEO role manual, root README, and validation script.
- Verification passed with `npm run validate`, `git diff --check`, and `npm test` after rerunning with local bind approval. The first sandboxed `npm test` failed on `listen EPERM` for `127.0.0.1`.

## 2026-05-23 current meeting browser viewer

- User chose a browser dashboard, limited to the current meeting only, with a chat timeline presentation.
- Access should be via a token-bearing URL returned by `create_meeting`.
- Scope is read-only. Browser-side message posting, meeting closing, meeting lists, search, and operations console are out of scope.
- Implementation should avoid new frontend dependencies and keep the dashboard served by the existing `127.0.0.1` discussion server.
- Implemented `viewerUrl` on `MeetingConnection`, backed by `GET /meetings/<meeting_id>?token=<token>`.
- The viewer serves dependency-free HTML/CSS/JS from the discussion server, then polls the existing meeting API with the token header every 2 seconds.
- The in-app Browser plugin had no registered browser backend in this session, so UI verification used Chrome through Computer Use against a disposable temp-project server. The view rendered the meeting title, connected state, participants, consensus, and two sample messages.
- Verification passed with `npm test` and `npm run check` after rerunning both with local bind approval. The first sandboxed runs failed on `listen EPERM` for `127.0.0.1`.

## 2026-05-23 mandatory viewerUrl sharing

- User wants the Agent Company skill markdown to require sharing `viewerUrl` when the skill runs.
- Current skill only says to share `viewerUrl` if the user wants to watch, which is too conditional for the requested behavior.
- Scope is skill guidance plus validation coverage only. Runtime APIs and viewer implementation do not need changes.
- Verification passed with `npm run validate` and `git diff --check`.

## 2026-05-23 round-based meeting protocol

- User wants Agent Company employee discussion to feel closer to real discussion, following the previously recommended model.
- Target model is not fully synchronous human conversation. It is a structured async review meeting with explicit rounds, required cross-references, position revision, and preserved conditional agreement.
- Existing runtime treats `agree` and `conditional` as enough for `consensus.reached`, while docs say conditional only counts if the condition is preserved. The new behavior should make conditional participation visible instead of silently collapsing it into plain agreement.
- Keep MCP API compatibility for this pass. Do not add a structured condition field to `post_message`; require the condition to be stated in the final consensus message body and surface conditional participants in the consensus snapshot.
- Implemented consensus snapshot fields `conditionalParticipants` and `missingParticipants`; the browser viewer now shows "조건 검토 필요" when consensus is reached with conditional participants.
- Verification passed with `npm run validate`, `npm test` using local bind approval, `npm run check` using local bind approval, and `git diff --check`.

## 2026-05-23 adversarial meeting protocol

- User observed that employees appear to agree immediately and clarified the desired product behavior as active disagreement, challenge, and intense debate before consensus.
- Current guidance requires rounds and cross-message references, but it still allows employees to frame replies as quick agreement with minor additions.
- Scope should stay in prompt and protocol guidance plus validation. No MCP schema or runtime persistence change is needed for this pass.
- CEO should reject bare consensus if a multi-participant meeting lacks substantive counterarguments, failure conditions, or explicit conditions for agreement.
- Implemented adversarial discussion guidance in the company skill, meeting protocol, delegation routing, output contract, role completion criteria, README files, and validation script.
- Verification passed with `npm run validate`, `npm test` using local bind approval after sandbox `EPERM`, `npm run check` using local bind approval after sandbox `EPERM`, and `git diff --check`.

## 2026-05-23 runtime discussion sufficiency

- User chose the stricter behavior: insufficient discussion should block `consensus.reached`, not merely show a separate warning.
- Runtime should still avoid semantic NLP. The first implementation should use structural evidence: participant position plus a later `reply` after another participant's message.
- Single-participant meetings cannot perform cross-participant rebuttal, so they should remain eligible for consensus once the participant posts `agree` or `conditional`.
- Viewer should distinguish position consensus blocked by missing rebuttal from ordinary in-progress meetings by showing a "반박 부족" state.
- Implemented `discussionSatisfied` and `discussionInsufficientParticipants`; `consensus.reached` now requires both position consensus and runtime discussion sufficiency.
- Verification passed with `npm run validate`, `npm test` using local bind approval after sandbox `EPERM`, `npm run check` using local bind approval after sandbox `EPERM`, and `git diff --check`.

## 2026-05-25 README meeting dashboard demo

- User wants the README to include a recording of Agent Company employees discussing in the dashboard when the skill runs.
- The selected deliverable is a real demo GIF, not just recording instructions or a placeholder.
- The selected source is an actual Agent Company employee meeting, not hand-authored sample messages or old records.
- Scope is documentation/media only: root `README.md` plus `plugins/agent-company/assets/agent-company-meeting-demo.gif`, with no runtime API or schema changes.
- The recording must avoid exposing the `viewerUrl` token; capture only the dashboard content area or a browser view without the address bar.
- Ran a real Agent Company meeting with `service-planner`, `ui-ux-designer`, and `qa-engineer`; all three posted statements, cited replies, and conditional consensus.
- Captured the local `viewerUrl` with Playwright content screenshots after the in-app browser backend and Chrome extension backend were unavailable, and after direct macOS `screencapture` failed.
- Generated the README GIF from four token-free dashboard content frames at `plugins/agent-company/assets/agent-company-meeting-demo.gif`.
- Verification passed with `file plugins/agent-company/assets/agent-company-meeting-demo.gif`, a Node GIF frame-count check showing 4 frames, `git diff --check`, and `npm run validate`.

## 2026-05-25 Notion resume Agent Company update

- User wants to update the Notion resume page at `https://www.notion.so/25-168950d70a6180c4ac01c090785c18a3` with Agent Company experience.
- User selected Codex MCP connection over direct Notion CLI editing or browser-only editing.
- Official Notion MCP guidance for Codex uses the remote server URL `https://mcp.notion.com/mcp` and OAuth through `codex mcp login notion`.
- Current local `codex mcp list` does not include Notion yet.
- The planned page edits are limited to the resume self-introduction, the top of the personal projects section, and the technology stack section.
- Notion MCP fetch succeeded for the target page. The page structure is contact summary, self-introduction, work history, work projects, personal projects, technology stack, and education.
- The target edit should preserve the existing Korean resume tone and add Agent Company before `Pause it` in the personal projects section.
- Updated the Notion resume page with an Agent Company sentence in the self-introduction, a full Agent Company personal project entry before `Pause it`, and a Backend / Tooling stack subsection.
- Verification fetch confirmed the edited Notion content at `2026-05-25T08:01:43.320Z`.

## 2026-05-25 Notion resume self introduction polish

- User wants the resume self-introduction checked for ambiguous or hard-to-understand phrasing and revised to better communicate strengths to a recruiter.
- Scope should be the self-introduction section only unless the Notion page structure requires a narrow adjacent replacement.
- Target messaging should emphasize mobile production stability, external SDK/native integration, issue diagnosis, data reliability, background/location processing, measurable outcomes, and current project-based learning.
- Ambiguous phrases identified in the old self-introduction included broad claims like structural risk resolution, many domains, and continuing practical sense without enough recruiter-readable detail.
- Rewrote the self-introduction to emphasize Android Native and React Native Android module experience, app stability, data reliability, issue diagnosis through data flow and app lifecycle, measurable KeepWell and Tram outcomes, and recent Flutter, Compose, Supabase, deployment automation, and AI agent workflow learning.
- Verification fetch confirmed the edited Notion self-introduction at `2026-05-25T08:27:59.912Z`.

## 2026-05-25 Notion resume verified skills cleanup

- User questioned whether deployment automation and Node.js/backend skill claims are accurate.
- Public GitHub verification found `pause_it/.github/workflows/deploy.yml` with `workflow_dispatch` inputs for `dev` and `prod`.
- Public GitHub verification found `pause_it/android/fastlane/Fastfile` with `dev` lane uploading to Firebase App Distribution and `prod` lane uploading an AAB to Google Play Console alpha as draft.
- The accurate wording is a manually triggered GitHub Actions/Fastlane deployment pipeline, not automatic deployment on every push.
- User said they do not know backend overall and do not know Node.js, so the resume should remove `Node.js` and backend-looking stack labels.
- Technology stack should include only confident skills and add an AI-specific section for Codex agent plugin work.
- Updated the self-introduction to say Pause it has a manually runnable test deployment pipeline instead of broad deployment automation.
- Updated Pause it role and achievement wording to GitHub Actions manual workflow plus Fastlane dev/prod lanes for Firebase App Distribution and Google Play Console alpha upload preparation.
- Removed `Backend / Tooling`, `Node.js`, and JavaScript/TypeScript from the technology stack. Added `AI / Agent Tools` and `Release / Operations` sections.
- Also narrowed BeMyPet wording by replacing serverless backend and CI claims with Supabase integration, GitHub Actions operations workflows, and scheduled Edge Function invocation.
- Verification fetch confirmed the edited Notion content at `2026-05-25T08:37:46.526Z`.

## 2026-05-27 Agent Company deep discussion skill

- User wants a user-explicit Agent Company mode for open-ended discussion, not just a default change to the existing company skill.
- User selected a separate skill rather than a slash command or option flag.
- The selected invocation name is `deep-discussion`, so the public call should be `$agent-company:deep-discussion <goal>`.
- The termination condition is strict all-participant agreement. `conditional`, `disagree`, and `needs-user` do not count as completion for this mode.
- Scope is skill and documentation policy plus validation coverage. MCP tools, server APIs, runtime consensus semantics, and persisted meeting schema should remain unchanged.
- Implemented `plugins/agent-company/skills/deep-discussion/SKILL.md` with no fixed round count, strict final `agree` termination, conditional re-discussion, and unresolved user-choice handling.
- Updated README files and meeting protocol docs to show `$agent-company:deep-discussion` as the explicit invocation.
- Verification passed with `npm run validate`, `npm test` after rerunning outside the sandbox for local `127.0.0.1` bind permission, and `git diff --check`.
