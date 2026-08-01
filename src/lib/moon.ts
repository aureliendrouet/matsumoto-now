/** Moon phase and rise/set for Matsumoto — computed, not fetched.
 *
 *  No API provides this for free with a licence we could rely on, and none is
 *  needed: the moon's position is arithmetic. The formulae are the standard
 *  low-precision ones from Meeus, *Astronomical Algorithms* (ch. 47 & 15),
 *  which are good to roughly a minute for rise/set at this latitude — far
 *  beyond what a "when does the moon rise" card needs.
 *
 *  Everything here is pure: no network, no licence, no attribution. */

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
/** Julian date of the 2000-01-01 12:00 TT epoch, as a Unix ms offset. */
const J2000 = 946728000000;

const MATSUMOTO = { lat: 36.238, lon: 137.972 };

/** days since J2000 */
const days = (d: Date): number => (d.getTime() - J2000) / DAY_MS;

interface Equatorial {
  ra: number; // right ascension, radians
  dec: number; // declination, radians
  dist: number; // km
  lon: number; // ecliptic longitude, radians
}

/** Geocentric position of the moon (Meeus ch. 47, principal terms only). */
function moonPosition(d: number): Equatorial {
  const L = (218.316 + 13.176396 * d) * RAD; // mean longitude
  const M = (134.963 + 13.064993 * d) * RAD; // mean anomaly
  const F = (93.272 + 13.22935 * d) * RAD; // argument of latitude

  const lon = L + 6.289 * RAD * Math.sin(M);
  const lat = 5.128 * RAD * Math.sin(F);
  const dist = 385001 - 20905 * Math.cos(M);

  // ecliptic → equatorial
  const e = 23.4397 * RAD;
  const ra = Math.atan2(
    Math.sin(lon) * Math.cos(e) - Math.tan(lat) * Math.sin(e),
    Math.cos(lon),
  );
  const dec = Math.asin(
    Math.sin(lat) * Math.cos(e) + Math.cos(lat) * Math.sin(e) * Math.sin(lon),
  );
  return { ra, dec, dist, lon };
}

