# Matsumoto Now · 松本なう

An unofficial, bilingual (English / 日本語) live dashboard for citizens of
Matsumoto City, Nagano: weather, warnings, air quality, pollen, earthquakes,
and city alerts — all from free public data sources, hosted for free on
GitHub Pages.

## How it works

- **Static site** built with [Astro](https://astro.build). No server, no cost.
- **Live data in the browser.** CORS-open APIs are fetched directly by the
  visitor's browser, so the dashboard is current to the minute:
  - JMA AMeDAS observations (Matsumoto station 48361) and warnings/advisories
    (Nagano 200000) — undocumented but long-stable `jma.go.jp/bosai` JSON
  - Open-Meteo forecast, UV, and modelled air quality (CC BY 4.0, free for
    non-commercial use)
  - Weathernews "Pollen Robo" open data (city code 20202, attribution required)
  - P2P地震情報 earthquake API (secondary use permitted)
- **Scheduled fetch for everything else.** Sources without CORS headers
  (Matsumoto City RSS feeds, Matsumoto Anshin-net) are pulled every 30 minutes
  by a GitHub Action (`.github/workflows/fetch-data.yml`) into
  `public/data/alerts.json` and committed, which redeploys the site.
- **i18n**: every page exists under `/en/` and `/ja/`; the root redirects by
  browser language. UI strings live in `src/i18n/ui.ts`. JMA codes are mapped
  to English in `src/lib/jma.ts`.

## Local development

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # production build in dist/
npm run fetch-data # populate public/data/alerts.json from the live city feeds
```

## Deploy to GitHub Pages

1. Create a GitHub repository (any name — the base path is derived
   automatically) and push this project to `main`.
2. In the repository: **Settings → Pages → Source: GitHub Actions**.
3. Push (or run the "Deploy to GitHub Pages" workflow manually). The site
   appears at `https://<username>.github.io/<repo>/`.
4. Optional — English translation of city alerts: create a free DeepL API
   account and add the key as a repository secret named `DEEPL_API_KEY`
   (**Settings → Secrets and variables → Actions**). Without it, alert titles
   are shown in Japanese on the English pages too.

The scheduled fetch workflow needs no setup; it starts running on schedule
once the repo is on GitHub. (GitHub may pause schedules on inactive forks —
re-enable under the Actions tab.)

## Data sources & terms

| Source | Used for | Terms |
|---|---|---|
| Japan Meteorological Agency | observations, warnings | attribution (出典: 気象庁); endpoints are undocumented and may change |
| Open-Meteo | forecast, UV, air quality | free non-commercial, CC BY 4.0, attribution |
| Weathernews Pollen Robo | pollen counts | attribution required; for a public site, confirm usage with Weathernews |
| P2P地震情報 | earthquakes | secondary use permitted; rate limits apply |
| Matsumoto City / 松本安心ネット | alerts, news | attribution (city terms, CC BY 4.0-aligned) |
| 国土地理院 (GSI) | map tiles | attribution |

**Disclaimer:** this is a volunteer community project, not affiliated with
Matsumoto City, JMA, or any data provider. Data may be delayed or wrong; in an
emergency follow official guidance (110 police / 119 fire & ambulance).

## Ideas for later

- Crime map from Nagano Prefectural Police per-incident open-data CSVs
  (neighborhood level, updated annually) — needs a build-time convert step.
- Evacuation shelters / AED map from the city's GIS open data (Shapefile →
  GeoJSON, CC BY 4.0).
- Bus route map from the city's GTFS feeds on gtfs-data.jp (CORS-open GeoJSON).
- Duty-doctor (休日当番医) daily scrape.
- Official air-quality station values via the Soramame API (needs the
  scheduled fetch, no CORS).
