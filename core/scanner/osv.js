import { OSV_BATCH_URL, OSV_VULN_URL} from "../../config/scanner.config.js";

export async function fetchOSVBatch(chunk) {
  const body = {
    queries: chunk.map((dep) => ({
      version: dep.version,
      package: { name: dep.name, ecosystem: "npm" },
    })),
  };

  try {
    const res = await fetch(OSV_BATCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`[api] OSV batch HTTP ${res.status}: ${res.statusText}`);
      return null;
    }

    const data = await res.json();

    if (!Array.isArray(data.results)) {
      console.error("[api] OSV batch — unexpected response shape");
      return null;
    }

    return data.results;
  } catch (err) {
    console.error(`[api] OSV batch network error — ${err.message}`);
    return null;
  }
}

/**
 * fetchFullAdvisory(id)
 *
 * @param  {string} id — e.g. "GHSA-rv95-896h-c2vc"
 * @returns {Promise<object | null>} null on failure
 */
export async function fetchFullAdvisory(id) {
  try {
    const res = await fetch(`${OSV_VULN_URL}/${id}`);
    if (!res.ok) {
      console.warn(`[api] Could not fetch advisory ${id} — HTTP ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn(`[api] Network error fetching ${id} — ${err.message}`);
    return null;
  }
}
