/**
 * Road Vertical Curve Alignment Engine (PVI Method)
 * Computes parabolic sag and crest vertical curves, grades (g1, g2),
 * algebraic grade differences (A), K-factor rate of curvature,
 * PVC/PVT stations, high/low turning points, and longitudinal profile elevations.
 */

export interface PVIStation {
  id: string;
  name: string;        // e.g. "PVI 0", "PVI 1", "PVI 2"
  chainage: number;    // Stationing in metres (e.g. 0, 250, 500)
  elevation: number;   // PVI Elevation Z (m)
  curveLength: number; // Parabolic curve length L (m) — 0 if sharp grade break
}

export interface VerticalCurveElements {
  pviName: string;
  pviChainage: number;
  pviElevation: number;
  curveLength: number;        // L (m)
  gradeInPercent: number;     // g1 (%)
  gradeOutPercent: number;    // g2 (%)
  algebraicDiffA: number;     // A = |g2 - g1| (%)
  kFactor: number;            // K = L / A
  type: 'CREST' | 'SAG' | 'NONE';
  pvcChainage: number;        // Point of Vertical Curvature (VPC)
  pvcElevation: number;
  pvtChainage: number;        // Point of Vertical Tangency (VPT)
  pvtElevation: number;
  highLowPointChainage?: number; // Turning point station (m)
  highLowPointElevation?: number;// Turning point elevation (m)
}

export interface ProfileElevationPoint {
  chainage: number;
  chainageStr: string;
  pviElevation: number;       // Straight grade tangent elevation (m)
  curveElevation: number;     // Parabolic vertical curve elevation (m)
  gradePercent: number;
  isSpecialPoint?: boolean;
  label?: string;             // "PVC", "PVI", "PVT", "HIGH POINT", "LOW POINT"
}

export interface VerticalProfileResult {
  pvis: PVIStation[];
  curveElements: VerticalCurveElements[];
  profilePoints: ProfileElevationPoint[];
  totalLength: number;
  minElevation: number;
  maxElevation: number;
}

/** Format chainage metres to standard road stationing format "0+120.00" */
export function formatChainage(metres: number): string {
  const km = Math.floor(metres / 1000);
  const m = metres % 1000;
  return `${km}+${m.toFixed(2).padStart(6, '0')}`;
}

/**
 * Computes complete Vertical Curve Alignment & Longitudinal Profile geometry.
 */
export function computeVerticalAlignment(
  pvis: PVIStation[],
  interval: number = 20
): VerticalProfileResult {
  if (pvis.length < 2) {
    return {
      pvis,
      curveElements: [],
      profilePoints: [],
      totalLength: 0,
      minElevation: 0,
      maxElevation: 0
    };
  }

  const sortedPVIS = [...pvis].sort((a, b) => a.chainage - b.chainage);
  const n = sortedPVIS.length;
  const curveElements: VerticalCurveElements[] = [];
  const profilePoints: ProfileElevationPoint[] = [];

  // Calculate incoming and outgoing grades for intermediate PVIs
  for (let i = 1; i < n - 1; i++) {
    const prev = sortedPVIS[i - 1];
    const curr = sortedPVIS[i];
    const next = sortedPVIS[i + 1];

    const dCh1 = curr.chainage - prev.chainage;
    const dCh2 = next.chainage - curr.chainage;

    const g1 = dCh1 > 0 ? ((curr.elevation - prev.elevation) / dCh1) * 100 : 0;
    const g2 = dCh2 > 0 ? ((next.elevation - curr.elevation) / dCh2) * 100 : 0;
    const A = Math.abs(g2 - g1);
    const L = curr.curveLength;

    if (L > 0 && A > 0.0001) {
      const K = L / A;
      const type: 'CREST' | 'SAG' = g1 > g2 ? 'CREST' : 'SAG';

      const pvcCh = curr.chainage - L / 2;
      const pvcZ = curr.elevation - (g1 * (L / 2)) / 100;

      const pvtCh = curr.chainage + L / 2;
      const pvtZ = curr.elevation + (g2 * (L / 2)) / 100;

      // High / Low turning point calculation
      let highLowCh: number | undefined = undefined;
      let highLowZ: number | undefined = undefined;

      const xHL = (g1 * L) / (g1 - g2);
      if (xHL > 0 && xHL < L) {
        highLowCh = Math.round((pvcCh + xHL) * 1000) / 1000;
        highLowZ = Math.round((pvcZ + (g1 * xHL) / 100 + ((g2 - g1) * xHL * xHL) / (200 * L)) * 1000) / 1000;
      }

      curveElements.push({
        pviName: curr.name || `PVI ${i}`,
        pviChainage: curr.chainage,
        pviElevation: curr.elevation,
        curveLength: L,
        gradeInPercent: Math.round(g1 * 100) / 100,
        gradeOutPercent: Math.round(g2 * 100) / 100,
        algebraicDiffA: Math.round(A * 100) / 100,
        kFactor: Math.round(K * 10) / 10,
        type,
        pvcChainage: Math.round(pvcCh * 1000) / 1000,
        pvcElevation: Math.round(pvcZ * 1000) / 1000,
        pvtChainage: Math.round(pvtCh * 1000) / 1000,
        pvtElevation: Math.round(pvtZ * 1000) / 1000,
        highLowPointChainage: highLowCh,
        highLowPointElevation: highLowZ
      });
    }
  }

  // Discretize profile points from start to end PVI
  const startCh = sortedPVIS[0].chainage;
  const endCh = sortedPVIS[n - 1].chainage;

  for (let ch = startCh; ch <= endCh + 1e-4; ch += interval) {
    const pElev = evaluateVerticalElevation(ch, sortedPVIS, curveElements);
    profilePoints.push({
      chainage: Math.round(ch * 1000) / 1000,
      chainageStr: formatChainage(ch),
      pviElevation: pElev.tangentZ,
      curveElevation: pElev.curveZ,
      gradePercent: pElev.grade
    });
  }

  // Inject key tangent points (PVC, PVI, PVT, High/Low) into profilePoints
  for (const c of curveElements) {
    const pvcZ = evaluateVerticalElevation(c.pvcChainage, sortedPVIS, curveElements);
    profilePoints.push({
      chainage: c.pvcChainage,
      chainageStr: formatChainage(c.pvcChainage),
      pviElevation: pvcZ.tangentZ,
      curveElevation: pvcZ.curveZ,
      gradePercent: c.gradeInPercent,
      isSpecialPoint: true,
      label: `PVC (${c.pviName})`
    });

    const pvtZ = evaluateVerticalElevation(c.pvtChainage, sortedPVIS, curveElements);
    profilePoints.push({
      chainage: c.pvtChainage,
      chainageStr: formatChainage(c.pvtChainage),
      pviElevation: pvtZ.tangentZ,
      curveElevation: pvtZ.curveZ,
      gradePercent: c.gradeOutPercent,
      isSpecialPoint: true,
      label: `PVT (${c.pviName})`
    });

    if (c.highLowPointChainage !== undefined && c.highLowPointElevation !== undefined) {
      const hlZ = evaluateVerticalElevation(c.highLowPointChainage, sortedPVIS, curveElements);
      profilePoints.push({
        chainage: c.highLowPointChainage,
        chainageStr: formatChainage(c.highLowPointChainage),
        pviElevation: hlZ.tangentZ,
        curveElevation: c.highLowPointElevation,
        gradePercent: 0,
        isSpecialPoint: true,
        label: c.type === 'CREST' ? `HIGH POINT (${c.highLowPointElevation.toFixed(2)}m)` : `LOW POINT (${c.highLowPointElevation.toFixed(2)}m)`
      });
    }
  }

  profilePoints.sort((a, b) => a.chainage - b.chainage);

  const elevations = profilePoints.map(p => p.curveElevation);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);

  return {
    pvis: sortedPVIS,
    curveElements,
    profilePoints,
    totalLength: Math.round((endCh - startCh) * 1000) / 1000,
    minElevation: Math.round(minElevation * 1000) / 1000,
    maxElevation: Math.round(maxElevation * 1000) / 1000
  };
}

