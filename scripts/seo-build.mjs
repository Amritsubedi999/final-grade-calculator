import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeRobotsTxt, makeSitemapXml, normalizeSiteUrl } from '../src/scripts/seo.mjs';

const outputDirectory = path.resolve('dist');
const siteUrl = normalizeSiteUrl(process.env.SITE_URL);

async function findHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findHtmlFiles(filePath);
    return entry.isFile() && entry.name.endsWith('.html') ? [filePath] : [];
  }));
  return nested.flat();
}

function extractAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2];
}

function isIndexable(html) {
  const robots = html.match(/<meta\b[^>]*\bname=["'](?:googlebot|robots)["'][^>]*>/gi) || [];
  return !robots.some((tag) => /noindex/i.test(extractAttribute(tag, 'content') || ''));
}

function isGoogleVerificationFile(html) {
  return /^google-site-verification:\s*[A-Za-z0-9_-]+\.html$/.test(html.trim());
}

const htmlFiles = await findHtmlFiles(outputDirectory);
const indexed = [];
const htmlByRoute = new Map(htmlFiles.map((filePath) => {
  const relative = path.relative(outputDirectory, filePath).split(path.sep).join('/');
  const route = relative === 'index.html' ? '/' : `/${relative.replace(/\/index\.html$/, '/').replace(/\.html$/, '')}`;
  return [route, filePath];
}));
for (const filePath of htmlFiles) {
  const html = await readFile(filePath, 'utf8');
  if (isGoogleVerificationFile(html)) continue;
  if (!isIndexable(html)) continue;
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const descriptionTags = html.match(/<meta\b[^>]*\bname=["']description["'][^>]*>/gi) || [];
  const description = descriptionTags.map((tag) => extractAttribute(tag, 'content')).find(Boolean);
  const canonicalTags = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi) || [];
  if (!title || !description) throw new Error(`Indexable page is missing a title or meta description: ${filePath}`);
  if (descriptionTags.length !== 1) throw new Error(`Expected exactly one meta description: ${filePath}`);
  if (!/<h1\b/i.test(html) || !/<main\b/i.test(html)) throw new Error(`Indexable page is missing a main landmark or H1: ${filePath}`);
  if (new Set([title, description]).size !== 2) throw new Error(`Title and description must be distinct: ${filePath}`);
  for (const link of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = extractAttribute(link[0], 'href');
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    if (href.startsWith('#')) {
      const id = decodeURIComponent(href.slice(1));
      if (id && !new RegExp(`\\bid=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(html)) {
        throw new Error(`Broken in-page link ${href} in ${filePath}`);
      }
      continue;
    }
    const linkBase = siteUrl || 'https://local.invalid';
    const url = new URL(href, linkBase);
    if (url.origin !== linkBase) continue;
    if (!url.pathname.startsWith('/')) continue;
    const route = url.pathname.endsWith('/') ? url.pathname : url.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
    if (!htmlByRoute.has(route)) throw new Error(`Broken internal link ${href} in ${filePath}`);
  }
  for (const image of html.matchAll(/<img\b[^>]*>/gi)) {
    if (extractAttribute(image[0], 'alt') === undefined) throw new Error(`Image is missing alt text: ${filePath}`);
  }
  for (const match of html.matchAll(/<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      JSON.parse(match[1]);
    } catch (error) {
      throw new Error(`Invalid JSON-LD in ${filePath}: ${error.message}`);
    }
  }
  if (!siteUrl) {
    indexed.push({ filePath, canonical: null, title, description });
    continue;
  }
  if (canonicalTags.length !== 1) throw new Error(`Expected exactly one canonical URL: ${filePath}`);
  const canonical = new URL(extractAttribute(canonicalTags[0], 'href'));
  if (canonical.origin !== siteUrl || canonical.search || canonical.hash) {
    throw new Error(`Canonical must be an absolute same-origin URL without query or fragment: ${filePath}`);
  }
  indexed.push({ filePath, canonical: canonical.href, title, description });
}

if (new Set(indexed.map((page) => page.title)).size !== indexed.length) {
  throw new Error('Duplicate titles found on indexable pages.');
}
if (new Set(indexed.map((page) => page.description)).size !== indexed.length) {
  throw new Error('Duplicate meta descriptions found on indexable pages.');
}
if (indexed.length === 0) throw new Error('No indexable HTML pages were generated.');

if (siteUrl) {
  const canonicalUrls = indexed.map((page) => page.canonical);
  if (new Set(canonicalUrls).size !== canonicalUrls.length) throw new Error('Duplicate canonical URLs found.');
  await Promise.all([
    writeFile(path.join(outputDirectory, 'sitemap.xml'), makeSitemapXml(canonicalUrls)),
    writeFile(path.join(outputDirectory, 'robots.txt'), makeRobotsTxt(siteUrl)),
  ]);
  console.log(`SEO check passed for ${indexed.length} indexable page(s). Generated sitemap.xml and robots.txt for ${siteUrl}.`);
} else {
  await Promise.all(['sitemap.xml', 'robots.txt'].map((file) => (
    rm(path.join(outputDirectory, file), { force: true })
  )));
  console.warn('SEO check passed, but SITE_URL is unset. Sitemap and robots.txt were not generated; set SITE_URL for production builds.');
}
