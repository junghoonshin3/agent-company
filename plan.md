# Agent Company v2 Core Runtime Plan

## Summary

Agent Company v2는 현재 Codex 세션이 CEO처럼 행동하고, 필요한 Codex 네이티브 하위 에이전트를 직원으로 호출하는 구조다. tmux 상주 직원, worktree 자동 생성, Kanban Office UI는 제거한다.

첫 구현 범위는 코어 런타임이다. CEO Plan Mode, 프로젝트별 로컬 토론 서버, 회의 메시지 기록, 합의 기반 회의 종료, 핵심 기록 저장을 구현한다.

## Key Decisions

- 사용자가 보는 주체는 gateway가 아니라 CEO다.
- CEO는 직원 실행 전에 계획을 제안하고 사용자 승인을 받는다.
- 직원들은 로컬 토론 서버를 통해 직접 메시지를 읽고 쓴다.
- 회의 종료는 합의 기반이며, 중요한 이견은 사용자 질문으로 올린다.
- v2 전체 직원 실행은 Codex `multi_agent` 기능이 있는 환경을 전제로 한다.
- 기존 `.agent-company` v1 기록은 읽기 전용 legacy로 보존한다.

## Implementation Scope

- `.agent-company/v2` 상태 디렉터리와 파일 기반 회의 기록을 추가한다.
- HTTP 토론 서버와 v2 MCP 도구를 구현한다.
- 기존 tmux API, Office UI, 관련 scripts, package scripts를 제거한다.
- README, skill, role/protocol references, validation, tests를 v2 기준으로 갱신한다.

## Verification

- `npm run validate`
- `npm test`
- `npm run check`
- `git diff --check`

## 2026-05-22 Branch Cleanup and README Refresh Plan

### Summary

main만 유지하고 나머지 로컬·원격 브랜치와 역할별 worktree를 제거한다. root `README.md`는 Agent Company v2 기준으로 다시 작성해 현재 구조, 실행 흐름, MCP 도구, 검증 명령만 남긴다.

### Scope

- 역할별 `.AgentInc-agent-company-worktrees/*` worktree를 제거한다.
- main 외 로컬 브랜치와 origin의 main 외 브랜치를 삭제한다.
- root `README.md`에서 v1 tmux, Office, delegate_task 계열 설명을 제거하고 v2 회의 서버 기반 설명으로 교체한다.

### Verification

- `npm run validate`
- `npm test`
- `git diff --check`
- `git status --short --branch`
- `git branch --list`
- `git branch -r`
