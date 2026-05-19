# Agent Company Dot Office

로컬 `.agent-company` 파일 상태를 읽어 직원별 작업 상태를 도트 오피스와 칸반 화면으로 보여주는 Agent Company 플러그인 내장 앱입니다.

## Commands

- `npm run dev:agent-office`
- `npm run typecheck:agent-office`
- `npm run test:agent-office`
- `npm run build:agent-office`
- `plugins/agent-company/skills/company/scripts/start-office.sh --project-dir <project_path>`
- `plugins/agent-company/skills/company/scripts/stop-office.sh --project-dir <project_path>`

## Notes

- v1은 보기 전용입니다.
- 개발 중에는 Vite 서버가 상태 API를 제공합니다.
- 플러그인 내장 실행은 `dist`를 직접 서빙하며, 실행 전에 `npm run build:agent-office`가 필요합니다.
- tmux 화면 내용은 파싱하지 않고 `.agent-company/config.json`, `board.json`, task outbox의 `done.json`, meeting Markdown만 읽습니다.
- 내장 서버 정보는 대상 프로젝트의 `.agent-company/office/server-info.json`, `server.pid`, `server.log`에 기록됩니다.
