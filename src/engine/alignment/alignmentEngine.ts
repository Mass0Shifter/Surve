/**
 * Horizontal Alignment Engine (IP Method)
 * Computes circular curve elements, tangent points (BC/EC), curve centers,
 * and chainage propagation along a road/infrastructure alignment.
 *
 * Formulas:
 *   Δ (Deflection Angle) = β2 − β1  (normalised to [-180°, 180°])
 *   T (Tangent Length)   = R * tan(|Δ| / 2)
 *   L (Curve Length)     = R * |Δ|rad
 *   C (Long Chord)       = 2 * R * sin(|Δ| / 2)
 *   E (External Dist)    = R * (sec(|Δ| / 2) - 1)
 *   BC (Beginning of Curve) = IP_i − T * u1
 *   EC (End of Curve)       = IP_i + T * u2
 */

import { decimalToDMS } from '../formats';

export interface IntersectionPoint {
  id: string;
  name: string;      // e.g. "IP 0", "IP 1", "IP 2"
  easting: number;
  northing: number;
  elevation?: number;
  radius: number;    // Curve radius R (m) — 0 if sharp vertex (no curve)
}

export interface CurveElements {
  ipName: string;
  radius: number;
  deflectionAngleDeg: number;  // positive = Right, negative = Left
  deflectionAngleDMS: string;
  tangentLength: number;       // T (m)
  curveLength: number;         // L (m)
  longChord: number;           // C (m)
  externalDistance: number;    // E (m)
  bcEasting: number;           // Beginning of Curve (PC)
  bcNorthing: number;
  bcChainage: number;          // Stationing (m)
  ecEasting: number;           // End of Curve (PT)
  ecNorthing: number;
  ecChainage: number;          // Stationing (m)
  centerX: number;             // Curve center Easting
  centerY: number;             // Curve center Northing
}

export interface ChainagePoint {
  chainage: number;            // Stationing in metres (e.g. 120.0 = 0+120.000)
  chainageStr: string;         // e.g. "0+120.00"
  easting: number;
  northing: number;
  elevation?: number;
  bearingDeg: number;          // Tangent bearing at this point
  isTangentPoint?: boolean;
  label?: string;              // "BC", "EC", "IP", etc.
}

export interface AlignmentResult {
  ips: IntersectionPoint[];
  curveElements: CurveElements[];
  chainagePoints: ChainagePoint[];
  totalLength: number;
  tangentSegments: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  curveArcs: Array<{
    centerX: number;
    centerY: number;
    radius: number;
    startAngleRad: number;
    endAngleRad: number;
    counterClockwise: boolean;
  }>;
}

/** Format chainage metres to standard road stationing format "0+120.00" */
export function formatChainage(metres: number): string {
  const km = Math.floor(metres / 1000);
  const m = metres % 1000;
  return `${km}+${m.toFixed(2).padStart(6, '0')}`;
}

