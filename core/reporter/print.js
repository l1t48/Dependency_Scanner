import { SEVERITIES, SEVERITY_ICONS } from "../../config/scanner.config.js";

/**
 * CLI display for the vulnerability report.
 * Separated from core/index.js so the orchestrator stays clean,
 * and so Phase 4 (email reporter) can sit alongside this as print.js's sibling.
 *
 * Future structure:
 *   core/reporter/
 *     print.js      ← this file  (CLI output — done)
 *     email.js      ← Phase 4    (HTML email — coming next)
 *     templates/
 *       email.html
 */

export function printReport(report) {
  // ── Summary block ─────────────────────────────────────────────────────────────
  const counts = { Critical: 0, High: 0, Moderate: 0, Low: 0, Unknown: 0 };
  for (const v of report) counts[v.severity] = (counts[v.severity] ?? 0) + 1;

  console.log("\n═══════════════════════════════════════");
  console.log("  Vulnerability Summary");
  console.log("═══════════════════════════════════════");
  for (const sev of SEVERITIES) {
    if (sev === "Unknown" && counts.Unknown === 0) continue;
    console.log(`  ${SEVERITY_ICONS[sev]}  ${sev.padEnd(10)}: ${counts[sev]}`);
  }
  console.log("═══════════════════════════════════════\n");

  // ── Grouped breakdown ─────────────────────────────────────────────────────────
  for (const sev of SEVERITIES) {
    const group = report.filter((v) => v.severity === sev);
    if (!group.length) continue;

    console.log(
      `${SEVERITY_ICONS[sev]}  ${sev.toUpperCase()} — ${group.length} issue(s)`,
    );
    console.log("─".repeat(60));

    for (const v of group) {
      console.log(`  📦 ${v.package}@${v.version}${v.dev ? "  [dev]" : ""}`);
      console.log(`     ${v.summary}`);
      console.log(`     Advisory : ${v.advisory}`);
      console.log(`     Projects : ${v.projects.join(", ")}`);
      console.log("");
    }
  }
}
