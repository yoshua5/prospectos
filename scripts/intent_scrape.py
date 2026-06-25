#!/usr/bin/env python3
"""
Intent-based lead scraper.
Finds people actively asking for services on Reddit, Twitter/X, Facebook groups, Quora, forums, and general web.
Reads JSON from stdin: {keywords, location, platforms, limit}
Outputs newline-delimited JSON leads to stdout.
"""
import sys
import json
import time
import urllib.parse

INTENT_WORDS = [
    'busco', 'necesito', 'alguien', 'recomienda', 'recomiendan', 'quien me',
    'donde consigo', 'busca', 'cotizacion', 'cotización', 'precio', 'cuanto cuesta',
    'cuánto cuesta', 'conocen', 'referencia', 'recomendacion', 'recomendación',
    'ayuda con', 'contratar', 'looking for', 'need a', 'anyone know', 'recommend',
    'seeking', 'hiring', 'quiero contratar', 'busco alguien', 'quien sabe',
    'me pueden', 'pueden recomendar', 'alguna empresa', 'algun profesional',
    'me recomiendan', 'busco empresa', 'busco profesional', 'necesito ayuda',
    'busco servicio', 'quiero saber', 'alguien conoce', 'alguien sabe',
    'donde', 'dónde', 'cual', 'cuál', 'cómo', 'como puedo', 'hay algun',
    'hay algún', 'saben de', 'tienen', 'opinion', 'opinión', 'sugerencia',
    'consejo', 'donde encuentro', 'dónde encuentro', 'donde hay', 'dónde hay',
    'vale la pena', 'es bueno', 'es buena', 'alguno', 'alguna', 'me ayudan',
    'quien conoce', 'quién conoce', 'me dicen', 'me pueden decir',
    'alguien ha', 'han probado', 'experiencia con', 'what is', 'where can',
    'how do', 'can anyone', 'does anyone', 'looking', 'wanted', 'help with',
]

FORUM_DOMAINS = [
    'forocoches.com', 'taringa.net', 'merca2.es', 'answers.yahoo.com',
    'forosperu.net', 'foro.univision.com', 'city-data.com', 'elrincondelsofa.com',
    'hobbyconsolas.com', 'mediavida.com', 'htcmania.com', 'xatakamovil.com',
    'comunidad.ieb.es', 'forumlibre.com', 'todoexpertos.com',
]

SKIP_DOMAINS = [
    'facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com',
    'youtube.com', 'linkedin.com', 'pinterest.com', 'reddit.com',
    'quora.com', 'wikipedia.org', 'amazon.com', 'ebay.com',
]


def has_intent(text: str) -> bool:
    if '?' in text or '¿' in text:
        return True
    t = text.lower()
    return any(w in t for w in INTENT_WORDS)


def decode_ddg_url(href: str) -> str:
    if 'uddg=' in href:
        encoded = href.split('uddg=')[1].split('&')[0]
        return urllib.parse.unquote(encoded)
    if href.startswith('http'):
        return href
    return ''


