export const getStyles = (C) => `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:       ${C.bgPage};
      --card:     ${C.bgCard};
      --border:   ${C.bgBorder};
      --input:    ${C.bgInput};
      --text:     ${C.textPrimary};
      --muted:    ${C.textMuted};
      --dim:      ${C.textDim};
      --accent:   ${C.accent};
      --glow:     ${C.accentGlow};

      --c-critical: ${C.Critical.text};
      --c-high:     ${C.High.text};
      --c-moderate: ${C.Moderate.text};
      --c-low:      ${C.Low.text};
      --c-unknown:  ${C.Unknown.text};

      --badge-critical: ${C.Critical.badge};
      --badge-high:     ${C.High.badge};
      --badge-moderate: ${C.Moderate.badge};
      --badge-low:      ${C.Low.badge};
      --badge-unknown:  ${C.Unknown.badge};
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      min-height: 100vh;
    }

    /* ── Layout ── */
    .shell { max-width: 1200px; margin: 0 auto; padding: 0 24px 64px; }

    /* ── Header ── */
    .header {
      background: linear-gradient(180deg, #161b22 0%, #0d1117 100%);
      border-bottom: 1px solid var(--border);
      padding: 32px 0 24px;
      margin-bottom: 32px;
    }
    .header-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
    .header-eyebrow {
      font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace;
      font-size: 11px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 8px;
    }
    .header-title {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: var(--text);
      margin-bottom: 6px;
    }
    .header-date { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
    .header-pills { display: flex; gap: 10px; flex-wrap: wrap; }
    .pill {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(255,255,255,0.06);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 4px 12px;
      font-size: 12px;
      color: var(--muted);
    }
    .pill.danger { background: rgba(218,54,51,0.15); border-color: #da3633; color: #ff7b72; }
    .pill.safe   { background: rgba(46,160,67,0.15);  border-color: #2ea043; color: #56d364; }

    /* ── Summary cards ── */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    @media (max-width: 640px) { .summary-grid { grid-template-columns: repeat(2, 1fr); } }
    .summary-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      position: relative;
      overflow: hidden;
      transition: border-color .2s;
    }
    .summary-card::before {
      content: "";
      position: absolute; top: 0; left: 0; right: 0; height: 3px;
    }
    .summary-card.critical::before { background: var(--badge-critical); }
    .summary-card.high::before     { background: var(--badge-high); }
    .summary-card.moderate::before { background: var(--badge-moderate); }
    .summary-card.low::before      { background: var(--badge-low); }
    .summary-card:hover { border-color: var(--accent); }
    .card-icon  { font-size: 24px; margin-bottom: 8px; }
    .card-count { font-size: 36px; font-weight: 700; line-height: 1; margin-bottom: 4px; }
    .card-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }
    .summary-card.critical .card-count { color: var(--c-critical); }
    .summary-card.high     .card-count { color: var(--c-high); }
    .summary-card.moderate .card-count { color: var(--c-moderate); }
    .summary-card.low      .card-count { color: var(--c-low); }

    /* ── Tabs ── */
    .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
    .tab-btn {
      background: none; border: none; cursor: pointer;
      padding: 10px 20px;
      font-size: 14px; font-family: inherit;
      color: var(--muted);
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      transition: color .15s, border-color .15s;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    /* ── Controls bar ── */
    .controls {
      display: flex; gap: 12px; flex-wrap: wrap;
      align-items: center;
      margin-bottom: 20px;
    }
    .search-wrap { position: relative; flex: 1; min-width: 200px; }
    .search-wrap svg {
      position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
      color: var(--muted); pointer-events: none;
    }
    .search-input {
      width: 100%;
      background: var(--input);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-family: inherit;
      font-size: 13px;
      padding: 8px 12px 8px 34px;
      outline: none;
      transition: border-color .15s;
    }
    .search-input:focus { border-color: var(--accent); }
    .search-input::placeholder { color: var(--dim); }

    .filter-group { display: flex; gap: 6px; flex-wrap: wrap; }
    .filter-btn {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      padding: 5px 12px;
      color: var(--muted);
      transition: all .15s;
      white-space: nowrap;
    }
    .filter-btn:hover { border-color: var(--accent); color: var(--text); }
    .filter-btn.active { color: #fff; border-color: transparent; }
    .filter-btn.sev-critical.active { background: var(--badge-critical); }
    .filter-btn.sev-high.active     { background: var(--badge-high); }
    .filter-btn.sev-moderate.active { background: var(--badge-moderate); }
    .filter-btn.sev-low.active      { background: var(--badge-low); }
    .filter-btn.sev-unknown.active  { background: var(--badge-unknown); }

    .select-input {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-family: inherit;
      font-size: 13px;
      padding: 7px 28px 7px 10px;
      appearance: none;
      outline: none;
      cursor: pointer;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237d8590' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 8px center;
      transition: border-color .15s;
    }
    .select-input:focus { border-color: var(--accent); }

    /* ── Results count ── */
    .results-meta {
      font-size: 12px; color: var(--muted);
      margin-bottom: 12px;
    }
    .results-meta strong { color: var(--text); }

    /* ── Table ── */
    .table-wrap {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; }
    thead { background: rgba(255,255,255,0.03); }
    th {
      padding: 10px 16px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .8px;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      transition: color .15s;
    }
    th:hover { color: var(--text); }
    th .sort-icon { margin-left: 4px; opacity: .4; font-style: normal; }
    th.sort-asc  .sort-icon,
    th.sort-desc .sort-icon { opacity: 1; color: var(--accent); }
    td {
      padding: 12px 16px;
      border-bottom: 1px solid rgba(48,54,61,0.6);
      vertical-align: top;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255,255,255,0.02); }

    .pkg-name { font-weight: 600; color: var(--text); }
    .pkg-version { color: var(--muted); font-family: ui-monospace, monospace; font-size: 12px; margin-left: 4px; }
    .dev-badge {
      display: inline-block;
      font-size: 10px; padding: 1px 6px;
      background: rgba(139,148,158,0.15);
      border: 1px solid var(--dim);
      border-radius: 10px;
      color: var(--muted);
      margin-left: 6px;
      vertical-align: middle;
    }
    .advisory-id {
      font-family: ui-monospace, monospace;
      font-size: 11px;
      color: var(--accent);
      background: var(--glow);
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }
    .summary-text { color: var(--text); font-size: 13px; }
    .projects-list { color: var(--muted); font-size: 12px; }

    /* ── Severity badge ── */
    .sev-badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 600;
      padding: 3px 8px; border-radius: 4px;
      white-space: nowrap;
    }
    .sev-badge.Critical { background: ${C.Critical.bg}; color: var(--c-critical); }
    .sev-badge.High     { background: ${C.High.bg};     color: var(--c-high); }
    .sev-badge.Moderate { background: ${C.Moderate.bg}; color: var(--c-moderate); }
    .sev-badge.Low      { background: ${C.Low.bg};      color: var(--c-low); }
    .sev-badge.Unknown  { background: ${C.Unknown.bg};  color: var(--c-unknown); }

    /* ── Empty state ── */
    .empty-state {
      padding: 64px 24px;
      text-align: center;
      color: var(--muted);
    }
    .empty-state .empty-icon { font-size: 48px; margin-bottom: 16px; }
    .empty-state h3 { color: var(--text); font-size: 18px; margin-bottom: 8px; }

    /* ── Project breakdown ── */
    .project-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 16px;
      transition: border-color .15s;
    }
    .project-card:hover { border-color: var(--accent); }
    .proj-rank {
      font-size: 11px; font-weight: 700;
      color: var(--dim);
      width: 24px; text-align: center; flex-shrink: 0;
    }
    .proj-name { font-weight: 600; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .proj-bar-wrap { flex: 2; min-width: 120px; }
    .proj-bar-bg { background: rgba(255,255,255,0.06); border-radius: 4px; height: 6px; overflow: hidden; }
    .proj-bar { height: 100%; border-radius: 4px; background: var(--accent); transition: width .4s ease; }
    .proj-counts { display: flex; gap: 8px; flex-shrink: 0; }
    .proj-count-chip {
      font-size: 11px; font-weight: 600;
      padding: 2px 8px; border-radius: 4px;
    }
    .proj-count-chip.Critical { background: ${C.Critical.bg}; color: var(--c-critical); }
    .proj-count-chip.High     { background: ${C.High.bg};     color: var(--c-high); }
    .proj-count-chip.Moderate { background: ${C.Moderate.bg}; color: var(--c-moderate); }
    .proj-count-chip.Low      { background: ${C.Low.bg};      color: var(--c-low); }

    /* ── Footer ── */
    .footer {
      border-top: 1px solid var(--border);
      margin-top: 48px;
      padding-top: 24px;
      font-size: 12px;
      color: var(--dim);
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
    }
    .footer a { color: var(--accent); text-decoration: none; }
    .footer a:hover { text-decoration: underline; }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
`;
