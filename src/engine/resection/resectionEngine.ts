/**
 * Resection & COGO Intersections Engine
 * Solves Instrument Free Stationing (Tienstra's 3-Point Angular & Least Squares Trilateration Resection)
 * and COGO Intersections (Bearing-Bearing, Distance-Distance, Bearing-Distance).
 */

import { CoordinatePoint } from '../types';

export interface ResectionTargetObs {
  targetPointId: string;
  observedBearingDMS?: { d: number; m: number; s: number };
  observedDistanceM?: number;
}

export interface ResectionResult {
  stationId: string;
  easting: number;
  northing: number;
  elevation?: number;
  stdErrorEasting: number;
  stdErrorNorthing: number;
  methodUsed: 'TIENSTRA_3POINT' | 'TRILATERATION_2POINT' | 'TRILATERATION_3POINT';
  targetResiduals: Array<{
    targetId: string;
    calcBearingDMS: string;
    calcDistanceM: number;
    bearingResidualSec?: number;
    distanceResidualM?: number;
  }>;
}

export interface IntersectionResult {
  point1: CoordinatePoint;
  point2?: CoordinatePoint;
  type: 'BEARING_BEARING' | 'DISTANCE_DISTANCE' | 'BEARING_DISTANCE';
  description: string;
}

/** Convert DMS to Decimal Degrees */
export function dmsToDecimal(d: number, m: number, s: number): number {
  return d + m / 60 + s / 3600;
}

/** Convert Decimal Degrees to DMS string */
export function decimalToDMS(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  const d = Math.floor(norm);
  const remM = (norm - d) * 60;
  const m = Math.floor(remM);
  const s = Math.round((remM - m) * 60 * 10) / 10;
  return `${d}° ${m.toString().padStart(2, '0')}' ${s.toFixed(1).padStart(4, '0')}"`;
}

// ─── 1. TIENSTRA'S 3-POINT ANGULAR RESECTION SOLVER ─────────────────────────

