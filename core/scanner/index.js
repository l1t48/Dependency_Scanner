import { SCAN_MODE, SEVERITY_ORDER } from "../../config/scanner.config.js";
import { getCacheStats } from "../cache/index.js";
import { detectVulnerabilities } from "./detect.js";
import { enrichBatch } from "./enrich.js"; // enrichAdvisories removed — no longer needed
import { mapAdvisories } from "./mapper.js";

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

  // Pass 1 — detect which packages have advisories
  const { pending, scanErrors } = await detectVulnerabilities(toScan);

  if (scanErrors.length > 0) {
    console.warn(
      `\n[scanner] ⚠️  ${scanErrors.length} package(s) could not be verified — listed as Unknown\n`,
    );
  }

  // Pass 2 — enrich the full pending list (cache hits are O(1) lookups, not API calls)
  const fullAdvisories = await enrichBatch(pending);

  if (!pending.length && !scanErrors.length) {
    console.log("\n[scanner] ✅ Scan complete — 0 vulnerabilities found");
    return [];
  }

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
