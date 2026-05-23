// Agent Company 회의 타임라인 HTML을 생성한다.

export function renderMeetingViewerHtml(input: { meetingId: string; roleTitles: Record<string, string> }): string {
  const config = escapeScriptJson(JSON.stringify(input));
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Company Meeting</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #5d6673;
      --line: #d9dee7;
      --accent: #0f766e;
      --accent-soft: #d9f4ef;
      --warn: #b45309;
      --warn-soft: #fff2d4;
      --bad: #b42318;
      --bad-soft: #ffe4df;
      --good: #166534;
      --good-soft: #dcfce7;
      --shadow: 0 18px 50px rgba(28, 39, 49, 0.08);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      min-width: 320px;
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 2;
      background: rgba(246, 247, 249, 0.94);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(12px);
    }

    .topbar-inner {
      width: min(1180px, calc(100vw - 32px));
      min-height: 68px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .brand {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .brand-label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.25;
      font-weight: 760;
      overflow-wrap: anywhere;
    }

    .connection {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
      min-height: 32px;
      padding: 0 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
      white-space: nowrap;
    }

    .connection::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--warn);
    }

    .connection.ok::before {
      background: var(--good);
    }

    .connection.bad::before {
      background: var(--bad);
    }

    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 24px auto 40px;
      display: grid;
      grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }

    .summary,
    .timeline {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }

    .summary {
      position: sticky;
      top: 92px;
      padding: 18px;
    }

    .summary-section + .summary-section {
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid var(--line);
    }

    .section-title {
      margin: 0 0 10px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 760;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .goal {
      margin: 0;
      color: var(--text);
      font-size: 14px;
      line-height: 1.55;
      overflow-wrap: anywhere;
    }

    .meta-grid {
      display: grid;
      gap: 8px;
    }

    .meta-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 28px;
      color: var(--muted);
      font-size: 13px;
    }

    .meta-row strong {
      color: var(--text);
      font-weight: 720;
      text-align: right;
      overflow-wrap: anywhere;
    }

    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      max-width: 100%;
      padding: 0 9px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: #f9fafb;
      color: var(--text);
      font-size: 12px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .pill.good {
      border-color: #bbf7d0;
      background: var(--good-soft);
      color: var(--good);
    }

    .pill.warn {
      border-color: #fed7aa;
      background: var(--warn-soft);
      color: var(--warn);
    }

    .pill.bad {
      border-color: #fecaca;
      background: var(--bad-soft);
      color: var(--bad);
    }

    .timeline-header {
      min-height: 56px;
      padding: 16px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--line);
    }

    .timeline-header h2 {
      margin: 0;
      font-size: 16px;
      line-height: 1.3;
    }

    .message-count {
      color: var(--muted);
      font-size: 13px;
      font-weight: 650;
      white-space: nowrap;
    }

    .messages {
      display: grid;
    }

    .message {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 12px;
      padding: 18px;
      border-top: 1px solid var(--line);
    }

    .message:first-child {
      border-top: 0;
    }

    .avatar {
      width: 42px;
      height: 42px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 14px;
      font-weight: 820;
      line-height: 1;
    }

    .message-head {
      min-width: 0;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .role {
      font-weight: 760;
      overflow-wrap: anywhere;
    }

    .time {
      color: var(--muted);
      font-size: 12px;
      font-weight: 620;
    }

    .body {
      margin: 8px 0 0;
      color: var(--text);
      font-size: 14px;
      line-height: 1.65;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .empty {
      min-height: 260px;
      display: grid;
      place-items: center;
      padding: 40px 18px;
      color: var(--muted);
      font-size: 14px;
      text-align: center;
    }

    @media (max-width: 820px) {
      .topbar-inner,
      main {
        width: min(100vw - 24px, 720px);
      }

      .topbar-inner {
        min-height: 78px;
        align-items: flex-start;
        flex-direction: column;
        justify-content: center;
        gap: 8px;
      }

      main {
        grid-template-columns: 1fr;
        margin-top: 16px;
      }

      .summary {
        position: static;
      }
    }

    @media (max-width: 520px) {
      .message {
        grid-template-columns: 1fr;
      }

      .avatar {
        width: 34px;
        height: 34px;
      }

      .timeline-header {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <div class="brand-label">Agent Company</div>
        <h1 id="meeting-title">회의</h1>
      </div>
      <div id="connection" class="connection">연결 중</div>
    </div>
  </header>

  <main>
    <aside class="summary" aria-label="회의 정보">
      <section class="summary-section">
        <h2 class="section-title">목표</h2>
        <p id="meeting-goal" class="goal">불러오는 중</p>
      </section>
      <section class="summary-section">
        <h2 class="section-title">상태</h2>
        <div class="meta-grid">
          <div class="meta-row"><span>회의</span><strong id="meeting-status">-</strong></div>
          <div class="meta-row"><span>합의</span><strong id="consensus-status">-</strong></div>
          <div class="meta-row"><span>업데이트</span><strong id="updated-at">-</strong></div>
        </div>
      </section>
      <section class="summary-section">
        <h2 class="section-title">참가자</h2>
        <div id="participants" class="pills"></div>
      </section>
      <section class="summary-section">
        <h2 class="section-title">입장</h2>
        <div id="positions" class="pills"></div>
      </section>
    </aside>

    <section class="timeline" aria-label="회의 발언">
      <div class="timeline-header">
        <h2>발언</h2>
        <div id="message-count" class="message-count">0개</div>
      </div>
      <div id="messages" class="messages">
        <div class="empty">아직 발언이 없습니다.</div>
      </div>
    </section>
  </main>

  <script>
    const config = ${config};
    const token = new URLSearchParams(window.location.search).get("token") || "";
    const stateLabels = {
      open: "진행 중",
      closed: "종료됨",
    };
    const kindLabels = {
      statement: "발언",
      reply: "응답",
      consensus: "합의",
      question: "질문",
      result: "결과",
      system: "시스템",
    };
    const positionLabels = {
      agree: "동의",
      conditional: "조건부 동의",
      disagree: "반대",
      "needs-user": "사용자 결정 필요",
    };

    const elements = {
      title: document.getElementById("meeting-title"),
      goal: document.getElementById("meeting-goal"),
      status: document.getElementById("meeting-status"),
      consensus: document.getElementById("consensus-status"),
      updatedAt: document.getElementById("updated-at"),
      participants: document.getElementById("participants"),
      positions: document.getElementById("positions"),
      messages: document.getElementById("messages"),
      count: document.getElementById("message-count"),
      connection: document.getElementById("connection"),
    };

    function roleTitle(role) {
      return config.roleTitles[role] || role;
    }

    function formatTime(value) {
      if (!value) {
        return "-";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      return new Intl.DateTimeFormat(undefined, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    }

    function initials(role) {
      return role
        .split("-")
        .map((part) => part.slice(0, 1))
        .join("")
        .slice(0, 2)
        .toUpperCase();
    }

    function pill(text, tone) {
      const node = document.createElement("span");
      node.className = "pill" + (tone ? " " + tone : "");
      node.textContent = text;
      return node;
    }

    function toneForPosition(position) {
      if (position === "agree") {
        return "good";
      }
      if (position === "conditional") {
        return "warn";
      }
      if (position === "disagree" || position === "needs-user") {
        return "bad";
      }
      return "";
    }

    function setConnection(text, tone) {
      elements.connection.textContent = text;
      elements.connection.className = "connection" + (tone ? " " + tone : "");
    }

    function render(data) {
      const meeting = data.meeting;
      const consensus = data.consensus;
      const messages = data.messages || [];
      const shouldStick = window.innerHeight + window.scrollY > document.body.offsetHeight - 96;

      elements.title.textContent = meeting.title;
      document.title = meeting.title + " - Agent Company";
      elements.goal.textContent = meeting.goal;
      elements.status.textContent = stateLabels[meeting.status] || meeting.status;
      const conditionalCount = consensus.conditionalParticipants ? consensus.conditionalParticipants.length : 0;
      const positionConsensusReached = consensus.requiredParticipants.every((role) => {
        const position = consensus.positions[role];
        return position === "agree" || position === "conditional";
      });
      elements.consensus.textContent = consensus.reached
        ? (conditionalCount > 0 ? "조건 검토 필요" : "완료")
        : (positionConsensusReached && consensus.discussionSatisfied === false ? "반박 부족" : "진행 중");
      elements.updatedAt.textContent = formatTime(meeting.updatedAt);
      elements.count.textContent = messages.length + "개";

      elements.participants.replaceChildren(
        ...meeting.participants.map((role) => pill(roleTitle(role), ""))
      );

      elements.positions.replaceChildren(
        ...consensus.requiredParticipants.map((role) => {
          const position = consensus.positions[role];
          const label = position ? positionLabels[position] || position : "대기";
          return pill(roleTitle(role) + " · " + label, toneForPosition(position));
        })
      );

      if (messages.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "아직 발언이 없습니다.";
        elements.messages.replaceChildren(empty);
      } else {
        elements.messages.replaceChildren(...messages.map(renderMessage));
      }

      if (shouldStick) {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      }
    }

    function renderMessage(message) {
      const item = document.createElement("article");
      item.className = "message";

      const avatar = document.createElement("div");
      avatar.className = "avatar";
      avatar.textContent = initials(message.role);

      const content = document.createElement("div");
      const head = document.createElement("div");
      head.className = "message-head";

      const role = document.createElement("span");
      role.className = "role";
      role.textContent = roleTitle(message.role);

      const kind = pill(kindLabels[message.kind] || message.kind, "");
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = "#" + message.sequence + " · " + formatTime(message.createdAt);

      head.append(role, kind);
      if (message.position) {
        head.append(pill(positionLabels[message.position] || message.position, toneForPosition(message.position)));
      }
      head.append(time);

      const body = document.createElement("p");
      body.className = "body";
      body.textContent = message.message;

      content.append(head, body);
      item.append(avatar, content);
      return item;
    }

    async function refresh() {
      try {
        const response = await fetch("/api/meetings/" + encodeURIComponent(config.meetingId), {
          headers: { "X-Agent-Company-Token": token },
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        render(await response.json());
        setConnection("연결됨", "ok");
      } catch (error) {
        setConnection("연결 오류", "bad");
      }
    }

    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`;
}

function escapeScriptJson(value: string): string {
  return value.replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
