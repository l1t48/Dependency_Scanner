import { SCAN_MODE, SEVERITY_ORDER } from "../../config/scanner.config.js";
import { getCacheStats } from "../cache/index.js";
import { detectVulnerabilities } from "./detect.js";
import { enrichBatch } from "./enrich.js";
import { mapAdvisories } from "./mapper.js";

/**
 * @module scanner
 * @desc Orchestrates the two-pass vulnerability scan.
 *
 * @logic
 *   Pass 1 — detect:
 *     Resolves cache hits synchronously, then dispatches all OSV batch
 *     requests concurrently. Returns a flat `pending` list of
 *     { dep, advisoryId } pairs and a `scanErrors` list of deps that
 *     could not be verified after all retries.
 *
 *   Pass 2 — enrich:
 *     Fetches full advisory details for every unique advisoryId in
 *     `pending`. Cache hits are O(1) lookups; only genuine misses
 *     produce API calls, throttled by the semaphore in enrich.js.
 *
 *   The two passes are intentionally sequential and explicit. At the
 *   scale this tool targets the separation costs nothing meaningful,
 *   especially on warm-cache runs where Pass 1 produces zero API calls.
 */
export async function queryOSV({ uniqueDeps, invertedIndex }) {
  const toScan =
    SCAN_MODE === "prod" ? uniqueDeps.filter((d) => !d.dev) : uniqueDeps;

  const stats = getCacheStats();
  console.log(`\n[scanner] Mode    : ${SCAN_MODE}`);
  console.log(
    `[scanner] To scan : ${toScan.length} of ${uniqueDeps.length} unique deps`,
  );
  console.log(
    `[scanner] Cache   : ${stats.valid} valid / ${stats.expired} expired / ${stats.total} total\n`,
  );

  // ── Pass 1 — detect which packages have advisories ────────────────────────
  const { pending, scanErrors } = await detectVulnerabilities(toScan);

  if (scanErrors.length > 0) {
    console.warn(
      `\n[scanner] ⚠️  ${scanErrors.length} package(s) could not be verified — listed as Unknown\n`,
    );
  }

  if (!pending.length && !scanErrors.length) {
    console.log("\n[scanner] ✅ Scan complete — 0 vulnerabilities found");
    return [];
  }

  // ── Pass 2 — enrich advisory details ─────────────────────────────────────
  const fullAdvisories = await enrichBatch(pending);

  // ── Map + merge ───────────────────────────────────────────────────────────
  const vulnerabilities = [];

  for (const { dep, advisoryId } of pending) {
    const full = fullAdvisories.get(advisoryId);
    if (!full) continue;
    vulnerabilities.push(...mapAdvisories([full], dep, invertedIndex));
  }

  for (const dep of scanErrors) {
    vulnerabilities.push({
      package: dep.name,
      version: dep.version,
      severity: "Unknown",
      advisory: "SCAN_ERROR",
      summary: "Could not verify — OSV API unreachable after retries",
      projects: invertedIndex[`${dep.name}@${dep.version}`] ?? [],
      dev: dep.dev,
    });
  }

  vulnerabilities.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4),
  );

  console.log(
    `\n[scanner] ✅ Scan complete — ${vulnerabilities.length} vulnerability(s) found`,
  );
  return vulnerabilities;
}
