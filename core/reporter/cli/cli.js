/**
 * @module print
 * @desc CLI renderer — consumes ReportData from aggregate.js.
 *
 * @logic
 *   Renders the vulnerability report to stdout in a structured,
 *   human-readable format. All data transformation is handled upstream
 *   by aggregate.js; this module is purely presentational.
 */

import { SEVERITIES, SEVERITY_ICONS } from "../../../config/scanner.config.js";

/**
 * printReport(report)
 * @param {ReportData} report — output of aggregate()
 */
export function printReport(report) {
  const { meta, counts, groups } = report;

  // ── Header ────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════");
  console.log("  Vulnerability Report");
  console.log("═══════════════════════════════════════");
  console.log(`  Projects : ${meta.totalProjects}`);
  console.log(`  Scanned  : ${meta.totalScanned} unique dependencies`);
  console.log(`  Found    : ${meta.totalVulnerabilities} vulnerability(s)`);
  console.log(`  At       : ${new Date(report.scannedAt).toLocaleString()}`);
  console.log("═══════════════════════════════════════");

  // ── Summary counts ────────────────────────────────────────────────────────
  console.log("\n  Summary");
  console.log("  ───────────────────────────────────");
  for (const sev of SEVERITIES) {
    if (sev === "Unknown" && counts.Unknown === 0) continue;
    console.log(`  ${SEVERITY_ICONS[sev]}  ${sev.padEnd(10)}: ${counts[sev]}`);
  }
  console.log("═══════════════════════════════════════\n");

  // ── Grouped breakdown ─────────────────────────────────────────────────────
  for (const { severity, icon, count, items } of groups) {
    console.log(`${icon}  ${severity.toUpperCase()} — ${count} issue(s)`);
    console.log("─".repeat(60));

    for (const v of items) {
      console.log(`  📦 ${v.package}@${v.version}${v.dev ? "  [dev]" : ""}`);
      console.log(`     ${v.summary}`);
      console.log(`     Advisory : ${v.advisory}`);
      console.log(`     Projects : ${v.projects.join(", ")}`);
      console.log("");
    }
  }
}
