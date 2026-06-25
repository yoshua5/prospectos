import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, subject, body, logo_url, header_color, cta_text, cta_url, sig_name, sig_title, sig_phone, sig_company } = await req.json();
  await execute(
    `UPDATE templates SET name=?, subject=?, body=?, logo_url=?, header_color=?, cta_text=?, cta_url=?, sig_name=?, sig_title=?, sig_phone=?, sig_company=? WHERE id=?`,
    [name, subject, body, logo_url||'', header_color||'#f97316', cta_text||'', cta_url||'', sig_name||'', sig_title||'', sig_phone||'', sig_company||'', id]
  );
  const templates = await query('SELECT * FROM templates WHERE id = ?', [id]);
  return NextResponse.json(templates[0]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await execute('DELETE FROM templates WHERE id = ?', [id]);
  return NextResponse.json({ ok: true });
}
