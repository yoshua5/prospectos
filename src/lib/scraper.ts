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
  'wikipedia', 'youtube', 'gob.mx', 'gobierno', 'pinterest',
  'tiktok', 'reddit', 'quora', 'amazon', 'mercadolibre',
];

const SKIP_DOMAINS_PERSONA = [
  'tripadvisor', 'yelp', 'google', 'facebook', 'instagram', 'twitter',
  'wikipedia', 'youtube', 'gob.mx', 'gobierno', 'pinterest',
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

function extractPersonName(title: string, description: string): string {
  // LinkedIn snippet: "Juan García - Event Planner | LinkedIn" or "Juan García · Organizador"
  const linkedinTitle = title.match(/^([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+(?: [A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+){1,3})\s*[-·|]/);
  if (linkedinTitle) return linkedinTitle[1];

  // Description: "Juan García, organizador de eventos en CDMX"
  const descName = description.match(/^([A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+(?: [A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+){1,3})[,·\-]/);
  if (descName) return descName[1];

  return title.split(/[-|·]/)[0].trim().slice(0, 60);
}

export async function* scrapePersonas(
  keywords: string,
  location: string,
  limit: number
): AsyncGenerator<string> {
  if (!process.env.BRAVE_API_KEY) {
    yield JSON.stringify({ error: 'BRAVE_API_KEY no configurado. Agrega la variable de entorno en Vercel.' });
    return;
  }

  const queries = [
    `site:linkedin.com/in ${keywords} ${location}`,
    `${keywords} ${location} organizador OR "event planner" OR "planner de eventos" contacto email`,
    `${keywords} ${location} contratar persona independiente OR freelance OR profesional`,
  ];

  const seen = new Set<string>();
  const batch: BraveResult[] = [];

  for (const q of queries) {
    if (batch.length >= limit * 2) break;
    const results = await braveSearch(q, 20);
    for (const r of results.filter(isUseful)) {
      if (seen.has(r.url)) continue;
      if (SKIP_DOMAINS_PERSONA.some(d => r.url.toLowerCase().includes(d))) continue;
      seen.add(r.url);
      batch.push(r);
    }
  }

  const toFetch = batch.slice(0, limit);
  const contacts = await Promise.allSettled(toFetch.map(r => fetchContactInfo(r.url)));

  for (let i = 0; i < toFetch.length; i++) {
    const r = toFetch[i];
    const settled = contacts[i];
    const contact = settled.status === 'fulfilled' ? settled.value : { emails: [], phones: [] };

    const snippetPhones = extractPhones(r.description || '');
    const phone = contact.phones[0] || snippetPhones[0] || '';
    const email = contact.emails[0] || '';
    const name = extractPersonName(r.title, r.description || '');

    const isLinkedIn = r.url.includes('linkedin.com');

    yield JSON.stringify({
      name,
      website: r.url,
      email: isLinkedIn ? '' : email,
      phone: isLinkedIn ? '' : phone,
      address: (r.description || '').slice(0, 220),
      city: location,
      social: isLinkedIn ? r.url : '',
      service: 'Persona',
      keywords,
    });
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
    const settled = contacts[i];
    const contact = settled.status === 'fulfilled' ? settled.value : { emails: [], phones: [] };

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