/** Normalise angle to [-PI, PI) */
function normaliseDeltaRad(rad: number): number {
  let a = rad % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Computes complete Horizontal Alignment geometry and chainage discretization.
 */
export function computeAlignment(
  ips: IntersectionPoint[],
  chainageInterval: number = 20
): AlignmentResult {
  if (ips.length < 2) {
    return {
      ips,
      curveElements: [],
      chainagePoints: [],
      totalLength: 0,
      tangentSegments: [],
      curveArcs: []
    };
  }

  const curveElements: CurveElements[] = [];
  const tangentSegments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const curveArcs: Array<{
    centerX: number;
    centerY: number;
    radius: number;
    startAngleRad: number;
    endAngleRad: number;
    counterClockwise: boolean;
  }> = [];

  // Track stationing along alignment
  let currentChainage = 0;
  const chainagePoints: ChainagePoint[] = [];

  // Add initial start station
  chainagePoints.push({
    chainage: 0,
    chainageStr: formatChainage(0),
    easting: ips[0].easting,
    northing: ips[0].northing,
    elevation: ips[0].elevation,
    bearingDeg: (Math.atan2(ips[1].easting - ips[0].easting, ips[1].northing - ips[0].northing) * 180) / Math.PI,
    isTangentPoint: true,
    label: ips[0].name || 'START'
  });

  // Calculate curve elements for intermediate IPs
  let prevPoint = { easting: ips[0].easting, northing: ips[0].northing };

  for (let i = 1; i < ips.length - 1; i++) {
    const prevIP = ips[i - 1];
    const currIP = ips[i];
    const nextIP = ips[i + 1];

    const b1Rad = Math.atan2(currIP.easting - prevIP.easting, currIP.northing - prevIP.northing);
    const b2Rad = Math.atan2(nextIP.easting - currIP.easting, nextIP.northing - currIP.northing);

    const deltaRad = normaliseDeltaRad(b2Rad - b1Rad);
    const deltaDeg = (deltaRad * 180) / Math.PI;

    const R = currIP.radius;

    if (R > 0 && Math.abs(deltaRad) > 1e-4) {
      const halfDelta = Math.abs(deltaRad) / 2;
      const T = R * Math.tan(halfDelta);
      const L = R * Math.abs(deltaRad);
      const C = 2 * R * Math.sin(halfDelta);
      const E_dist = R * (1 / Math.cos(halfDelta) - 1);

      // BC (Beginning of Curve / PC)
      const bcE = currIP.easting - T * Math.sin(b1Rad);
      const bcN = currIP.northing - T * Math.cos(b1Rad);

      // EC (End of Curve / PT)
      const ecE = currIP.easting + T * Math.sin(b2Rad);
      const ecN = currIP.northing + T * Math.cos(b2Rad);

      // Dist from prev point to BC
      const distToBC = Math.hypot(bcE - prevPoint.easting, bcN - prevPoint.northing);
      const bcChainage = currentChainage + distToBC;
      const ecChainage = bcChainage + L;

      // Curve Center O
      const sign = deltaRad > 0 ? 1 : -1; // +1 Right, -1 Left
      const perpB1 = b1Rad + (sign * Math.PI) / 2;
      const centerX = bcE + R * Math.sin(perpB1);
      const centerY = bcN + R * Math.cos(perpB1);

      // Angles from Center to BC and EC (standard math angles CCW from X axis)
      // Note: survey N is Y, E is X.
      const startAngleMath = Math.atan2(bcN - centerY, bcE - centerX);
      const endAngleMath   = Math.atan2(ecN - centerY, ecE - centerX);

      curveElements.push({
        ipName: currIP.name || `IP ${i}`,
        radius: R,
        deflectionAngleDeg: Math.round(deltaDeg * 10000) / 10000,
        deflectionAngleDMS: decimalToDMS(Math.abs(deltaDeg)).formatted + (deltaDeg >= 0 ? ' (R)' : ' (L)'),
        tangentLength: Math.round(T * 1000) / 1000,
        curveLength: Math.round(L * 1000) / 1000,
        longChord: Math.round(C * 1000) / 1000,
        externalDistance: Math.round(E_dist * 1000) / 1000,
        bcEasting: Math.round(bcE * 1000) / 1000,
        bcNorthing: Math.round(bcN * 1000) / 1000,
        bcChainage: Math.round(bcChainage * 1000) / 1000,
        ecEasting: Math.round(ecE * 1000) / 1000,
        ecNorthing: Math.round(ecN * 1000) / 1000,
        ecChainage: Math.round(ecChainage * 1000) / 1000,
        centerX: Math.round(centerX * 1000) / 1000,
        centerY: Math.round(centerY * 1000) / 1000
      });

      // Add tangent line segment
      tangentSegments.push({ x1: prevPoint.easting, y1: prevPoint.northing, x2: bcE, y2: bcN });

      // Add curve arc
      curveArcs.push({
        centerX,
        centerY,
        radius: R,
        startAngleRad: startAngleMath,
        endAngleRad: endAngleMath,
        counterClockwise: sign < 0
      });

      // Discretize tangent leading to BC
      let ch = Math.ceil(currentChainage / chainageInterval) * chainageInterval;
      while (ch < bcChainage) {
        const frac = (ch - currentChainage) / distToBC;
        chainagePoints.push({
          chainage: ch,
          chainageStr: formatChainage(ch),
          easting: prevPoint.easting + frac * (bcE - prevPoint.easting),
          northing: prevPoint.northing + frac * (bcN - prevPoint.northing),
          bearingDeg: (b1Rad * 180) / Math.PI
        });
        ch += chainageInterval;
      }

      // Add BC point
      chainagePoints.push({
        chainage: bcChainage,
        chainageStr: formatChainage(bcChainage),
        easting: bcE,
        northing: bcN,
        bearingDeg: (b1Rad * 180) / Math.PI,
        isTangentPoint: true,
        label: `BC (${currIP.name})`
      });

      // Discretize curve arc from BC to EC
      let arcCh = Math.ceil(bcChainage / chainageInterval) * chainageInterval;
      while (arcCh < ecChainage) {
        const arcFrac = (arcCh - bcChainage) / L;
        const currentDelta = arcFrac * deltaRad;
        const currentBearing = b1Rad + currentDelta;
        const currentPerp = b1Rad + (sign * Math.PI) / 2 + currentDelta;

        const ptE = centerX - R * Math.sin(currentPerp);
        const ptN = centerY - R * Math.cos(currentPerp);

        chainagePoints.push({
          chainage: arcCh,
          chainageStr: formatChainage(arcCh),
          easting: Math.round(ptE * 1000) / 1000,
          northing: Math.round(ptN * 1000) / 1000,
          bearingDeg: (currentBearing * 180) / Math.PI
        });
        arcCh += chainageInterval;
      }

      // Add EC point
      chainagePoints.push({
        chainage: ecChainage,
        chainageStr: formatChainage(ecChainage),
        easting: ecE,
        northing: ecN,
        bearingDeg: (b2Rad * 180) / Math.PI,
        isTangentPoint: true,
        label: `EC (${currIP.name})`
      });

      currentChainage = ecChainage;
      prevPoint = { easting: ecE, northing: ecN };
    } else {
      // Sharp vertex (no curve)
      const dist = Math.hypot(currIP.easting - prevPoint.easting, currIP.northing - prevPoint.northing);
      tangentSegments.push({ x1: prevPoint.easting, y1: prevPoint.northing, x2: currIP.easting, y2: currIP.northing });

      let ch = Math.ceil(currentChainage / chainageInterval) * chainageInterval;
      while (ch < currentChainage + dist) {
        const frac = (ch - currentChainage) / dist;
        chainagePoints.push({
          chainage: ch,
          chainageStr: formatChainage(ch),
          easting: prevPoint.easting + frac * (currIP.easting - prevPoint.easting),
          northing: prevPoint.northing + frac * (currIP.northing - prevPoint.northing),
          bearingDeg: (b1Rad * 180) / Math.PI
        });
        ch += chainageInterval;
      }

      currentChainage += dist;
      prevPoint = { easting: currIP.easting, northing: currIP.northing };
    }
  }

  // Final leg to last IP
  const lastIP = ips[ips.length - 1];
  const lastDist = Math.hypot(lastIP.easting - prevPoint.easting, lastIP.northing - prevPoint.northing);
  const lastBearingRad = Math.atan2(lastIP.easting - prevPoint.easting, lastIP.northing - prevPoint.northing);

  tangentSegments.push({ x1: prevPoint.easting, y1: prevPoint.northing, x2: lastIP.easting, y2: lastIP.northing });

  let ch = Math.ceil(currentChainage / chainageInterval) * chainageInterval;
  while (ch < currentChainage + lastDist) {
    const frac = (ch - currentChainage) / lastDist;
    chainagePoints.push({
      chainage: ch,
      chainageStr: formatChainage(ch),
      easting: prevPoint.easting + frac * (lastIP.easting - prevPoint.easting),
      northing: prevPoint.northing + frac * (lastIP.northing - prevPoint.northing),
      bearingDeg: (lastBearingRad * 180) / Math.PI
    });
    ch += chainageInterval;
  }

  const finalChainage = currentChainage + lastDist;
  chainagePoints.push({
    chainage: finalChainage,
    chainageStr: formatChainage(finalChainage),
    easting: lastIP.easting,
    northing: lastIP.northing,
    elevation: lastIP.elevation,
    bearingDeg: (lastBearingRad * 180) / Math.PI,
    isTangentPoint: true,
    label: lastIP.name || 'END'
  });

  return {
    ips,
    curveElements,
    chainagePoints,
    totalLength: Math.round(finalChainage * 1000) / 1000,
    tangentSegments,
    curveArcs
  };
}

// ─── SurvPack Benchmark Road Alignment Dataset ───────────────────────────────
export const DEMO_ALIGNMENT_IPS: IntersectionPoint[] = [
  { id: '1', name: 'IP 0 (Start)', easting: 294200.000, northing: 992000.000, elevation: 345.0, radius: 0 },
  { id: '2', name: 'IP 1',         easting: 294450.000, northing: 992250.000, elevation: 348.5, radius: 120 },
  { id: '3', name: 'IP 2',         easting: 294800.000, northing: 992150.000, elevation: 350.2, radius: 150 },
  { id: '4', name: 'IP 3',         easting: 295100.000, northing: 992450.000, elevation: 352.0, radius: 100 },
  { id: '5', name: 'IP 4 (End)',   easting: 295400.000, northing: 992400.000, elevation: 349.8, radius: 0 }
];
