/** Open-Meteo clients — Matsumoto city center. Non-commercial use, CC BY 4.0 attribution. */

const LAT = 36.238;
const LON = 137.972;

export interface Forecast {
  current: {
    time: Date;
    temp: number;
    humidity: number;
    weatherCode: number;
    windSpeed: number;
  };
  hourly: {
    time: Date;
    temp: number;
    pop: number;
    precip: number;
    uv: number;
    weatherCode: number;
  }[];
  daily: {
    date: Date;
    weatherCode: number;
    tMax: number;
    tMin: number;
    popMax: number;
    uvMax: number;
  }[];
}

export async function fetchForecast(): Promise<Forecast> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    timezone: 'Asia/Tokyo',
    current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,precipitation_probability,precipitation,uv_index,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max',
    forecast_days: '7',
    wind_speed_unit: 'ms',
  }).toString();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const j = await res.json();

  const hourly = (j.hourly.time as string[]).map((t: string, i: number) => ({
    time: new Date(`${t}:00+09:00`),
    temp: j.hourly.temperature_2m[i] as number,
    pop: (j.hourly.precipitation_probability?.[i] ?? 0) as number,
    precip: (j.hourly.precipitation?.[i] ?? 0) as number,
    uv: (j.hourly.uv_index?.[i] ?? 0) as number,
    weatherCode: j.hourly.weather_code[i] as number,
  }));

  const daily = (j.daily.time as string[]).map((t: string, i: number) => ({
    date: new Date(`${t}T12:00:00+09:00`),
    weatherCode: j.daily.weather_code[i] as number,
    tMax: j.daily.temperature_2m_max[i] as number,
    tMin: j.daily.temperature_2m_min[i] as number,
    popMax: (j.daily.precipitation_probability_max?.[i] ?? 0) as number,
    uvMax: (j.daily.uv_index_max?.[i] ?? 0) as number,
  }));

  return {
    current: {
      time: new Date(j.current.time + ':00+09:00'),
      temp: j.current.temperature_2m,
      humidity: j.current.relative_humidity_2m,
      weatherCode: j.current.weather_code,
      windSpeed: j.current.wind_speed_10m,
    },
    hourly,
    daily,
  };
}

export interface AirQuality {
  current: {
    time: Date;
    /** US EPA air quality index, computed by Open-Meteo from all pollutants */
    aqi: number | null;
    pm25: number | null;
    pm10: number | null;
    o3: number | null;
    no2: number | null;
  };
  /** last 48 h, one entry per hour, aligned across every series */
  history: {
    time: Date;
    aqi: number | null;
    pm25: number | null;
    pm10: number | null;
    o3: number | null;
    no2: number | null;
  }[];
}

export async function fetchAirQuality(): Promise<AirQuality> {
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.search = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    timezone: 'Asia/Tokyo',
    current: 'us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide',
    hourly: 'us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide',
    past_days: '2',
    forecast_days: '1',
  }).toString();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`air-quality ${res.status}`);
  const j = await res.json();

  const now = Date.now();
  const num = (arr: unknown, i: number): number | null =>
    (Array.isArray(arr) ? (arr[i] as number | null) : null) ?? null;
  const history = (j.hourly.time as string[])
    .map((t: string, i: number) => ({
      time: new Date(`${t}:00+09:00`),
      aqi: num(j.hourly.us_aqi, i),
      pm25: num(j.hourly.pm2_5, i),
      pm10: num(j.hourly.pm10, i),
      o3: num(j.hourly.ozone, i),
      no2: num(j.hourly.nitrogen_dioxide, i),
    }))
    .filter((p) => p.time.getTime() <= now);

  return {
    current: {
      time: new Date(j.current.time + ':00+09:00'),
      aqi: j.current.us_aqi ?? null,
      pm25: j.current.pm2_5 ?? null,
      pm10: j.current.pm10 ?? null,
      o3: j.current.ozone ?? null,
      no2: j.current.nitrogen_dioxide ?? null,
    },
    history,
  };
}

/** Simple PM2.5 banding, informed by the Japanese daily standard (35 µg/m³). */
export function pm25Level(v: number): 'good' | 'moderate' | 'elevated' | 'high' {
  if (v <= 15) return 'good';
  if (v <= 35) return 'moderate';
  if (v <= 70) return 'elevated';
  return 'high';
}

/* UV banding lives in scales.ts now, with the colours it shares with the
   air-quality charts. */