function sunPosition(d: number): { ra: number; dec: number; lon: number } {
  const M = (357.5291 + 0.98560028 * d) * RAD;
  const C = (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * RAD;
  const P = 102.9372 * RAD;
  const lon = M + C + P + Math.PI;
  const e = 23.4397 * RAD;
  return {
    ra: Math.atan2(Math.sin(lon) * Math.cos(e), Math.cos(lon)),
    dec: Math.asin(Math.sin(e) * Math.sin(lon)),
    lon,
  };
}

export type PhaseName =
  | 'new'
  | 'waxingCrescent'
  | 'firstQuarter'
  | 'waxingGibbous'
  | 'full'
  | 'waningGibbous'
  | 'lastQuarter'
  | 'waningCrescent';

export interface MoonInfo {
  /** 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter */
  phase: number;
  /** lit fraction of the disc, 0–1 */
  illumination: number;
  name: PhaseName;
  /** true while the moon is growing — the lit limb is on the west side */
  waxing: boolean;
  rise: Date | null;
  set: Date | null;
  /** next new and full moon, as instants */
  nextNew: Date;
  nextFull: Date;
}

/** Illuminated fraction and phase.
 *
 *  `phase` is the elongation — how far the moon has pulled ahead of the sun in
 *  ecliptic longitude — scaled to 0 → 1: 0 new, 0.25 first quarter, 0.5 full,
 *  0.75 last quarter. Elongation is used rather than the bright-limb position
 *  angle because it increases smoothly through the whole lunation. The angle
 *  formulation flips sign exactly at new and full moon, which leaves the value
 *  correct but non-monotonic, and a search for "the next new moon" then trips
 *  over the discontinuity at full moon and answers with the wrong date.
 *
 *  The illuminated fraction is the geometric one (Meeus ch. 48), which is what
 *  the eye actually sees. */
function illuminationAt(d: number): { phase: number; illumination: number } {
  const s = sunPosition(d);
  const m = moonPosition(d);
  const elong = m.lon - s.lon;
  const phase = ((elong / (2 * Math.PI)) % 1 + 1) % 1;
  return { phase, illumination: (1 - Math.cos(elong)) / 2 };
}

function phaseName(phase: number, illumination: number): PhaseName {
  // The named phases are instants, so give each a small window and let the
  // crescent/gibbous names cover the rest — otherwise "full moon" would show
  // for a fraction of a second and never in practice.
  if (illumination < 0.02) return 'new';
  if (illumination > 0.98) return 'full';
  const near = (target: number) => Math.abs(((phase - target + 1.5) % 1) - 0.5) < 0.015;
  if (near(0.25)) return 'firstQuarter';
  if (near(0.75)) return 'lastQuarter';
  if (phase < 0.25) return 'waxingCrescent';
  if (phase < 0.5) return 'waxingGibbous';
  if (phase < 0.75) return 'waningGibbous';
  return 'waningCrescent';
}

/** Altitude of the moon above the horizon, in radians. */
function altitude(date: Date, lat: number, lon: number): number {
  const d = days(date);
  const m = moonPosition(d);
  const lst = (280.16 + 360.9856235 * d) * RAD + lon * RAD; // local sidereal time
  const H = lst - m.ra;
  const phi = lat * RAD;
  return Math.asin(
    Math.sin(phi) * Math.sin(m.dec) + Math.cos(phi) * Math.cos(m.dec) * Math.cos(H),
  );
}

/** Scan the JST day in 10-minute steps for horizon crossings. Simple, exact
 *  enough (±5 min), and immune to the edge cases that trip closed-form
 *  solutions: days with no rise at all, or two of them. */
function riseSet(dayStartUtc: Date): { rise: Date | null; set: Date | null } {
  const STEP = 10 * 60 * 1000;
  // the moon rises ~50 min later each day, so a 25-hour window never misses one
  const steps = Math.round((25 * 3600 * 1000) / STEP);
  let rise: Date | null = null;
  let set: Date | null = null;
  let prev = altitude(dayStartUtc, MATSUMOTO.lat, MATSUMOTO.lon);
  for (let i = 1; i <= steps; i++) {
    const at = new Date(dayStartUtc.getTime() + i * STEP);
    const alt = altitude(at, MATSUMOTO.lat, MATSUMOTO.lon);
    // -0.008 rad ≈ -0.45°, the standard refraction + semidiameter allowance
    if (prev < -0.008 && alt >= -0.008 && !rise) rise = at;
    if (prev >= -0.008 && alt < -0.008 && !set) set = at;
    prev = alt;
  }
  return { rise, set };
}

/** Next instant at which the phase reaches `target` (0 = new, 0.5 = full).
 *
 *  Hourly scan for the crossing, then bisection to the minute. New moon is the
 *  wrap from just-under-1 back to 0, so it is detected as a drop rather than a
 *  rise — the one case a naïve "prev < target <= now" test gets wrong. */
function nextPhase(from: Date, target: number): Date {
  const SYNODIC = 29.530588853;
  const phaseAt = (ms: number) => illuminationAt(days(new Date(ms))).phase;
  // New moon is the wrap from just under 1 back to 0, so it shows up as a large
  // drop rather than a rise; requiring a big jump keeps rounding noise out.
  const crossed = (a: number, b: number) =>
    target === 0 ? a - b > 0.5 : a < target && b >= target;

  const t0 = from.getTime();
  let prevMs = t0;
  let prev = phaseAt(t0);
  for (let i = 1; i <= Math.ceil(SYNODIC * 24) + 2; i++) {
    const at = t0 + i * 3600 * 1000;
    const p = phaseAt(at);
    if (crossed(prev, p)) {
      let lo = prevMs;
      let hi = at;
      while (hi - lo > 60 * 1000) {
        const mid = (lo + hi) / 2;
        if (crossed(phaseAt(lo), phaseAt(mid))) hi = mid;
        else lo = mid;
      }
      return new Date(Math.round(hi / 60000) * 60000);
    }
    prevMs = at;
    prev = p;
  }
  return new Date(t0 + SYNODIC * DAY_MS);
}

/** Everything the moon card needs, for the JST day containing `now`. */
export function moonInfo(now = new Date()): MoonInfo {
  const d = days(now);
  const { phase, illumination } = illuminationAt(d);
  // start of the current day in JST, expressed as a UTC instant
  const jstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  const dayStart = new Date(
    Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate()) - 9 * 3600 * 1000,
  );
  const { rise, set } = riseSet(dayStart);
  return {
    phase,
    illumination,
    name: phaseName(phase, illumination),
    waxing: phase < 0.5,
    rise,
    set,
    nextNew: nextPhase(now, 0),
    nextFull: nextPhase(now, 0.5),
  };
}

/** SVG path for the lit part of the disc: a half-circle limb plus the elliptical
 *  terminator — the standard two-arc construction, exact at every phase.
 *
 *  Northern-hemisphere orientation, so a waxing moon is lit on the right.
 *  The terminator's half-width is |cos| of the phase angle: zero at the
 *  quarters (a straight edge) and the full radius at new and full moon. Its
 *  sweep flips between crescent and gibbous — the bulge curves into the lit
 *  side for a crescent and away from it for a gibbous moon, and getting this
 *  wrong silently draws every gibbous phase as a crescent. */
export function moonDiscPath(phase: number, r: number): string {
  const sweep = phase < 0.5 ? 1 : 0;
  const k = Math.cos(2 * Math.PI * phase);
  const rx = Math.abs(k) * r;
  // For a crescent the terminator arc doubles back over the limb, cancelling
  // most of the half-disc; for a gibbous moon it completes it. Swap these and
  // the whole cycle renders inside-out — new moon as a full disc.
  const inner = k > 0 ? 1 - sweep : sweep;
  return `M0,${-r} A${r},${r} 0 0 ${sweep} 0,${r} A${rx},${r} 0 0 ${inner} 0,${-r} Z`;
}
