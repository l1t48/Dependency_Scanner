/**
 * @module pdf
 * @desc Converts the static PDF report HTML to a PDF buffer via Puppeteer.
 *
 * @note
 *   Uses renderPDFReport() — a dedicated static template — NOT the
 *   interactive dashboard renderHTML(). The dashboard HTML contains
 *   search inputs, filter buttons and JavaScript which are meaningless
 *   in a PDF and cause layout issues.
 *
 *   --no-sandbox and --disable-dev-shm-usage are required for GitHub
 *   Actions (Ubuntu, no root sandbox, limited /dev/shm).
 *   printBackground: true is required — without it Chromium strips all
 *   background colours and the dark theme becomes a blank white page.
 */

import puppeteer from "puppeteer";
import { renderPDFReport } from "./pdf-report.js";

/**
 * renderPDF(report)
 *
 * @param  {ReportData} report — output of aggregate()
 * @returns {Promise<Buffer>} Raw PDF bytes
 */
export async function renderPDF(report) {
  const html = renderPDFReport(report);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" },
    });
  } finally {
    await browser.close();
  }
}
