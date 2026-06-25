import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get('ids');

  let leads: Record<string, unknown>[];
  if (ids) {
    const idList = ids.split(',');
    const rows = await Promise.all(idList.map(id => query('SELECT * FROM leads WHERE id = ?', [id])));
    leads = rows.flat().filter(Boolean) as Record<string, unknown>[];
  } else {
    leads = await query('SELECT * FROM leads ORDER BY created_at DESC') as Record<string, unknown>[];
  }

  const headers = ['id','name','website','email','phone','address','city','social','service','keywords','status','created_at'];
  const csv = [
    headers.join(','),
    ...leads.map(lead =>
      headers.map(h => `"${String(lead[h] ?? '').replace(/"/g, '""')}"`).join(',')
    )
  ].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="leads.csv"',
    },
  });
}