def scrape_reddit(fetcher, keywords: str, location: str, limit: int) -> int:
    """Scrape old.reddit.com/search HTML."""
    query = f"{keywords} {location}".strip()
    encoded = urllib.parse.quote(query)
    url = f"https://old.reddit.com/search?q={encoded}&restrict_sr=false&sort=new&t=all"

    try:
        page = fetcher.get(url, stealthy_headers=True, timeout=20)
    except Exception as e:
        print(json.dumps({"error": f"Reddit: {e}"}), file=sys.stderr, flush=True)
        return 0

    posts = page.css('.search-result-link, .search-result')
    all_leads = []
    intent_leads = []

    for post in posts:
        try:
            title_el = post.css('a.search-result-link, .search-title a, h3 a')
            title = title_el[0].text.strip() if title_el else ''
            post_href = title_el[0].attrib.get('href', '') if title_el else ''
            if post_href and not post_href.startswith('http'):
                post_href = 'https://www.reddit.com' + post_href

            desc_el = post.css('.search-result-body, .usertext-body')
            desc = desc_el[0].text.strip()[:150] if desc_el else ''

            meta_el = post.css('.search-result-meta, .tagline')
            meta = meta_el[0].text.strip() if meta_el else ''

            if not title and not post_href:
                continue

            excerpt = title
            if desc:
                excerpt += ' — ' + desc

            lead = {
                "name": title[:80] if title else 'Reddit post',
                "website": post_href,
                "email": "", "phone": "",
                "address": excerpt[:220],
                "city": location,
                "social": post_href,
                "service": "Reddit",
                "keywords": keywords,
                "platform": "Reddit",
                "platform_meta": meta[:40] if meta else 'reddit',
            }
            all_leads.append(lead)
            if has_intent(f"{title} {desc}"):
                intent_leads.append(lead)
        except Exception:
            continue

    results = intent_leads if intent_leads else all_leads
    emitted = 0
    for lead in results[:limit]:
        print(json.dumps(lead), flush=True)
        emitted += 1
    return emitted


def _ddg_search(fetcher, query: str, timeout: int = 15):
    """Single DDG HTML search, returns list of (title, snippet, url)."""
    search_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
    try:
        page = fetcher.get(search_url, stealthy_headers=True, timeout=timeout)
    except Exception:
        return []

    items = []
    for r in page.css('.result'):
        try:
            title_el = r.css('h2.result__title a, .result__a')
            title = title_el[0].text.strip() if title_el else ''

            snippet_el = r.css('.result__snippet')
            snippet = snippet_el[0].text.strip() if snippet_el else ''

            link_el = r.css('a.result__a, a[href*="uddg"]')
            href = link_el[0].attrib.get('href', '') if link_el else ''
            real_url = decode_ddg_url(href)

            if not real_url or not real_url.startswith('http'):
                continue
            items.append((title, snippet, real_url))
        except Exception:
            continue
    return items


def scrape_platform_ddg(fetcher, keywords: str, location: str, platform_name: str,
                         domain_filter: str, search_hint: str, limit: int) -> int:
    """DDG search filtered to a specific domain, with 2 query variants merged."""
    queries = [
        f'{keywords} {location} {search_hint} busco OR necesito OR donde',
        f'{keywords} {location} {search_hint} recomendacion OR contratar',
    ]

    seen_urls = set()
    all_leads = []
    intent_leads = []

    for query in queries:
        for title, snippet, real_url in _ddg_search(fetcher, query):
            url_lower = real_url.lower()
            if domain_filter not in url_lower:
                continue
            if any(skip in url_lower for skip in ['/login', '/signup', 'login?', 'signup?']):
                continue
            if real_url in seen_urls:
                continue
            seen_urls.add(real_url)

            lead = {
                "name": title[:80] if title else platform_name,
                "website": real_url,
                "email": "", "phone": "",
                "address": (snippet or title)[:220],
                "city": location,
                "social": real_url,
                "service": platform_name,
                "keywords": keywords,
                "platform": platform_name,
                "platform_meta": domain_filter,
            }
            all_leads.append(lead)
            if has_intent(f"{title} {snippet}"):
                intent_leads.append(lead)
        time.sleep(0.5)

    results = intent_leads if intent_leads else all_leads
    emitted = 0
    for lead in results[:limit]:
        print(json.dumps(lead), flush=True)
        emitted += 1
    return emitted


