/**
 * Datum Transform Engine: Minna Datum (Clarke 1880) ↔ WGS84
 *
 * Pipeline (Minna → WGS84):
 *   1. Geodetic (φ,λ,h) [Minna/Clarke1880] → ECEF (X,Y,Z)
 *   2. Helmert 3-parameter shift (Nigeria official)
 *   3. ECEF [WGS84] → Geodetic (φ,λ,h)
 *   4. Geodetic [WGS84] → UTM (auto-zone for Nigeria)
 *
 * Reverse (WGS84 → Minna): inverted Helmert, then to Minna grid via UTM-equivalent.
 *
 * References:
 *   - Nigerian Helmert parameters: ΔX=−92m, ΔY=−93m, ΔZ=+122m (NiMet/OSgb)
 *   - Clarke 1880: a=6378249.145, 1/f=293.465
 *   - WGS84:       a=6378137.000, 1/f=298.257223563
 */

// ─── Ellipsoid Parameters ─────────────────────────────────────────────────────

export interface Ellipsoid {
  name: string;
  a: number;   // semi-major axis (m)
  b: number;   // semi-minor axis (m)
  e2: number;  // first eccentricity squared
}

function makeEllipsoid(name: string, a: number, invF: number): Ellipsoid {
  const f = 1 / invF;
  const b = a * (1 - f);
  const e2 = 2 * f - f * f;
  return { name, a, b, e2 };
}

export const CLARKE_1880  = makeEllipsoid('Clarke 1880 (IGN)', 6378249.145, 293.465);
export const WGS84_ELLIP  = makeEllipsoid('WGS84 / GRS80',    6378137.000, 298.257223563);

// ─── Nigeria Helmert Shift (Minna → WGS84) ────────────────────────────────────

export const NIGERIA_SHIFT_TO_WGS84 = { dX: -92, dY: -93, dZ: 122 };
export const NIGERIA_SHIFT_TO_MINNA = { dX:  92, dY:  93, dZ: -122 };

// ─── Geodetic ↔ ECEF ──────────────────────────────────────────────────────────

export interface Geodetic {
  latDeg: number;   // φ in decimal degrees (+N, −S)
  lonDeg: number;   // λ in decimal degrees (+E, −W)
  height: number;   // ellipsoidal height in metres
}

export interface ECEF {
  X: number;
  Y: number;
  Z: number;
}

/** Prime vertical radius of curvature N(φ) */
function primeVertical(a: number, e2: number, sinLat: number): number {
  return a / Math.sqrt(1 - e2 * sinLat * sinLat);
}

export function geodeticToECEF(g: Geodetic, ell: Ellipsoid): ECEF {
  const { a, e2 } = ell;
  const lat = (g.latDeg * Math.PI) / 180;
  const lon = (g.lonDeg * Math.PI) / 180;
  const h = g.height;

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const N = primeVertical(a, e2, sinLat);

  return {
    X: (N + h) * cosLat * Math.cos(lon),
    Y: (N + h) * cosLat * Math.sin(lon),
    Z: (N * (1 - e2) + h) * sinLat
  };
}

export function ecefToGeodetic(ecef: ECEF, ell: Ellipsoid): Geodetic {
  const { a, b, e2 } = ell;
  const { X, Y, Z } = ecef;
  const e2b = (a * a - b * b) / (b * b); // second eccentricity sq

  const p = Math.sqrt(X * X + Y * Y);
  const theta = Math.atan2(Z * a, p * b);

  const lat = Math.atan2(
    Z + e2b * b * Math.pow(Math.sin(theta), 3),
    p - e2 * a * Math.pow(Math.cos(theta), 3)
  );
  const lon = Math.atan2(Y, X);
  const sinLat = Math.sin(lat);
  const N = primeVertical(a, e2, sinLat);
  const h = p / Math.cos(lat) - N;

  return {
    latDeg: (lat * 180) / Math.PI,
    lonDeg: (lon * 180) / Math.PI,
    height: h
  };
}

// ─── Helmert 3-Parameter Shift ─────────────────────────────────────────────────

function helmertShift(
  ecef: ECEF,
  shift: { dX: number; dY: number; dZ: number }
): ECEF {
  return {
    X: ecef.X + shift.dX,
    Y: ecef.Y + shift.dY,
    Z: ecef.Z + shift.dZ
  };
}

// ─── UTM Projection (WGS84) ────────────────────────────────────────────────────

export interface UTMCoord {
  easting: number;
  northing: number;
  zone: number;
  hemisphere: 'N' | 'S';
  zoneLetter: string;
}

