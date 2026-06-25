import * as cheerio from 'cheerio';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
};

const SKIP_DOMAINS = [
  'tripadvisor', 'yelp', 'google', 'facebook', 'instagram', 'twitter',
  'wikipedia', 'youtube', 'gob.mx', 'gobierno', 'linkedin', 'pinterest',
  'tiktok', 'reddit', 'quora', 'amazon', 'mercadolibre',
];

function decodeDdgUrl(href: string): string {
  if (href.includes('uddg=')) {
    const encoded = href.split('uddg=')[1].split('&')[0];
    return decodeURIComponent(encoded);
  }
  return href.startsWith('http') ? href : '';
}

function extractEmails(text: string): string[] {
  const found = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)]
    .map(m => m[0])
    .filter(e => !/\.(png|jpg|gif|svg|webp)$/i.test(e));
  return [...new Set(found)];
}

function extractPhones(text: string): string[] {
  const found = [...text.matchAll(/[\+]?[(]?[0-9]{2,4}[)]?[-\s.]?[0-9]{2,4}[-\s.]?[0-9]{3,4}[-\s.]?[0-9]{0,4}/g)]
    .map(m => m[0].trim())
    .filter(p => p.replace(/\D/g, '').length >= 7);
  return found;
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

export async function* scrapeLeads(
  service: string,
  keywords: string,
  location: string,
  limit: number
): AsyncGenerator<string> {
  const query = `${keywords} ${location} empresa contacto telefono`.trim();
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const html = await fetchHtml(searchUrl);
  if (!html) {
    yield JSON.stringify({ error: 'No se pudo conectar a DuckDuckGo' });
    return;
  }

  const $ = cheerio.load(html);
  const results = $('.result').toArray();

  let found = 0;
  for (const el of results) {
    if (found >= limit) break;

    try {
      const titleEl = $(el).find('h2.result__title a, .result__a').first();
      const title = titleEl.text().trim();

      const linkEl = $(el).find('a.result__a, a[href*="uddg"]').first();
      const href = linkEl.attr('href') || '';
      const realUrl = decodeDdgUrl(href);

      if (!realUrl || !realUrl.startsWith('http')) continue;
      const urlLower = realUrl.toLowerCase();
      if (SKIP_DOMAINS.some(d => urlLower.includes(d))) continue;
      if (!title) continue;

      const snippetEl = $(el).find('.result__snippet').first();
      const snippet = snippetEl.text().trim();

      const phones = extractPhones(snippet);

      const lead: Record<string, string> = {
        name: title,
        website: realUrl,
        email: '',
        phone: phones[0] || '',
        address: '',
        city: location,
        social: '',
        service,
        keywords,
      };

      // Visit site to extract email/phone/social
      const siteHtml = await fetchHtml(realUrl, 8000);
      if (siteHtml) {
        const emails = extractEmails(siteHtml);
        if (emails.length) lead.email = emails[0];

        if (!lead.phone) {
          const sitePhones = extractPhones(siteHtml);
          if (sitePhones.length) lead.phone = sitePhones[0];
        }

        const $site = cheerio.load(siteHtml);
        const socials: string[] = [];
        $site('a[href*="instagram.com"], a[href*="facebook.com"], a[href*="linkedin.com"]').each((_, a) => {
          const s = $site(a).attr('href') || '';
          if (s && !s.includes('sharer')) socials.push(s);
        });
        if (socials.length) lead.social = [...new Set(socials)].slice(0, 2).join(', ');
      }

      yield JSON.stringify(lead);
      found++;

      await new Promise(r => setTimeout(r, 300));
    } catch {
      continue;
    }
  }
}
