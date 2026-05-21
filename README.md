# Agent Company

Agent Company는 Codex 안에서 작은 제품 회사를 로컬로 운영하기 위한 플러그인입니다. 사용자는 현재 Codex 게이트웨이에 목표를 전달하고, 게이트웨이는 `tmux`에 상주하는 CEO Agent에게 요청을 넘깁니다. CEO Agent는 직원들을 역할별로 호출해 기획, 리서치, UI/UX, 아키텍처, 구현, QA, 릴리즈, 기록 관리를 조율합니다.

이 레포는 Agent Company 플러그인만 독립적으로 담은 공개용 패키지입니다. 원래 실험용 작업공간에 있던 모바일 TODO 예제나 런타임 상태 파일은 포함하지 않습니다.

## 주요 기능

- CEO 중심 워크플로우. 사용자는 개별 직원이 아니라 상주 CEO Agent에게 목표를 전달합니다.
- 역할 기반 에이전트 9명. CEO, 서비스 기획자, 리서처, UI/UX 디자이너, 아키텍트, 풀스택 개발자, QA 엔지니어, 릴리즈 매니저, 지식관리자가 분리되어 있습니다.
- `tmux` 기반 지속 세션. 각 직원은 별도 Codex TUI 세션으로 유지됩니다.
- 파일 기반 업무 기록. `.agent-company/` 아래에 inbox, outbox, board, meeting, discussion, decision, peer message가 남습니다.
- MCP 도구 제공. `start_company`, `delegate_task`, `wait_for_task`, `collect_result`, `record_meeting`, `send_peer_message` 등을 제공합니다.
- 완료 게이트. 직원 결과는 `done.json`과 역할별 `result.md` 필수 섹션을 통과해야 완료로 인정됩니다.
- 읽기 전용 Kanban/Dot Office 대시보드. 현재 직원별 진행 상태, 최근 작업, 회의 기록을 브라우저에서 볼 수 있습니다.
- 안전 규칙. 배포, 삭제, 비용 발생, 외부 공개, 자격 증명 변경, 큰 방향 전환은 사용자 승인을 요구합니다.

## 요구 사항

- Codex CLI 또는 Codex 플러그인과 MCP를 사용할 수 있는 환경.
- Node.js `22.12` 이상 권장.
- `npm`.
- `tmux`.
- Git.

직원 세션은 Codex TUI를 `tmux` 창으로 실행하므로, Codex가 로컬 셸에서 정상 실행되는 상태여야 합니다.

## 빠른 시작

레포를 받은 뒤 의존성을 설치하고 검증합니다.

```sh
npm install
npm run check
```

Codex 플러그인으로 설치합니다.

```sh
codex plugin add agent-company@agentinc-local
```

Codex 세션을 새로 열고 다음처럼 사용자 메시지에서 스킬을 호출합니다.

```text
$agent-company:company TODO 앱의 다음 기능을 기획하고 필요한 직원만 회의시켜줘
```

스킬은 먼저 `start_company(project_path)`를 실행해 CEO와 직원 사무실을 열고, 이어서 `company_status(project_path)`로 현재 상태와 대시보드 URL을 확인합니다. 사용자 작업은 기본적으로 `delegate_task(role: "ceo")`로 CEO에게 전달됩니다.

## 레포 구조

```text
.
├── .agents/plugins/marketplace.json
├── .mcp.json
├── package.json
└── plugins/agent-company
    ├── .codex-plugin/plugin.json
    ├── .mcp.json
    ├── office
    ├── references
    ├── scripts
    ├── server
    └── skills
```

주요 디렉터리는 다음 역할을 가집니다.

| 경로 | 역할 |
| --- | --- |
| `plugins/agent-company/skills/company/SKILL.md` | 게이트웨이가 CEO에게 요청을 전달하는 운영 절차와 승인 규칙입니다. |
| `plugins/agent-company/server/src` | MCP 서버, 런타임, `tmux` 제어, 작업 파일 관리를 담당합니다. |
| `plugins/agent-company/references/roles` | 직원별 역할 매뉴얼과 결과 템플릿입니다. |
| `plugins/agent-company/references/protocols` | 승인, 라우팅, 회의, 산출물 계약, 작업 방식 프로토콜입니다. |
| `plugins/agent-company/office` | 읽기 전용 Kanban/Dot Office 대시보드입니다. |
| `plugins/agent-company/skills/company/scripts` | 대시보드 실행과 CLI 보조 스크립트입니다. |

## 운영 모델