/** Evaluates tangent Z & parabolic curve Z at any chainage station */
function evaluateVerticalElevation(
  ch: number,
  pvis: PVIStation[],
  curveElements: VerticalCurveElements[]
): { tangentZ: number; curveZ: number; grade: number } {
  // Find PVI segment containing ch
  let segIdx = 0;
  for (let i = 0; i < pvis.length - 1; i++) {
    if (ch >= pvis[i].chainage && ch <= pvis[i + 1].chainage) {
      segIdx = i;
      break;
    }
  }

  const p1 = pvis[segIdx];
  const p2 = pvis[Math.min(segIdx + 1, pvis.length - 1)];
  const dCh = p2.chainage - p1.chainage;
  const grade = dCh > 0 ? ((p2.elevation - p1.elevation) / dCh) * 100 : 0;
  const tangentZ = p1.elevation + (grade * (ch - p1.chainage)) / 100;

  // Check if ch falls inside a parabolic curve
  let curveZ = tangentZ;
  for (const c of curveElements) {
    if (ch >= c.pvcChainage && ch <= c.pvtChainage) {
      const x = ch - c.pvcChainage; // distance from PVC
      const g1 = c.gradeInPercent;
      const g2 = c.gradeOutPercent;
      const L = c.curveLength;
      curveZ = c.pvcElevation + (g1 * x) / 100 + ((g2 - g1) * x * x) / (200 * L);
      break;
    }
  }

  return {
    tangentZ: Math.round(tangentZ * 1000) / 1000,
    curveZ: Math.round(curveZ * 1000) / 1000,
    grade: Math.round(grade * 100) / 100
  };
}

// ─── SurvPack Benchmark Road Vertical Profile Dataset ────────────────────────
export const DEMO_VERTICAL_PVIS: PVIStation[] = [
  { id: '1', name: 'PVI 0 (Start)', chainage: 0,   elevation: 345.00, curveLength: 0 },
  { id: '2', name: 'PVI 1',         chainage: 250, elevation: 352.50, curveLength: 120 }, // Crest curve
  { id: '3', name: 'PVI 2',         chainage: 500, elevation: 344.00, curveLength: 150 }, // Sag curve
  { id: '4', name: 'PVI 3',         chainage: 750, elevation: 354.00, curveLength: 100 }, // Crest curve
  { id: '5', name: 'PVI 4 (End)',   chainage: 1000, elevation: 348.50, curveLength: 0 }
];
