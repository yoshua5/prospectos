import { NextRequest } from 'next/server';
import { scrapeIntent } from '@/lib/intentScraper';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { keywords, location, platforms, limit = 20 } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const line of scrapeIntent(keywords, location, platforms, limit)) {
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