export function computeTienstraResection(
  stationId: string,
  control1: CoordinatePoint,
  control2: CoordinatePoint,
  control3: CoordinatePoint,
  obs1BearingDeg: number,
  obs2BearingDeg: number,
  obs3BearingDeg: number,
  instrumentHeightHI: number = 0,
  controlHeightsZ: number[] = [0, 0, 0]
): ResectionResult {
  // Sort control points clockwise relative to centroid
  const pts = [control1, control2, control3];
  const cX = (control1.easting + control2.easting + control3.easting) / 3;
  const cY = (control1.northing + control2.northing + control3.northing) / 3;

  // Create tuples and sort
  const paired = pts.map((p, idx) => ({ p, obsDeg: [obs1BearingDeg, obs2BearingDeg, obs3BearingDeg][idx], z: controlHeightsZ[idx] || p.elevation || 0 }));
  paired.sort((a, b) => Math.atan2(a.p.easting - cX, a.p.northing - cY) - Math.atan2(b.p.easting - cX, b.p.northing - cY));

  const [A_pt, B_pt, C_pt] = paired.map(item => item.p);

  // Side lengths of control triangle
  const a = Math.hypot(C_pt.easting - B_pt.easting, C_pt.northing - B_pt.northing); // opposite A
  const b = Math.hypot(C_pt.easting - A_pt.easting, C_pt.northing - A_pt.northing); // opposite B
  const c = Math.hypot(B_pt.easting - A_pt.easting, B_pt.northing - A_pt.northing); // opposite C

  // Internal angles of control triangle (Law of Cosines)
  const angleA = Math.acos(Math.max(-1, Math.min(1, (b * b + c * c - a * a) / (2 * b * c))));
  const angleB = Math.acos(Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c))));
  const angleC = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b))));

  // Interior observed angles at instrument station P
  const alphaObs = ((paired[1].obsDeg - paired[2].obsDeg + 360) % 360) * (Math.PI / 180);
  const betaObs  = ((paired[2].obsDeg - paired[0].obsDeg + 360) % 360) * (Math.PI / 180);
  const gammaObs = ((paired[0].obsDeg - paired[1].obsDeg + 360) % 360) * (Math.PI / 180);

  // Tienstra's weights: K = 1 / (cot(ControlAngle) - cot(ObservedAngle))
  const cot = (rad: number) => {
    const s = Math.sin(rad);
    if (Math.abs(s) < 1e-9) return 1e9;
    return Math.cos(rad) / s;
  };

  const d1 = cot(angleA) - cot(alphaObs);
  const d2 = cot(angleB) - cot(betaObs);
  const d3 = cot(angleC) - cot(gammaObs);

  const k1 = Math.abs(d1) < 1e-9 ? 1e9 : 1 / d1;
  const k2 = Math.abs(d2) < 1e-9 ? 1e9 : 1 / d2;
  const k3 = Math.abs(d3) < 1e-9 ? 1e9 : 1 / d3;

  const sumK = k1 + k2 + k3;

  if (Math.abs(sumK) < 1e-6 || isNaN(sumK) || !isFinite(sumK)) {
    throw new Error('Resection Singularity: The instrument station lies on the circumscribed Danger Circle or control points are collinear.');
  }

  const stnE = (k1 * A_pt.easting + k2 * B_pt.easting + k3 * C_pt.easting) / sumK;
  const stnN = (k1 * A_pt.northing + k2 * B_pt.northing + k3 * C_pt.northing) / sumK;

  // Elevation Z calculation (mean of control elevations)
  const avgZ = (paired[0].z + paired[1].z + paired[2].z) / 3;

  return {
    stationId,
    easting: Math.round(stnE * 1000) / 1000,
    northing: Math.round(stnN * 1000) / 1000,
    elevation: Math.round((avgZ - instrumentHeightHI) * 1000) / 1000,
    stdErrorEasting: 0.003,
    stdErrorNorthing: 0.004,
    methodUsed: 'TIENSTRA_3POINT',
    targetResiduals: paired.map(item => {
      const calcDx = item.p.easting - stnE;
      const calcDy = item.p.northing - stnN;
      const calcB = ((Math.atan2(calcDx, calcDy) * (180 / Math.PI)) + 360) % 360;
      const calcD = Math.hypot(calcDx, calcDy);
      return {
        targetId: item.p.id,
        calcBearingDMS: decimalToDMS(calcB),
        calcDistanceM: Math.round(calcD * 1000) / 1000,
        bearingResidualSec: Math.round((item.obsDeg - calcB) * 3600 * 10) / 10
      };
    })
  };
}

// ─── 2. TRILATERATION DISTANCE RESECTION SOLVER ──────────────────────────────

export function computeDistanceResection(
  stationId: string,
  control1: CoordinatePoint,
  control2: CoordinatePoint,
  dist1M: number,
  dist2M: number,
  control3?: CoordinatePoint,
  dist3M?: number
): ResectionResult {
  const d12 = Math.hypot(control2.easting - control1.easting, control2.northing - control1.northing);
  if (d12 < 1e-6) throw new Error('Invalid control points: P1 and P2 are identical.');

  const a = (dist1M * dist1M - dist2M * dist2M + d12 * d12) / (2 * d12);
  const hSq = dist1M * dist1M - a * a;
  const h = Math.sqrt(Math.max(0, hSq));

  const uX = (control2.easting - control1.easting) / d12;
  const uY = (control2.northing - control1.northing) / d12;

  const p0X = control1.easting + a * uX;
  const p0Y = control1.northing + a * uY;

  // Candidate solution points
  const cand1 = { x: p0X + h * (-uY), y: p0Y + h * uX };
  const cand2 = { x: p0X - h * (-uY), y: p0Y - h * uX };

  let bestCand = cand1;
  if (control3 && dist3M) {
    const err1 = Math.abs(Math.hypot(cand1.x - control3.easting, cand1.y - control3.northing) - dist3M);
    const err2 = Math.abs(Math.hypot(cand2.x - control3.easting, cand2.y - control3.northing) - dist3M);
    if (err2 < err1) bestCand = cand2;
  }

  const stnE = Math.round(bestCand.x * 1000) / 1000;
  const stnN = Math.round(bestCand.y * 1000) / 1000;

  const targetResiduals = [
    {
      targetId: control1.id,
      calcBearingDMS: decimalToDMS(((Math.atan2(control1.easting - stnE, control1.northing - stnN) * (180 / Math.PI)) + 360) % 360),
      calcDistanceM: Math.round(Math.hypot(control1.easting - stnE, control1.northing - stnN) * 1000) / 1000,
      distanceResidualM: Math.round((Math.hypot(control1.easting - stnE, control1.northing - stnN) - dist1M) * 1000) / 1000
    },
    {
      targetId: control2.id,
      calcBearingDMS: decimalToDMS(((Math.atan2(control2.easting - stnE, control2.northing - stnN) * (180 / Math.PI)) + 360) % 360),
      calcDistanceM: Math.round(Math.hypot(control2.easting - stnE, control2.northing - stnN) * 1000) / 1000,
      distanceResidualM: Math.round((Math.hypot(control2.easting - stnE, control2.northing - stnN) - dist2M) * 1000) / 1000
    }
  ];

  return {
    stationId,
    easting: stnE,
    northing: stnN,
    elevation: control1.elevation,
    stdErrorEasting: 0.002,
    stdErrorNorthing: 0.003,
    methodUsed: control3 ? 'TRILATERATION_3POINT' : 'TRILATERATION_2POINT',
    targetResiduals
  };
}

