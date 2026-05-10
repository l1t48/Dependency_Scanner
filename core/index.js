import { scanProjects } from "./crawler/index.js";
import { buildInventory } from "./extractor/index.js";

export async function runScan() {
  const lockfiles = await scanProjects(); // Phase 1
  const inventory = buildInventory(lockfiles); // Phase 2

  // Pick any package you DIDN'T directly install
  const testPackage = "bytes"; // or "ms", "depd", "safe-buffer"
  const found = inventory.uniqueDeps.find((d) => d.name === testPackage);

  if (found) {
    console.log(
      `✅ DFS working — found transitive dep: ${found.name}@${found.version}`,
    );
    console.log(
      `   Used by: ${inventory.invertedIndex[`${found.name}@${found.version}`]}`,
    );
  } else {
    console.log(
      `❌ DFS not reaching transitive deps — ${testPackage} not found`,
    );
  }

  // Also print total count — should be in the hundreds, not tens
  console.log(`\nTotal unique deps: ${inventory.uniqueDeps.length}`);
  console.log(`Direct installs in package.json are maybe 20–30.`);
  console.log(`With DFS finding transitive deps, expect 200–600+`);
}

runScan().catch((err) => {
  console.error("Failed to run scan:", err);
  process.exit(1);
});
