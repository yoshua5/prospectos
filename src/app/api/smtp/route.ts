import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export async function GET() {
  const rows = await query('SELECT * FROM smtp_config WHERE id = 1');
  if (!rows[0]) return NextResponse.json({});
  const safe = { ...(rows[0] as Record<string, unknown>) };
  safe.pass = safe.pass ? '***' : '';
  return NextResponse.json(safe);
}

export async function POST(req: NextRequest) {
  const { host, port, user, pass, from_name, from_email } = await req.json();
  const existing = await query('SELECT id FROM smtp_config WHERE id = 1');
  if (existing[0]) {
    await execute(
      'UPDATE smtp_config SET host=?, port=?, user=?, pass=?, from_name=?, from_email=? WHERE id=1',
      [host, port, user, pass, from_name, from_email]
    );
  } else {
    await execute(
      'INSERT INTO smtp_config (id, host, port, user, pass, from_name, from_email) VALUES (1, ?, ?, ?, ?, ?, ?)',
      [host, port, user, pass, from_name, from_email]
    );
  }
  return NextResponse.json({ ok: true });
}
