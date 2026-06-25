import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export async function GET() {
  const rows = await query('SELECT * FROM smtp_config WHERE id = 1');
  if (!rows[0]) return NextResponse.json({});
  const safe = { ...(rows[0] as Record<string, unknown>) };
  safe.pass = safe.pass ? '***' : '';
  // mask lp_api_key too but keep first 8 chars so user can confirm it's set
  if (safe.lp_api_key) {
    const key = safe.lp_api_key as string;
    safe.lp_api_key = key.slice(0, 8) + '***';
  }
  return NextResponse.json(safe);
}

export async function POST(req: NextRequest) {
  const { host, port, user, pass, from_name, from_email, lp_api_key } = await req.json();
  const existing = await query<{pass?: string; lp_api_key?: string}>('SELECT pass, lp_api_key FROM smtp_config WHERE id = 1');
  const existingPass = existing[0]?.pass;
  const existingKey = existing[0]?.lp_api_key;
  // Don't overwrite masked values
  const finalPass = pass === '***' ? existingPass : pass;
  const finalKey = lp_api_key?.endsWith('***') ? existingKey : lp_api_key;

  if (existing[0]) {
    await execute(
      'UPDATE smtp_config SET host=?, port=?, user=?, pass=?, from_name=?, from_email=?, lp_api_key=? WHERE id=1',
      [host, port, user, finalPass, from_name, from_email, finalKey || '']
    );
  } else {
    await execute(
      'INSERT INTO smtp_config (id, host, port, user, pass, from_name, from_email, lp_api_key) VALUES (1, ?, ?, ?, ?, ?, ?, ?)',
      [host, port, user, finalPass, from_name, from_email, finalKey || '']
    );
  }
  return NextResponse.json({ ok: true });
}
