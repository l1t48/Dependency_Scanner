import { scanProjects } from "./crawler/index.js";

export async function runScan() {
  await scanProjects();       // Phase 1
}

// Just to test the engine phases
runScan().catch(err => {
  console.error("Failed to run scan:", err);
  process.exit(1);
});