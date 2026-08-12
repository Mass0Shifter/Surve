/**
 * Stadia Tacheometry & Total Station Reduction Engine
 * Computes 3D coordinates from theodolite/total station field observations.
 *
 * Stadia:   D_H = K*s*cos²θ + C*cosθ  (K=100, C=0)
 *           V   = (K*s/2)*sin(2θ) + C*sinθ
 * TotalStation: D_H = SD * sin(VA)
 *               V   = SD * cos(VA)
 * Position: ΔE = D_H * sin(WCB), ΔN = D_H * cos(WCB)
 * Height:   Z  = Z_stn + HI + V - MR/TH
 */

export type TachMethod = 'STADIA' | 'TOTAL_STATION';

export interface TachObservation {
  id: string;
  pointId: string;
  /** Whole Circle Bearing degrees, minutes, seconds */
  wcbDeg: number;
  wcbMin: number;
  wcbSec: number;
  /** Stadia: upper reading (m) */
  upper?: number | null;
  /** Stadia: middle reading / horizontal hair (m) */
  middle?: number | null;
  /** Stadia: lower reading (m) */
  lower?: number | null;
  /** Total Station: slope distance (m) */
  slopeDistance?: number | null;
  /** Vertical angle in decimal degrees (zenith = 90°) */
  verticalAngleDeg: number;
  verticalAngleMin: number;
  verticalAngleSec: number;
  /** Target height / mid-rod reading (m) */
  targetHeight: number;
  remarks?: string;
}

export interface TachStation {
  stationId: string;
  easting: number;
  northing: number;
  elevation: number;
  instrumentHeight: number; // HI above station mark
}

export interface TachReductionRow {
  pointId: string;
  wcb: number; // decimal degrees
  verticalAngle: number; // decimal degrees
  staffIntercept: number | null; // s = upper - lower
  horizontalDistance: number;
  verticalComponent: number;
  deltaE: number;
  deltaN: number;
  deltaZ: number;
  computedE: number;
  computedN: number;
  computedZ: number;
  remarks: string;
}

export interface TachReductionResult {
  station: TachStation;
  method: TachMethod;
  rows: TachReductionRow[];
}

/** Convert DMS to decimal degrees */
export function dmsToDecimal(deg: number, min: number, sec: number): number {
  const sign = deg < 0 ? -1 : 1;
  return sign * (Math.abs(deg) + min / 60 + sec / 3600);
}

/**
 * Main reduction function: converts tacheometry observations to 3D coords.
 */
export function computeTachReduction(
  station: TachStation,
  observations: TachObservation[],
  method: TachMethod
): TachReductionResult {
  const K = 100; // Stadia multiplier constant
  const C = 0;   // Stadia additive constant (0 for internal-focus telescopes)

  const rows: TachReductionRow[] = observations.map(obs => {
    const wcb = dmsToDecimal(obs.wcbDeg, obs.wcbMin, obs.wcbSec);
    const va = dmsToDecimal(obs.verticalAngleDeg, obs.verticalAngleMin, obs.verticalAngleSec);

    // Convert vertical angle: if zenith angle, θ_alt = 90° - VA
    // We treat VA as altitude angle (above horizontal = positive)
    const thetaRad = (va * Math.PI) / 180;
    const wcbRad = (wcb * Math.PI) / 180;

    let D_H = 0;
    let V = 0;
    let s: number | null = null;

    if (method === 'STADIA') {
      const upper = obs.upper ?? 0;
      const lower = obs.lower ?? 0;
      s = Math.round((upper - lower) * 1000) / 1000;
      D_H = K * s * Math.pow(Math.cos(thetaRad), 2) + C * Math.cos(thetaRad);
      V = (K * s / 2) * Math.sin(2 * thetaRad) + C * Math.sin(thetaRad);
    } else {
      // Total Station
      const SD = obs.slopeDistance ?? 0;
      D_H = SD * Math.sin(thetaRad);
      V = SD * Math.cos(thetaRad);
    }

    D_H = Math.round(D_H * 1000) / 1000;
    V = Math.round(V * 1000) / 1000;

    const deltaE = Math.round(D_H * Math.sin(wcbRad) * 1000) / 1000;
    const deltaN = Math.round(D_H * Math.cos(wcbRad) * 1000) / 1000;
    const TH = obs.targetHeight ?? (obs.middle ?? 1.500);
    const deltaZ = Math.round((station.instrumentHeight + V - TH) * 1000) / 1000;

    return {
      pointId: obs.pointId || `PT_${obs.id}`,
      wcb,
      verticalAngle: va,
      staffIntercept: s,
      horizontalDistance: D_H,
      verticalComponent: V,
      deltaE,
      deltaN,
      deltaZ,
      computedE: Math.round((station.easting + deltaE) * 1000) / 1000,
      computedN: Math.round((station.northing + deltaN) * 1000) / 1000,
      computedZ: Math.round((station.elevation + deltaZ) * 1000) / 1000,
      remarks: obs.remarks || ''
    };
  });

  return { station, method, rows };
}

