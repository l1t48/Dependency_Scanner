/**
 * @module escape
 * @desc Server-side HTML escaping utility for the HTML reporter.
 *
 * @note
 *   client.js intentionally carries its own copy of this function because
 *   it runs in the browser at report-view time and cannot import Node modules.
 *   That duplication is unavoidable — this file is the single source of truth
 *   for everything that runs server-side (html.js, layout.js).
 */
export function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