export function geodeticToUTM(g: Geodetic): UTMCoord {
  const lat = (g.latDeg * Math.PI) / 180;
  const lon = g.lonDeg;

  // Auto-determine zone from longitude
  const zone = Math.floor((lon + 180) / 6) + 1;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);

  const k0 = 0.9996;
  const a  = WGS84_ELLIP.a;
  const e2 = WGS84_ELLIP.e2;
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  const N  = a / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat));
  const T  = Math.pow(Math.tan(lat), 2);
  const C  = (e2 / (1 - e2)) * Math.pow(Math.cos(lat), 2);
  const A  = Math.cos(lat) * (lon * (Math.PI / 180) - lon0);

  const M  = a * (
    (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * lat
    - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * lat)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * lat)
    - (35 * e6 / 3072) * Math.sin(6 * lat)
  );

  const easting = k0 * N * (
    A + (1 - T + C) * Math.pow(A, 3) / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * (e2 / (1 - e2))) * Math.pow(A, 5) / 120
  ) + 500000;

  const northing_raw = k0 * (
    M + N * Math.tan(lat) * (
      A * A / 2
      + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * (e2 / (1 - e2))) * Math.pow(A, 6) / 720
    )
  );

  const hemisphere = g.latDeg >= 0 ? 'N' : 'S';
  const northing   = hemisphere === 'S' ? northing_raw + 10000000 : northing_raw;

  // UTM zone letter
  const letters = 'CDEFGHJKLMNPQRSTUVWX';
  const idx = Math.min(Math.floor((g.latDeg + 80) / 8), letters.length - 1);
  const zoneLetter = letters[Math.max(0, idx)];

  return {
    easting:  Math.round(easting * 1000) / 1000,
    northing: Math.round(northing * 1000) / 1000,
    zone,
    hemisphere,
    zoneLetter
  };
}

// ─── UTM → WGS84 Geodetic ─────────────────────────────────────────────────────

export function utmToGeodetic(
  easting: number,
  northing: number,
  zone: number,
  hemisphere: 'N' | 'S'
): Geodetic {
  const k0 = 0.9996;
  const a  = WGS84_ELLIP.a;
  const e2 = WGS84_ELLIP.e2;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  const x  = easting  - 500000;
  const y  = hemisphere === 'S' ? northing - 10000000 : northing;

  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const M  = y / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));

  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu)
    + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu);

  const N1 = a / Math.sqrt(1 - e2 * Math.pow(Math.sin(phi1), 2));
  const T1 = Math.pow(Math.tan(phi1), 2);
  const C1 = (e2 / (1 - e2)) * Math.pow(Math.cos(phi1), 2);
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.pow(Math.sin(phi1), 2), 1.5);
  const D  = x / (N1 * k0);

  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (
    D * D / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * (e2 / (1 - e2))) * Math.pow(D, 4) / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * (e2 / (1 - e2)) - 3 * C1 * C1) * Math.pow(D, 6) / 720
  );
  const lon = lon0 + (
    D
    - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * (e2 / (1 - e2)) + 24 * T1 * T1) * Math.pow(D, 5) / 120
  ) / Math.cos(phi1);

  return {
    latDeg: Math.round((lat * 180 / Math.PI) * 1e8) / 1e8,
    lonDeg: Math.round((lon * 180 / Math.PI) * 1e8) / 1e8,
    height: 0
  };
}

// ─── High-Level Transform Functions ───────────────────────────────────────────

export interface MinnaGridPoint {
  id: string;
  easting: number;
  northing: number;
  elevation?: number;
}

export interface WGS84Point {
  id: string;
  latDeg: number;
  lonDeg: number;
  height?: number;
}

export interface TransformResult {
  inputId: string;
  minnaEasting: number;
  minnaNorthing: number;
  minnaElevation: number;
  wgs84Lat: number;
  wgs84Lon: number;
  wgs84Height: number;
  utmZone: number;
  utmEasting: number;
  utmNorthing: number;
  utmZoneLetter: string;
}

/**
 * Convert Minna Grid UTM point → WGS84 Geodetic + UTM (WGS84).
 * The Minna Grid is approximately UTM using Clarke 1880.
 * We reverse-project to Clarke1880 geodetic, apply Helmert, then re-project to WGS84.
 */
export function minnaGridToWGS84(
  point: MinnaGridPoint,
  minnaZone: number = 32,
  hemisphere: 'N' | 'S' = 'N'
): TransformResult {
  // Step 1: Minna UTM → Clarke 1880 geodetic
  const clarkeGeodetic = utmToGeodetic(point.easting, point.northing, minnaZone, hemisphere);
  clarkeGeodetic.height = point.elevation ?? 0;

  // Step 2: Clarke 1880 geodetic → ECEF
  const clarkeECEF = geodeticToECEF(clarkeGeodetic, CLARKE_1880);

  // Step 3: Helmert shift → WGS84 ECEF
  const wgs84ECEF = helmertShift(clarkeECEF, NIGERIA_SHIFT_TO_WGS84);

  // Step 4: WGS84 ECEF → WGS84 geodetic
  const wgs84Geo = ecefToGeodetic(wgs84ECEF, WGS84_ELLIP);

  // Step 5: WGS84 geodetic → UTM (WGS84)
  const utm = geodeticToUTM(wgs84Geo);

  return {
    inputId: point.id,
    minnaEasting: point.easting,
    minnaNorthing: point.northing,
    minnaElevation: point.elevation ?? 0,
    wgs84Lat: Math.round(wgs84Geo.latDeg * 1e8) / 1e8,
    wgs84Lon: Math.round(wgs84Geo.lonDeg * 1e8) / 1e8,
    wgs84Height: Math.round(wgs84Geo.height * 1000) / 1000,
    utmZone: utm.zone,
    utmEasting: utm.easting,
    utmNorthing: utm.northing,
    utmZoneLetter: utm.zoneLetter
  };
}

