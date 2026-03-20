// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://micmer-git.github.io',
  base: '/voglia-di-pizza',
  integrations: [sitemap()],
});
