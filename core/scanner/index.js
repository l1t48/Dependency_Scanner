import { SCAN_MODE, SEVERITY_ORDER } from "../../config/scanner.config.js";
import { getCacheStats } from "../cache/index.js";
import { detectVulnerabilities } from "./detect.js";
import { enrichAdvisories } from "./enrich.js";
import { mapAdvisories } from "./mapper.js";

export async function queryOSV({ uniqueDeps, invertedIndex }) {
  // Filter by SCAN_MODE before touching cache or API
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
  const pending = await detectVulnerabilities(toScan);

  if (!pending.length) {
    console.log("\n[scanner] ✅ Scan complete — 0 vulnerabilities found");
    return [];
  }

  // Pass 2 — fetch full advisory details (severity, summary, CVSS)
  const fullAdvisories = await enrichAdvisories(pending);

  // Map to VulnResult shape using full advisory data
  const vulnerabilities = [];
  for (const { dep, advisoryId } of pending) {
    const full = fullAdvisories.get(advisoryId);
    if (!full) continue; // fetch failed — skip rather than emit "Unknown"
    vulnerabilities.push(...mapAdvisories([full], dep, invertedIndex));
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
