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
 * @note
 *   Mailer and PDF failures are caught and logged — they never crash the
 *   process or suppress the HTML file output.
 *
 * @exit_codes
 *   0 — scan complete, no Critical or High vulnerabilities found
 *   1 — Critical or High vulnerabilities found (CI workflow turns red)
 *   1 — unrecoverable pipeline error
 *
 *   All outputs (HTML file, email, CLI log) are written BEFORE the process
 *   exits, so a non-zero exit never means a lost report.
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

  // ── Output: HTML file ─────────────────────────────────────────────────────
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

// ─── CLI entry ────────────────────────────────────────────────────────────────
// Exit codes are only meaningful when running as a CLI command (node core/index.js scan).
// When imported as a module (e.g. in tests), runScan() resolves normally.
//
// Threshold: Critical or High vulnerabilities trigger exit 1.
// Rationale: Moderate/Low vulns are informational — they warrant review but
// should not block CI. Critical/High are active risks that need immediate action.
//
// All outputs are written inside runScan() before this block runs,
// so the non-zero exit never causes a lost report or email.

if (process.argv[2] === "scan") {
  runScan()
    .then(({ report }) => {
      const critical = report.counts.Critical ?? 0;
      const high = report.counts.High ?? 0;
      const blocking = critical + high;

      if (blocking > 0) {
        console.log(
          `\n[scanner] ⛔ Exiting with code 1 — ` +
            `${critical} Critical / ${high} High vulnerabilities found.`,
        );
        console.log(
          "          Review the report and update affected dependencies.",
        );
        process.exit(1);
      }

      process.exit(0);
    })
    .catch((err) => {
      console.error("[core] Fatal error:", err.message);
      process.exit(1);
    });
}
