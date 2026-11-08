import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRobotsTxt, makeSitemapXml, normalizeSiteUrl } from '../src/scripts/seo.mjs';

test('normalizes a public site URL to its origin', () => {
  assert.equal(normalizeSiteUrl('https://grades.example/'), 'https://grades.example');
});

test('rejects invalid public site URL values', () => {
  assert.throws(() => normalizeSiteUrl('ftp://grades.example'), /HTTP or HTTPS/);
  assert.throws(() => normalizeSiteUrl('https://grades.example/path'), /origin/);
});

test('robots.txt allows crawling and references the absolute sitemap URL', () => {
  assert.equal(
    makeRobotsTxt('https://grades.example'),
    'User-agent: *\nAllow: /\nSitemap: https://grades.example/sitemap.xml\n',
  );
});

test('sitemap XML escapes URL characters and removes duplicate locations', () => {
  const xml = makeSitemapXml([
    'https://grades.example/',
    'https://grades.example/?a=1&b=2',
    'https://grades.example/',
  ]);
  assert.equal((xml.match(/<url>/g) || []).length, 2);
  assert.match(xml, /https:\/\/grades\.example\/\?a=1&amp;b=2/);
});
