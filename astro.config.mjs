import { defineConfig } from 'astro/config';
import { DEFAULT_SITE_URL, normalizeSiteUrl } from './src/scripts/seo.mjs';

export default defineConfig({
  site: normalizeSiteUrl(process.env.SITE_URL || DEFAULT_SITE_URL),
  output: 'static',
});
