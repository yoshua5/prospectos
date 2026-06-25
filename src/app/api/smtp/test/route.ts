import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import nodemailer from 'nodemailer';

type SmtpConfig = {
  host: string; port: number; user: string; pass: string; from_name: string; from_email: string;
};

export async function POST() {
  const rows = await query<SmtpConfig>('SELECT * FROM smtp_config WHERE id = 1');
  const smtp = rows[0];
  if (!smtp?.host) return NextResponse.json({ error: 'SMTP no configurado.' }, { status: 400 });

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    await transporter.verify();
    await transporter.sendMail({
      from: `"${smtp.from_name}" <${smtp.from_email}>`,
      to: smtp.from_email,
      subject: '✅ Prueba de conexión — Prospectos App',
      html: `<div style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:32px;background:#f9fafb;border-radius:12px;border:1px solid #e5e7eb;">
        <h2 style="color:#f97316;margin:0 0 16px;">✅ Conexión exitosa</h2>
        <p style="color:#374151;">Tu configuración SMTP funciona correctamente.</p>
        <p style="color:#6b7280;font-size:13px;">Servidor: ${smtp.host}:${smtp.port}<br>Usuario: ${smtp.user}</p>
      </div>`,
    });
    return NextResponse.json({ ok: true, message: `Email de prueba enviado a ${smtp.from_email}` });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
