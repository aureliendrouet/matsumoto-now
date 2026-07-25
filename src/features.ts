/** Feature toggles.
 *
 *  Set a flag to `false` and rebuild (push) to remove a feature from the site:
 *  dashboard cards disappear, their data is no longer fetched, and disabled
 *  pages are not built at all (their nav links vanish too).
 *
 *  Example: if Weathernews declines public use of the pollen data, set
 *  `pollen: false` and push — nothing else to change.
 */
export const features = {
  /* dashboard cards */
  warnings: true, // JMA warnings & advisories banner
  currentConditions: true, // "Right now" card (AMeDAS)
  hourlyTemperature: true, // 24 h temperature chart
  weekOutlook: true, // 7-day strip
  precipitationChart: true, // 24 h precipitation-probability chart
  airQuality: true, // Open-Meteo modelled air quality
  pollen: false, // Weathernews Pollen Robo — OFF until Weathernews confirms public-site use
  uv: true, // UV index card
  quakesPreview: true, // "Recent earthquakes" card on the dashboard

  /* whole pages (also hidden from the nav) */
  earthquakesPage: true,
  alertsPage: true,
  resourcesPage: true,
} as const;

export type FeatureKey = keyof typeof features;
