/**
 * @module aggregate
 * @desc Pure data transformation layer for the vulnerability report.
 *
 * @logic
 *   Takes the raw VulnResult[] from the scanner and produces a single
 *   ReportData object consumed by every renderer (CLI, email, future).
 *   No I/O, no side effects — deterministic given the same input.
 *
 *   Shape:
 *   {
 *     scannedAt  : ISO 8601 string
 *     meta       : { totalProjects, totalScanned, totalVulnerabilities }
 *     counts     : { Critical, High, Moderate, Low, Unknown }
 *     groups     : [{ severity, icon, count, items: [VulnRow] }]
 *   }
 *
 *   VulnRow:
 *   {
 *     package  : string
 *     version  : string
 *     advisory : string
 *     summary  : string
 *     projects : string[]
 *     dev      : boolean
 *   }
 *
 * @note
 *   totalProjects is derived from the union of all project names across
 *   all vulnerabilities — it reflects projects with at least one vuln,
 *   not the total number of projects scanned. Pass projectCount explicitly
 *   from the crawler if you need the full count.
 */

import { SEVERITIES, SEVERITY_ICONS } from "../../config/scanner.config.js";

/**
 * aggregate(vulns, meta?)
 *
 * @param  {VulnResult[]} vulns
 * @param  {{ totalScanned?: number, projectCount?: number }} meta
 * @returns {ReportData}
 */
export function aggregate(
  vulns,
  { totalScanned = 0, projectCount = null } = {},
) {
  // ── Counts ─────────────────────────────────────────────────────────────────
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  for (const v of vulns) {
    counts[v.severity] = (counts[v.severity] ?? 0) + 1;
  }

  // ── Project union (from vuln data) ─────────────────────────────────────────
  const projectUnion = new Set(vulns.flatMap((v) => v.projects));
  const totalProjects = projectCount ?? projectUnion.size;

  // ── Groups — severity order is preserved from SEVERITIES array ────────────
  const groups = SEVERITIES.map((severity) => {
    const items = vulns
      .filter((v) => v.severity === severity)
      .map(({ package: pkg, version, advisory, summary, projects, dev }) => ({
        package: pkg,
        version,
        advisory,
        summary,
        projects,
        dev,
      }));

    return {
      severity,
      icon: SEVERITY_ICONS[severity],
      count: items.length,
      items,
    };
  }).filter((g) => g.count > 0); // omit severities with zero issues

  return {
    scannedAt: new Date().toISOString(),
    meta: {
      totalProjects,
      totalScanned,
      totalVulnerabilities: vulns.length,
    },
    counts,
    groups,
  };
}
