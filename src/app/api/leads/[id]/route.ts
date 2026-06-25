import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, website, email, phone, address, city, social, status } = await req.json();

  await execute(
    `UPDATE leads SET name=?, website=?, email=?, phone=?, address=?, city=?, social=?, status=? WHERE id=?`,
    [name, website, email, phone, address, city, social, status, id]
  );

  const leads = await query('SELECT * FROM leads WHERE id = ?', [id]);
  return NextResponse.json(leads[0]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await execute('DELETE FROM leads WHERE id = ?', [id]);
  return NextResponse.json({ ok: true });
}
