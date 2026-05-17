/**
 * @module advisory-mapper
 * @desc Normalizes raw OSV vulnerabilities into a standard internal schema.
 *
 * @logic
 * This utility serves as the translation layer between the API and the reporting engine:
 * 1. **Normalization**: Uniformly structures package names, versions, and summaries.
 * 2. **Severity Translation**: Delegates complex score-to-label mapping to the `mapSeverity` utility.
 * 3. **Project Linking**: Re-attaches project context by looking up the `package@version` 
 * key in the `invertedIndex`.
 * 4. **Metadata Preservation**: Carries over flags like `dev` to allow for downstream 
 * filtering (e.g., ignoring dev-dependency vulnerabilities in production reports).
 *
 * @note
 * The `invertedIndex` lookup is critical here; it transforms a generic vulnerability 
 * into a project-specific actionable item. If a key is missing from the index, it 
 * defaults to an empty array to prevent rendering errors.
 */
import { mapSeverity } from "./severity.js";

/**
 * @function mapAdvisories
 * @desc Maps an array of raw vulnerabilities to a specific dependency's context.
 * @param {Array} advisories - Raw vulnerability objects from OSV.
 * @param {Object} dep - The dependency object (name, version, dev flag).
 * @param {Object} invertedIndex - Map of package@version to array of project names.
 * @returns {Array} List of normalized vulnerability objects.
 */
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