Agent Company는 모든 직원을 무조건 부르지 않습니다. 상주 CEO는 먼저 목표를 분류하고, 가장 책임이 큰 소유 역할을 정한 뒤 필요한 지원 역할만 호출합니다.

일반적인 흐름은 다음과 같습니다.

1. 현재 Codex 게이트웨이가 사용자 목표를 CEO task로 전달합니다.
2. `start_company`로 직원 사무실과 대시보드를 시작하거나 복구합니다.
3. CEO가 `companyctl delegate`로 필요한 직원에게 좁은 작업을 보냅니다.
4. CEO가 `companyctl wait`, `task-status`, `collect`로 결과를 확인합니다.
5. 의미 있는 결론은 CEO가 `companyctl meeting` 또는 `companyctl decision`으로 남깁니다.
6. 구현이 필요하면 범위와 성공 기준이 명확한 뒤 풀스택 개발자에게 위임합니다.
7. 위험이 있으면 QA와 릴리즈 담당자가 검증과 릴리즈 준비를 맡습니다.
8. CEO가 최종 `result.md`와 `done.json`을 작성하면 게이트웨이가 사용자에게 중계합니다.

직원 간 직접 질문이 필요할 때는 `send_peer_message` 또는 `companyctl peer-message`를 사용합니다. 이 메시지는 board task가 아니라 `.agent-company/messages/`에 남는 파일 기반 대화입니다.

## 직원 역할

| 역할 | 담당 범위 |
| --- | --- |
| CEO | 사용자 목표 해석, 프로세스 설계, 직원 위임, 결과 취합, 최종 보고입니다. |
| 서비스 기획자 | 문제 정의, MVP 범위, 우선순위, 성공 기준입니다. |
| 리서치 담당자 | 사용자 기대, 시장, 경쟁 제품, 기술 비교 근거입니다. |
| UI/UX 디자이너 | 사용자 흐름, 화면 구조, 상호작용, 접근성입니다. |
| 프로젝트 아키텍트 | 모듈 경계, 데이터 흐름, API, 마이그레이션, 기술 리스크입니다. |
| 풀스택 개발자 | 승인된 구현과 관련 검증입니다. |
| QA 엔지니어 | 회귀 위험, 테스트 전략, 수동 확인, 차단 이슈입니다. |
| 릴리즈 담당자 | 릴리즈 노트, 배포 준비도, 롤백 위험, 승인 필요 항목입니다. |
| 기록·지식관리 담당자 | 결정사항, 근거, 열린 질문, 다음 액션입니다. |

## 런타임 상태

대상 프로젝트에는 `.agent-company/` 디렉터리가 생성됩니다. 이 디렉터리는 소스 코드가 아니라 운영 상태입니다.

대표적인 파일은 다음과 같습니다.

| 상태 파일 | 설명 |
| --- | --- |
| `.agent-company/config.json` | 직원 구성, 세션명, worktree 경로입니다. |
| `.agent-company/board.json` | 현재 task board입니다. |
| `.agent-company/inbox/<role>/` | 직원에게 전달된 작업 파일입니다. |
| `.agent-company/outbox/<task_id>/result.md` | 직원의 사람용 결과 보고입니다. |
| `.agent-company/outbox/<task_id>/done.json` | 완료, 차단, 실패 상태를 나타내는 기계용 완료 파일입니다. |
| `.agent-company/meetings/` | 회의록입니다. |
| `.agent-company/discussions/` | 여러 라운드가 필요한 토론 기록입니다. |
| `.agent-company/messages/` | 직원 간 직접 메시지입니다. |
| `.agent-company/decisions.md` | CEO가 기록한 결정 로그입니다. |

직원용 worktree는 대상 프로젝트 옆에 `.<repo-name>-agent-company-worktrees/` 형태로 생성됩니다.

## 내장 대시보드

`start_company`는 직원 사무실이 준비된 뒤 읽기 전용 대시보드를 자동으로 시작하거나 복구합니다. 대시보드는 `.agent-company` 파일을 읽어 Kanban 상태, 최근 작업, 최근 회의, 실시간 연결 상태를 보여줍니다.

대시보드 빌드가 없거나 오래되었으면 먼저 빌드합니다.

```sh
npm run build:agent-office
```

수동으로 시작할 때는 다음 스크립트를 사용합니다.

```sh
plugins/agent-company/skills/company/scripts/start-office.sh --project-dir /path/to/project
```

기본값은 `127.0.0.1` 바인딩이므로 현재 Mac에서만 접근 가능합니다. 휴대폰이나 같은 LAN의 다른 장비에서 보려면 명시적으로 `0.0.0.0`에 바인딩합니다.

