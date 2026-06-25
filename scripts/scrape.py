#!/usr/bin/env python3
"""
Lead scraper using DuckDuckGo HTML (no JS required).
Reads JSON from stdin: {service, keywords, location, limit}
Outputs newline-delimited JSON leads to stdout.
"""
import sys
import json
import re
import time
from urllib.parse import urlparse, unquote

def extract_emails(text: str) -> list:
    pattern = r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'
    found = [e for e in re.findall(pattern, text) if not e.endswith(('.png','.jpg','.gif','.svg','.webp'))]
    return list(set(found))

def extract_phones(text: str) -> list:
    pattern = r'[\+]?[(]?[0-9]{2,4}[)]?[-\s.]?[0-9]{2,4}[-\s.]?[0-9]{3,4}[-\s.]?[0-9]{0,4}'
    return [p.strip() for p in re.findall(pattern, text) if len(re.sub(r'\D','',p)) >= 7]

def decode_ddg_url(href: str) -> str:
    if href.startswith('//duckduckgo.com/l/?uddg='):
        encoded = href.split('uddg=')[1].split('&')[0]
        return unquote(encoded)
    if href.startswith('http'):
        return href
    return ''

def scrape_leads(service: str, keywords: str, location: str, limit: int = 20):
    try:
        from scrapling import Fetcher
    except ImportError:
        print(json.dumps({"error": "scrapling not installed"}), flush=True)
        return

    fetcher = Fetcher(auto_match=False)

    # Add business-targeting suffix to avoid news/events/articles
    query = f"{keywords} {location} empresa contacto telefono".strip()
    search_url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"

    try:
        page = fetcher.get(search_url, stealthy_headers=True, timeout=15)
    except Exception as e:
        print(json.dumps({"error": f"Search failed: {e}"}), file=sys.stderr, flush=True)
        return

    results = page.css('.result')
    if not results:
        print(json.dumps({"error": "No results from search"}), file=sys.stderr, flush=True)
        return

    found = 0
    for r in results:
        if found >= limit:
            break

        try:
            # Title
            title_el = r.css('h2.result__title a, .result__a')
            title = title_el[0].text.strip() if title_el else ''

            # URL
            url_el = r.css('.result__url')
            raw_url = url_el[0].text.strip() if url_el else ''

            link_el = r.css('a.result__a, a[href*="uddg"]')
            href = link_el[0].attrib.get('href', '') if link_el else ''
            real_url = decode_ddg_url(href)
            if not real_url and raw_url:
                real_url = f"https://{raw_url}" if not raw_url.startswith('http') else raw_url

            # Skip news, government, events, aggregators
            skip_domains = [
                'tripadvisor', 'yelp', 'google', 'facebook', 'instagram', 'twitter',
                'wikipedia', 'youtube', 'gob.mx', 'gobierno', 'cartelera', 'cdmx.gob',
                'turismo.cdmx', 'conxion', 'lachispa', 'descubreen', 'revistaequipar',
                'designweek', 'oem.com.mx', 'cronica', 'milenio', 'excelsior', 'eluniversal',
                'infobae', 'expansion', 'forbes', 'entrepreneur', 'linkedin', 'pinterest',
                'tiktok', 'reddit', 'quora', 'amazon', 'mercadolibre'
            ]
            if not title or any(d in real_url.lower() for d in skip_domains):
                continue

            # Snippet for phone
            snippet_el = r.css('.result__snippet')
            snippet = snippet_el[0].text if snippet_el else ''

            phone = ''
            phones = extract_phones(snippet)
            if phones:
                phone = phones[0]

            lead = {
                "name": title,
                "website": real_url,
                "email": '',
                "phone": phone,
                "address": '',
                "city": location,
                "social": '',
                "service": service,
                "keywords": keywords
            }

            # Visit website to get email + phone
            if real_url and real_url.startswith('http'):
                try:
                    site_page = fetcher.get(real_url, stealthy_headers=True, timeout=8)
                    site_text = site_page.get_all_text(separator=' ')

                    emails = extract_emails(site_text)
                    if emails:
                        lead['email'] = emails[0]

                    if not phone:
                        site_phones = extract_phones(site_text)
                        if site_phones:
                            lead['phone'] = site_phones[0]

                    # Social links
                    socials = []
                    for a in site_page.css('a[href*="instagram.com"], a[href*="facebook.com"], a[href*="linkedin.com"]'):
                        s = a.attrib.get('href', '')
                        if s and 'sharer' not in s:
                            socials.append(s)
                    if socials:
                        lead['social'] = ', '.join(list(set(socials))[:2])
                except Exception:
                    pass

            print(json.dumps(lead), flush=True)
            found += 1
            time.sleep(0.3)

        except Exception:
            continue

if __name__ == '__main__':
    try:
        data = json.loads(sys.stdin.read())
        service = data.get('service', '')
        keywords = data.get('keywords', '')
        location = data.get('location', '')
        limit = int(data.get('limit', 20))
        scrape_leads(service, keywords, location, limit)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr, flush=True)
        sys.exit(1)
