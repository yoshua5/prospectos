interface BraveResult {
  title: string;
  url: string;
  description?: string;
}

const INTENT_WORDS = [
  'busco', 'necesito', 'alguien', 'recomienda', 'recomiendan', 'quien me',
  'donde consigo', 'busca', 'cotizacion', 'precio', 'cuanto cuesta',
  'conocen', 'referencia', 'recomendacion', 'ayuda con', 'contratar',
  'looking for', 'need a', 'anyone know', 'recommend', 'seeking',
  'quiero contratar', 'busco alguien', 'me pueden', 'alguna empresa',
  'me recomiendan', 'necesito ayuda', 'donde', 'dónde', 'cual', 'cuál',
  'cómo', 'hay algun', 'saben de', 'opinion', 'opinión', 'sugerencia',
  'consejo', 'vale la pena', 'es bueno', 'me ayudan', 'alguien ha',
  'han probado', 'experiencia con', 'where can', 'how do', 'can anyone',
  'does anyone', 'looking', 'wanted', 'help with',
];

const FORUM_DOMAINS = [
  'forocoches.com', 'taringa.net', 'merca2.es', 'answers.yahoo.com',
  'forosperu.net', 'foro.univision.com', 'todoexpertos.com',
];

const SOCIAL_DOMAINS = [
  'facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com',
  'youtube.com', 'linkedin.com', 'pinterest.com', 'reddit.com',
  'quora.com', 'wikipedia.org', 'amazon.com', 'ebay.com',
];

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

function hasIntent(text: string): boolean {
  if (text.includes('?') || text.includes('¿')) return true;
  const t = text.toLowerCase();
  return INTENT_WORDS.some(w => t.includes(w));
}

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

async function fetchRedditHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function scrapeReddit(keywords: string, location: string, limit: number): Promise<string[]> {
  // Use Brave to search Reddit specifically
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];

  const query = `site:reddit.com ${keywords} ${location}`.trim();
  const results = await braveSearch(query, limit * 2);

  const allLeads: string[] = [];
  const intentLeads: string[] = [];

  for (const r of results.filter(isUseful)) {
    if (!r.url.includes('reddit.com')) continue;
    const text = `${r.title} ${r.description || ''}`;
    const lead = JSON.stringify({
      name: r.title.slice(0, 80) || 'Reddit post',
      website: r.url,
      email: '', phone: '',
      address: (r.description || r.title).slice(0, 220),
      city: location, social: r.url,
      service: 'Reddit', keywords,
      platform: 'Reddit', platform_meta: 'reddit.com',
    });
    allLeads.push(lead);
    if (hasIntent(text)) intentLeads.push(lead);
  }

  const out = intentLeads.length ? intentLeads : allLeads;
  return out.slice(0, limit);
}

async function scrapePlatform(
  keywords: string, location: string,
  platformName: string, domainFilter: string, hint: string,
  limit: number
): Promise<string[]> {
  const queries = [
    `${keywords} ${location} ${hint} busco OR necesito OR donde`,
    `${keywords} ${location} ${hint} recomendacion OR contratar`,
  ];

  const seen = new Set<string>();
  const allLeads: string[] = [];
  const intentLeads: string[] = [];

  for (const q of queries) {
    const results = await braveSearch(q, 20);
    for (const r of results.filter(isUseful)) {
      if (!r.url.toLowerCase().includes(domainFilter)) continue;
      if (seen.has(r.url)) continue;
      seen.add(r.url);

      const text = `${r.title} ${r.description || ''}`;
      const lead = JSON.stringify({
        name: r.title.slice(0, 80) || platformName,
        website: r.url, email: '', phone: '',
        address: (r.description || r.title).slice(0, 220),
        city: location, social: r.url,
        service: platformName, keywords,
        platform: platformName, platform_meta: domainFilter,
      });
      allLeads.push(lead);
      if (hasIntent(text)) intentLeads.push(lead);
    }
  }

  const out = intentLeads.length ? intentLeads : allLeads;
  return out.slice(0, limit);
}

