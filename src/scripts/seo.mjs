export function normalizeSiteUrl(value) {
  if (!value) return undefined;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('SITE_URL must use HTTP or HTTPS.');
  }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new TypeError('SITE_URL must be an origin without a path, query, or credentials.');
  }
  return url.origin;
}

export function makeRobotsTxt(siteUrl) {
  const site = normalizeSiteUrl(siteUrl);
  if (!site) throw new TypeError('A public SITE_URL is required to generate robots.txt.');
  return `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`;
}

export function makeSitemapXml(urls) {
  const entries = [...new Set(urls)].map((url) => {
    const parsed = new URL(url);
    return `  <url><loc>${escapeXml(parsed.href)}</loc></url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
