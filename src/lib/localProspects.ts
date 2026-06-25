const BASE = 'https://localprospects.ai/api/v1';
const DEMO_BASE = 'https://localprospects.ai/api/v1/demo';

function apiHeaders(apiKey: string) {
  return { 'x-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' };
}

async function getLocationCode(location: string, apiKey: string, demo: boolean): Promise<string | null> {
  try {
    const base = demo ? DEMO_BASE : BASE;
    const res = await fetch(`${base}/locations?q=${encodeURIComponent(location)}`, {
      headers: apiHeaders(apiKey),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = Array.isArray(data) ? data : (data.results || []);
    return results[0]?.location_code ?? null;
  } catch {
    return null;
  }
}

async function startSearch(keyword: string, locationCode: string, apiKey: string, demo: boolean): Promise<string | null> {
  try {
    const base = demo ? DEMO_BASE : BASE;
    const res = await fetch(`${base}/search`, {
      method: 'POST',
      headers: apiHeaders(apiKey),
      body: JSON.stringify({ keyword, location_code: locationCode }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.job_id ?? null;
  } catch {
    return null;
  }
}

async function pollJob(jobId: string, apiKey: string, demo: boolean): Promise<{ done: boolean; progress?: string }> {
  try {
    const base = demo ? DEMO_BASE : BASE;
    const res = await fetch(`${base}/job/${jobId}`, {
      headers: apiHeaders(apiKey),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { done: false };
    const data = await res.json();
    return { done: data.status === 'completed', progress: data.progress };
  } catch {
    return { done: false };
  }
}

async function getResults(jobId: string, apiKey: string, demo: boolean): Promise<unknown[]> {
  try {
    const base = demo ? DEMO_BASE : BASE;
    const res = await fetch(`${base}/job/${jobId}/results`, {
      headers: apiHeaders(apiKey),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.results || []);
  } catch {
    return [];
  }
}

function mapBusiness(b: Record<string, unknown>, location: string, keywords: string): Record<string, unknown> {
  const contact = b.contact as Record<string, unknown> | undefined;
  const allEmails = (contact?.all_emails as Array<{email: string; status: string}> | undefined) || [];
  const allPhones = (contact?.all_phones as Array<{number: string; type: string; carrier?: string}> | undefined) || [];
  const rep = b.reputation as Record<string, unknown> | undefined;
  const web = b.web as Record<string, unknown> | undefined;

  const bestEmail = (b.email as string) || allEmails[0]?.email || '';
  const bestPhone = (b.phone as string) || allPhones[0]?.number || '';
  const bestPhoneType = (b.phone_type as string) || allPhones[0]?.type || '';

  const socials = (web?.socials as string[] | undefined) || [];

  return {
    name: (b.name as string || '').slice(0, 80),
    website: (b.website as string) || '',
    owner: (b.owner as string) || '',
    email: bestEmail,
    phone: bestPhone,
    phone_type: bestPhoneType?.toUpperCase() === 'MOBILE' ? 'MOBILE' : bestPhoneType ? 'LANDLINE' : '',
    address: (b.address as string) || '',
    city: (b.city as string) || location,
    social: socials[0] || '',
    service: keywords,
    keywords,
    // Extra metadata
    rating: rep?.rating,
    reviews: rep?.reviews,
    gbp_url: b.gbp_url,
    google_cid: b.google_cid,
    category: b.category,
  };
}

export async function* scrapeLocalProspects(
  keywords: string,
  location: string,
  limit: number,
  apiKey: string
): AsyncGenerator<string> {
  const demo = !apiKey || apiKey === 'demo';
  const key = demo ? '' : apiKey;

  yield JSON.stringify({ status: true, msg: '📍 Buscando ubicación...' });

  const locationCode = await getLocationCode(location, key, demo);
  if (!locationCode) {
    yield JSON.stringify({ error: `No se encontró la ubicación: ${location}` });
    return;
  }

  yield JSON.stringify({ status: true, msg: '🔍 Iniciando búsqueda en Google Maps...' });

  const jobId = await startSearch(keywords, locationCode, key, demo);
  if (!jobId) {
    yield JSON.stringify({ error: 'No se pudo iniciar la búsqueda. Verifica tu API key y créditos.' });
    return;
  }

  // Poll up to 5 minutes
  let attempts = 0;
  while (attempts < 60) {
    await new Promise(r => setTimeout(r, 5000));
    const { done, progress } = await pollJob(jobId, key, demo);
    yield JSON.stringify({ status: true, msg: `⏳ Procesando... ${progress || ''}`.trim() });
    if (done) break;
    attempts++;
  }

  yield JSON.stringify({ status: true, msg: '📋 Obteniendo resultados...' });

  const businesses = await getResults(jobId, key, demo);
  const slice = businesses.slice(0, limit);

  for (const b of slice) {
    yield JSON.stringify(mapBusiness(b as Record<string, unknown>, location, keywords));
  }
}
