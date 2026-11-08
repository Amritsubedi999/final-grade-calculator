import { defineConfig } from 'astro/config';
import { normalizeSiteUrl } from './src/scripts/seo.mjs';

export default defineConfig({
  site: normalizeSiteUrl(process.env.SITE_URL),
  output: 'static',
});