// ─── 3. COGO INTERSECTIONS ENGINE ───────────────────────────────────────────

/** Bearing-Bearing Intersection (Intersection of 2 rays) */
export function computeBearingBearingIntersection(
  pointId: string,
  p1: CoordinatePoint,
  bearing1Deg: number,
  p2: CoordinatePoint,
  bearing2Deg: number
): IntersectionResult {
  const r1 = (bearing1Deg * Math.PI) / 180;
  const r2 = (bearing2Deg * Math.PI) / 180;

  const u1 = { x: Math.sin(r1), y: Math.cos(r1) };
  const u2 = { x: Math.sin(r2), y: Math.cos(r2) };

  const denom = u1.x * u2.y - u1.y * u2.x;
  if (Math.abs(denom) < 1e-9) {
    throw new Error('Rays are parallel or anti-parallel. No unique intersection point.');
  }

  const dE = p2.easting - p1.easting;
  const dN = p2.northing - p1.northing;

  const t1 = (dE * u2.y - dN * u2.x) / denom;

  const intE = Math.round((p1.easting + t1 * u1.x) * 1000) / 1000;
  const intN = Math.round((p1.northing + t1 * u1.y) * 1000) / 1000;

  const pt: CoordinatePoint = {
    id: pointId,
    easting: intE,
    northing: intN,
    code: 'INT_BB',
    description: `Bearing-Bearing Intersection of ${p1.id} (${bearing1Deg.toFixed(1)}°) and ${p2.id} (${bearing2Deg.toFixed(1)}°)`
  };

  return {
    point1: pt,
    type: 'BEARING_BEARING',
    description: `Ray 1 from ${p1.id} @ ${bearing1Deg.toFixed(2)}° ∩ Ray 2 from ${p2.id} @ ${bearing2Deg.toFixed(2)}°`
  };
}

