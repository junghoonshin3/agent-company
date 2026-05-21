# 출력 계약

## 직원 완료 파일

CEO와 직원은 작업 완료 시 아래 두 파일을 작성한다.

- `.agent-company/outbox/<task_id>/result.md`.
- `.agent-company/outbox/<task_id>/done.json`.

## done.json 예시

```json
{
  "status": "completed",
  "summary": "요구사항 초안을 작성했습니다."
}
```

차단 상태는 다음 형식을 쓴다.

```json
{
  "status": "blocked",
  "summary": "외부 서비스 비용 승인이 필요합니다.",
  "needs": "사용자가 유료 API 사용 여부를 승인해야 합니다."
}
```

실패 상태는 다음 형식을 쓴다.

```json
{
  "status": "failed",
  "summary": "검증 명령이 실패했습니다."
}
```

`done.json`은 JSON 객체여야 한다. `status`는 `completed`, `blocked`, `failed` 중 하나여야 한다. `summary`는 항상 비어 있으면 안 된다. `blocked` 상태는 `needs`가 비어 있으면 실패로 처리된다.

## result.md 원칙

직원 결과는 CEO가 바로 의사결정에 사용할 수 있게 짧고 구조적으로 작성한다. CEO 결과는 현재 Codex 게이트웨이가 사용자에게 그대로 중계할 수 있게 작성한다. 근거가 약한 내용은 추정으로 표시한다.

`result.md`는 비어 있으면 실패로 처리된다. `completed` 상태는 역할 문서의 `result.md 템플릿`에 있는 필수 heading을 모두 포함해야 한다.

## 동료 메시지 파일

직접 메시지는 작업 완료물이 아니며 `done.json`을 요구하지 않는다. 메시지는 `.agent-company/messages/<message_id>.json`, `.agent-company/messages/<message_id>.md`, 대상 직원의 `.agent-company/inbox/<role>/<message_id>.peer.md`에 남는다.

직접 메시지는 좁은 질문, 근거 요청, 리스크 확인에만 사용한다. 승인 필요한 일이나 작업 범위 변경은 CEO에게 올린다.
