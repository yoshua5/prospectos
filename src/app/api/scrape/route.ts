import { NextRequest } from 'next/server';
import { scrapeLeads, scrapePersonas } from '@/lib/scraper';
import { scrapeLocalProspects } from '@/lib/localProspects';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { service, keywords, location, limit = 20, mode = 'empresa' } = await req.json();
  const encoder = new TextEncoder();

  // Check for LocalProspects API key
  const configRows = await query<{lp_api_key?: string}>('SELECT lp_api_key FROM smtp_config WHERE id = 1');
  const lpApiKey = configRows[0]?.lp_api_key || process.env.LP_API_KEY || '';

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let gen: AsyncGenerator<string>;
        if (mode === 'persona') {
          gen = scrapePersonas(keywords, location, limit);
        } else if (lpApiKey) {
          gen = scrapeLocalProspects(keywords, location, limit, lpApiKey);
        } else {
          gen = scrapeLeads(service, keywords, location, limit);
        }
        for await (const line of gen) {
          controller.enqueue(encoder.encode(`data: ${line}\n\n`));
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`data: {"error":"${String(err)}"}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: {"done":true}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
