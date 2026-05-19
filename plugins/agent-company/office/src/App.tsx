// Agent Company 직원 상태를 도트 오피스 화면으로 렌더링한다.
import { useEffect, useMemo, useState } from "react";
import { fetchOfficeState, subscribeToOfficeState, type OfficeStateSubscription } from "./api";
import type { OfficeMeeting, OfficeMeetingRoleClaim, OfficeRole, OfficeState, OfficeTask, RoleActivityStatus, RoleId } from "./officeTypes";
import { getLatestRoleTask, getRecentRoleTasks, getRoleActivityStatus } from "./status";

const POLL_INTERVAL_MS = 1500;
const CLOCK_INTERVAL_MS = 30000;
const ROLE_TASK_LIMIT = 3;
const ACTIVE_TASK_STATUSES: OfficeTask["status"][] = ["delegated", "queued"];

type KanbanStatusFilter = RoleActivityStatus | "all";
type SyncMode = "loading" | "live" | "polling";

const STATUS_LABELS: Record<RoleActivityStatus, string> = {
  idle: "대기",
  working: "작업 중",
  done: "완료",
  blocked: "막힘",
  failed: "실패",
};

const KANBAN_FILTER_OPTIONS: { value: KanbanStatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "working", label: STATUS_LABELS.working },
  { value: "done", label: STATUS_LABELS.done },
  { value: "blocked", label: STATUS_LABELS.blocked },
  { value: "failed", label: STATUS_LABELS.failed },
  { value: "idle", label: STATUS_LABELS.idle },
];

const ROLE_LABELS: Record<RoleId, string> = {
  "service-planner": "서비스 기획자",
  researcher: "리서치 담당자",
  "ui-ux-designer": "UI/UX 디자이너",
  architect: "프로젝트 아키텍트",
  "fullstack-developer": "풀스택 개발자",
  "qa-engineer": "QA 엔지니어",
  "release-manager": "릴리즈 담당자",
  "knowledge-manager": "기록·지식관리 담당자",
};

