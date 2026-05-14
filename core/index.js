import { scanProjects } from "./crawler/index.js";
import { buildInventory } from "./extractor/index.js";
import { queryOSV } from "./scanner/index.js";
import { aggregate } from "./reporter/aggregate.js";
import { printReport } from "./reporter/print.js";
import { renderEmail } from "./reporter/email.js";
import { writeFile } from "fs/promises";
import { performance } from "perf_hooks";
import path from "path";
import { fileURLToPath } from "url";
import { REPORT_TYPE, SCAN_MODE } from "../config/scanner.config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * runScan()
 *
 * Full four-phase pipeline. Returns { report, html } where html is null
 * when REPORT_TYPE is "cli".
 *
 * Phase 1 — Crawler    : finds every package-lock.json under SEARCH_PATH
 * Phase 2 — Extractor  : parses lockfiles, builds global inventory
 * Phase 3 — Scanner    : checks uniqueDeps against OSV, uses cache
 * Phase 4 — Reporter   : aggregates data, renders to selected output(s)
 */
export async function runScan() {
  console.log("═══════════════════════════════════════");
  console.log("  dep-scanner  —  starting scan");
  console.log(`  Report type : ${REPORT_TYPE}`);
  console.log("═══════════════════════════════════════");

  const startTime = performance.now();

  // Phase 1 — Crawler
  const lockfiles = await scanProjects();

  // Phase 2 — Extractor
  const inventory = buildInventory(lockfiles);

  // Phase 3 — Scanner
  const vulns = await queryOSV(inventory);

  // Phase 4 — Reporter
  const report = aggregate(vulns, {
    totalScanned:
      SCAN_MODE === "prod"
        ? inventory.uniqueDeps.filter((d) => !d.dev).length
        : inventory.uniqueDeps.length,
    projectCount: lockfiles.length,
  });

  let html = null;

  if (REPORT_TYPE === "cli" || REPORT_TYPE === "both") {
    printReport(report);
  }

  if (REPORT_TYPE === "email" || REPORT_TYPE === "both") {
    html = renderEmail(report);

    // Write preview file so you can open it in a browser during development
    const previewPath = path.join(__dirname, "reporter", "email-preview.html");
    await writeFile(previewPath, html, "utf-8");
    console.log(`\n[reporter] Email HTML written → ${previewPath}`);
  }

  const duration = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`\n✨ Done in ${duration}s`);

  return { report, html };
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