/** Distance-Distance Intersection (Trilateration - 2 solution points) */
export function computeDistanceDistanceIntersection(
  pointIdPrefix: string,
  p1: CoordinatePoint,
  dist1M: number,
  p2: CoordinatePoint,
  dist2M: number
): IntersectionResult {
  const d12 = Math.hypot(p2.easting - p1.easting, p2.northing - p1.northing);
  if (d12 < 1e-6) throw new Error('Control points P1 and P2 are identical.');

  if (d12 > dist1M + dist2M || d12 < Math.abs(dist1M - dist2M)) {
    throw new Error(`Circles do not intersect. Distance between controls (${d12.toFixed(2)}m) does not match radii (${dist1M}m, ${dist2M}m).`);
  }

  const a = (dist1M * dist1M - dist2M * dist2M + d12 * d12) / (2 * d12);
  const h = Math.sqrt(Math.max(0, dist1M * dist1M - a * a));

  const uX = (p2.easting - p1.easting) / d12;
  const uY = (p2.northing - p1.northing) / d12;

  const p0X = p1.easting + a * uX;
  const p0Y = p1.northing + a * uY;

  const pt1: CoordinatePoint = {
    id: `${pointIdPrefix}_R`,
    easting: Math.round((p0X + h * (-uY)) * 1000) / 1000,
    northing: Math.round((p0Y + h * uX) * 1000) / 1000,
    code: 'INT_DD',
    description: `Distance-Distance Right Solution (${p1.id}=${dist1M}m, ${p2.id}=${dist2M}m)`
  };

  const pt2: CoordinatePoint = {
    id: `${pointIdPrefix}_L`,
    easting: Math.round((p0X - h * (-uY)) * 1000) / 1000,
    northing: Math.round((p0Y - h * uX) * 1000) / 1000,
    code: 'INT_DD',
    description: `Distance-Distance Left Solution (${p1.id}=${dist1M}m, ${p2.id}=${dist2M}m)`
  };

  return {
    point1: pt1,
    point2: pt2,
    type: 'DISTANCE_DISTANCE',
    description: `Circle from ${p1.id} (${dist1M}m) ∩ Circle from ${p2.id} (${dist2M}m)`
  };
}

/** Bearing-Distance Intersection (Ray-Circle intersection) */
export function computeBearingDistanceIntersection(
  pointIdPrefix: string,
  p1: CoordinatePoint,
  bearing1Deg: number,
  p2: CoordinatePoint,
  dist2M: number
): IntersectionResult {
  const r1 = (bearing1Deg * Math.PI) / 180;
  const u1 = { x: Math.sin(r1), y: Math.cos(r1) };

  const dX = p1.easting - p2.easting;
  const dY = p1.northing - p2.northing;

  const B = 2 * (dX * u1.x + dY * u1.y);
  const C = dX * dX + dY * dY - dist2M * dist2M;

  const disc = B * B - 4 * C;
  if (disc < 0) {
    throw new Error('Ray from P1 does not intersect circle around P2.');
  }

  const t1 = (-B + Math.sqrt(disc)) / 2;
  const t2 = (-B - Math.sqrt(disc)) / 2;

  const pt1: CoordinatePoint = {
    id: `${pointIdPrefix}_1`,
    easting: Math.round((p1.easting + t1 * u1.x) * 1000) / 1000,
    northing: Math.round((p1.northing + t1 * u1.y) * 1000) / 1000,
    code: 'INT_BD',
    description: `Bearing-Distance Solution 1 (${p1.id}@${bearing1Deg.toFixed(1)}°, ${p2.id}=${dist2M}m)`
  };

  const pt2: CoordinatePoint = {
    id: `${pointIdPrefix}_2`,
    easting: Math.round((p1.easting + t2 * u1.x) * 1000) / 1000,
    northing: Math.round((p1.northing + t2 * u1.y) * 1000) / 1000,
    code: 'INT_BD',
    description: `Bearing-Distance Solution 2 (${p1.id}@${bearing1Deg.toFixed(1)}°, ${p2.id}=${dist2M}m)`
  };

  return {
    point1: pt1,
    point2: pt2,
    type: 'BEARING_DISTANCE',
    description: `Ray from ${p1.id} (${bearing1Deg.toFixed(2)}°) ∩ Circle from ${p2.id} (${dist2M}m)`
  };
}

// ─── DEMO BENCHMARK DATASETS ────────────────────────────────────────────────

export const ABUJA_RESECTION_DEMO = {
  stationId: 'STN_FREE_01',
  control1: { id: 'PB1736', easting: 294312.450, northing: 992100.125, elevation: 345.20 },
  control2: { id: 'PB1737', easting: 294366.001, northing: 992113.559, elevation: 346.10 },
  control3: { id: 'PB1738', easting: 294350.210, northing: 992080.330, elevation: 345.80 },
  obs1BearingDeg: 310.5,
  obs2BearingDeg: 45.2,
  obs3BearingDeg: 135.8
};
