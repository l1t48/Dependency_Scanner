import { DARK_THEME as C } from "../themes/dark.js";
import { SEVERITY_ICONS } from "../../../config/scanner.config.js";

/**
 * @module pdf-report
 * @desc Generates a static, print-optimised HTML string for PDF export.
 *
 * @logic
 *   Completely separate from the interactive HTML dashboard (html.js).
 *   No search bars, no filter buttons, no tabs, no JavaScript.
 *   Vulnerabilities are grouped by severity in a fixed-layout table
 *   with word-break on every cell — nothing overflows or gets clipped.
 *   All styles are inlined so Puppeteer renders correctly with
 *   printBackground: true.
 *
 * @note
 *   Column widths are tuned for A4 (210mm) with 16mm side margins.
 *   Severity 10% · Package 18% · Advisory 17% · Summary 33% · Projects 22%
 */
export function renderPDFReport(report) {
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

  // ── Summary cards ──────────────────────────────────────────────────────────
  const summaryCards = ["Critical", "High", "Moderate", "Low"]
    .map((sev) => {
      const s = C[sev];
      return /* html */ `
        <div style="flex:1;background:${s.bg};border:1px solid ${s.border};border-radius:6px;padding:12px 8px;text-align:center;">
          <div style="font-size:18px;margin-bottom:2px;">${SEVERITY_ICONS[sev]}</div>
          <div style="font-size:24px;font-weight:700;color:${s.text};font-family:Arial,sans-serif;line-height:1;margin-bottom:2px;">
            ${counts[sev] ?? 0}
          </div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:${s.text};font-family:Arial,sans-serif;opacity:.85;">
            ${sev}
          </div>
        </div>`;
    })
    .join("");

  // ── Severity sections ──────────────────────────────────────────────────────
  const sections = groups
    .map(({ severity, count, items }) => {
      const s = C[severity] ?? C.Unknown;

      const rows = items
        .map((v, i) => {
          const bg =
            i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.01)";
          const projectList = v.projects.join(", ");

          return /* html */ `
            <tr style="background:${bg};">
              <td style="${TD}width:12%;vertical-align:top;">
                <span style="display:inline-block;background:${s.bg};border:1px solid ${s.border};color:${s.text};border-radius:4px;font-size:9px;font-weight:700;padding:2px 6px;white-space:nowrap;">
                  ${SEVERITY_ICONS[severity]} ${severity}
                </span>
              </td>
              <td style="${TD}width:18%;vertical-align:top;">
                <span style="font-weight:700;color:${C.textPrimary};">${v.package}</span>
                <span style="color:${C.textMuted};font-size:10px;"> @${v.version}</span>
              </td>
              <td style="${TD}width:17%;vertical-align:top;">
                <span style="font-family:monospace;font-size:9px;color:${C.accent};background:${C.accentGlow};padding:2px 4px;border-radius:3px;word-break:break-all;">
                  ${v.advisory}
                </span>
              </td>
              <td style="${TD}width:33%;vertical-align:top;color:${C.textPrimary};">${v.summary ?? "No summary"}</td>
              <td style="${TD}width:20%;vertical-align:top;color:${C.textMuted};font-size:10px;">${projectList}</td>
            </tr>`;
        })
        .join("");

      return /* html */ `
        <div style="margin-bottom:30px;page-break-inside:avoid;">
          <div style="display:flex;align-items:center;background:${s.bg};border-left:3px solid ${s.border};border-radius:0 4px 4px 0;padding:10px 15px;">
            <span style="font-family:Arial,sans-serif;font-weight:700;font-size:12px;color:${s.text};text-transform:uppercase;letter-spacing:.5px;">
              ${severity} Vulnerabilities
            </span>
            <span style="background:${s.badge};color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:2px 10px;margin-left:auto;">
              ${count} issue${count !== 1 ? "s" : ""}
            </span>
          </div>
          <table style="${TABLE}">
            <thead>
              <tr style="background:rgba(255,255,255,0.05);">
                <th style="${TH}width:12%;">Severity</th>
                <th style="${TH}width:18%;">Package</th>
                <th style="${TH}width:17%;">Advisory</th>
                <th style="${TH}width:33%;">Summary</th>
                <th style="${TH}width:20%;">Projects</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    })
    .join("");

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    /* CRITICAL: Defines the professional padding/margins for PDF */
    @page {
      size: A4;
      margin: 20mm 15mm;
      background-color: ${C.bgPage};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: ${C.bgPage};
      color: ${C.textPrimary};
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 11px;
      line-height: 1.5;
    }
  </style>
</head>
<body>

  <div style="border-bottom:1px solid ${C.bgBorder}; padding-bottom:20px; margin-bottom:25px;">
    <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${C.accent};font-family:monospace;margin-bottom:8px;">👁 DEP-SCANNER</div>
    <div style="font-size:26px;font-weight:700;letter-spacing:-.5px;color:#ffffff;margin-bottom:4px;">
      Dependency Vulnerability Report
    </div>
    <div style="font-size:12px;color:${C.textMuted};margin-bottom:15px;">${date}</div>
    <div style="display:flex;gap:10px;">
      <span style="${PILL}">📁 ${meta.totalProjects} projects</span>
      <span style="${PILL}">📦 ${meta.totalScanned} scanned</span>
      ${
        hasVulns
          ? `<span style="${PILL}background:rgba(218,54,51,.2);border-color:#da3633;color:#ff7b72;">⚠️ ${meta.totalVulnerabilities} vulnerabilities</span>`
          : `<span style="${PILL}background:rgba(46,160,67,.2);border-color:#2ea043;color:#56d364;">✓ Clean</span>`
      }
    </div>
  </div>

  <div style="display:flex;gap:12px;margin-bottom:32px;">
    ${summaryCards}
  </div>

  ${hasVulns ? sections : `<div style="text-align:center;padding:60px;color:${C.textMuted};">...No Issues...</div>`}

  <div style="border-top:1px solid ${C.bgBorder}; margin-top:40px; padding-top:15px; font-size:10px; color:${C.textDim}; display:flex; justify-content:space-between;">
    <span>Generated by <strong>dep-scanner</strong> · Data from osv.dev</span>
    <span>${new Date().getFullYear()} Report</span>
  </div>

</body>
</html>`;
}

// Ensure these constants use your updated theme
const TD = `padding:10px; border-bottom:1px solid rgba(48,54,61,.4); word-break:break-word;`;
const TH = `padding:8px 10px; text-align:left; font-size:9px; font-weight:700; text-transform:uppercase; color:${C.textMuted}; border-bottom:1px solid ${C.bgBorder};`;
const PILL = `display:inline-flex; align-items:center; background:rgba(255,255,255,.06); border:1px solid ${C.bgBorder}; border-radius:20px; padding:3px 12px; font-size:10px; color:${C.textMuted};`;
const TABLE = `width:100%; border-collapse:collapse; border:1px solid ${C.bgBorder}; border-top:none; table-layout:fixed;`;
