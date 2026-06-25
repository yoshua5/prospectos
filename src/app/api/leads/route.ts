import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';

  let sql = 'SELECT * FROM leads WHERE 1=1';
  const args: string[] = [];

  if (search) {
    sql += ` AND (name LIKE ? OR email LIKE ? OR city LIKE ? OR phone LIKE ?)`;
    args.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) {
    sql += ` AND status = ?`;
    args.push(status);
  }
  sql += ' ORDER BY created_at DESC';

  const leads = await query(sql, args);
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const { name, website, email, phone, address, city, social, service, keywords, status } = await req.json();

  const { lastInsertRowid } = await execute(
    `INSERT INTO leads (name, website, email, phone, address, city, social, service, keywords, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name||'', website||'', email||'', phone||'', address||'', city||'', social||'', service||'', keywords||'', status||'nuevo']
  );

  const lead = await query('SELECT * FROM leads WHERE id = ?', [lastInsertRowid]);
  return NextResponse.json(lead[0], { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { ids } = await req.json() as { ids: number[] };
  for (const id of ids) {
    await execute('DELETE FROM leads WHERE id = ?', [id]);
  }
  return NextResponse.json({ ok: true });
}
