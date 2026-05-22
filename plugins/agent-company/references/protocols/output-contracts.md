# 출력 계약

## 직원 메시지

직원은 회의 서버에 짧고 구조적인 메시지를 남긴다.

첫 메시지는 다음을 포함한다.

- 역할 관점의 핵심 판단.
- 판단 근거.
- 리스크.
- 필요한 질문.

마지막 consensus 메시지는 다음을 포함한다.

- `agree`, `conditional`, `disagree`, `needs-user` 중 하나의 입장.
- 입장 근거.
- 조건이나 사용자 질문이 있으면 명확한 문장.

## CEO 보고

CEO 최종 보고는 사용자가 바로 판단할 수 있게 짧게 작성한다.

- 선택한 운영 방식과 참가 역할.
- 합의 내용 또는 남은 선택지.
- 결정과 근거.
- 실제 검증 결과.
- 남은 리스크.
- 다음 액션.

## 기록 위치

- 회의 메타데이터는 `.agent-company/v2/meetings/<meeting_id>/meeting.json`에 저장한다.
- 회의 메시지는 `.agent-company/v2/meetings/<meeting_id>/messages.jsonl`에 저장한다.
- CEO 결정은 `.agent-company/v2/decisions.jsonl`에 저장한다.

## 금지

- 검증하지 않은 내용을 검증 완료로 쓰지 않는다.
- 불명확한 추정을 사실처럼 쓰지 않는다.
- 승인 필요한 행동을 완료된 일처럼 보고하지 않는다.
