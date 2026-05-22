// Agent Company v2의 CEO와 전문 직원 역할 메타데이터를 정의한다.
import type { RoleDefinition, RoleId, TaskCategory } from "./types.ts";

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    id: "ceo",
    title: "CEO",
    referencePath: "references/roles/ceo.md",
    category: "general",
    canEdit: false,
  },
  {
    id: "service-planner",
    title: "서비스 기획자",
    referencePath: "references/roles/service-planner.md",
    category: "planning",
    canEdit: false,
  },
  {
    id: "researcher",
    title: "리서치 담당자",
    referencePath: "references/roles/researcher.md",
    category: "research",
    canEdit: false,
    useSearch: true,
  },
  {
    id: "ui-ux-designer",
    title: "UI/UX 디자이너",
    referencePath: "references/roles/ui-ux-designer.md",
    category: "design",
    canEdit: false,
  },
  {
    id: "architect",
    title: "프로젝트 아키텍트",
    referencePath: "references/roles/architect.md",
    category: "architecture",
    canEdit: false,
  },
  {
    id: "fullstack-developer",
    title: "풀스택 개발자",
    referencePath: "references/roles/fullstack-developer.md",
    category: "implementation",
    canEdit: true,
  },
  {
    id: "qa-engineer",
    title: "QA 엔지니어",
    referencePath: "references/roles/qa-engineer.md",
    category: "qa",
    canEdit: false,
  },
  {
    id: "release-manager",
    title: "릴리즈 담당자",
    referencePath: "references/roles/release-manager.md",
    category: "release",
    canEdit: false,
  },
  {
    id: "knowledge-manager",
    title: "기록·지식관리 담당자",
    referencePath: "references/roles/knowledge-manager.md",
    category: "knowledge",
    canEdit: false,
  },
];

export const TASK_CATEGORIES: TaskCategory[] = [
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

export function isTaskCategory(value: string): value is TaskCategory {
  return TASK_CATEGORIES.some((category) => category === value);
}
