import { logError } from './safe-log';

interface FlagResolvedPayload {
  flagId: number;
  severity: string;
  description: string;
  routeName: string;
  resolvedByEmail: string;
  resolutionNotes: string | null;
  resolvedAt: string;
  latitude: number;
  longitude: number;
}

interface FlagEmailPayload {
  flagId: number;
  patrollerName: string;
  patrollerEmail: string;
  routeName: string;
  severity: string;
  description: string;
  latitude: number;
  longitude: number;
  flagPhotoUrl?: string | null;
  createdAt: string;
}

export async function sendFlagResolvedEmail(payload: FlagResolvedPayload, patrollerEmail: string): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpHost || !smtpUser || !smtpPass) return;

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass },
    });
    const appUrl = process.env.NEXTAUTH_URL ?? 'https://dfphotos.cloudextel.com';
    const mapsUrl = `https://maps.google.com/?q=${payload.latitude},${payload.longitude}`;
    const severityColor = payload.severity === 'high' ? '#dc2626' : payload.severity === 'medium' ? '#ea580c' : '#ca8a04';

    const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px;">
  <h2 style="color:#16a34a;margin-bottom:4px;">✅ Your Flag Has Been Resolved</h2>
  <p style="color:#6b7280;margin-top:0;">Flag #${payload.flagId} — Resolved ${new Date(payload.resolvedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr><td style="padding:8px 0;color:#374151;font-weight:600;width:140px;">Route</td><td style="padding:8px 0;">${payload.routeName}</td></tr>
    <tr><td style="padding:8px 0;color:#374151;font-weight:600;">Severity</td><td style="padding:8px 0;"><span style="background:${severityColor};color:#fff;padding:2px 10px;border-radius:9999px;font-size:13px;text-transform:capitalize;">${payload.severity}</span></td></tr>
    <tr><td style="padding:8px 0;color:#374151;font-weight:600;">Issue</td><td style="padding:8px 0;">${payload.description}</td></tr>
    <tr><td style="padding:8px 0;color:#374151;font-weight:600;">Resolved by</td><td style="padding:8px 0;">${payload.resolvedByEmail}</td></tr>
    <tr><td style="padding:8px 0;color:#374151;font-weight:600;">Location</td><td style="padding:8px 0;"><a href="${mapsUrl}" style="color:#2563eb;">${payload.latitude.toFixed(5)}, ${payload.longitude.toFixed(5)}</a></td></tr>
  </table>
  ${payload.resolutionNotes ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:16px;"><p style="margin:0 0 4px;font-weight:600;color:#15803d;">Resolution Notes</p><p style="margin:0;color:#166534;">${payload.resolutionNotes}</p></div>` : ''}
  <a href="${appUrl}/patrol" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View Your Patrols</a>
</div>`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? smtpUser,
      to: patrollerEmail,
      subject: `Flag #${payload.flagId} Resolved — ${payload.routeName}`,
      html,
    });
  } catch (err) {
    logError('sendFlagResolvedEmail', err);
  }
}

export async function sendFlagAlert(payload: FlagEmailPayload, managerEmails: string[]): Promise<void> {
  if (managerEmails.length === 0) return;

  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn('[email] SMTP not configured — skipping flag alert email');
    return;
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass },
    });

    const severityColor = payload.severity === 'high' ? '#dc2626' : payload.severity === 'medium' ? '#ea580c' : '#ca8a04';
    const mapsUrl = `https://maps.google.com/?q=${payload.latitude},${payload.longitude}`;
    const appUrl = process.env.NEXTAUTH_URL ?? 'https://dfphotos.cloudextel.com';

    const html = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px;">
  <h2 style="color:#dc2626;margin-bottom:4px;">🚩 Patrol Red Flag Raised</h2>
  <p style="color:#6b7280;margin-top:0;">Flag #${payload.flagId} — ${new Date(payload.createdAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr><td style="padding:8px 0;color:#374151;font-weight:600;width:140px;">Patroller</td><td style="padding:8px 0;">${payload.patrollerName} (${payload.patrollerEmail})</td></tr>
    <tr><td style="padding:8px 0;color:#374151;font-weight:600;">Route</td><td style="padding:8px 0;">${payload.routeName}</td></tr>
    <tr><td style="padding:8px 0;color:#374151;font-weight:600;">Severity</td><td style="padding:8px 0;"><span style="background:${severityColor};color:#fff;padding:2px 10px;border-radius:9999px;font-size:13px;text-transform:capitalize;">${payload.severity}</span></td></tr>
    <tr><td style="padding:8px 0;color:#374151;font-weight:600;">Description</td><td style="padding:8px 0;">${payload.description}</td></tr>
    <tr><td style="padding:8px 0;color:#374151;font-weight:600;">Location</td><td style="padding:8px 0;"><a href="${mapsUrl}" style="color:#2563eb;">${payload.latitude.toFixed(6)}, ${payload.longitude.toFixed(6)}</a></td></tr>
  </table>

  ${payload.flagPhotoUrl ? `<p><img src="${payload.flagPhotoUrl}" alt="Flag photo" style="max-width:100%;border-radius:8px;border:1px solid #e5e7eb;" /></p>` : ''}

  <a href="${appUrl}/patrol/manager" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View in Dashboard</a>
</div>`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? smtpUser,
      to: managerEmails.join(', '),
      subject: `[${payload.severity.toUpperCase()}] Patrol Red Flag — ${payload.routeName}`,
      html,
    });
  } catch (err) {
    logError('sendFlagAlert', err);
  }
}
