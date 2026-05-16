/**
 * @module mailer
 * @desc Standalone Nodemailer transport — no Express dependency.
 *
 * @logic
 *   Reads SMTP credentials from environment variables only.
 *   Called directly from core/index.js after a scan completes.
 *   The transporter is created lazily and reused if sendReport is
 *   called multiple times in one process (unlikely in scheduled use,
 *   but correct regardless).
 *
 *   Environment variables required (set in .env or GitHub Actions secrets):
 *     SMTP_HOST     — e.g. smtp.gmail.com
 *     SMTP_PORT     — e.g. 587 (STARTTLS) or 465 (TLS)
 *     SMTP_SECURE   — "true" for port 465, omit or "false" for 587
 *     SMTP_USER     — sender email address
 *     SMTP_PASS     — sender password or app password
 *     REPORT_TO     — recipient email address(es), comma-separated
 *
 * @note
 *   sendReport() resolves on success and rejects on failure.
 *   core/index.js should catch and log, never let a mailer failure
 *   crash the process or suppress the HTML/CLI output.
 */

import nodemailer from "nodemailer";

// ─── Lazy transporter ─────────────────────────────────────────────────────────
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const {
    SMTP_HOST,
    SMTP_PORT = "587",
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
  } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "[mailer] Missing required env vars: SMTP_HOST, SMTP_USER, SMTP_PASS",
    );
  }

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === "true", // true = TLS (port 465), false = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return _transporter;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * sendReport(html, report)
 *
 * Sends the rendered HTML email to REPORT_TO.
 *
 * @param  {string}     html   — output of renderEmail(report)
 * @param  {ReportData} report — used to build the subject line
 * @returns {Promise<void>}
 */
export async function sendReport(html, report) {
  const to = process.env.REPORT_TO;
  if (!to) throw new Error("[mailer] REPORT_TO env var is not set");

  const { meta, counts } = report;
  const hasVulns = meta.totalVulnerabilities > 0;

  // Subject line mirrors the email header at a glance
  const critHigh = (counts.Critical ?? 0) + (counts.High ?? 0);
  const subject = hasVulns
    ? `⚠️ dep-scanner: ${meta.totalVulnerabilities} vuln${meta.totalVulnerabilities !== 1 ? "s" : ""} found` +
      (critHigh > 0 ? ` (${critHigh} critical/high)` : "")
    : `✅ dep-scanner: all ${meta.totalScanned} dependencies clean`;

  const transport = getTransporter();

  const info = await transport.sendMail({
    from: `"dep-scanner" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    // Plain-text fallback for mail clients that strip HTML
    text: buildPlainText(report),
  });

  console.log(`[mailer] ✓ Report sent → ${to} (messageId: ${info.messageId})`);
}

// ─── Plain-text fallback ──────────────────────────────────────────────────────

function buildPlainText({ meta, counts, groups, scannedAt }) {
  const lines = [
    "dep-scanner — Dependency Vulnerability Report",
    "=".repeat(48),
    `Scanned : ${new Date(scannedAt).toLocaleString()}`,
    `Projects: ${meta.totalProjects}`,
    `Deps    : ${meta.totalScanned}`,
    `Found   : ${meta.totalVulnerabilities} vulnerability(s)`,
    "",
    "Summary",
    "-".repeat(48),
    `  Critical : ${counts.Critical ?? 0}`,
    `  High     : ${counts.High ?? 0}`,
    `  Moderate : ${counts.Moderate ?? 0}`,
    `  Low      : ${counts.Low ?? 0}`,
    "",
  ];

  for (const { severity, count, items } of groups) {
    lines.push(`${severity.toUpperCase()} — ${count} issue(s)`);
    lines.push("-".repeat(48));
    for (const v of items) {
      lines.push(`  ${v.package}@${v.version}${v.dev ? "  [dev]" : ""}`);
      lines.push(`  ${v.summary}`);
      lines.push(`  Advisory : ${v.advisory}`);
      lines.push(`  Projects : ${v.projects.join(", ")}`);
      lines.push("");
    }
  }

  lines.push("Data sourced from https://osv.dev");
  return lines.join("\n");
}