```sh
plugins/agent-company/skills/company/scripts/start-office.sh --project-dir /path/to/project --host 0.0.0.0
```

이 경우 `company_status(project_path).officeDashboard.networkUrls` 또는 `.agent-company/office/server-info.json`의 `networkUrls`에서 휴대폰 접속 주소를 확인합니다.

대시보드는 읽기 전용입니다. 제어 버튼으로 작업을 수정하지 않고, `GET /api/company/state`와 `GET /api/company/events`로 상태를 제공합니다.

## MCP 도구

플러그인은 다음 MCP 도구를 제공합니다.

| 도구 | 설명 |
| --- | --- |
| `start_company` | 대상 프로젝트에 직원 사무실과 상태 디렉터리를 준비합니다. |
| `company_status` | 설정, board, 최근 회의, 대시보드 상태를 읽습니다. |
| `delegate_task` | 특정 역할에게 작업 파일을 보내고 `tmux` 창에 알립니다. |
| `wait_for_task` | 직원의 완료 파일을 제한 시간 안에서 기다립니다. |
| `task_status` | board를 변경하지 않고 단일 작업 상태를 미리 봅니다. |
| `collect_result` | 직원 산출물을 읽고 완료 게이트를 검증합니다. |
| `record_meeting` | 회의록을 `.agent-company/meetings/`에 기록합니다. |
| `record_decision` | 결정 로그를 `.agent-company/decisions.md`에 추가합니다. |
| `start_discussion` | 지속 토론 기록을 시작합니다. |
| `append_discussion_round` | 토론 라운드 요약을 추가합니다. |
| `close_discussion` | 토론 결론과 합의, 이견, 다음 액션을 저장합니다. |
| `send_peer_message` | 직원 간 파일 기반 직접 메시지를 보냅니다. |
| `stop_company` | 직원 사무실과 대시보드 종료를 시도합니다. |

## 개발 명령

```sh
npm test
npm run validate
npm run typecheck:agent-office
npm run test:agent-office
npm run build:agent-office
npm run check
```

명령별 역할은 다음과 같습니다.

| 명령 | 설명 |
| --- | --- |
| `npm test` | Agent Company 런타임과 CLI 인접 동작을 Node test runner로 검증합니다. |
| `npm run validate` | 플러그인 manifest, marketplace, MCP smoke test, 역할 문서, 대시보드 산출물을 정적 검증합니다. |
| `npm run typecheck:agent-office` | 대시보드 TypeScript 타입을 검사합니다. |
| `npm run test:agent-office` | 대시보드 타입 검사, Vitest, 정적 검증을 실행합니다. |
| `npm run build:agent-office` | 내장 서버가 서빙할 대시보드 `dist`를 생성합니다. |
| `npm run check` | 공개 레포 기준 전체 검증을 실행합니다. |

## 안전과 승인

Agent Company는 로컬 자동화를 돕지만 사용자의 승인 없이 고위험 작업을 진행하지 않도록 설계되어 있습니다.

명시 승인이 필요한 작업은 다음과 같습니다.

- 배포.
- 파괴적 삭제.
- 비용이 발생하는 작업.
- 외부 공개.
- 자격 증명 변경.
- 제품 방향을 크게 바꾸는 결정.
- 원격 저장소 push.

일반적인 로컬 기획, 로컬 구현, 로컬 테스트, 회의록 기록은 별도 승인이 없어도 진행할 수 있습니다.

## 문제 해결

MCP 도구가 보이지 않으면 플러그인 캐시가 예전 버전을 가리킬 수 있습니다.

```sh
codex mcp get agent-company
codex plugin add agent-company@agentinc-local
```

재설치 후에도 도구가 보이지 않으면 Codex 세션을 새로 시작합니다.

대시보드가 뜨지 않으면 다음 파일을 확인합니다.

```sh
cat .agent-company/office/auto-start-error.json
cat .agent-company/office/server.log
```

직원 작업이 오래 멈춘 것처럼 보이면 `task_status`로 outbox 상태를 확인하고, 필요하면 더 좁은 작업으로 다시 위임합니다. `wait_for_task` 타임아웃은 board에 실패 상태로 남도록 처리됩니다.

## 라이선스

아직 별도 라이선스 파일은 포함하지 않았습니다. 공개 저장소로 열려 있더라도 사용, 수정, 재배포 조건은 라이선스가 추가되기 전까지 명시적으로 부여되지 않습니다.