def scrape_foros_ddg(fetcher, keywords: str, location: str, limit: int) -> int:
    """DDG search accepting results from known Spanish/general forums."""
    queries = [
        f'{keywords} {location} foro OR comunidad busco OR necesito OR recomendacion',
        f'{keywords} {location} foro OR ayuda OR opinion',
    ]

    seen_urls = set()
    all_leads = []
    intent_leads = []

    for query in queries:
        for title, snippet, real_url in _ddg_search(fetcher, query):
            url_lower = real_url.lower()
            if not any(d in url_lower for d in FORUM_DOMAINS):
                continue
            if real_url in seen_urls:
                continue
            seen_urls.add(real_url)

            lead = {
                "name": title[:80] if title else 'Foro post',
                "website": real_url,
                "email": "", "phone": "",
                "address": (snippet or title)[:220],
                "city": location,
                "social": real_url,
                "service": "Foros",
                "keywords": keywords,
                "platform": "Foros",
                "platform_meta": urllib.parse.urlparse(real_url).netloc,
            }
            all_leads.append(lead)
            if has_intent(f"{title} {snippet}"):
                intent_leads.append(lead)
        time.sleep(0.5)

    results = intent_leads if intent_leads else all_leads
    emitted = 0
    for lead in results[:limit]:
        print(json.dumps(lead), flush=True)
        emitted += 1
    return emitted


def scrape_web_ddg(fetcher, keywords: str, location: str, limit: int) -> int:
    """General DDG search — no domain filter, intent words in query."""
    queries = [
        f'{keywords} {location} busco OR necesito OR recomiendan OR donde contratar',
        f'{keywords} {location} quien recomienda OR alguien sabe OR me pueden ayudar',
    ]

    seen_urls = set()
    all_leads = []
    intent_leads = []

    for query in queries:
        for title, snippet, real_url in _ddg_search(fetcher, query):
            url_lower = real_url.lower()
            # Skip known social/noise domains
            if any(d in url_lower for d in SKIP_DOMAINS):
                continue
            if any(skip in url_lower for skip in ['/login', '/signup']):
                continue
            if real_url in seen_urls:
                continue
            seen_urls.add(real_url)

            domain = urllib.parse.urlparse(real_url).netloc

            lead = {
                "name": title[:80] if title else domain,
                "website": real_url,
                "email": "", "phone": "",
                "address": (snippet or title)[:220],
                "city": location,
                "social": real_url,
                "service": "Web general",
                "keywords": keywords,
                "platform": "Web general",
                "platform_meta": domain,
            }
            all_leads.append(lead)
            if has_intent(f"{title} {snippet}"):
                intent_leads.append(lead)
        time.sleep(0.5)

    results = intent_leads if intent_leads else all_leads
    emitted = 0
    for lead in results[:limit]:
        print(json.dumps(lead), flush=True)
        emitted += 1
    return emitted


def scrape_intent(keywords: str, location: str, platforms: list, limit: int):
    try:
        from scrapling import Fetcher
        fetcher = Fetcher(auto_match=False)
    except ImportError:
        print(json.dumps({"error": "scrapling not installed"}), file=sys.stderr, flush=True)
        return

    platform_config = {
        'reddit':   ('Reddit',   'reddit.com',          'reddit'),
        'twitter':  ('Twitter/X','twitter.com',         'twitter OR X'),
        'facebook': ('Facebook', 'facebook.com/groups', 'facebook grupos'),
        'quora':    ('Quora',    'quora.com',            'quora'),
    }

    emitted = 0

    for platform in platforms:
        if emitted >= limit:
            break
        remaining = limit - emitted

        if platform == 'reddit':
            emitted += scrape_reddit(fetcher, keywords, location, remaining)
        elif platform == 'foros':
            emitted += scrape_foros_ddg(fetcher, keywords, location, remaining)
        elif platform == 'web':
            emitted += scrape_web_ddg(fetcher, keywords, location, remaining)
        elif platform in platform_config:
            name, domain, hint = platform_config[platform]
            emitted += scrape_platform_ddg(fetcher, keywords, location, name, domain, hint, remaining)

        time.sleep(0.8)


if __name__ == '__main__':
    try:
        data = json.loads(sys.stdin.read())
        keywords = data.get('keywords', '')
        location = data.get('location', '')
        platforms = data.get('platforms', ['reddit', 'twitter', 'facebook', 'quora', 'foros', 'web'])
        limit = int(data.get('limit', 20))
        scrape_intent(keywords, location, platforms, limit)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr, flush=True)
        sys.exit(1)
