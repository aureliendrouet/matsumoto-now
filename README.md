# Matsumoto Now · 松本なう

An unofficial live dashboard for citizens of Matsumoto City, Nagano, in
13 languages (English, 日本語, Français, Español, Português, Italiano, Deutsch,
Norsk, 中文, 한국어, Filipino, Tiếng Việt, ไทย): weather, warnings, air quality,
pollen, earthquakes, city alerts, crime statistics, city buses, evacuation
shelters & AEDs, emergency medical contacts and fire & rescue information —
all from free public data
sources, hosted for free on GitHub Pages.

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
  Slow-moving open data (police crime CSVs, GTFS bus feeds, shelter/AED
  designations) is refreshed monthly by `.github/workflows/fetch-monthly.yml`
  into `public/data/{crime,bus,shelters}.json`. The bus fetch also scrapes the
  city's bus page for each line's own timetable and fare PDF: every link there
  is labelled identically (`時刻表（R8.3.14～）`) with the line name in the
  `<h5>` above it, and the attachment IDs change at every timetable revision,
  so the mapping is re-derived monthly rather than hardcoded. Only the URLs are
  stored — the PDFs are linked, never copied. If the scrape fails or a line
  stops matching, `timetable` is `null` and the page links the city's index
  page for that line instead; the run logs `per-line timetables: n/34`.
- **i18n**: every page exists under each language slug (`/en/`, `/ja/`,
  `/fr/`, `/es/`, `/pt/`, `/it/`, `/de/`, `/no/`, `/zh/`, `/ko/`, `/tl/`,
  `/vi/`, `/th/`); the root redirects by browser language. Each language is
  one module in `src/i18n/locales/` holding the UI dictionary plus JMA
  warning, WMO weather-code, and compass labels — `npx tsx
  scripts/check-locales.mjs` verifies every locale has exactly the same keys.
  City-alert titles are machine-translated (DeepL) to English and French
  only; other languages show the English title. The Resources and About
  pages are curated in en/ja/fr and fall back to English elsewhere.

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
4. Optional — English/French translation of city alerts: create a free DeepL
   API account and add the key as a repository secret named `DEEPL_API_KEY`
   (**Settings → Secrets and variables → Actions**). Without it, alert titles
   are shown in Japanese on every non-Japanese page. (Only EN and FR are
   machine-translated, to preserve the DeepL free-tier quota; other languages
   reuse the English titles.)

The scheduled fetch workflow needs no setup; it starts running on schedule
once the repo is on GitHub. (GitHub may pause schedules on inactive forks —
re-enable under the Actions tab.)

## Page structure

The landing page (**"Now"**) is emergency-first: active JMA warnings, who to
call (119 fire & ambulance, 110 police, medical advice lines), and any
earthquake actually felt in Matsumoto or Nagano. Nothing else. Weather,
forecast, air quality and UV live on their own **weather page**, so the landing
page stays scannable when something is wrong.

