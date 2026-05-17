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
 *     "email" → PDF attachment via SMTP (requires SMTP_* env vars)
 *     "html"  → writes report.html to project root
 *     "both"  → terminal + HTML file + PDF email
 *
 *   Email output always sends a PDF generated from the same dark HTML
 *   report. In "both" mode the HTML is rendered once and reused for
 *   PDF generation — no redundant work.
 *
 * @note
 *   Mailer and PDF failures are caught and logged — they never crash the
 *   process or suppress the HTML file output. A failed email does not
 *   mean the scan result is lost; report.html is always the source of
 *   truth on disk.
 */

import { scanProjects } from "./crawler/index.js";
import { buildInventory } from "./extractor/index.js";
import { queryOSV } from "./scanner/index.js";
import { aggregate } from "./reporter/aggregate.js";
import { printReport } from "./reporter/cli/cli.js";
import { renderHTML } from "./reporter/dashboard/dashboard.js";
import { renderPDF } from "./reporter/mailer/pdf.js";
import { sendReport } from "./reporter/mailer/mailer.js";
import { writeFile } from "fs/promises";
import { performance } from "perf_hooks";
import path from "path";
import { fileURLToPath } from "url";
import { REPORT_TYPE, SCAN_MODE } from "../config/scanner.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @function runScan
 * @desc Executes the full multi-phase scanning pipeline.
 * @logic
 * 1. Tracks performance via `perf_hooks`.
 * 2. Chains the Crawler -> Extractor -> Scanner modules.
 * 3. Aggregates results: filters dev-dependencies if SCAN_MODE is 'prod'.
 * 4. Dispatches results to selected output drivers (CLI, HTML, and/or Mailer).
 * @returns {Promise<Object>} Object containing the raw report data and rendered HTML string.
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

  // ── Output: HTML file ─────────────────────────────────────────────────────
  // Rendered first so "both" mode can reuse it for PDF without a second render.
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

  // ── Output: PDF email attachment ──────────────────────────────────────────
  // Reuses the HTML rendered above in "both" mode (zero redundant work).
  // Generates fresh HTML in "email" mode without writing it to disk.
  if (REPORT_TYPE === "email" || REPORT_TYPE === "both") {
    try {
      console.log("\n[reporter] Generating PDF...");
      const pdfBuffer = await renderPDF(report);
      await sendReport(pdfBuffer, report);
    } catch (err) {
      console.error(`[mailer] ✗ Failed to send report: ${err.message}`);
      console.error("         Check SMTP_* env vars and REPORT_TO.");
    }
  }

  console.log(`\n✨ Done in ${duration}s`);

  return { report, html };
}

/**
 * @logic
 * Checks process arguments for the 'scan' command.
 * Provides a clean exit code (0 for success, 1 for fatal errors).
 */
if (process.argv[2] === "scan") {
  runScan()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[core] Fatal error:", err.message);
      process.exit(1);
    });
}
