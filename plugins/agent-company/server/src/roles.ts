// Agent Company의 상주 직원 역할과 부팅 프롬프트를 정의한다.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { RoleDefinition, RoleId, TaskType } from "./types.ts";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHARED_REFERENCE_PATHS = [
  "references/protocols/delegation-routing.md",
  "references/protocols/approval.md",
  "references/protocols/output-contracts.md",
  "references/protocols/workspaces.md",
];
export const TASK_PLAYBOOK_PATH = "references/protocols/task-playbooks.md";

export const TASK_TYPES: TaskType[] = [
  "planning",
  "research",
  "design",
  "architecture",
  "implementation",
  "qa",
  "release",
  "knowledge",
  "general",
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: "ceo",
    title: "CEO",
    windowName: "ceo",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    writable: false,
    referencePath: "references/roles/ceo.md",
    defaultTaskType: "general",
    requiredResultHeadings: ["## 프로세스 설계", "## 위임 현황", "## 결정과 근거", "## 사용자 보고"],
  },
  {
    id: "service-planner",
    title: "서비스 기획자",
    windowName: "planner",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    writable: false,
    referencePath: "references/roles/service-planner.md",
    defaultTaskType: "planning",
    requiredResultHeadings: ["## 문제 정의", "## 권장 범위", "## 성공 기준", "## 확인 질문"],
  },
  {
    id: "researcher",
    title: "리서치 담당자",
    windowName: "research",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    writable: false,
    useSearch: true,
    referencePath: "references/roles/researcher.md",
    defaultTaskType: "research",
    requiredResultHeadings: ["## 확인된 사실", "## 추정", "## 후보 평가", "## 리스크"],
  },
  {
    id: "ui-ux-designer",
    title: "UI/UX 디자이너",
    windowName: "ui-ux",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    writable: false,
    referencePath: "references/roles/ui-ux-designer.md",
    defaultTaskType: "design",
    requiredResultHeadings: ["## 사용자 흐름", "## 화면 구조", "## 상호작용", "## 접근성"],
  },
  {
    id: "architect",
    title: "프로젝트 아키텍트",
    windowName: "architect",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    writable: false,
    referencePath: "references/roles/architect.md",
    defaultTaskType: "architecture",
    requiredResultHeadings: ["## 권장 구조", "## 데이터 흐름", "## 리스크", "## 구현 순서"],
  },
  {
    id: "fullstack-developer",
    title: "풀스택 개발자",
    windowName: "developer",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    writable: true,
    referencePath: "references/roles/fullstack-developer.md",
    defaultTaskType: "implementation",
    requiredResultHeadings: ["## 변경 요약", "## 변경 파일", "## 검증", "## 남은 리스크"],
  },
  {
    id: "qa-engineer",
    title: "QA 엔지니어",
    windowName: "qa",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    writable: true,
    referencePath: "references/roles/qa-engineer.md",
    defaultTaskType: "qa",
    requiredResultHeadings: ["## 테스트 관점", "## 수동 확인", "## 자동 검증", "## 차단 이슈"],
  },
  {
    id: "release-manager",
    title: "릴리즈 담당자",
    windowName: "release",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    writable: false,
    referencePath: "references/roles/release-manager.md",
    defaultTaskType: "release",
    requiredResultHeadings: ["## 릴리즈 노트", "## 배포 체크리스트", "## 롤백", "## 승인 필요 항목"],
  },
  {
    id: "knowledge-manager",
    title: "기록·지식관리 담당자",
    windowName: "knowledge",
    sandbox: "workspace-write",
    approvalPolicy: "on-request",
    writable: true,
    referencePath: "references/roles/knowledge-manager.md",
    defaultTaskType: "knowledge",
    requiredResultHeadings: ["## 결정사항", "## 근거", "## 열린 질문", "## 다음 액션"],
  },
];

export function getRole(id: string): RoleDefinition {
  const role = ROLE_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!role) {
    throw new Error(`Unknown role: ${id}`);
  }
  return role;
}

export function isRoleId(value: string): value is RoleId {
  return ROLE_DEFINITIONS.some((role) => role.id === value);
}

export function isTaskType(value: string): value is TaskType {
  return TASK_TYPES.some((taskType) => taskType === value);
}