async function scrapeForums(keywords: string, location: string, limit: number): Promise<string[]> {
  const queries = [
    `${keywords} ${location} foro OR comunidad busco OR necesito OR recomendacion`,
    `${keywords} ${location} foro ayuda OR opinion`,
  ];

  const seen = new Set<string>();
  const allLeads: string[] = [];
  const intentLeads: string[] = [];

  for (const q of queries) {
    const results = await braveSearch(q, 20);
    for (const r of results.filter(isUseful)) {
      if (!FORUM_DOMAINS.some(d => r.url.toLowerCase().includes(d))) continue;
      if (seen.has(r.url)) continue;
      seen.add(r.url);

      const text = `${r.title} ${r.description || ''}`;
      let domain = '';
      try { domain = new URL(r.url).hostname; } catch { domain = r.url; }

      const lead = JSON.stringify({
        name: r.title.slice(0, 80) || 'Foro post',
        website: r.url, email: '', phone: '',
        address: (r.description || r.title).slice(0, 220),
        city: location, social: r.url,
        service: 'Foros', keywords,
        platform: 'Foros', platform_meta: domain,
      });
      allLeads.push(lead);
      if (hasIntent(text)) intentLeads.push(lead);
    }
  }

  const out = intentLeads.length ? intentLeads : allLeads;
  return out.slice(0, limit);
}

async function scrapeWeb(keywords: string, location: string, limit: number): Promise<string[]> {
  const queries = [
    `${keywords} ${location} busco OR necesito OR recomiendan OR donde contratar`,
    `${keywords} ${location} quien recomienda OR alguien sabe`,
  ];

  const seen = new Set<string>();
  const allLeads: string[] = [];
  const intentLeads: string[] = [];

  for (const q of queries) {
    const results = await braveSearch(q, 20);
    for (const r of results.filter(isUseful)) {
      const urlLower = r.url.toLowerCase();
      if (SOCIAL_DOMAINS.some(d => urlLower.includes(d))) continue;
      if (seen.has(r.url)) continue;
      seen.add(r.url);

      let domain = '';
      try { domain = new URL(r.url).hostname; } catch { domain = r.url; }

      const text = `${r.title} ${r.description || ''}`;
      const lead = JSON.stringify({
        name: r.title.slice(0, 80) || domain,
        website: r.url, email: '', phone: '',
        address: (r.description || r.title).slice(0, 220),
        city: location, social: r.url,
        service: 'Web general', keywords,
        platform: 'Web general', platform_meta: domain,
      });
      allLeads.push(lead);
      if (hasIntent(text)) intentLeads.push(lead);
    }
  }

  const out = intentLeads.length ? intentLeads : allLeads;
  return out.slice(0, limit);
}

const PLATFORM_CONFIG: Record<string, { name: string; domain: string; hint: string }> = {
  twitter:  { name: 'Twitter/X', domain: 'twitter.com',         hint: 'twitter OR X' },
  facebook: { name: 'Facebook',  domain: 'facebook.com/groups', hint: 'facebook grupos' },
  quora:    { name: 'Quora',     domain: 'quora.com',           hint: 'quora' },
};

export async function* scrapeIntent(
  keywords: string,
  location: string,
  platforms: string[],
  limit: number
): AsyncGenerator<string> {
  if (!process.env.BRAVE_API_KEY) {
    yield JSON.stringify({ error: 'BRAVE_API_KEY no configurado. Agrega la variable de entorno en Vercel.' });
    return;
  }

  let emitted = 0;

  for (const platform of platforms) {
    if (emitted >= limit) break;
    const remaining = limit - emitted;
    let leads: string[] = [];

    if (platform === 'reddit') {
      leads = await scrapeReddit(keywords, location, remaining);
    } else if (platform === 'foros') {
      leads = await scrapeForums(keywords, location, remaining);
    } else if (platform === 'web') {
      leads = await scrapeWeb(keywords, location, remaining);
    } else if (PLATFORM_CONFIG[platform]) {
      const { name, domain, hint } = PLATFORM_CONFIG[platform];
      leads = await scrapePlatform(keywords, location, name, domain, hint, remaining);
    }

    for (const lead of leads) {
      yield lead;
      emitted++;
    }
  }
}