/**
 * Convert WGS84 Lat/Lon → Minna Grid coordinates.
 */
export function wgs84ToMinnaGrid(
  point: WGS84Point,
  minnaZone: number = 32,
  hemisphere: 'N' | 'S' = 'N'
): TransformResult {
  const wgs84Geo: Geodetic = {
    latDeg: point.latDeg,
    lonDeg: point.lonDeg,
    height: point.height ?? 0
  };

  // Step 1: WGS84 geodetic → WGS84 ECEF
  const wgs84ECEF = geodeticToECEF(wgs84Geo, WGS84_ELLIP);

  // Step 2: Helmert inverse shift → Clarke 1880 ECEF
  const clarkeECEF = helmertShift(wgs84ECEF, NIGERIA_SHIFT_TO_MINNA);

  // Step 3: Clarke 1880 ECEF → Clarke 1880 geodetic
  const clarkeGeo = ecefToGeodetic(clarkeECEF, CLARKE_1880);

  // Step 4: Clarke 1880 geodetic → Minna UTM (approx)
  // Use standard UTM formula but with Clarke 1880 parameters
  const lat = (clarkeGeo.latDeg * Math.PI) / 180;
  const lon = clarkeGeo.lonDeg;
  const zone = minnaZone;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
  const k0 = 0.9996;
  const { a, e2 } = CLARKE_1880;
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  const N_r = a / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat));
  const T_r = Math.pow(Math.tan(lat), 2);
  const C_r = (e2 / (1 - e2)) * Math.pow(Math.cos(lat), 2);
  const A_r = Math.cos(lat) * (lon * Math.PI / 180 - lon0);
  const M_r = a * (
    (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * lat
    - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * lat)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * lat)
    - (35 * e6 / 3072) * Math.sin(6 * lat)
  );

  const minnaE = k0 * N_r * (
    A_r + (1 - T_r + C_r) * Math.pow(A_r, 3) / 6
    + (5 - 18 * T_r + T_r * T_r + 72 * C_r - 58 * (e2 / (1 - e2))) * Math.pow(A_r, 5) / 120
  ) + 500000;

  const minnaN_raw = k0 * (
    M_r + N_r * Math.tan(lat) * (
      A_r * A_r / 2
      + (5 - T_r + 9 * C_r + 4 * C_r * C_r) * Math.pow(A_r, 4) / 24
      + (61 - 58 * T_r + T_r * T_r + 600 * C_r - 330 * (e2 / (1 - e2))) * Math.pow(A_r, 6) / 720
    )
  );
  const minnaHemisphere = hemisphere;
  const minnaN = minnaHemisphere === 'S' ? minnaN_raw + 10000000 : minnaN_raw;

  // Also compute WGS84 UTM for reference
  const utm = geodeticToUTM(wgs84Geo);

  return {
    inputId: point.id,
    minnaEasting:  Math.round(minnaE * 1000) / 1000,
    minnaNorthing: Math.round(minnaN * 1000) / 1000,
    minnaElevation: clarkeGeo.height ?? 0,
    wgs84Lat: point.latDeg,
    wgs84Lon: point.lonDeg,
    wgs84Height: point.height ?? 0,
    utmZone: utm.zone,
    utmEasting: utm.easting,
    utmNorthing: utm.northing,
    utmZoneLetter: utm.zoneLetter
  };
}

// ─── Demo Points ──────────────────────────────────────────────────────────────

export const DEMO_WGS84_POINTS: WGS84Point[] = [
  { id: 'GPS_01', latDeg:  8.9653472, lonDeg: 7.3894583, height: 348.5, },
  { id: 'GPS_02', latDeg:  8.9710654, lonDeg: 7.3985124, height: 352.1, },
  { id: 'GPS_03', latDeg:  8.9582900, lonDeg: 7.3812340, height: 344.3, },
];

export const DEMO_MINNA_POINTS: MinnaGridPoint[] = [
  { id: 'MN_01', easting: 294315.000, northing: 992118.500, elevation: 347.250 },
  { id: 'MN_02', easting: 294895.500, northing: 993210.750, elevation: 351.800 },
  { id: 'MN_03', easting: 293760.250, northing: 991450.000, elevation: 343.900 },
];
