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
  // Soramame measured station values — OFF until Nagano Prefecture (station
  // operator) confirms republication; the Soramame API manual asks to inquire
  // for non-national stations. Data pipeline is ready (scripts/fetch-air-data.mjs).
  measuredAir: false,
  pollen: false, // Weathernews Pollen Robo — OFF until Weathernews confirms public-site use
  uv: true, // UV index card
  quakesPreview: true, // "Recent earthquakes" card on the dashboard
  emergencyContacts: true, // static emergency medical contacts card (no data feed)

  /* whole pages (also hidden from the nav) */
  earthquakesPage: true,
  alertsPage: true,
  busesPage: true, // city bus route/stop map (GTFS open data)
  sheltersPage: true, // evacuation shelters & AED map (GSI + city open data)
  medicalPage: true, // emergency medical contacts page (static, verified facts)
  safetyPage: true, // crime statistics from Nagano police open data (yearly)
  resourcesPage: true,
} as const;

export type FeatureKey = keyof typeof features;
