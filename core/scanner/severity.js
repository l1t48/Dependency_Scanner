import { SEVERITY_MAP } from "../../config/scanner.config.js";

export function mapSeverity(vuln) {
  // Path 1 — root-level GitHub Advisory label (most common for npm packages)
  const rootLabel = vuln.database_specific?.severity;
  if (rootLabel && SEVERITY_MAP[rootLabel.toUpperCase()]) {
    return SEVERITY_MAP[rootLabel.toUpperCase()];
  }

  // Path 2 — nested inside affected[] (some OSV ecosystem formats)
  if (Array.isArray(vuln.affected)) {
    for (const affected of vuln.affected) {
      const nestedLabel = affected.database_specific?.severity;
      if (nestedLabel && SEVERITY_MAP[nestedLabel.toUpperCase()]) {
        return SEVERITY_MAP[nestedLabel.toUpperCase()];
      }
    }
  }

  // Path 3 — CVSS vector string → numeric score → label
  const cvssEntry = vuln.severity?.find(
    (s) => s.type === "CVSS_V3" || s.type === "CVSS_V4" || s.type === "CVSS_V2",
  );

  if (cvssEntry?.score) {
    const score = parseCVSSVector(cvssEntry.score); // returns a NUMBER
    return scoreToLabel(score); // converts number → label
  }

  return "Unknown";
}

// ─── CVSS 3.x base score calculation ─────────────────────────────────────────
// Formula from the official CVSS 3.1 specification.
// parseCVSSVector returns a number 0.0–10.0, NOT an object.

function parseCVSSVector(vector) {
  const parts = {};
  for (const seg of vector.split("/").slice(1)) {
    const [key, val] = seg.split(":");
    parts[key] = val;
  }

  const W = {
    AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
    AC: { L: 0.77, H: 0.44 },
    UI: { N: 0.85, R: 0.62 },
    IMP: { N: 0.0, L: 0.22, H: 0.56 },
    PR_U: { N: 0.85, L: 0.62, H: 0.27 },
    PR_C: { N: 0.85, L: 0.68, H: 0.5 },
  };

  const scope = parts["S"];
  const PR_W = scope === "C" ? W.PR_C : W.PR_U;

  const AV = W.AV[parts["AV"]] ?? 0;
  const AC = W.AC[parts["AC"]] ?? 0;
  const PR = PR_W[parts["PR"]] ?? 0;
  const UI = W.UI[parts["UI"]] ?? 0;
  const C = W.IMP[parts["C"]] ?? 0;
  const I = W.IMP[parts["I"]] ?? 0;
  const A = W.IMP[parts["A"]] ?? 0;

  const ISCBase = 1 - (1 - C) * (1 - I) * (1 - A);
  const ISC =
    scope === "U"
      ? 6.42 * ISCBase
      : 7.52 * (ISCBase - 0.029) - 3.25 * Math.pow(ISCBase - 0.02, 15);
  const ESC = 8.22 * AV * AC * PR * UI;

  if (ISC <= 0) return 0;

  const raw =
    scope === "U" ? Math.min(ISC + ESC, 10) : Math.min(1.08 * (ISC + ESC), 10);

  return Math.ceil(raw * 10) / 10; // CVSS "Roundup" — ceiling to 1 decimal place
}

function scoreToLabel(score) {
  if (score >= 9.0) return "Critical";
  if (score >= 7.0) return "High";
  if (score >= 4.0) return "Moderate";
  if (score > 0.0) return "Low";
  return "Unknown";
}
