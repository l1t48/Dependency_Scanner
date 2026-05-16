/**
 * @module themes/light
 * @desc Design tokens for the light HTML email report.
 *
 * Both theme files (dark.js and light.js) must satisfy this shape:
 * {
 *   bgPage, bgCard, textPrimary,
 *   Critical, High, Moderate, Low, Unknown
 * }
 * where each severity entry is: { bg, border, badge, text }
 *
 * Email clients do not support dark mode, so this palette is intentionally
 * light. All styles must be inlined — no external sheets, no JS.
 * If you add or rename a severity in dark.js, update this file too.
 */
export const LIGHT_THEME = {
  bgPage: "#f4f6f9",
  bgCard: "#ffffff",
  bgHeader: "#1a2942",
  bgFooter: "#2c3e50",
  textPrimary: "#1a2942",
  textMuted: "#6b7a8d",
  textLight: "#ffffff",
  border: "#e2e8f0",

  Critical: {
    bg: "#fff5f5",
    border: "#fc8181",
    badge: "#e53e3e",
    text: "#742a2a",
  },
  High: {
    bg: "#fffaf0",
    border: "#f6ad55",
    badge: "#dd6b20",
    text: "#7b341e",
  },
  Moderate: {
    bg: "#fffff0",
    border: "#f6e05e",
    badge: "#d69e2e",
    text: "#744210",
  },
  Low: {
    bg: "#f0fff4",
    border: "#68d391",
    badge: "#38a169",
    text: "#1c4532",
  },
  Unknown: {
    bg: "#f7fafc",
    border: "#a0aec0",
    badge: "#718096",
    text: "#2d3748",
  },
};