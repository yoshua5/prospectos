import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export async function GET() {
  const campaigns = await query('SELECT * FROM campaigns ORDER BY created_at DESC');
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  const { name, templateId, leadIds } = await req.json();
  const { lastInsertRowid } = await execute(
    'INSERT INTO campaigns (name, template_id, leads_json) VALUES (?, ?, ?)',
    [name, templateId, JSON.stringify(leadIds || [])]
  );
  const campaigns = await query('SELECT * FROM campaigns WHERE id = ?', [lastInsertRowid]);
  return NextResponse.json(campaigns[0], { status: 201 });
}
