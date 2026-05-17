/**
 * @module pdf-reporter
 * @desc Generates structured HTML fragments for PDF report generation.
 * @logic
 * 1. **Fixed Layouts**: Uses explicit percentage widths for table columns to prevent 
 * layout shifting during the PDF print-stream conversion.
 * 2. **Visual Hierarchy**: Groups vulnerabilities by severity, providing a clean 
 * color-coded header for each section to help users prioritize remediation.
 * 3. **Print Optimization**: Implements `page-break-inside: avoid` on section 
 * wrappers to ensure a severity header isn't orphaned at the bottom of a page.
 *
 * @note
 * This module uses shared styles (`TD`, `TH`, `TABLE`) from `pdf-styles.js` to 
 * maintain a consistent design language across the multi-page document.
 */

import { DARK_THEME as C } from "../themes/dark.js";
import { SEVERITY_ICONS } from "../../../config/scanner.config.js";
import { TD, TH, TABLE } from "./pdf-styles.js";

/**
 * @function renderSummaryCards
 * @desc Renders the top-level metric cards for the PDF front page.
 * @param {Object} counts - Object containing counts for each severity level.
 * @returns {string} HTML string containing flex-based summary boxes.
 */
export function renderSummaryCards(counts) {
  return ["Critical", "High", "Moderate", "Low"]
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
}

/**
 * @function renderSeveritySections
 * @desc Iterates through vulnerability groups to create categorized tables.
 * @logic 
 * Maps over the `groups` array, creating a new table for each severity level.
 * Includes zebra-striping for rows to improve readability in dense data sets.
 * @param {Array<Object>} groups - Array of objects containing severity, count, and items.
 * @returns {string} HTML string containing the full list of vulnerability tables.
 */
export function renderSeveritySections(groups) {
  return groups
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
}
