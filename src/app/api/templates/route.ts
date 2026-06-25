import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export async function GET() {
  const templates = await query('SELECT * FROM templates ORDER BY created_at DESC');
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const { name, subject, body, logo_url, header_color, cta_text, cta_url, sig_name, sig_title, sig_phone, sig_company } = await req.json();
  const { lastInsertRowid } = await execute(
    `INSERT INTO templates (name, subject, body, logo_url, header_color, cta_text, cta_url, sig_name, sig_title, sig_phone, sig_company)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, subject, body, logo_url||'', header_color||'#f97316', cta_text||'', cta_url||'', sig_name||'', sig_title||'', sig_phone||'', sig_company||'']
  );
  const templates = await query('SELECT * FROM templates WHERE id = ?', [lastInsertRowid]);
  return NextResponse.json(templates[0], { status: 201 });
}
