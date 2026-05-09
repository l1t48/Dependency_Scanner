import fg from "fast-glob";
import path from "path";
import { SEARCH_PATH, IGNORE_LIST, CRAWLER_OPTIONS } from "../../config/scanner.config.js";

export async function scanProjects() {
  console.log("🚀 Scanning for MERN projects...");

  const pattern = `${SEARCH_PATH}/**/package-lock.json`;

  const entries = await fg(pattern, {
    ignore: IGNORE_LIST,
    ...CRAWLER_OPTIONS,
  });

  console.log(`\n✅ Found ${entries.length} projects:`);
  entries.forEach((file) => {
    console.log(`- ${path.dirname(file)}`);
  });

  return entries;
}
