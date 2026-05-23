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

## 2026-05-23 Current Meeting Viewer Plan

### Summary

Agent Company v2의 특정 회의 하나를 브라우저에서 실시간으로 볼 수 있는 읽기 전용 대시보드를 추가한다. 기존 로컬 discussion server가 정적 HTML/CSS/JS를 직접 제공하고, `create_meeting` 결과에 바로 열 수 있는 `viewerUrl`을 포함한다.

### Scope

- `MeetingConnection`에 `viewerUrl`을 추가한다.
- `GET /meetings/<meeting_id>?token=<token>`에서 현재 회의 전용 채팅 타임라인 화면을 제공한다.
- 대시보드는 회의 제목, 목표, 상태, 참가 역할, 합의 상태, 발언 종류, 입장, 작성 시각, 메시지 본문을 보여준다.
- 대시보드는 기존 회의 API를 2초 간격으로 폴링한다.
- 브라우저에서 메시지 작성, 회의 종료, 결정 기록은 제공하지 않는다.

### Verification

- `npm run validate`
- `npm test`
- `npm run check`
- `git diff --check`
- 로컬 브라우저에서 viewer URL 화면을 확인한다.

## 2026-05-23 Round-Based Meeting Protocol Plan

### Summary

Agent Company 회의를 단순 의견 취합이 아니라 비동기 심의 회의에 가깝게 바꾼다. 직원은 초기 입장, 상호 반박, 입장 수정, 최종 합의 라운드를 거치고, 최종 발언은 다른 직원 메시지 sequence를 참조해야 한다.

### Assumptions

- 완전한 실시간 대화는 목표가 아니며, 로컬 HTTP 회의 서버에 남는 메시지를 기반으로 한 다회차 비동기 토론을 목표로 한다.
- `conditional`은 동의로 뭉개지지 않아야 하며, 런타임 상태와 CEO 지침에서 조건부 입장을 별도로 드러내야 한다.
- 이번 변경은 기존 MCP API를 깨지 않는 선에서 한다. 구조화된 조건 필드는 추가하지 않고, 조건은 consensus 메시지 본문에 명시하게 한다.

### Scope

- CEO skill에 라운드 기반 회의 절차와 메시지 참조 의무를 추가한다.
- 회의, 출력, 라우팅, CEO 역할 프로토콜에 같은 절차를 반영한다.
- 런타임 consensus snapshot에 조건부 참가자와 미응답 참가자를 노출한다.
- viewer와 테스트를 새 consensus snapshot에 맞춘다.
- validation script가 새 회의 절차 핵심 문구를 검증하게 한다.

### Verification

- `npm run validate`
- `npm test`
- `npm run check`
- `git diff --check`

## 2026-05-23 Adversarial Meeting Protocol Plan

### Summary

Agent Company 회의가 너무 빠르게 동의로 수렴하지 않도록 토론 규칙을 강화한다. 각 직원은 자기 역할의 권장안뿐 아니라 반대 가설, 실패 조건, 다른 직원 주장에 대한 구체적 반박을 남겨야 하며, CEO는 반박 없는 `agree`를 최종 합의로 받아들이지 않는다.

### Scope

- CEO skill에 적대적 검토 원칙과 합의 전 반박 의무를 추가한다.
- 회의 프로토콜과 위임 라우팅 문서에 반대 가설, 실패 조건, 반박 기준을 추가한다.
- 직원 역할 문서의 완료 기준에 “최소 하나의 실질 반박 또는 조건부 반대”를 반영한다.
- validation script가 새 적대적 회의 규칙을 검증하게 한다.
- MCP API와 회의 저장 형식은 변경하지 않는다.

### Verification

- `npm run validate`
- `npm test`
- `git diff --check`

## 2026-05-23 Runtime Discussion Sufficiency Plan

### Summary

Agent Company consensus snapshot에 구조적 토론 충족 여부를 추가한다. 다중 참가자 회의에서 반박 라운드 없이 전원이 동의하면 `consensus.reached`를 false로 유지하고 viewer에는 반박 부족 상태를 표시한다.

### Scope

- `ConsensusSnapshot`에 `discussionSatisfied`와 `discussionInsufficientParticipants`를 추가한다.
- 다중 참가자 회의는 참가자별 최종 position 전에 다른 참가자 발언 이후의 `reply`가 있어야 토론 충족으로 본다.
- 단일 참가자 회의는 상호 반박이 불가능하므로 토론 충족으로 본다.
- viewer, README, validation, tests를 새 snapshot 의미에 맞춘다.
- 메시지 의미 분석은 하지 않고 `kind`, `role`, `sequence` 기반 구조 판정만 한다.

### Verification

- `npm run validate`
- `npm test`
- `npm run check`
- `git diff --check`
