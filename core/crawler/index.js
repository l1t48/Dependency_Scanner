/**
 * @module crawler
 * @desc Recursive project discovery engine for identifying MERN stacks.
 *
 * @logic
 * Uses `fast-glob` to perform a deep-scan for `package-lock.json` files
 * starting from the defined SEARCH_PATH. It filters out noise using
 * an explicit IGNORE_LIST (e.g., node_modules, .git) to keep scan times
 * fast and prevent infinite loops.
 *
 * @note
 * The project name is derived from the immediate parent directory of
 * the found lockfile. Ensure that project root folders are named
 * descriptively as they appear in the final report.
 */

import fg from "fast-glob";
import path from "path";
import {
  SEARCH_PATH,
  IGNORE_LIST,
  CRAWLER_OPTIONS,
} from "../../config/scanner.config.js";

/**
 * scanProjects()
 * @returns {Promise<Array<{project: string, lockfilePath: string}>>} 
 * List of identified project metadata.
 */
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

  return entries.map((file) => ({
    project: path.basename(path.dirname(file)),
    lockfilePath: file,
  }));
}
