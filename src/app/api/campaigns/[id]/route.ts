import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import nodemailer from 'nodemailer';
import { renderEmail, type EmailTemplateData, type LeadData } from '@/lib/emailTemplate';

type SmtpConfig = {
  host: string; port: number; user: string; pass: string; from_name: string; from_email: string;
};

type Campaign = {
  id: number; name: string; template_id: number; leads_json: string; status: string; sent_count: number;
};

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await execute('DELETE FROM campaigns WHERE id = ?', [id]);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await req.json();
  if (action !== 'send') return NextResponse.json({ error: 'unknown action' }, { status: 400 });

  const campaigns = await query<Campaign>('SELECT * FROM campaigns WHERE id = ?', [id]);
  const campaign = campaigns[0];
  if (!campaign) return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 });

  const templates = await query<EmailTemplateData>('SELECT * FROM templates WHERE id = ?', [campaign.template_id]);
  const template = templates[0];
  if (!template) return NextResponse.json({ error: 'Template no encontrado' }, { status: 404 });

  const smtpRows = await query<SmtpConfig>('SELECT * FROM smtp_config WHERE id = 1');
  const smtpConfig = smtpRows[0];
  if (!smtpConfig?.host) {
    return NextResponse.json({ error: 'SMTP no configurado. Ve a Marketing → Configuración SMTP.' }, { status: 400 });
  }

  const leadIds: number[] = JSON.parse(String(campaign.leads_json || '[]'));
  const leadRows = await Promise.all(leadIds.map(lid => query<LeadData>('SELECT * FROM leads WHERE id = ?', [lid])));
  const leads = leadRows.map(r => r[0]).filter(Boolean) as LeadData[];
  const leadsWithEmail = leads.filter(l => l.email);

  if (leadsWithEmail.length === 0) {
    return NextResponse.json({ error: 'Ningún lead tiene email. Agrega emails en Mis Leads.' }, { status: 400 });
  }

  let transporter: nodemailer.Transporter;
  try {
    transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.port === 465,
      auth: { user: smtpConfig.user, pass: smtpConfig.pass },
    });
    await transporter.verify();
  } catch (err) {
    return NextResponse.json({
      error: `Error de conexión SMTP: ${(err as Error).message}`
    }, { status: 400 });
  }

  let sent = 0;
  let bounced = 0;
  const errors: string[] = [];

  for (const lead of leadsWithEmail) {
    try {
      const html = renderEmail(template, lead);
      const subject = String(template.subject || '')
        .replace(/\{\{nombre_empresa\}\}/g, String(lead.name || ''))
        .replace(/\{\{ciudad\}\}/g, String(lead.city || ''));
      await transporter.sendMail({
        from: `"${smtpConfig.from_name}" <${smtpConfig.from_email}>`,
        to: String(lead.email),
        subject,
        html,
      });
      sent++;
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      bounced++;
      errors.push(`${lead.email}: ${(err as Error).message}`);
    }
  }

  await execute(
    `UPDATE campaigns SET status='sent', sent_count=?, bounce_count=?, sent_at=datetime('now') WHERE id=?`,
    [sent, bounced, id]
  );

  return NextResponse.json({ sent, bounced, total: leadsWithEmail.length, errors });
}
