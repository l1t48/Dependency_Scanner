/**
 * @module pdf-styles
 * @desc Shared CSS-in-JS constants for PDF report generation.
 * @logic
 * Standard web CSS often fails or renders inconsistently in PDF engines.
 * We solve this by:
 * 1. Defining a global `@page` context for physical A4 dimensions.
 * 2. Exporting pre-baked style strings (inline CSS) for table elements.
 * 3. Using `table-layout: fixed` to ensure columns don't collapse or overflow.
 * @note
 * All colors are dynamically sourced from the `DARK_THEME` configuration to
 * maintain brand alignment between the HTML dashboard and PDF exports.
 */
import { DARK_THEME as C } from "../themes/dark.js";

/**
 * @const STYLESHEET
 * @desc Global CSS reset and page-level definitions.
 */
export const STYLESHEET = `
  /* CRITICAL: Defines the professional padding/margins for PDF */
  @page {
    size: A4;
    margin: 20mm 15mm;
    background-color: ${C.bgPage};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: ${C.bgPage};
    color: ${C.textPrimary};
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 11px;
    line-height: 1.5;
  }
`;

export const TD = `padding:10px; border-bottom:1px solid rgba(48,54,61,.4); word-break:break-word;`;
export const TH = `padding:8px 10px; text-align:left; font-size:9px; font-weight:700; text-transform:uppercase; color:${C.textMuted}; border-bottom:1px solid ${C.bgBorder};`;
export const PILL = `display:inline-flex; align-items:center; background:rgba(255,255,255,.06); border:1px solid ${C.bgBorder}; border-radius:20px; padding:3px 12px; font-size:10px; color:${C.textMuted};`;
export const TABLE = `width:100%; border-collapse:collapse; border:1px solid ${C.bgBorder}; border-top:none; table-layout:fixed;`;
