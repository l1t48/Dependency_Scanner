/**
 * @module mailer
 * @desc Nodemailer transport. Sends the PDF report as an attachment
 * with a clean HTML summary as the email body.
 *
 * Required env vars: SMTP_HOST, SMTP_USER, SMTP_PASS, REPORT_TO
 * Optional env vars: SMTP_PORT (default 587), SMTP_SECURE (default false)
 */

import nodemailer from "nodemailer";
import { buildEmailBody, buildPlainText } from "./email-body.js";

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
    secure: SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return _transporter;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function sendReport(pdfBuffer, report) {
  const to = process.env.REPORT_TO;
  if (!to) throw new Error("[mailer] REPORT_TO env var is not set");

  const { meta, counts } = report;
  const hasVulns = meta.totalVulnerabilities > 0;
  const critHigh = (counts.Critical ?? 0) + (counts.High ?? 0);

  const subject = hasVulns
    ? `⚠️ dep-scanner: ${meta.totalVulnerabilities} vuln${meta.totalVulnerabilities !== 1 ? "s" : ""} found` +
      (critHigh > 0 ? ` (${critHigh} critical/high)` : "")
    : `✅ dep-scanner: all ${meta.totalScanned} dependencies clean`;

  const filename = `dep-scanner-${new Date().toISOString().slice(0, 10)}.pdf`;

  const info = await getTransporter().sendMail({
    from: `"dep-scanner" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html: buildEmailBody(report),
    text: buildPlainText(report),
    attachments: [
      { filename, content: pdfBuffer, contentType: "application/pdf" },
    ],
  });

  console.log(
    `[mailer] ✓ Report sent → ${to} (${filename}, messageId: ${info.messageId})`,
  );
}
