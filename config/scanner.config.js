import "dotenv/config";

// Central configuration for dep-scanner.
// SEARCH_PATH and REPORT_TYPE can be overridden by environment variables
// so GitHub Actions (or any CI) can inject values without touching this file.

// ─── Paths ────────────────────────────────────────────────────────────────────
export const SEARCH_PATH = process.env.SEARCH_PATH;

// ─── Scan behaviour ───────────────────────────────────────────────────────────
export const SCAN_MODE = process.env.SCAN_MODE ?? "prod"; // "prod" | "all"

// ─── Report output ────────────────────────────────────────────────────────────
// "cli"   → terminal only
// "email" → SMTP only  (requires SMTP_* env vars + REPORT_TO)
// "html"  → writes report.html to project root, no email
// "both"  → terminal + SMTP + HTML file
export const REPORT_TYPE = process.env.REPORT_TYPE ?? "html";

// ─── Cache ────────────────────────────────────────────────────────────────────
export const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── OSV API ──────────────────────────────────────────────────────────────────
export const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
export const OSV_VULN_URL = "https://api.osv.dev/v1/vulns";

// ─── Scanner tuning ───────────────────────────────────────────────────────────
export const CHUNK_SIZE = 1000; // max queries per OSV batch request
export const CONCURRENCY_LIMIT = 15; // max simultaneous advisory fetches
export const MAX_RETRIES = 3; // OSV 5xx retry ceiling
export const RETRY_BASE_DELAY_MS = 500; // doubles each attempt: 500→1000→2000ms

// ─── Crawler ──────────────────────────────────────────────────────────────────
export const IGNORE_LIST = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/temp/**",
];

export const CRAWLER_OPTIONS = {
  deep: 5,
  onlyFiles: true,
};

// ─── Severity metadata ────────────────────────────────────────────────────────
export const SEVERITIES = ["Critical", "High", "Moderate", "Low", "Unknown"];

export const SEVERITY_ICONS = {
  Critical: "🔴",
  High: "🟠",
  Moderate: "🟡",
  Low: "🟢",
  Unknown: "⚪",
};

export const SEVERITY_ORDER = {
  Critical: 0,
  High: 1,
  Moderate: 2,
  Low: 3,
  Unknown: 4,
};

export const SEVERITY_MAP = {
  CRITICAL: "Critical",
  HIGH: "High",
  MODERATE: "Moderate",
  MEDIUM: "Moderate",
  LOW: "Low",
};
