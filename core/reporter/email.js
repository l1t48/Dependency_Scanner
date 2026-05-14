/**
 * @module email
 * @desc HTML email renderer — consumes ReportData from aggregate.js.
 *
 * @logic
 *   Produces a self-contained HTML string suitable for sending via any
 *   SMTP mailer. All styles are inlined — no external stylesheets,
 *   no JavaScript — for maximum email client compatibility.
 *
 *   Structure:
 *     Header   — scan timestamp + summary counts
 *     Sections — one block per severity group, each containing a
 *                package table with advisory ID, summary, affected projects
 *     Footer   — generated-by notice
 *
 * @note
 *   Returns a string. Sending is the responsibility of server/mailer.js.
 *   This module has no I/O side effects.
 */

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bgPage: "#f4f6f9",
  bgCard: "#ffffff",
  bgHeader: "#1a2942",
  bgFooter: "#2c3e50",
  textPrimary: "#1a2942",
  textMuted: "#6b7a8d",
  textLight: "#ffffff",
  border: "#e2e8f0",
  Critical: {
    bg: "#fff5f5",
    border: "#fc8181",
    badge: "#e53e3e",
    text: "#742a2a",
  },
  High: { bg: "#fffaf0", border: "#f6ad55", badge: "#dd6b20", text: "#7b341e" },
  Moderate: {
    bg: "#fffff0",
    border: "#f6e05e",
    badge: "#d69e2e",
    text: "#744210",
  },
  Low: { bg: "#f0fff4", border: "#68d391", badge: "#38a169", text: "#1c4532" },
  Unknown: {
    bg: "#f7fafc",
    border: "#a0aec0",
    badge: "#718096",
    text: "#2d3748",
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function summaryBadge(severity, icon, count) {
  const { badge, text } = C[severity] ?? C.Unknown;
  return /* html */ `
    <td style="padding:8px;text-align:center;width:100px;">
      <div style="
        background:${badge};color:#fff;
        border-radius:8px;padding:12px 8px;
        font-family:Arial,sans-serif;
      ">
        <div style="font-size:22px;line-height:1;">${icon}</div>
        <div style="font-size:20px;font-weight:700;margin:4px 0;">${count}</div>
        <div style="font-size:11px;opacity:.9;letter-spacing:.5px;text-transform:uppercase;">${severity}</div>
      </div>
    </td>`;
}

function packageRow(item, rowIndex) {
  const bg = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
  const projectList = item.projects.join(", ");
  const devBadge = item.dev
    ? `<span style="background:#e2e8f0;color:#4a5568;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:6px;">dev</span>`
    : "";

  return /* html */ `
    <tr>
      <td style="padding:12px 16px;background:${bg};border-bottom:1px solid ${C.border};vertical-align:top;font-family:Arial,sans-serif;">
        <span style="font-weight:700;color:${C.textPrimary};font-size:13px;">${item.package}</span>
        <span style="color:${C.textMuted};font-size:12px;">@${item.version}</span>
        ${devBadge}
      </td>
      <td style="padding:12px 16px;background:${bg};border-bottom:1px solid ${C.border};vertical-align:top;font-family:Arial,sans-serif;">
        <div style="color:${C.textPrimary};font-size:13px;margin-bottom:4px;">${item.summary}</div>
        <code style="font-size:11px;color:${C.textMuted};background:#f1f5f9;padding:2px 6px;border-radius:4px;">${item.advisory}</code>
      </td>
      <td style="padding:12px 16px;background:${bg};border-bottom:1px solid ${C.border};vertical-align:top;font-family:Arial,sans-serif;">
        <span style="color:${C.textMuted};font-size:12px;">${projectList}</span>
      </td>
    </tr>`;
}

function severitySection({ severity, icon, count, items }) {
  const pal = C[severity] ?? C.Unknown;
  const rows = items.map((item, i) => packageRow(item, i)).join("");

  return /* html */ `
    <div style="margin-bottom:32px;">

      <!-- Section header -->
      <div style="
        display:flex;align-items:center;gap:10px;
        background:${pal.bg};
        border-left:4px solid ${pal.border};
        border-radius:0 6px 6px 0;
        padding:12px 16px;margin-bottom:0;
      ">
        <span style="font-size:20px;">${icon}</span>
        <span style="
          font-family:Arial,sans-serif;font-weight:700;
          font-size:15px;color:${pal.text};text-transform:uppercase;
          letter-spacing:.5px;
        ">${severity}</span>
        <span style="
          background:${pal.badge};color:#fff;
          font-family:Arial,sans-serif;font-size:12px;font-weight:700;
          padding:2px 10px;border-radius:12px;margin-left:auto;
        ">${count} issue${count !== 1 ? "s" : ""}</span>
      </div>

      <!-- Package table -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="
        border-collapse:collapse;
        border:1px solid ${C.border};
        border-top:none;
        border-radius:0 0 6px 6px;
        overflow:hidden;
      ">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:10px 16px;text-align:left;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${C.textMuted};text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid ${C.border};width:25%;">Package</th>
            <th style="padding:10px 16px;text-align:left;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${C.textMuted};text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid ${C.border};width:50%;">Advisory</th>
            <th style="padding:10px 16px;text-align:left;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:${C.textMuted};text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid ${C.border};width:25%;">Affected Projects</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * renderEmail(report)
 *
 * @param  {ReportData} report — output of aggregate()
 * @returns {string} Self-contained HTML string
 */
export function renderEmail(report) {
  const { scannedAt, meta, counts, groups } = report;
  const date = new Date(scannedAt).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const hasVulns = meta.totalVulnerabilities > 0;

  const summaryBadges = ["Critical", "High", "Moderate", "Low"]
    .map((s) =>
      summaryBadge(
        s,
        report.groups.find((g) => g.severity === s)?.icon ?? "",
        counts[s] ?? 0,
      ),
    )
    .join("");

  const sections = groups.map(severitySection).join("");

  const emptyState = /* html */ `
    <div style="text-align:center;padding:48px 24px;color:${C.textMuted};font-family:Arial,sans-serif;">
      <div style="font-size:48px;margin-bottom:16px;">✅</div>
      <div style="font-size:18px;font-weight:700;color:${C.textPrimary};margin-bottom:8px;">No vulnerabilities found</div>
      <div style="font-size:14px;">All ${meta.totalScanned} scanned dependencies are clean.</div>
    </div>`;

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Dependency Vulnerability Report</title>
</head>
<body style="margin:0;padding:0;background:${C.bgPage};font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bgPage};padding:32px 16px;">
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:720px;margin:0 auto;">

  <!-- Header -->
  <tr><td style="background:${C.bgHeader};border-radius:8px 8px 0 0;padding:32px;">
    <div style="color:${C.textLight};font-size:22px;font-weight:700;margin-bottom:4px;">
      👁️ Dependency Vulnerability Report
    </div>
    <div style="color:#94a3b8;font-size:13px;">${date}</div>
    <div style="margin-top:20px;display:flex;gap:12px;">
      <span style="background:rgba(255,255,255,.1);color:#fff;font-size:12px;padding:4px 12px;border-radius:20px;">
        📁 ${meta.totalProjects} project${meta.totalProjects !== 1 ? "s" : ""}
      </span>
      <span style="background:rgba(255,255,255,.1);color:#fff;font-size:12px;padding:4px 12px;border-radius:20px;">
        📦 ${meta.totalScanned} dependencies scanned
      </span>
      <span style="background:${hasVulns ? "#e53e3e" : "#38a169"};color:#fff;font-size:12px;padding:4px 12px;border-radius:20px;">
        ${hasVulns ? `⚠ ${meta.totalVulnerabilities} vulnerabilities found` : "✓ All clean"}
      </span>
    </div>
  </td></tr>

  <!-- Summary badges -->
  <tr><td style="background:${C.bgCard};padding:24px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${summaryBadges}</tr>
    </table>
  </td></tr>

  <!-- Divider -->
  <tr><td style="background:${C.bgCard};padding:0 24px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};">
    <hr style="border:none;border-top:1px solid ${C.border};margin:0;">
  </td></tr>

  <!-- Body -->
  <tr><td style="background:${C.bgCard};padding:24px;border-left:1px solid ${C.border};border-right:1px solid ${C.border};">
    ${hasVulns ? sections : emptyState}
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:${C.bgFooter};border-radius:0 0 8px 8px;padding:20px 24px;">
    <div style="color:#94a3b8;font-size:12px;text-align:center;">
      Generated by <strong style="color:#cbd5e0;">dep-scanner</strong>
      &nbsp;·&nbsp; Data sourced from
      <a href="https://osv.dev" style="color:#63b3ed;text-decoration:none;">OSV.dev</a>
      &nbsp;·&nbsp; ${new Date(scannedAt).getFullYear()}
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
