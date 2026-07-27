import type { APIRoute } from 'astro';

// Built from SITE_URL/BASE_PATH like the rest of the site (see astro.config.mjs),
// so this stays correct on any fork without editing.
export const GET: APIRoute = () => {
  const site = import.meta.env.SITE || 'http://localhost:4321';
  const base = import.meta.env.BASE_URL;
  const sitemapUrl = new URL(`${base}sitemap-index.xml`, site).toString();

  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`, {
    headers: { 'Content-Type': 'text/plain' },
  });
};
