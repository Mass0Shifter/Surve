import { CoordinatePoint, Parcel } from '../types';
import { computeParcel, shoelaceArea } from '../cogo';

export interface SetbackResult {
  parcelId: string;
  setbackDistance: number;
  originalArea: number;
  usableBuildingArea: number;
  setbackVertices: { easting: number; northing: number }[];
}

/**
 * Computes an inward offset (setback) polygon for building footprint regulation.
 * Common in Nigerian town planning (3m side/rear setbacks, 6m front road setback).
 */
export function computeParcelSetback(
  parcel: Parcel,
  points: CoordinatePoint[],
  setbackDistance: number = 3.0
): SetbackResult | null {
  const comp = computeParcel(parcel, points);
  if (!comp || comp.vertices.length < 3) return null;

  const verts = comp.vertices;
  const n = verts.length;
  const setbackVerts: { easting: number; northing: number }[] = [];

  // Compute centroid
  const centE = verts.reduce((s, v) => s + v.easting, 0) / n;
  const centN = verts.reduce((s, v) => s + v.northing, 0) / n;

  for (let i = 0; i < n; i++) {
    const curr = verts[i];
    // Direction vector towards centroid
    const dx = centE - curr.easting;
    const dy = centN - curr.northing;
    const len = Math.hypot(dx, dy);

    if (len > 0) {
      // Offset inward along centroid ray proportionally
      const scale = Math.max(0.1, (len - setbackDistance) / len);
      setbackVerts.push({
        easting: curr.easting + dx * (1 - scale),
        northing: curr.northing + dy * (1 - scale)
      });
    } else {
      setbackVerts.push({ easting: curr.easting, northing: curr.northing });
    }
  }

  const usableArea = shoelaceArea(setbackVerts);

  return {
    parcelId: parcel.id,
    setbackDistance,
    originalArea: comp.areaSquareMeters,
    usableBuildingArea: usableArea,
    setbackVertices: setbackVerts
  };
}

/**
 * Proportional parcel division calculation (Modernizes legacy frmDivPol)
 * Splits a 4-corner parcel into two equal or custom ratio sub-plots (e.g. 50/50 split).
 */
export function divideParcelProportional(
  parcel: Parcel,
  points: CoordinatePoint[],
  ratio: number = 0.5 // 0.5 = 50/50 split
): { subPlotA: CoordinatePoint[]; subPlotB: CoordinatePoint[]; areaA: number; areaB: number } | null {
  const comp = computeParcel(parcel, points);
  if (!comp || comp.vertices.length !== 4) return null;

  const [p1, p2, p3, p4] = comp.vertices;

  // Midpoints along opposite edges
  const mid1_2: CoordinatePoint = {
    id: `${parcel.plotNumber}_SPLIT_1`,
    easting: p1.easting + (p2.easting - p1.easting) * ratio,
    northing: p1.northing + (p2.northing - p1.northing) * ratio
  };

  const mid4_3: CoordinatePoint = {
    id: `${parcel.plotNumber}_SPLIT_2`,
    easting: p4.easting + (p3.easting - p4.easting) * ratio,
    northing: p4.northing + (p3.northing - p4.northing) * ratio
  };

  const subPlotA = [p1, mid1_2, mid4_3, p4];
  const subPlotB = [mid1_2, p2, p3, mid4_3];

  const areaA = shoelaceArea(subPlotA);
  const areaB = shoelaceArea(subPlotB);

  return {
    subPlotA,
    subPlotB,
    areaA,
    areaB
  };
}