export async function buildBootstrapPrompt(
  role: RoleDefinition,
  stateDir: string,
  projectPath: string,
): Promise<string> {
  const roleReference = await readReference(role.referencePath);
  const sharedReferences = await Promise.all(
    SHARED_REFERENCE_PATHS.map(async (referencePath) => ({
      referencePath,
      content: await readReference(referencePath),
    })),
  );

  const isCeo = role.id === "ceo";
  return [
    `너는 Agent Company의 ${role.title} Agent다.`,
    isCeo
      ? "사용자와 직접 대화하는 Codex 게이트웨이가 tmux를 통해 사용자 요청 작업 파일 경로를 알려주면 해당 파일을 읽고 회사를 조율한다."
      : "CEO Agent가 tmux를 통해 작업 파일 경로를 알려주면 해당 파일을 읽고 작업한다.",
    `완료 시 반드시 ${stateDir}/outbox/<task_id>/result.md 와 done.json 을 작성한다.`,
    "아래 역할 문서와 공통 실행 계약을 우선한다.",
    "",
    "## 역할 문서",
    "",
    `Reference: ${role.referencePath}`,
    "",
    roleReference.trim(),
    "",
    "## 공통 실행 계약",
    "",
    ...sharedReferences.flatMap((reference) => [
      `### ${reference.referencePath}`,
      "",
      reference.content.trim(),
      "",
    ]),
    ...(isCeo
      ? buildCeoControlSection(projectPath)
      : buildPeerMessageSection(projectPath, role)),
    "## 완료 게이트",
    "",
    "- `done.json`은 객체여야 하며 `status`는 `completed`, `blocked`, `failed` 중 하나여야 한다.",
    "- `summary`는 항상 비어 있으면 안 된다.",
    "- `blocked`는 `needs`가 비어 있으면 실패로 처리된다.",
    "- `completed`는 역할 문서의 `result.md 템플릿` heading을 모두 포함해야 한다.",
  ].join("\n");
}

function buildCeoControlSection(projectPath: string): string[] {
  const companyctl = shellQuote(path.join(PLUGIN_ROOT, "skills/company/scripts/companyctl"));
  const project = shellQuote(projectPath);
  return [
    "## 회사 조율 명령",
    "",
    "사용자 요청을 직접 구현하지 말고 필요한 직원에게 좁은 작업으로 위임한다.",
    "자기 자신에게 다시 위임하지 않는다.",
    "소스 코드를 직접 수정하지 않는다.",
    "직원 결과를 모아 사용자에게 보고할 최종 결과를 작성한다.",
    "",
    "```sh",
    `${companyctl} delegate ${project} <role> <title> <instructions> [expected_output] [task_type]`,
    `${companyctl} wait ${project} <task_id> [timeout_sec]`,
    `${companyctl} task-status ${project} <task_id> [preview_chars]`,
    `${companyctl} collect ${project} <task_id>`,
    `${companyctl} meeting ${project} <title> <participants_csv> <summary> [decisions] [open_questions] [next_actions] [discussion_id]`,
    `${companyctl} decision ${project} <summary> <rationale> <risk_level> [discussion_id]`,
    `${companyctl} discussion-start ${project} <title> <question> <participants_csv> <context> <expected_decision>`,
    `${companyctl} discussion-round ${project} <discussion_id> <round> <task_ids> <summary>`,
    `${companyctl} discussion-close ${project} <discussion_id> <conclusion> <agreements> <disagreements> <decision> <next_actions> [meeting_id] [decision_id]`,
    `${companyctl} peer-message ${project} ceo <target_role> <title> <message> [discussion_id] [task_id] [in_reply_to]`,
    "```",
    "",
  ];
}

function buildPeerMessageSection(projectPath: string, role: RoleDefinition): string[] {
  return [
    "## 동료 직접 메시지",
    "",
    "동료에게 좁은 질문, 근거 요청, 리스크 확인이 필요하면 작업 범위를 바꾸지 않는 선에서 peer message를 보낼 수 있다.",
    "직접 메시지는 작업 배정이 아니며 배포, 삭제, 비용, 인증, 큰 방향 전환은 여전히 CEO와 사용자 승인이 필요하다.",
    "사용 형식:",
    "",
    "```sh",
    `${shellQuote(path.join(PLUGIN_ROOT, "skills/company/scripts/companyctl"))} peer-message ${shellQuote(projectPath)} ${role.id} <target_role> <title> <message> [discussion_id] [task_id] [in_reply_to]`,
    "```",
    "",
  ];
}

export async function readTaskPlaybook(taskType: TaskType): Promise<string> {
  const content = await readReference(TASK_PLAYBOOK_PATH);
  return extractMarkdownSection(content, taskType);
}

async function readReference(relativePath: string): Promise<string> {
  return fs.readFile(path.join(PLUGIN_ROOT, relativePath), "utf8");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function extractMarkdownSection(content: string, heading: string): string {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) {
    return "";
  }

  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n").trim();
}
