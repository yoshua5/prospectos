import { NextRequest } from 'next/server';
import { scrapeLeads, scrapePersonas } from '@/lib/scraper';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { service, keywords, location, limit = 20, mode = 'empresa' } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = mode === 'persona'
          ? scrapePersonas(keywords, location, limit)
          : scrapeLeads(service, keywords, location, limit);
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
