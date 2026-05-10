import { mapSeverity } from "./severity.js";

export function mapAdvisories(advisories, dep, invertedIndex) {
  return advisories.map((vuln) => ({
    package: dep.name,
    version: dep.version,
    severity: mapSeverity(vuln),
    advisory: vuln.id,
    summary: vuln.summary ?? "No summary available",
    projects: invertedIndex[`${dep.name}@${dep.version}`] ?? [],
    dev: dep.dev,
  }));
}
