/**
 * Setout / Setting-Out Engine
 * Computes WCB, horizontal distance, vertical angle, and slope distance
 * from an occupied station to a set of design (target) points.
 *
 * All coordinates are in the Minna Grid (Easting/Northing metres).
 *
 * WCB:        atan2(ΔE, ΔN) → normalised to [0°, 360°)
 * D_H:        √(ΔE² + ΔN²)
 * VA:         atan((Z_tgt + TH − Z_stn − HI) / D_H)  [if elevations given]
 * SlopeDist:  D_H / cos(VA)
 */

import { decimalToDMS } from '../formats';

export interface SetoutStation {
  stationId: string;
  easting: number;
  northing: number;
  elevation: number;
  instrumentHeight: number; // HI above station mark (m)
}

export interface SetoutDesignPoint {
  id: string;
  pointId: string;
  easting: number;
  northing: number;
  elevation?: number | null; // optional – for 3D stakeout
  targetHeight?: number;     // TH / prism height (m)
  notes?: string;
}

export interface SetoutResult {
  designPoint: SetoutDesignPoint;
  deltaE: number;
  deltaN: number;
  horizontalDistance: number;
  wcbDecimal: number;
  wcbDMS: string;           // formatted "142° 35' 20.4\""
  verticalAngle: number | null;   // decimal degrees — null if no elevation
  verticalAngleDMS: string | null;
  slopeDistance: number | null;
  notes: string;
}

export interface SetoutSchedule {
  station: SetoutStation;
  results: SetoutResult[];
}

/**
 * Normalise an angle in radians to [0, 2π)
 */
function normaliseRad(rad: number): number {
  const twoPi = 2 * Math.PI;
  return ((rad % twoPi) + twoPi) % twoPi;
}

/**
 * Compute the WCB in decimal degrees from (station) to (target).
 * WCB = atan2(ΔE, ΔN) normalised to [0°, 360°).
 */
function computeWCB(
  stationE: number, stationN: number,
  targetE: number,  targetN: number
): number {
  const dE = targetE - stationE;
  const dN = targetN - stationN;
  const radians = Math.atan2(dE, dN);
  const normalised = normaliseRad(radians);
  return (normalised * 180) / Math.PI;
}

/**
 * Main reduction: computes setout parameters for all design points from one station.
 */
export function computeSetout(
  station: SetoutStation,
  designPoints: SetoutDesignPoint[]
): SetoutSchedule {
  const results: SetoutResult[] = designPoints.map(dp => {
    const dE = Math.round((dp.easting  - station.easting)  * 1000) / 1000;
    const dN = Math.round((dp.northing - station.northing) * 1000) / 1000;

    const D_H = Math.round(Math.hypot(dE, dN) * 1000) / 1000;
    const wcbDec = computeWCB(station.easting, station.northing, dp.easting, dp.northing);
    const wcbFormatted = decimalToDMS(wcbDec).formatted;

    let va: number | null = null;
    let vaDMS: string | null = null;
    let slopeDist: number | null = null;

    if (
      typeof dp.elevation === 'number' && !isNaN(dp.elevation) &&
      D_H > 0
    ) {
      const TH  = dp.targetHeight ?? 1.5;
      const dZ  = dp.elevation + TH - station.elevation - station.instrumentHeight;
      va = (Math.atan2(dZ, D_H) * 180) / Math.PI;
      va = Math.round(va * 10000) / 10000;
      vaDMS = decimalToDMS(Math.abs(va)).formatted + (va < 0 ? ' (Depression)' : ' (Elevation)');
      const cosVA = Math.cos((va * Math.PI) / 180);
      slopeDist = cosVA !== 0 ? Math.round((D_H / cosVA) * 1000) / 1000 : D_H;
    }

    return {
      designPoint: dp,
      deltaE: dE,
      deltaN: dN,
      horizontalDistance: D_H,
      wcbDecimal: Math.round(wcbDec * 10000) / 10000,
      wcbDMS: wcbFormatted,
      verticalAngle: va,
      verticalAngleDMS: vaDMS,
      slopeDistance: slopeDist,
      notes: dp.notes || ''
    };
  });

  return { station, results };
}

// ─── Default demo dataset ─────────────────────────────────────────────────────
export const SETOUT_STATION_DEFAULT: SetoutStation = {
  stationId: 'OC_01',
  easting: 294315.000,
  northing: 992118.500,
  elevation: 347.250,
  instrumentHeight: 1.460
};

export const SETOUT_DESIGN_POINTS_DEMO: SetoutDesignPoint[] = [
  { id: '1', pointId: 'PEG_A1', easting: 294395.000, northing: 992218.000, elevation: 349.500, targetHeight: 1.5, notes: 'NW Corner Peg' },
  { id: '2', pointId: 'PEG_A2', easting: 294445.000, northing: 992178.000, elevation: 348.750, targetHeight: 1.5, notes: 'NE Corner Peg' },
  { id: '3', pointId: 'PEG_B1', easting: 294415.000, northing: 992098.000, elevation: 346.800, targetHeight: 1.5, notes: 'SE Corner Peg' },
  { id: '4', pointId: 'PEG_B2', easting: 294365.000, northing: 992078.000, elevation: 346.200, targetHeight: 1.5, notes: 'SW Corner Peg' },
  { id: '5', pointId: 'CL_01',  easting: 294405.000, northing: 992148.000, elevation: 348.000, targetHeight: 0.0, notes: 'Centreline Peg 1' },
];
