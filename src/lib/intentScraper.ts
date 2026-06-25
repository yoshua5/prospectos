import * as cheerio from 'cheerio';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
};

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

function hasIntent(text: string): boolean {
  if (text.includes('?') || text.includes('¿')) return true;
  const t = text.toLowerCase();
  return INTENT_WORDS.some(w => t.includes(w));
}

function decodeDdgUrl(href: string): string {
  if (href.includes('uddg=')) {
    const encoded = href.split('uddg=')[1].split('&')[0];
    return decodeURIComponent(encoded);
  }
  return href.startsWith('http') ? href : '';
}

async function fetchHtml(url: string, timeout = 12000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface DdgResult { title: string; snippet: string; url: string }

async function ddgSearch(query: string): Promise<DdgResult[]> {
  const html = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!html) return [];

  const $ = cheerio.load(html);
  const items: DdgResult[] = [];

  $('.result').each((_, el) => {
    const title = $(el).find('h2.result__title a, .result__a').first().text().trim();
    const snippet = $(el).find('.result__snippet').first().text().trim();
    const href = $(el).find('a.result__a, a[href*="uddg"]').first().attr('href') || '';
    const url = decodeDdgUrl(href);
    if (url.startsWith('http')) items.push({ title, snippet, url });
  });

  return items;
}

async function scrapeReddit(keywords: string, location: string, limit: number): Promise<string[]> {
  const query = `${keywords} ${location}`.trim();
  const html = await fetchHtml(
    `https://old.reddit.com/search?q=${encodeURIComponent(query)}&restrict_sr=false&sort=new&t=all`
  );
  if (!html) return [];

  const $ = cheerio.load(html);
  const allLeads: string[] = [];
  const intentLeads: string[] = [];

  $('.search-result-link, .search-result').each((_, el) => {
    const titleEl = $(el).find('a.search-result-link, .search-title a, h3 a').first();
    const title = titleEl.text().trim();
    let href = titleEl.attr('href') || '';
    if (href && !href.startsWith('http')) href = 'https://www.reddit.com' + href;

    const desc = $(el).find('.search-result-body, .usertext-body').first().text().trim().slice(0, 150);
    const meta = $(el).find('.search-result-meta, .tagline').first().text().trim().slice(0, 40);

    if (!title && !href) return;

    const lead = JSON.stringify({
      name: title.slice(0, 80) || 'Reddit post',
      website: href, email: '', phone: '',
      address: (title + (desc ? ' — ' + desc : '')).slice(0, 220),
      city: location, social: href,
      service: 'Reddit', keywords,
      platform: 'Reddit', platform_meta: meta || 'reddit',
    });

    allLeads.push(lead);
    if (hasIntent(`${title} ${desc}`)) intentLeads.push(lead);
  });

  const results = intentLeads.length ? intentLeads : allLeads;
  return results.slice(0, limit);
}

async function scrapeDdgPlatform(
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
    const items = await ddgSearch(q);
    for (const { title, snippet, url } of items) {
      if (!url.toLowerCase().includes(domainFilter)) continue;
      if (['/login', '/signup'].some(s => url.toLowerCase().includes(s))) continue;
      if (seen.has(url)) continue;
      seen.add(url);

      const lead = JSON.stringify({
        name: title.slice(0, 80) || platformName,
        website: url, email: '', phone: '',
        address: (snippet || title).slice(0, 220),
        city: location, social: url,
        service: platformName, keywords,
        platform: platformName, platform_meta: domainFilter,
      });
      allLeads.push(lead);
      if (hasIntent(`${title} ${snippet}`)) intentLeads.push(lead);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const results = intentLeads.length ? intentLeads : allLeads;
  return results.slice(0, limit);
}

async function scrapeForosDdg(keywords: string, location: string, limit: number): Promise<string[]> {
  const queries = [
    `${keywords} ${location} foro OR comunidad busco OR necesito OR recomendacion`,
    `${keywords} ${location} foro OR ayuda OR opinion`,
  ];

  const seen = new Set<string>();
  const allLeads: string[] = [];
  const intentLeads: string[] = [];

  for (const q of queries) {
    const items = await ddgSearch(q);
    for (const { title, snippet, url } of items) {
      if (!FORUM_DOMAINS.some(d => url.toLowerCase().includes(d))) continue;
      if (seen.has(url)) continue;
      seen.add(url);

      const domain = new URL(url).hostname;
      const lead = JSON.stringify({
        name: title.slice(0, 80) || 'Foro post',
        website: url, email: '', phone: '',
        address: (snippet || title).slice(0, 220),
        city: location, social: url,
        service: 'Foros', keywords,
        platform: 'Foros', platform_meta: domain,
      });
      allLeads.push(lead);
      if (hasIntent(`${title} ${snippet}`)) intentLeads.push(lead);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const results = intentLeads.length ? intentLeads : allLeads;
  return results.slice(0, limit);
}

async function scrapeWebDdg(keywords: string, location: string, limit: number): Promise<string[]> {
  const queries = [
    `${keywords} ${location} busco OR necesito OR recomiendan OR donde contratar`,
    `${keywords} ${location} quien recomienda OR alguien sabe OR me pueden ayudar`,
  ];

  const seen = new Set<string>();
  const allLeads: string[] = [];
  const intentLeads: string[] = [];

  for (const q of queries) {
    const items = await ddgSearch(q);
    for (const { title, snippet, url } of items) {
      const urlLower = url.toLowerCase();
      if (SOCIAL_DOMAINS.some(d => urlLower.includes(d))) continue;
      if (['/login', '/signup'].some(s => urlLower.includes(s))) continue;
      if (seen.has(url)) continue;
      seen.add(url);

      const domain = new URL(url).hostname;
      const lead = JSON.stringify({
        name: title.slice(0, 80) || domain,
        website: url, email: '', phone: '',
        address: (snippet || title).slice(0, 220),
        city: location, social: url,
        service: 'Web general', keywords,
        platform: 'Web general', platform_meta: domain,
      });
      allLeads.push(lead);
      if (hasIntent(`${title} ${snippet}`)) intentLeads.push(lead);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  const results = intentLeads.length ? intentLeads : allLeads;
  return results.slice(0, limit);
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
  let emitted = 0;

  for (const platform of platforms) {
    if (emitted >= limit) break;
    const remaining = limit - emitted;

    let leads: string[] = [];

    if (platform === 'reddit') {
      leads = await scrapeReddit(keywords, location, remaining);
    } else if (platform === 'foros') {
      leads = await scrapeForosDdg(keywords, location, remaining);
    } else if (platform === 'web') {
      leads = await scrapeWebDdg(keywords, location, remaining);
    } else if (PLATFORM_CONFIG[platform]) {
      const { name, domain, hint } = PLATFORM_CONFIG[platform];
      leads = await scrapeDdgPlatform(keywords, location, name, domain, hint, remaining);
    }

    for (const lead of leads) {
      yield lead;
      emitted++;
    }

    await new Promise(r => setTimeout(r, 800));
  }
}
