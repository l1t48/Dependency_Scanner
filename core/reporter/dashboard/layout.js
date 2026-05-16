import { escHtml } from "./escape.js";

/**
 * @module layout
 * @desc HTML report layout template.
 *
 * @note
 *   escHtml is imported directly from ./escape.js rather than received
 *   as a function argument. This keeps the getLayout signature lean —
 *   escape behaviour is an internal implementation detail, not something
 *   the caller should need to supply or swap out.
 */
export const getLayout = ({
  styles,
  date,
  meta,
  hasVulns,
  counts,
  projectRows,
  dataJson,
  clientScript,
}) => /* html */ `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>dep-scanner — Vulnerability Report</title>
  <style>
    ${styles}
  </style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <div class="header-eyebrow">👁 dep-scanner</div>
    <div class="header-title">Dependency Vulnerability Report</div>
    <div class="header-date">${date}</div>
    <div class="header-pills">
      <span class="pill">📁 ${meta.totalProjects} project${meta.totalProjects !== 1 ? "s" : ""}</span>
      <span class="pill">📦 ${meta.totalScanned} dependencies scanned</span>
      ${
        hasVulns
          ? `<span class="pill danger">⚠ ${meta.totalVulnerabilities} vulnerabilit${meta.totalVulnerabilities !== 1 ? "ies" : "y"} found</span>`
          : `<span class="pill safe">✓ All dependencies clean</span>`
      }
    </div>
  </div>
</div>

<div class="shell">

  <div class="summary-grid">
    ${["Critical", "High", "Moderate", "Low"]
      .map(
        (sev) => `
    <div class="summary-card ${sev.toLowerCase()}">
      <div class="card-icon">${{ Critical: "🔴", High: "🟠", Moderate: "🟡", Low: "🟢" }[sev]}</div>
      <div class="card-count">${counts[sev] ?? 0}</div>
      <div class="card-label">${sev}</div>
    </div>`,
      )
      .join("")}
  </div>

  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('vulns', this)">
      Vulnerabilities <span id="tab-vuln-count" style="margin-left:6px;font-size:11px;opacity:.6;">(${meta.totalVulnerabilities})</span>
    </button>
    <button class="tab-btn" onclick="switchTab('projects', this)">
      Projects <span style="margin-left:6px;font-size:11px;opacity:.6;">(${projectRows.length})</span>
    </button>
  </div>

  <div id="tab-vulns" class="tab-panel active">
    <div class="controls">
      <div class="search-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input
          class="search-input"
          id="search"
          type="text"
          placeholder="Search package name or advisory ID…"
          oninput="applyFilters()"
          autocomplete="off"
        >
      </div>

      <div class="filter-group" id="sev-filters">
        ${["Critical", "High", "Moderate", "Low", "Unknown"]
          .map(
            (sev) => `
        <button class="filter-btn sev-${sev.toLowerCase()} active" data-sev="${sev}" onclick="toggleSev(this)">
          ${{ Critical: "🔴", High: "🟠", Moderate: "🟡", Low: "🟢", Unknown: "⚪" }[sev]} ${sev}
        </button>`,
          )
          .join("")}
      </div>

      <select class="select-input" id="proj-filter" onchange="applyFilters()">
        <option value="">All projects</option>
        ${projectRows.map((p) => `<option value="${escHtml(p.name)}">${escHtml(p.name)}</option>`).join("")}
      </select>

      <select class="select-input" id="dev-filter" onchange="applyFilters()">
        <option value="both">Prod + Dev</option>
        <option value="prod">Prod only</option>
        <option value="dev">Dev only</option>
      </select>
    </div>

    <div class="results-meta" id="results-meta"></div>

    <div class="table-wrap">
      <table id="vuln-table">
        <thead>
          <tr>
            <th onclick="sortBy('severity')" data-col="severity">Severity <i class="sort-icon">↕</i></th>
            <th onclick="sortBy('package')"  data-col="package">Package <i class="sort-icon">↕</i></th>
            <th onclick="sortBy('advisory')" data-col="advisory">Advisory <i class="sort-icon">↕</i></th>
            <th>Summary</th>
            <th onclick="sortBy('projects')" data-col="projects">Projects <i class="sort-icon">↕</i></th>
          </tr>
        </thead>
        <tbody id="vuln-tbody"></tbody>
      </table>
      <div id="empty-vulns" class="empty-state" style="display:none;">
        <div class="empty-icon">🔍</div>
        <h3>No matching vulnerabilities</h3>
        <p>Try adjusting the search or filters.</p>
      </div>
    </div>
  </div>

  <div id="tab-projects" class="tab-panel">
    <div id="projects-list"></div>
    <div id="empty-projects" class="empty-state" style="display:none;">
      <div class="empty-icon">✅</div>
      <h3>No vulnerable projects found</h3>
      <p>All ${meta.totalProjects} scanned projects are clean.</p>
    </div>
  </div>

  <div class="footer">
    <span>Generated by <strong>dep-scanner</strong> · Data sourced from <a href="https://osv.dev" target="_blank" rel="noopener">OSV.dev</a></span>
    <span>${new Date().getFullYear()}</span>
  </div>

</div>

<script>
const DATA = ${dataJson};
${clientScript}
</script>
</body>
</html>`;