Its earthquake card filters to locally-felt quakes on purpose: of the last 100
reports nationwide (about two days' worth) typically **none** are felt in
Matsumoto, so an unfiltered list fills the second-largest block with tremors
hundreds of km away. When nothing has been felt it says so in one line. The
full nationwide list stays on the earthquakes page.

Both pages share `src/lib/dashboard.ts` via `initWidgets()`, which renders only
the widgets present in the DOM — so a card moves between pages by moving its
markup, with no change to the renderer.

On the **buses page** the route chips are a selector, not links: picking a line
dims the other 33, zooms to its extent and shows that line's stops at any zoom
level (stop membership comes from `bus-times.json`, which is the only file that
links stops to routes), while a panel above the chips links that line's own
timetable and fare PDFs. The chips used to be 34 links to the same city page,
which is what made them feel broken. The map does the explaining because the
PDFs are Japanese-only — for the other 12 languages, "where does this bus go"
has to be answered visually.

The nav wraps rather than scrolls horizontally: with 11 destinations (longer
labels in German and French) a scrolling strip with a hidden scrollbar left
items unreachable on phones. Every destination is now one tap away at every
width — verified at 375 px in every language. Nav labels are Title Case in the
Latin-script locales; page headings stay sentence case.

## Feature toggles

Every dashboard card and secondary page can be switched on/off in
`src/features.ts` — set a flag to `false` and push. Disabled cards disappear
from the dashboard (and their APIs are no longer called); disabled pages are
not built and vanish from the navigation.

Currently `pollen` is **off** pending Weathernews' confirmation that
public-site use of the Pollen Robo open data is acceptable, and `fireLiveData`
is **off** pending 松本広域消防局's confirmation (see below) — the fire page
itself stays up, showing only what needs no permission.

Attribution is derived from the feature flags in three places, never hardcoded:
the per-card notes where the data appears, the table on the **About & Data**
page, and a short footer line naming only the providers whose licence requires
attribution wherever their data is shown (CC BY 4.0, or the Government Standard
Terms' 出典 requirement). P2P地震情報 permits secondary use without attribution,
so it appears in the About table only — hence the footer line ends with a link to
the full list rather than pretending to be one.

Gate a new source on the flag that actually **displays** it, not the flag that
builds its page: the fire bureau is credited under `fireLiveData`, not
`firePage`, because with the scraped feeds off the site only links to them. The
old hardcoded footer had drifted exactly this way — it credited Weathernews while
`pollen` was off, and omitted GSI, the police crime data and gtfs-data.jp.

## Data sources & terms

| Source | Used for | Terms |
|---|---|---|
| Japan Meteorological Agency | observations, warnings | attribution (出典: 気象庁); endpoints are undocumented and may change |
| Open-Meteo | forecast, UV, air quality | free non-commercial, CC BY 4.0, attribution |
| Weathernews Pollen Robo | pollen counts | attribution required; for a public site, confirm usage with Weathernews |
| P2P地震情報 | earthquakes | secondary use permitted; rate limits apply |
| Matsumoto City / 松本安心ネット | alerts, news | attribution (city terms, CC BY 4.0-aligned) |
| 長野県警察 犯罪オープンデータ | crime statistics | CC BY 4.0-compatible, attribution |
| 松本市 GTFS (gtfs-data.jp) | bus routes & stops | CC BY 4.0, attribution (松本市) |
| 松本市 バス時刻表ページ | per-line timetable & fare PDF links | city page, CC BY 4.0; only the URLs are stored, the PDFs are linked |
| 国土地理院 指定緊急避難場所データ | evacuation shelters | attribution (政府標準利用規約) |
| 松本市オープンデータ | AED locations | CC BY 4.0, attribution |
| 環境省 そらまめくん | measured air quality (disabled) | preliminary values; non-national stations: confirm reuse with the operator (長野県) |
| 松本広域消防局 | live fire reports, 119 dispatch counts, fire statistics (disabled) | **no published licence or terms** — ask the bureau before enabling `firePage` |
| 国土地理院 (GSI) | map tiles | attribution |

**Disclaimer:** this is a volunteer community project, not affiliated with
Matsumoto City, JMA, or any data provider. Data may be delayed or wrong; in an
emergency follow official guidance (110 police / 119 fire & ambulance).

## Ideas for later

- Live police incident feed (bears, suspicious persons, scams): the Raiporisu
  web map (map.police.nagano.dsvc.jp) exposes fresh public TSVs, but the
  Nagano Police terms prohibit republication without permission — ask
  生活安全企画課 first. The Safety page links to the official map instead.
- Duty-doctor (休日当番医) live schedule: the Matsumoto City Medical
  Association publishes a clean daily rotation at matsu-med.or.jp, but their
  terms prohibit reproduction without written permission — ask them first.
  (The medical page currently links out instead.)
- Stop-first bus view ("what leaves from *my* stop", or the ordered stop list
  of a line). `bus-times.json` aggregates departures per stop/route/service
  with no `stop_sequence`, so ordering by first departure interleaves services
  and produces a wrong sequence — it would need `scripts/fetch-bus-data.mjs` to
  carry the sequence through from `stop_times.txt`.
- Crime map (the police CSVs have neighborhood names but no coordinates —
  would need geocoding against MLIT 位置参照情報).
- Enable `measuredAir` once Nagano Prefecture confirms republication of the
  Soramame station values (pipeline is ready in `scripts/fetch-air-data.mjs`).
- Enable `firePage` once 松本広域消防局 confirms republication of their 災害発生状況 incident feed,
  指令件数 dispatch counters and 火災発生状況 statistics. Their site permits
  crawling (robots.txt) but publishes no open-data licence, so consent has to
  be asked for — draft inquiry at `Desktop/Test/matsumoto-fire-bureau-email.md`
  (outside the repo), contact form at m-kouiki119.jp or (0263)25-0119. Both
  pipelines are ready: `scripts/fetch-fire-data.mjs` (30 min) and
  `scripts/fetch-fire-stats.mjs` (monthly). No fire data is committed to
  `public/data/` while the flag is off, so nothing is republished early.
- No fire-station map: residents dial 119 rather than travel to a station, and
  the ~15 Matsumoto fires a year are too sparse — and too close to
  sensationalism — to map at 町丁目 precision. The fire page shows live state
  instead.
