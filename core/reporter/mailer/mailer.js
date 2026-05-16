/**
 * @module mailer
 * @desc Nodemailer transport. Sends the PDF report as an attachment
 *       with a clean HTML summary as the email body.
 *
 * Required env vars: SMTP_HOST, SMTP_USER, SMTP_PASS, REPORT_TO
 * Optional env vars: SMTP_PORT (default 587), SMTP_SECURE (default false)
 */

import nodemailer from "nodemailer";

const SEV = {
  Critical: { bg: "#fff5f5", border: "#fc8181", text: "#742a2a", icon: "🔴" },
  High: { bg: "#fffaf0", border: "#f6ad55", text: "#7b341e", icon: "🟠" },
  Moderate: { bg: "#fffff0", border: "#f6e05e", text: "#744210", icon: "🟡" },
  Low: { bg: "#f0fff4", border: "#68d391", text: "#1c4532", icon: "🟢" },
};

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
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS)
    throw new Error(
      "[mailer] Missing required env vars: SMTP_HOST, SMTP_USER, SMTP_PASS",
    );

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

// ─── Email body ───────────────────────────────────────────────────────────────

function buildEmailBody({ scannedAt, meta, counts }) {
  const hasVulns = meta.totalVulnerabilities > 0;

  const date = new Date(scannedAt).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const cards = ["Critical", "High", "Moderate", "Low"]
    .map((sev) => {
      const s = SEV[sev];
      return /* html */ `
      <td style="padding:4px;text-align:center;width:25%;">
        <div style="background:${s.bg};border:1px solid ${s.border};border-radius:8px;padding:12px 4px;">
          <div style="font-size:16px;margin-bottom:2px;">${s.icon}</div>
          <div style="font-size:22px;font-weight:700;color:${s.text};font-family:Arial,sans-serif;line-height:1;margin-bottom:2px;">
            ${counts[sev] ?? 0}
          </div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:${s.text};font-family:Arial,sans-serif;">
            ${sev}
          </div>
        </div>
      </td>`;
    })
    .join("");

  const statusPill = hasVulns
    ? `<span style="background:#e53e3e;color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;font-family:Arial,sans-serif;display:inline-block;">
        ⚠️ ${meta.totalVulnerabilities} vulnerabilit${meta.totalVulnerabilities !== 1 ? "ies" : "y"} found
       </span>`
    : `<span style="background:#38a169;color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;font-family:Arial,sans-serif;display:inline-block;">
        ✓ All dependencies clean
       </span>`;

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:20px 12px;">
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">

  <tr><td style="background:#1a2942;border-radius:8px 8px 0 0;padding:24px 24px;">
    <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#58a6ff;font-family:monospace;margin-bottom:6px;">👁 DEP-SCANNER</div>
    <div style="font-size:18px;font-weight:700;color:#e6edf3;font-family:Arial,sans-serif;margin-bottom:4px;">Vulnerability Report</div>
    <div style="font-size:12px;color:#8b949e;font-family:Arial,sans-serif;">${date}</div>
  </td></tr>

  <tr><td style="background:#fff;padding:20px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
    <div style="font-size:13px;color:#6b7a8d;font-family:Arial,sans-serif;margin-bottom:12px;">
      📁 <strong style="color:#1a2942;">${meta.totalProjects}</strong> projects
      &nbsp;·&nbsp;
      📦 <strong style="color:#1a2942;">${meta.totalScanned}</strong> deps scanned
    </div>
    <div>${statusPill}</div>
  </td></tr>

  <tr><td style="background:#fff;padding:0 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
  </td></tr>

  <tr><td style="background:#fff;padding:20px 20px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#6b7a8d;font-family:Arial,sans-serif;margin-bottom:12px;padding-left:4px;">Severity Breakdown</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cards}</tr></table>
  </td></tr>

  <tr><td style="background:#fff;padding:0 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;">
  </td></tr>

  <tr><td style="background:#fff;padding:20px 24px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
    <div style="font-size:13px;color:#1a2942;font-family:Arial,sans-serif;font-weight:600;margin-bottom:4px;">Full report attached</div>
    <div style="font-size:12px;color:#6b7a8d;font-family:Arial,sans-serif;line-height:1.4;">Open the PDF for the complete breakdown including package names, advisory IDs, and remediation paths.</div>
  </td></tr>

  <tr><td style="background:#2c3e50;border-radius:0 0 8px 8px;padding:16px 24px;text-align:center;">
    <div style="font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;">
      Generated by <strong style="color:#cbd5e0;">dep-scanner</strong> &nbsp;·&nbsp;
      <a href="https://osv.dev" style="color:#58a6ff;text-decoration:none;">OSV.dev</a>
      &nbsp;·&nbsp; ${new Date().getFullYear()}
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── Plain-text fallback ──────────────────────────────────────────────────────

function buildPlainText({ meta, counts, scannedAt }) {
  return [
    "dep-scanner — Dependency Vulnerability Report",
    "=".repeat(48),
    `Scanned : ${new Date(scannedAt).toLocaleString()}`,
    `Projects: ${meta.totalProjects}`,
    `Deps    : ${meta.totalScanned}`,
    `Found   : ${meta.totalVulnerabilities} vulnerability(s)`,
    "",
    `  Critical : ${counts.Critical ?? 0}`,
    `  High     : ${counts.High ?? 0}`,
    `  Moderate : ${counts.Moderate ?? 0}`,
    `  Low      : ${counts.Low ?? 0}`,
    "",
    "Full report attached as PDF. Data sourced from https://osv.dev",
  ].join("\n");
}
