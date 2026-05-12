import { scanProjects } from "./crawler/index.js";
import { buildInventory } from "./extractor/index.js";
import { queryOSV } from "./scanner/index.js";
import { printReport } from "./reporter/print.js";
import { performance } from "perf_hooks";

/**
 * runScan()
 *
 * Runs the full three-phase pipeline and returns the vulnerability report.
 *
 * Phase 1 — Crawler
 *   Finds every package-lock.json under SEARCH_PATH.
 *   Returns: [{ project, lockfilePath }]
 *
 * Phase 2 — Extractor
 *   Parses each lockfile via DFS, builds the global inventory.
 *   Returns: { uniqueDeps, invertedIndex }
 *
 * Phase 3 — Scanner
 *   Checks uniqueDeps against OSV, uses cache to skip known results.
 *   Returns: VulnResult[] sorted by severity
 *
 * Phase 4 — Reporter (not yet implemented)
 *   Will receive the VulnResult[] and produce the HTML email.
 *
 */

export async function runScan() {
  console.log("═══════════════════════════════════════");
  console.log("  dep-scanner  —  starting scan");
  console.log("═══════════════════════════════════════");
  const startTime = performance.now();

  const lockfiles = await scanProjects(); // Phase 1 — crawler
  const inventory = buildInventory(lockfiles); // Phase 2 — extractor
  const report = await queryOSV(inventory); // Phase 3 — scanner
  // await sendReport(report);                  // Phase 4 — coming next

  printReport(report);
  const endTime = performance.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2); // Convert ms to seconds
  
  console.log(`\n✨ Done in ${duration}s`); // Final success message
  return report;
}

// ─── CLI entry ────────────────────────────────────────────────────────────────
// The "scan" argument guard prevents runScan() firing on import by the server.

if (process.argv[2] === "scan") {
  runScan()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[core] Fatal error:", err.message);
      process.exit(1);
    });
}
