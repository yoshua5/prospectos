interface BraveResult {
  title: string;
  url: string;
  description?: string;
}

const USELESS_DESC = [
  'we cannot provide a description',
  'sign in to',
  'log in to',
  'please enable javascript',
  'access denied',
];

function isUseful(r: BraveResult): boolean {
  if (!r.description) return false;
  const d = r.description.toLowerCase();
  return !USELESS_DESC.some(s => d.includes(s));
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

function extractEmails(text: string): string[] {
  const raw = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)].map(m => m[0].toLowerCase());
  return [...new Set(raw)].filter(e => !e.includes('example') && !e.includes('sentry') && !e.includes('wix') && !e.includes('@2x'));
}

async function fetchContactInfo(url: string): Promise<{ emails: string[]; phones: string[] }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { emails: [], phones: [] };
    const html = await res.text();
    const text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
                     .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
                     .replace(/<[^>]+>/g, ' ');
    return {
      emails: extractEmails(text).slice(0, 3),
      phones: extractPhones(text).slice(0, 3),
    };
  } catch {
    return { emails: [], phones: [] };
  }
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

  // Filter to valid results first
  const batch = results
    .filter(isUseful)
    .filter(r => r.title && !SKIP_DOMAINS.some(d => r.url.toLowerCase().includes(d)))
    .slice(0, limit);

  // Fetch contact info from all sites in parallel
  const contacts = await Promise.allSettled(batch.map(r => fetchContactInfo(r.url)));

  for (let i = 0; i < batch.length; i++) {
    const r = batch[i];
    const contact = contacts[i].status === 'fulfilled' ? contacts[i].value : { emails: [], phones: [] };

    const snippetPhones = extractPhones(r.description || '');
    const phone = contact.phones[0] || snippetPhones[0] || '';
    const email = contact.emails[0] || '';

    yield JSON.stringify({
      name: r.title.slice(0, 80),
      website: r.url,
      email,
      phone,
      address: (r.description || '').slice(0, 220),
      city: location,
      social: '',
      service,
      keywords,
    });
  }
}