export function App() {
  const [state, setState] = useState<OfficeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>("loading");
  const [clockNow, setClockNow] = useState(() => new Date().toISOString());
  const [kanbanStatusFilter, setKanbanStatusFilter] = useState<KanbanStatusFilter>("all");
  const [expandedMeetingId, setExpandedMeetingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let pollIntervalId: number | undefined;
    let subscription: OfficeStateSubscription | null = null;

    async function loadState(nextSyncMode: SyncMode) {
      try {
        const nextState = await fetchOfficeState();
        if (isMounted) {
          setState(nextState);
          setError(null);
          setSyncMode(nextSyncMode);
        }
      } catch (unknownError) {
        if (isMounted) {
          setError(unknownError instanceof Error ? unknownError.message : "상태를 불러오지 못했습니다.");
          setSyncMode("polling");
        }
      }
    }

    function startPolling() {
      if (pollIntervalId !== undefined) {
        return;
      }

      setSyncMode("polling");
      void loadState("polling");
      pollIntervalId = window.setInterval(() => {
        void loadState("polling");
      }, POLL_INTERVAL_MS);
    }

    subscription = subscribeToOfficeState(
      (nextState) => {
        if (!isMounted) {
          return;
        }

        setState(nextState);
        setError(null);
        setSyncMode("live");
      },
      () => {
        if (!isMounted) {
          return;
        }

        subscription?.close();
        subscription = null;
        startPolling();
      },
    );

    if (!subscription) {
      startPolling();
    }

    return () => {
      isMounted = false;
      subscription?.close();
      if (pollIntervalId !== undefined) {
        window.clearInterval(pollIntervalId);
      }
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockNow(new Date().toISOString());
    }, CLOCK_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  const roleStatuses = useMemo(() => {
    const tasks = state?.tasks ?? [];

    return (state?.roles ?? []).map((role) => ({
      role,
      status: getRoleActivityStatus(role.id, tasks),
    }));
  }, [state]);

  const statusCounts = useMemo(() => {
    const counts: Record<RoleActivityStatus, number> = {
      idle: 0,
      working: 0,
      done: 0,
      blocked: 0,
      failed: 0,
    };

    for (const { status } of roleStatuses) {
      counts[status] += 1;
    }

    return counts;
  }, [roleStatuses]);

  const kanbanFilterCounts = useMemo<Record<KanbanStatusFilter, number>>(() => ({
    all: roleStatuses.length,
    working: statusCounts.working,
    done: statusCounts.done,
    blocked: statusCounts.blocked,
    failed: statusCounts.failed,
    idle: statusCounts.idle,
  }), [roleStatuses.length, statusCounts]);

  const visibleRoleStatuses = useMemo(() => {
    if (kanbanStatusFilter === "all") {
      return roleStatuses;
    }

    return roleStatuses.filter(({ status }) => status === kanbanStatusFilter);
  }, [kanbanStatusFilter, roleStatuses]);

  const activeTasks = useMemo(() => {
    return (state?.tasks ?? [])
      .filter(isActiveTask)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  }, [state]);

  return (
    <main id="office-dashboard" className="office-shell">
      <header className="office-header">
        <div>
          <p className="eyebrow">Agent Company</p>
          <h1>Dot Office</h1>
        </div>
        <div className="sync-panel" aria-live="polite">
          <span className={getSyncDotClassName(syncMode, Boolean(error))} />
          <span>{getSyncStatusLabel(syncMode, Boolean(error), Boolean(state))}</span>
          {state ? <time dateTime={state.generatedAt}>{formatClock(state.generatedAt)}</time> : null}
        </div>
      </header>

      {error ? <p className="error-strip">{error}</p> : null}

      <ActiveWorkPanel tasks={activeTasks} roles={state?.roles ?? []} nowIso={clockNow} />

      <section className="summary-bar" aria-label="역할 상태 요약">
        <SummaryMetric label="작업 중" value={statusCounts.working} tone="working" />
        <SummaryMetric label="완료" value={statusCounts.done} tone="done" />
        <SummaryMetric label="막힘" value={statusCounts.blocked} tone="blocked" />
        <SummaryMetric label="실패" value={statusCounts.failed} tone="failed" />
        <SummaryMetric label="대기" value={statusCounts.idle} tone="idle" />
      </section>

      <section id="office-floor" className="office-floor" aria-label="도트 오피스 역할 현황">
        <div id="role-grid" className="role-grid">
          {(state?.roles ?? []).map((role) => (
            <RoleDesk key={role.id} role={role} tasks={state?.tasks ?? []} />
          ))}
        </div>
      </section>

      <section className="activity-layout">
        <article id="task-kanban" className="activity-panel kanban-panel" aria-labelledby="task-kanban-title">
          <div className="panel-heading panel-heading--kanban">
            <div className="panel-title-copy">
              <p>최근 진행</p>
              <h2 id="task-kanban-title">에이전트별 칸반</h2>
            </div>
            <div className="kanban-filter" role="group" aria-label="칸반 진행상황 필터">
              {KANBAN_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`kanban-filter-button${kanbanStatusFilter === option.value ? " kanban-filter-button--active" : ""}`}
                  aria-pressed={kanbanStatusFilter === option.value}
                  onClick={() => setKanbanStatusFilter(option.value)}
                >
                  <span>{option.label}</span>
                  <strong>{kanbanFilterCounts[option.value]}</strong>
                </button>
              ))}
            </div>
            <span aria-label="최근 작업 수">{state?.tasks.length ?? 0}</span>
          </div>
          {(state?.roles ?? []).length > 0 ? (
            <div className="kanban-board" aria-label="에이전트별 최근 작업 목록">
              {visibleRoleStatuses.length > 0 ? (
                visibleRoleStatuses.map(({ role, status }) => (
                  <RoleKanbanColumn key={role.id} role={role} status={status} tasks={state?.tasks ?? []} nowIso={clockNow} />
                ))
              ) : (
                <p className="kanban-filter-empty">선택한 진행상황의 에이전트가 없습니다.</p>
              )}
            </div>
          ) : (
            <p className="empty-state">에이전트 상태가 없습니다.</p>
          )}
        </article>

        <article id="meeting-list" className="activity-panel" aria-labelledby="meeting-list-title">
          <div className="panel-heading">
            <h2 id="meeting-list-title">최근 회의</h2>
            <span>{state?.recentMeetings.length ?? 0}</span>
          </div>
          <div className="feed-list">
            {(state?.recentMeetings ?? []).length > 0 ? (
              state?.recentMeetings.map((meeting) => (
                <MeetingRow
                  key={meeting.id}
                  meeting={meeting}
                  isExpanded={expandedMeetingId === meeting.id}
                  onToggle={() => setExpandedMeetingId((currentId) => currentId === meeting.id ? null : meeting.id)}
                />
              ))
            ) : (
              <p className="empty-state">회의 기록이 없습니다.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

function ActiveWorkPanel({ tasks, roles, nowIso }: { tasks: OfficeTask[]; roles: OfficeRole[]; nowIso: string }) {
  return (
    <section id="active-work" className="activity-panel active-work-panel" aria-labelledby="active-work-title">
      <div className="panel-heading active-work-heading">
        <div className="panel-title-copy">
          <p>실시간 진행</p>
          <h2 id="active-work-title">현재 작업 중</h2>
        </div>
        <span aria-label="현재 작업 중 수">{tasks.length}</span>
      </div>
      {tasks.length > 0 ? (
        <div className="active-work-list">
          {tasks.map((task) => (
            <ActiveTaskCard key={task.id} task={task} roleTitle={getRoleTitle(task.role, roles)} nowIso={nowIso} />
          ))}
        </div>
      ) : (
        <p className="active-work-empty">진행 중인 작업 없음</p>
      )}
    </section>
  );
}

function ActiveTaskCard({ task, roleTitle, nowIso }: { task: OfficeTask; roleTitle: string; nowIso: string }) {
  return (
    <article className={`active-task-card active-task-card--${task.status}`} data-task-status={task.status}>
      <div className="active-task-meta">
        <span className={`status-badge status-badge--${task.status}`}>{formatTaskStatus(task.status)}</span>
        <span>{roleTitle}</span>
      </div>
      <strong>{task.title}</strong>
      <p>{task.summary ?? task.id}</p>
      <div className="active-task-times">
        <time dateTime={task.createdAt}>진행 {formatElapsedTime(task.createdAt, nowIso)}</time>
        <time dateTime={task.updatedAt}>최근 갱신 {formatDateTime(task.updatedAt)}</time>
      </div>
    </article>
  );
}

function MeetingRow({
  meeting,
  isExpanded,
  onToggle,
}: {
  meeting: OfficeMeeting;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const detailId = `meeting-detail-${meeting.id}`;

  return (
    <article className={`meeting-row${isExpanded ? " meeting-row--expanded" : ""}`}>
      <button
        type="button"
        className="meeting-trigger"
        aria-expanded={isExpanded}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span>
          <strong>{meeting.title}</strong>
          <span className="meeting-participants">{formatParticipants(meeting.participants)}</span>
        </span>
        <time dateTime={meeting.createdAt}>{formatDateTime(meeting.createdAt)}</time>
      </button>
      {isExpanded ? (
        <div id={detailId} className="meeting-detail">
          <section className="meeting-detail-section">
            <h3>에이전트 주장</h3>
            {meeting.roleClaims.length > 0 ? (
              <ul className="meeting-claim-list">
                {meeting.roleClaims.map((claim) => <MeetingClaimItem key={`${meeting.id}-${claim.role}`} claim={claim} />)}
              </ul>
            ) : (
              <p className="meeting-muted">개별 주장 기록이 없습니다.</p>
            )}
          </section>

          <section className="meeting-detail-section">
            <h3>결론 흐름</h3>
            {meeting.summary ? <p>{meeting.summary}</p> : null}
            {meeting.decisions.length > 0 ? (
              <ul className="meeting-decision-list">
                {meeting.decisions.map((decision) => <li key={decision}>{decision}</li>)}
              </ul>
            ) : (
              <p className="meeting-muted">결정 기록이 없습니다.</p>
            )}
            {meeting.nextActions.length > 0 ? (
              <div className="meeting-next-actions">
                <span>다음 조치</span>
                <ul>
                  {meeting.nextActions.map((action) => <li key={action}>{action}</li>)}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </article>
  );
}

function MeetingClaimItem({ claim }: { claim: OfficeMeetingRoleClaim }) {
  return (
    <li className={`meeting-claim${claim.recorded ? "" : " meeting-claim--muted"}`}>
      <strong>{claim.roleTitle}</strong>
      <p>{claim.summary}</p>
      {claim.sourceTaskTitle ? <small>{claim.sourceTaskTitle}</small> : null}
    </li>
  );
}

function RoleKanbanColumn({
  role,
  status,
  tasks,
  nowIso,
}: {
  role: OfficeRole;
  status: RoleActivityStatus;
  tasks: OfficeTask[];
  nowIso: string;
}) {
  const recentRoleTasks = getRecentRoleTasks(role.id, tasks, ROLE_TASK_LIMIT);

  return (
    <section className={`kanban-column kanban-column--${status}`} data-role-id={role.id} data-role-status={status}>
      <div className="kanban-column-header">
        <div>
          <h3>{role.title}</h3>
          <p>{STATUS_LABELS[status]}</p>
        </div>
        <strong>{recentRoleTasks.length}</strong>
      </div>
      <div className="kanban-card-list">
        {recentRoleTasks.length > 0 ? (
          recentRoleTasks.map((task) => <KanbanTaskCard key={task.id} task={task} roleTitle={role.title} nowIso={nowIso} />)
        ) : (
          <p className="kanban-empty">최근 작업 없음</p>
        )}
      </div>
    </section>
  );
}

function RoleDesk({ role, tasks }: { role: OfficeRole; tasks: OfficeTask[] }) {
  const status = getRoleActivityStatus(role.id, tasks);
  const latestTask = getLatestRoleTask(role.id, tasks);

  return (
    <article className={`role-desk role-desk--${status}`} data-role-id={role.id} data-role-status={status}>
      <div className="desk-scene" aria-hidden="true">
        <div className={`pixel-worker pixel-worker--${status}`}>
          <span className="pixel-head" />
          <span className="pixel-body" />
          <span className="pixel-arm pixel-arm--left" />
          <span className="pixel-arm pixel-arm--right" />
        </div>
        <div className="pixel-desk">
          <span className="pixel-monitor" />
          <span className="pixel-keyboard" />
        </div>
      </div>
      <div className="role-copy">
        <div className="role-title-row">
          <h2>{role.title}</h2>
          <span className={`status-badge status-badge--${status}`}>{STATUS_LABELS[status]}</span>
        </div>
        <p>{latestTask?.title ?? "할당된 작업 없음"}</p>
        {latestTask?.summary ? <small>{latestTask.summary}</small> : null}
      </div>
    </article>
  );
}

function SummaryMetric({ label, value, tone }: { label: string; value: number; tone: RoleActivityStatus }) {
  return (
    <div className={`summary-metric summary-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function KanbanTaskCard({ task, roleTitle, nowIso }: { task: OfficeTask; roleTitle: string; nowIso: string }) {
  return (
    <article className={`kanban-card kanban-card--${task.status}`} data-task-status={task.status}>
      <div className="kanban-card-meta">
        <span className={`status-badge status-badge--${task.status}`}>{formatTaskStatus(task.status)}</span>
        <time dateTime={task.updatedAt}>{formatDateTime(task.updatedAt)}</time>
      </div>
      <small className="kanban-card-role">{roleTitle}</small>
      <strong>{task.title}</strong>
      <p>{task.summary ?? task.id}</p>
      {isActiveTask(task) ? <span className="kanban-card-elapsed">진행 {formatElapsedTime(task.createdAt, nowIso)}</span> : null}
    </article>
  );
}

function isActiveTask(task: OfficeTask): boolean {
  return ACTIVE_TASK_STATUSES.includes(task.status);
}

function getRoleTitle(roleId: RoleId, roles: OfficeRole[]): string {
  return roles.find((role) => role.id === roleId)?.title ?? ROLE_LABELS[roleId];
}

function getSyncDotClassName(syncMode: SyncMode, hasError: boolean): string {
  if (hasError) {
    return "sync-dot sync-dot--error";
  }

  if (syncMode === "live") {
    return "sync-dot sync-dot--live";
  }

  if (syncMode === "polling") {
    return "sync-dot sync-dot--polling";
  }

  return "sync-dot";
}

function getSyncStatusLabel(syncMode: SyncMode, hasError: boolean, hasState: boolean): string {
  if (hasError) {
    return "연결 오류";
  }

  if (syncMode === "live") {
    return "실시간 연결됨";
  }

  if (syncMode === "polling") {
    return "폴링으로 동기화 중";
  }

  return hasState ? "재연결 중" : "불러오는 중";
}

function formatTaskStatus(status: OfficeTask["status"]): string {
  if (status === "delegated" || status === "queued") {
    return "작업 중";
  }

  if (status === "completed") {
    return "완료";
  }

  if (status === "blocked") {
    return "막힘";
  }

  return "실패";
}

function formatParticipants(participants: RoleId[]): string {
  if (participants.length === 0) {
    return "참가자 기록 없음";
  }

  return participants.map((participant) => ROLE_LABELS[participant]).join(", ");
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatElapsedTime(startedAt: string, nowIso: string): string {
  const startTime = Date.parse(startedAt);
  const nowTime = Date.parse(nowIso);
  if (Number.isNaN(startTime) || Number.isNaN(nowTime)) {
    return "시간 확인 중";
  }

  const elapsedMinutes = Math.max(0, Math.floor((nowTime - startTime) / 60000));
  if (elapsedMinutes < 1) {
    return "1분 미만";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}분째`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const remainingMinutes = elapsedMinutes % 60;
  if (elapsedHours < 24) {
    return remainingMinutes > 0 ? `${elapsedHours}시간 ${remainingMinutes}분째` : `${elapsedHours}시간째`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  const remainingHours = elapsedHours % 24;
  return remainingHours > 0 ? `${elapsedDays}일 ${remainingHours}시간째` : `${elapsedDays}일째`;
}
