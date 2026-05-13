export const SEARCH_PATH = "E:/Projects";
export const SCAN_MODE = "prod";
export const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — cache pruning
export const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
export const OSV_VULN_URL = "https://api.osv.dev/v1/vulns";
export const SEVERITIES = ["Critical", "High", "Moderate", "Low", "Unknown"];
export const CHUNK_SIZE = 1000;
export const CONCURRENCY_LIMIT = 15; // max simultaneous advisory fetches
export const MAX_RETRIES = 3; // OSV 5xx retry ceiling
export const RETRY_BASE_DELAY_MS = 500; // doubles each attempt: 500→1000→2000ms

export const IGNORE_LIST = [
  "**/node_modules/**",
  "**/React-Learning-Simple-Projects/**",
  "**/dist/**",
  "**/build/**",
  "**/temp/**",
];

export const CRAWLER_OPTIONS = {
  deep: 5,
  onlyFiles: true,
};

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
