/**
 * @module themes/dark
 * @desc Design tokens for the dark HTML report.
 *
 * Both theme files (dark.js and light.js) must satisfy this shape:
 * {
 *   bgPage, bgCard, textPrimary,
 *   Critical, High, Moderate, Low, Unknown
 * }
 * where each severity entry is: { bg, border, badge, text }
 *
 * light.js adds email-specific keys (bgHeader, bgFooter, bgCardHover, etc.)
 * on top of this shared base — but the severity entries are the contract
 * both files must honour. If you add or rename a severity, update both.
 */
export const DARK_THEME = {
  bgPage: "#0d1117",
  bgCard: "#161b22",
  bgCardHover: "#1c2128",
  bgBorder: "#30363d",
  bgInput: "#0d1117",
  textPrimary: "#e6edf3",
  textMuted: "#7d8590",
  textDim: "#484f58",
  accent: "#58a6ff",
  accentGlow: "rgba(88,166,255,0.15)",

  Critical: {
    bg: "rgba(248,81,73,0.1)",
    border: "#f85149",
    badge: "#da3633",
    text: "#ff7b72",
  },
  High: {
    bg: "rgba(219,109,40,0.1)",
    border: "#db6d28",
    badge: "#af4b11",
    text: "#ffa657",
  },
  Moderate: {
    bg: "rgba(187,128,9,0.1)",
    border: "#bb8009",
    badge: "#9e6a03",
    text: "#d29922",
  },
  Low: {
    bg: "rgba(63,185,80,0.1)",
    border: "#3fb950",
    badge: "#2ea043",
    text: "#56d364",
  },
  Unknown: {
    bg: "rgba(139,148,158,0.1)",
    border: "#484f58",
    badge: "#484f58",
    text: "#8b949e",
  },
};