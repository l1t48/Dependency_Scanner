export const clientScript = `
// ─── Data ─────────────────────────────────────────────────────────────────────
// DATA is injected dynamically before this script runs.

const SEV_ORDER = { Critical:0, High:1, Moderate:2, Low:3, Unknown:4 };
const SEV_ICONS = { Critical:"🔴", High:"🟠", Moderate:"🟡", Low:"🟢", Unknown:"⚪" };

// ─── State ────────────────────────────────────────────────────────────────────
let sortCol = "severity";
let sortDir = 1; // 1 = asc, -1 = desc
let activeSevs = new Set(["Critical","High","Moderate","Low","Unknown"]);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// ─── Sorting ──────────────────────────────────────────────────────────────────
function sortBy(col) {
  if (sortCol === col) { sortDir *= -1; }
  else { sortCol = col; sortDir = 1; }
  document.querySelectorAll("th[data-col]").forEach(th => {
    th.classList.remove("sort-asc","sort-desc");
    th.querySelector(".sort-icon").textContent = "↕";
  });
  const th = document.querySelector("th[data-col='" + col + "']");
  if (th) {
    th.classList.add(sortDir === 1 ? "sort-asc" : "sort-desc");
    th.querySelector(".sort-icon").textContent = sortDir === 1 ? "↑" : "↓";
  }
  applyFilters();
}

function sortValue(v) {
  if (sortCol === "severity") return SEV_ORDER[v.severity] ?? 4;
  if (sortCol === "package")  return v.package.toLowerCase();
  if (sortCol === "advisory") return v.advisory.toLowerCase();
  if (sortCol === "projects") return v.projects.length;
  return 0;
}

// ─── Severity toggles ─────────────────────────────────────────────────────────
function toggleSev(btn) {
  const sev = btn.dataset.sev;
  if (activeSevs.has(sev)) {
    if (activeSevs.size === 1) return; // keep at least one active
    activeSevs.delete(sev);
    btn.classList.remove("active");
  } else {
    activeSevs.add(sev);
    btn.classList.add("active");
  }
  applyFilters();
}

// ─── Main filter + render ─────────────────────────────────────────────────────
function applyFilters() {
  const q      = document.getElementById("search").value.trim().toLowerCase();
  const proj   = document.getElementById("proj-filter").value;
  const devMode= document.getElementById("dev-filter").value;

  let rows = DATA.vulns.filter(v => {
    if (!activeSevs.has(v.severity)) return false;
    if (proj && !v.projects.includes(proj)) return false;
    if (devMode === "prod" && v.dev) return false;
    if (devMode === "dev"  && !v.dev) return false;
    if (q) {
      const hit = v.package.toLowerCase().includes(q) || v.advisory.toLowerCase().includes(q) || v.summary.toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  rows.sort((a, b) => {
    const av = sortValue(a), bv = sortValue(b);
    if (av < bv) return -1 * sortDir;
    if (av > bv) return  1 * sortDir;
    return 0;
  });

  const tbody = document.getElementById("vuln-tbody");
  const empty = document.getElementById("empty-vulns");
  const meta  = document.getElementById("results-meta");

  document.getElementById("tab-vuln-count").textContent = "(" + rows.length + ")";

  if (rows.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    meta.innerHTML = "";
  } else {
    empty.style.display = "none";
    meta.innerHTML = "Showing <strong>" + rows.length + "</strong> of <strong>" + DATA.vulns.length + "</strong> vulnerabilities";
    tbody.innerHTML = rows.map(v => {
      const devBadge = v.dev ? '<span class="dev-badge">dev</span>' : "";
      return \`<tr>
        <td><span class="sev-badge \${esc(v.severity)}">\${SEV_ICONS[v.severity] || ""} \${esc(v.severity)}</span></td>
        <td>
          <span class="pkg-name">\${esc(v.package)}</span><span class="pkg-version">@\${esc(v.version)}</span>\${devBadge}
        </td>
        <td><span class="advisory-id">\${esc(v.advisory)}</span></td>
        <td><span class="summary-text">\${esc(v.summary)}</span></td>
        <td><span class="projects-list">\${esc(v.projects.join(", "))}</span></td>
      </tr>\`;
    }).join("");
  }
}

// ─── Tab switching ────────────────────────────────────────────────────────────
function switchTab(id, btn) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + id).classList.add("active");
  btn.classList.add("active");
}

// ─── Project breakdown ────────────────────────────────────────────────────────
function renderProjects() {
  const list = document.getElementById("projects-list");
  const empty = document.getElementById("empty-projects");

  if (!DATA.projects || DATA.projects.length === 0) {
    list.style.display = "none";
    empty.style.display = "block";
    return;
  }

  const maxTotal = DATA.projects[0]?.total || 1;
  list.innerHTML = DATA.projects.map((p, i) => {
    const chips = ["Critical","High","Moderate","Low"]
      .filter(s => p[s] > 0)
      .map(s => \`<span class="proj-count-chip \${s}">\${SEV_ICONS[s]} \${p[s]}</span>\`)
      .join("");

    const barPct = Math.round((p.total / maxTotal) * 100);
    return \`
      <div class="project-card">
        <span class="proj-rank">\${i + 1}</span>
        <span class="proj-name" title="\${esc(p.name)}">\${esc(p.name)}</span>
        <div class="proj-bar-wrap">
          <div class="proj-bar-bg"><div class="proj-bar" style="width:\${barPct}%"></div></div>
        </div>
        <div class="proj-counts">\${chips}</div>
        <span style="font-size:12px;color:var(--muted);flex-shrink:0;">\${p.total} total</span>
      </div>\`;
  }).join("");
}

// ─── Init ─────────────────────────────────────────────────────────────────────
applyFilters();
renderProjects();

// Set initial sort icon
(function() {
  const th = document.querySelector("th[data-col='severity']");
  if (th) { th.classList.add("sort-asc"); th.querySelector(".sort-icon").textContent = "↑"; }
})();
`;