// ============================================================
// SurvPack Historic Benchmark Dataset: ABJ_TACH.DAT
// Occupied station: OC_01 | Easting: 294315.000 | Northing: 992118.500 | Elev: 347.250m
// ============================================================
export const TACH_STATION_DEFAULT: TachStation = {
  stationId: 'OC_01',
  easting: 294315.000,
  northing: 992118.500,
  elevation: 347.250,
  instrumentHeight: 1.460  // HI = 1.460m
};

export const TACH_OBSERVATIONS_DEMO: TachObservation[] = [
  { id: '1',  pointId: 'SP_01', wcbDeg: 12,  wcbMin: 30, wcbSec: 0,  upper: 1.850, middle: 1.500, lower: 1.150, verticalAngleDeg: 2,  verticalAngleMin: 30, verticalAngleSec: 0, targetHeight: 1.500, remarks: 'Road Edge - N' },
  { id: '2',  pointId: 'SP_02', wcbDeg: 45,  wcbMin: 15, wcbSec: 0,  upper: 2.010, middle: 1.650, lower: 1.290, verticalAngleDeg: -1, verticalAngleMin: 15, verticalAngleSec: 0, targetHeight: 1.650, remarks: 'Drain Invert NE' },
  { id: '3',  pointId: 'SP_03', wcbDeg: 78,  wcbMin: 0,  wcbSec: 0,  upper: 1.720, middle: 1.400, lower: 1.080, verticalAngleDeg: 3,  verticalAngleMin: 0,  verticalAngleSec: 0, targetHeight: 1.400, remarks: 'Ground Spot E' },
  { id: '4',  pointId: 'SP_04', wcbDeg: 112, wcbMin: 45, wcbSec: 0,  upper: 2.250, middle: 1.750, lower: 1.250, verticalAngleDeg: -3, verticalAngleMin: 30, verticalAngleSec: 0, targetHeight: 1.750, remarks: 'Culvert Top SE' },
  { id: '5',  pointId: 'SP_05', wcbDeg: 152, wcbMin: 20, wcbSec: 0,  upper: 1.930, middle: 1.580, lower: 1.230, verticalAngleDeg: 1,  verticalAngleMin: 45, verticalAngleSec: 0, targetHeight: 1.580, remarks: 'Building Corner S' },
  { id: '6',  pointId: 'SP_06', wcbDeg: 195, wcbMin: 0,  wcbSec: 0,  upper: 1.680, middle: 1.350, lower: 1.020, verticalAngleDeg: -2, verticalAngleMin: 10, verticalAngleSec: 0, targetHeight: 1.350, remarks: 'Road Edge SW' },
  { id: '7',  pointId: 'SP_07', wcbDeg: 238, wcbMin: 30, wcbSec: 0,  upper: 2.120, middle: 1.700, lower: 1.280, verticalAngleDeg: 4,  verticalAngleMin: 0,  verticalAngleSec: 0, targetHeight: 1.700, remarks: 'High Point W' },
  { id: '8',  pointId: 'SP_08', wcbDeg: 275, wcbMin: 10, wcbSec: 0,  upper: 1.590, middle: 1.300, lower: 1.010, verticalAngleDeg: -1, verticalAngleMin: 30, verticalAngleSec: 0, targetHeight: 1.300, remarks: 'Low Point NW' },
  { id: '9',  pointId: 'SP_09', wcbDeg: 310, wcbMin: 0,  wcbSec: 0,  upper: 1.880, middle: 1.540, lower: 1.200, verticalAngleDeg: 2,  verticalAngleMin: 0,  verticalAngleSec: 0, targetHeight: 1.540, remarks: 'Spot Height NNW' },
  { id: '10', pointId: 'SP_10', wcbDeg: 355, wcbMin: 45, wcbSec: 0,  upper: 2.050, middle: 1.620, lower: 1.190, verticalAngleDeg: -0, verticalAngleMin: 45, verticalAngleSec: 0, targetHeight: 1.620, remarks: 'Manhole Cover N' }
];
