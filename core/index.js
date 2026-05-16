/**
 * @module core/index
 * @desc Entry point for the dep-scanner pipeline.
 *
 * @logic
 *   Orchestrates four phases:
 *     Phase 1 — Crawler    : finds every package-lock.json under SEARCH_PATH
 *     Phase 2 — Extractor  : parses lockfiles, builds global inventory
 *     Phase 3 — Scanner    : checks uniqueDeps against OSV (cache-aware)
 *     Phase 4 — Reporter   : aggregates data, renders to selected output(s)
 *
 *   Output selection is driven by REPORT_TYPE in scanner.config.js:
 *     "cli"   → terminal only
 *     "email" → SMTP only   (requires SMTP_* env vars)
 *     "html"  → file only   (writes report.html)
 *     "both"  → terminal + SMTP + file
 *
 * @note
 *   Mailer failures are caught and logged — they never crash the process
 *   or suppress other outputs. The HTML file write is similarly guarded.
 *   A failed email does not mean the scan result is lost.
 */
import { scanProjects } from "./crawler/index.js";
import { buildInventory } from "./extractor/index.js";
import { queryOSV } from "./scanner/index.js";
import { aggregate } from "./reporter/aggregate.js";
import { printReport } from "./reporter/print.js";
import { renderEmail } from "./reporter/email.js";
import { renderHTML } from "./reporter/html/html.js";
import { sendReport } from "./reporter/mailer.js";
import { writeFile } from "fs/promises";
import { performance } from "perf_hooks";
import path from "path";
import { fileURLToPath } from "url";
import { REPORT_TYPE, SCAN_MODE } from "../config/scanner.config.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * runScan()
 *
 * Full pipeline. Returns { report, html } where html is null
 * when REPORT_TYPE is "cli".
 */
export async function runScan() {
  console.log("═══════════════════════════════════════");
  console.log("  dep-scanner  —  starting scan");
  console.log(`  Report type : ${REPORT_TYPE}`);
  console.log("═══════════════════════════════════════");

  const startTime = performance.now();

  // ── Phase 1 — Crawler ─────────────────────────────────────────────────────
  const lockfiles = await scanProjects();

  // ── Phase 2 — Extractor ───────────────────────────────────────────────────
  const inventory = buildInventory(lockfiles);

  // ── Phase 3 — Scanner ─────────────────────────────────────────────────────
  const vulns = await queryOSV(inventory);

  // ── Phase 4 — Reporter ────────────────────────────────────────────────────
  const report = aggregate(vulns, {
    totalScanned:
      SCAN_MODE === "prod"
        ? inventory.uniqueDeps.filter((d) => !d.dev).length
        : inventory.uniqueDeps.length,
    projectCount: lockfiles.length,
  });

  const duration = ((performance.now() - startTime) / 1000).toFixed(2);

  // ── Output: terminal ──────────────────────────────────────────────────────
  if (REPORT_TYPE === "cli" || REPORT_TYPE === "both") {
    printReport(report);
  }

  // ── Output: email (SMTP) ──────────────────────────────────────────────────
  let emailHtml = null;

  if (REPORT_TYPE === "email" || REPORT_TYPE === "both") {
    emailHtml = renderEmail(report);

    try {
      await sendReport(emailHtml, report);
    } catch (err) {
      // Never crash the run over a mailer failure — log and continue
      console.error(`[mailer] ✗ Failed to send report: ${err.message}`);
      console.error("         Check SMTP_* env vars and REPORT_TO.");
    }
  }

  // ── Output: static HTML file ──────────────────────────────────────────────
  let html = null;

  if (REPORT_TYPE === "html" || REPORT_TYPE === "both") {
    html = renderHTML(report);

    const reportPath = path.join(__dirname, "..", "report.html");
    try {
      await writeFile(reportPath, html, "utf-8");
      console.log(`\n[reporter] HTML report written → ${reportPath}`);
    } catch (err) {
      console.error(`[reporter] ✗ Failed to write report.html: ${err.message}`);
    }
  }

  console.log(`\n✨ Done in ${duration}s`);

  return { report, html: html ?? emailHtml };
}

// ─── CLI entry ─────────────────────────────────────────────────────────────────
if (process.argv[2] === "scan") {
  runScan()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[core] Fatal error:", err.message);
      process.exit(1);
    });
}
