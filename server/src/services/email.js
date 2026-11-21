/**
 * Email service — Nodemailer with SMTP.
 *
 * Required env vars:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS   — your SMTP provider (e.g. Mailgun, Resend, Brevo)
 *   SMTP_FROM   — sender address, e.g. "EdgeVerify <noreply@edgeverify.io>"
 *   APP_URL     — base URL for links in emails, e.g. https://app.edgeverify.io
 *
 * When SMTP_HOST is not set the service logs to console (useful in dev/demo).
 */
import nodemailer from 'nodemailer';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const FROM = process.env.SMTP_FROM || 'EdgeVerify <noreply@edgeverify.io>';

let _transport = null;
let _etherealUser = null;

async function getTransport() {
  if (_transport) return _transport;

  if (process.env.SMTP_HOST) {
    _transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    return _transport;
  }

  // No SMTP configured — spin up a free Ethereal test account.
  // Emails are captured at https://ethereal.email and never actually delivered.
  try {
    const account = await nodemailer.createTestAccount();
    _etherealUser = account.user;
    _transport = nodemailer.createTransport({
      host: 'smtp.ethereal.email', port: 587, secure: false,
      auth: { user: account.user, pass: account.pass },
    });
    console.log(`[email] No SMTP configured — using Ethereal test inbox`);
    console.log(`[email] View sent emails at https://ethereal.email/login`);
    console.log(`[email] Ethereal login: ${account.user} / ${account.pass}`);
    return _transport;
  } catch (e) {
    console.warn('[email] Could not create Ethereal account:', e.message, '— emails will be logged only');
    return null;
  }
}

async function send({ to, subject, html, text }) {
  const transport = await getTransport();
  if (!transport) {
    console.log(`[email] (no transport) To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    const info = await transport.sendMail({ from: FROM, to, subject, html, text });
    // Ethereal gives a preview URL — log it so you can click through and see the email
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log(`[email] Preview: ${previewUrl}`);
  } catch (e) {
    console.error(`[email] failed to send to ${to}:`, e.message);
  }
}

// ── Templates ──────────────────────────────────────────────────────────────

function wrap(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:system-ui,sans-serif;background:#f4f6f8;margin:0;padding:32px 0}
    .card{background:#fff;border-radius:10px;max-width:560px;margin:0 auto;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .logo{font-size:18px;font-weight:700;color:#0d9488;margin-bottom:28px}
    h2{margin:0 0 16px;font-size:20px;color:#111}
    p{margin:0 0 14px;color:#444;line-height:1.6;font-size:15px}
    .btn{display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:12px 24px;border-radius:7px;font-weight:600;font-size:15px;margin:8px 0 20px}
    .footer{text-align:center;font-size:12px;color:#999;margin-top:28px}
    .chip{display:inline-block;background:#f0fdf9;color:#0d9488;border:1px solid #99f6e4;border-radius:5px;padding:3px 10px;font-size:13px;font-weight:600}
  </style></head><body>
  <div class="card">
    <div class="logo">EdgeVerify</div>
    <h2>${title}</h2>
    ${body}
    <div class="footer">EdgeVerify · A product of Secure Edge Technologies Limited<br>This is an automated message — please do not reply.</div>
  </div></body></html>`;
}

export async function sendPasswordReset({ to, name, token }) {
  const link = `${APP_URL}/reset-password?token=${token}`;
  await send({
    to,
    subject: 'Reset your EdgeVerify password',
    html: wrap('Reset your password', `
      <p>Hi ${name || 'there'},</p>
      <p>We received a request to reset the password for your EdgeVerify account. Click the button below to choose a new password.</p>
      <a href="${link}" class="btn">Reset password</a>
      <p>This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email.</p>
    `),
    text: `Reset your EdgeVerify password\n\nOpen this link to reset your password:\n${link}\n\nExpires in 1 hour.`,
  });
}

export async function sendAlertNotification({ to, name, alert }) {
  const link = `${APP_URL}/alerts`;
  const sevColor = { critical: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#16a34a' }[alert.severity] || '#666';
  await send({
    to,
    subject: `[${alert.severity?.toUpperCase()}] New alert: ${alert.alert_type}`,
    html: wrap('New alert raised', `
      <p>Hi ${name || 'there'},</p>
      <p>A new alert has been raised on your EdgeVerify account that requires your attention.</p>
      <p><strong>Type:</strong> ${alert.alert_type}<br>
         <strong>Severity:</strong> <span style="color:${sevColor};font-weight:700">${alert.severity}</span><br>
         ${alert.customer_name ? `<strong>Customer:</strong> ${alert.customer_name}<br>` : ''}
         <strong>Score:</strong> ${alert.score || 'N/A'}</p>
      <a href="${link}" class="btn">Review alert</a>
    `),
    text: `New ${alert.severity} alert: ${alert.alert_type}\n\nReview at: ${link}`,
  });
}

export async function sendCaseAssignment({ to, name, caseRef, caseTitle }) {
  const link = `${APP_URL}/cases`;
  await send({
    to,
    subject: `Case assigned to you: ${caseRef}`,
    html: wrap('Case assigned to you', `
      <p>Hi ${name || 'there'},</p>
      <p>A case has been assigned to you for investigation.</p>
      <p><strong>Reference:</strong> <span class="chip">${caseRef}</span><br>
         <strong>Title:</strong> ${caseTitle}</p>
      <a href="${link}" class="btn">Open case</a>
    `),
    text: `Case ${caseRef} assigned to you: ${caseTitle}\n\nOpen at: ${link}`,
  });
}

export async function sendStrConfirmation({ to, name, ref, filedWith }) {
  await send({
    to,
    subject: `STR submitted: ${ref}`,
    html: wrap('STR report submitted', `
      <p>Hi ${name || 'there'},</p>
      <p>Your Suspicious Transaction Report has been submitted successfully.</p>
      <p><strong>Reference:</strong> <span class="chip">${ref}</span><br>
         <strong>Filed with:</strong> ${filedWith}</p>
      <p>Keep this reference for your records. EdgeVerify has logged a full audit trail of this submission.</p>
    `),
    text: `STR ${ref} submitted to ${filedWith}.`,
  });
}
