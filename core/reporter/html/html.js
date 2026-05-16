import { clientScript } from "./client.js";
import { getStyles } from "./styles.js";
import { getLayout } from "./layout.js";
import { DARK_THEME } from "../themes/dark.js"; // one level up to reporter/, then themes/

/**
 * @module html
 * @desc HTML report renderer — consumes ReportData from aggregate.js.
 *
 * @note
 *   escHtml is defined once in ./escape.js and imported by both this
 *   module and layout.js directly — it is no longer threaded through
 *   getLayout as a function argument.
 */
export function renderHTML(report) {
  const { scannedAt, meta, counts, groups } = report;

  const allVulns = groups.flatMap((g) =>
    g.items.map((item) => ({ ...item, severity: g.severity })),
  );

  const projectMap = {};
  for (const v of allVulns) {
    for (const proj of v.projects) {
      if (!projectMap[proj]) {
        projectMap[proj] = {
          Critical: 0,
          High: 0,
          Moderate: 0,
          Low: 0,
          Unknown: 0,
          total: 0,
        };
      }
      projectMap[proj][v.severity]++;
      projectMap[proj].total++;
    }
  }

  const projectRows = Object.entries(projectMap)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, s]) => ({ name, ...s }));

  const date = new Date(scannedAt).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const dataJson = JSON.stringify({
    vulns: allVulns,
    projects: projectRows,
    meta,
    counts,
    scannedAt,
  });

  return getLayout({
    styles: getStyles(DARK_THEME),
    date,
    meta,
    hasVulns: meta.totalVulnerabilities > 0,
    counts,
    projectRows,
    dataJson,
    clientScript,
  });
}
