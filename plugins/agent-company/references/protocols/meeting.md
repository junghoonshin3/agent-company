# 회의 프로토콜

## 목적

직원 회의는 CEO가 혼자 결정하기 어려운 제품, 설계, 구현, 검증 판단을 역할별 근거로 모으기 위한 절차다.

## 시작 조건

- 사용자에게 CEO 계획을 제안했고 승인을 받았다.
- 참가 역할과 합의 정책이 명확하다.
- `create_meeting`으로 회의방과 HTTP 접속 정보가 만들어졌다.

## 진행 방식

- CEO는 각 직원에게 역할 문서, 회의 목표, HTTP API, 토큰, 기대 산출물, 합의 규칙을 전달한다.
- 직원은 회의 서버에서 기존 메시지를 읽고 자기 발언을 직접 남긴다.
- 직원은 다른 직원의 발언을 읽고 필요한 경우 보완, 반대, 질문을 남긴다.
- CEO는 `meeting_status`로 실제 메시지를 확인한 뒤에만 요약한다.

## 합의

- 모든 필수 참가자가 `agree` 또는 `conditional` 입장을 남기면 합의로 본다.
- `conditional`은 조건이 최종 결정에 반영될 때만 합의로 인정한다.
- `disagree` 또는 `needs-user`가 남아 있으면 CEO는 사용자에게 선택지를 올리고 멈춘다.

## 기록

- 모든 회의 메시지는 `.agent-company/v2/meetings/<meeting_id>/messages.jsonl`에 남는다.
- 회의 메타데이터는 `.agent-company/v2/meetings/<meeting_id>/meeting.json`에 남는다.
- 중요한 CEO 결정은 `.agent-company/v2/decisions.jsonl`에 남긴다.

## 종료

- 합의가 나면 CEO가 `close_meeting`으로 요약, 합의 내용, 남은 질문, 다음 액션을 기록한다.
- 합의가 안 나면 회의를 닫지 말고 사용자 질문으로 전환한다.
