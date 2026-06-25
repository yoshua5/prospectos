import { NextRequest } from 'next/server';
import { scrapeLeads } from '@/lib/scraper';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { service, keywords, location, limit = 20 } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const line of scrapeLeads(service, keywords, location, limit)) {
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
