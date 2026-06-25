interface BraveResult {
  title: string;
  url: string;
  description?: string;
}

const SKIP_DOMAINS = [
  'tripadvisor', 'yelp', 'google', 'facebook', 'instagram', 'twitter',
  'wikipedia', 'youtube', 'gob.mx', 'gobierno', 'linkedin', 'pinterest',
  'tiktok', 'reddit', 'quora', 'amazon', 'mercadolibre',
];

async function braveSearch(query: string, count = 20): Promise<BraveResult[]> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`,
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': key,
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.web?.results || []) as BraveResult[];
  } catch {
    return [];
  }
}

function extractPhones(text: string): string[] {
  return [...text.matchAll(/[\+]?[(]?[0-9]{2,4}[)]?[-\s.]?[0-9]{2,4}[-\s.]?[0-9]{3,4}[-\s.]?[0-9]{0,4}/g)]
    .map(m => m[0].trim())
    .filter(p => p.replace(/\D/g, '').length >= 7);
}

export async function* scrapeLeads(
  service: string,
  keywords: string,
  location: string,
  limit: number
): AsyncGenerator<string> {
  if (!process.env.BRAVE_API_KEY) {
    yield JSON.stringify({ error: 'BRAVE_API_KEY no configurado. Agrega la variable de entorno en Vercel.' });
    return;
  }

  const query = `${keywords} ${location} empresa contacto telefono`.trim();
  const results = await braveSearch(query, Math.min(limit * 2, 20));

  let found = 0;
  for (const r of results) {
    if (found >= limit) break;

    const urlLower = r.url.toLowerCase();
    if (!r.title) continue;
    if (SKIP_DOMAINS.some(d => urlLower.includes(d))) continue;

    const phones = extractPhones(r.description || '');

    yield JSON.stringify({
      name: r.title.slice(0, 80),
      website: r.url,
      email: '',
      phone: phones[0] || '',
      address: (r.description || '').slice(0, 220),
      city: location,
      social: '',
      service,
      keywords,
    });
    found++;
  }
}
