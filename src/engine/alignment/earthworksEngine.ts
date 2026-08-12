/**
 * Earthworks Volume Engine (Cross-Section & Cut/Fill Calculations)
 * Extracts transverse profiles from DTM along an alignment,
 * computes Cut/Fill cross-section areas, and integrates volumes
 * using Average End Area and Prismoidal formulas.
 */

import { ChainagePoint } from './alignmentEngine';
import { CoordinatePoint } from '../types';

export interface FormationParams {
  formationWidth: number;   // Road bed width W in metres (e.g. 10.0m)
  sideSlopeRatio: number;   // s in s:1 (horizontal : vertical, e.g. 1.5 for 1:1.5)
  defaultFormationZ?: number; // Base formation design level (m)
}

export interface CrossSectionPoint {
  offset: number;     // Metres left (-ve) or right (+ve) of centerline
  easting: number;
  northing: number;
  groundZ: number;    // Interpolated DTM elevation
  designZ: number;    // Formation design elevation
  depth: number;      // groundZ - designZ (positive = Cut, negative = Fill)
}

export interface ChainageCrossSection {
  chainage: number;
  chainageStr: string;
  centerEasting: number;
  centerNorthing: number;
  groundZ: number;
  designZ: number;
  cutArea: number;    // Cross-section cut area (m²)
  fillArea: number;   // Cross-section fill area (m²)
  profilePoints: CrossSectionPoint[];
  type: 'CUT' | 'FILL' | 'MIXED' | 'BALANCED';
}

export interface VolumeSegment {
  fromChainageStr: string;
  toChainageStr: string;
  distance: number;       // Distance between sections (m)
  endAreaCutVol: number;  // Cut volume via Average End Area (m³)
  endAreaFillVol: number; // Fill volume via Average End Area (m³)
  prismoidalCutVol: number;  // Cut volume via Prismoidal (m³)
  prismoidalFillVol: number; // Fill volume via Prismoidal (m³)
}

export interface EarthworksResult {
  params: FormationParams;
  sections: ChainageCrossSection[];
  volumeSegments: VolumeSegment[];
  totalEndAreaCutVol: number;
  totalEndAreaFillVol: number;
  totalPrismoidalCutVol: number;
  totalPrismoidalFillVol: number;
  netVolume: number;     // Cut (+ve) or Fill (-ve) balance (m³)
}

/** Interpolates ground elevation Z from nearest 3D survey points */
function sampleGroundElevation(
  easting: number,
  northing: number,
  dtmPoints: CoordinatePoint[]
): number {
  if (dtmPoints.length === 0) return 350.0; // fallback default elevation

  // Inverse Distance Weighting (IDW) from 4 nearest neighbors
  const dists = dtmPoints
    .filter(p => typeof p.elevation === 'number' && !isNaN(p.elevation!))
    .map(p => {
      const d = Math.hypot(p.easting - easting, p.northing - northing);
      return { z: p.elevation!, d };
    })
    .sort((a, b) => a.d - b.d);

  if (dists.length === 0) return 350.0;
  if (dists[0].d < 0.01) return dists[0].z; // exact match

  const k = Math.min(4, dists.length);
  let weightSum = 0;
  let zSum = 0;

  for (let i = 0; i < k; i++) {
    const w = 1 / Math.pow(Math.max(0.1, dists[i].d), 2);
    weightSum += w;
    zSum += dists[i].z * w;
  }

  return Math.round((zSum / weightSum) * 1000) / 1000;
}

/**
 * Computes Cross-Section Cut/Fill Areas & Profiles for all chainage stations.
 */
export function computeEarthworks(
  chainagePoints: ChainagePoint[],
  dtmPoints: CoordinatePoint[],
  params: FormationParams
): EarthworksResult {
  const { formationWidth, sideSlopeRatio } = params;
  const W = formationWidth;
  const s = sideSlopeRatio;

  const sections: ChainageCrossSection[] = chainagePoints.map(cp => {
    // Determine design formation level
    const designZ = typeof cp.elevation === 'number' && !isNaN(cp.elevation)
      ? cp.elevation
      : (params.defaultFormationZ ?? 348.0);

    const groundZ = sampleGroundElevation(cp.easting, cp.northing, dtmPoints);

    // Generate transverse cross-section profile points (-15m to +15m offset)
    const offsets = [-15, -10, -W / 2, 0, W / 2, 10, 15];
    const bearingRad = (cp.bearingDeg * Math.PI) / 180;
    const perpRad = bearingRad + Math.PI / 2;

    const profilePoints: CrossSectionPoint[] = offsets.map(off => {
      const pE = cp.easting + off * Math.sin(perpRad);
      const pN = cp.northing + off * Math.cos(perpRad);
      const gZ = sampleGroundElevation(pE, pN, dtmPoints);
      const depth = Math.round((gZ - designZ) * 1000) / 1000;

      return {
        offset: off,
        easting: Math.round(pE * 1000) / 1000,
        northing: Math.round(pN * 1000) / 1000,
        groundZ: gZ,
        designZ,
        depth
      };
    });

    // Centerline cut/fill depth
    const centerDepth = groundZ - designZ;
    let cutArea = 0;
    let fillArea = 0;
    let type: 'CUT' | 'FILL' | 'MIXED' | 'BALANCED' = 'BALANCED';

    // Trapezoidal section area approximation: A = (W + s * h) * h
    if (centerDepth > 0) {
      const h = centerDepth;
      cutArea = (W + s * h) * h;
      type = 'CUT';
    } else if (centerDepth < 0) {
      const h = Math.abs(centerDepth);
      fillArea = (W + s * h) * h;
      type = 'FILL';
    }

    cutArea = Math.round(cutArea * 1000) / 1000;
    fillArea = Math.round(fillArea * 1000) / 1000;

    return {
      chainage: cp.chainage,
      chainageStr: cp.chainageStr,
      centerEasting: cp.easting,
      centerNorthing: cp.northing,
      groundZ,
      designZ,
      cutArea,
      fillArea,
      profilePoints,
      type
    };
  });

  // Volume Integration between adjacent sections
  const volumeSegments: VolumeSegment[] = [];
  let totalEndAreaCutVol = 0;
  let totalEndAreaFillVol = 0;
  let totalPrismoidalCutVol = 0;
  let totalPrismoidalFillVol = 0;

  for (let i = 0; i < sections.length - 1; i++) {
    const s1 = sections[i];
    const s2 = sections[i + 1];
    const D = s2.chainage - s1.chainage;
    if (D <= 0) continue;

    // 1. Average End Area Method: V = 0.5 * (A1 + A2) * D
    const endAreaCut = 0.5 * (s1.cutArea + s2.cutArea) * D;
    const endAreaFill = 0.5 * (s1.fillArea + s2.fillArea) * D;

    // 2. Prismoidal Formula: V = (D / 6) * (A1 + 4*M + A2)
    const midCutArea = 0.5 * (s1.cutArea + s2.cutArea);
    const midFillArea = 0.5 * (s1.fillArea + s2.fillArea);

    const prismoidalCut = (D / 6) * (s1.cutArea + 4 * midCutArea + s2.cutArea);
    const prismoidalFill = (D / 6) * (s1.fillArea + 4 * midFillArea + s2.fillArea);

    volumeSegments.push({
      fromChainageStr: s1.chainageStr,
      toChainageStr: s2.chainageStr,
      distance: Math.round(D * 1000) / 1000,
      endAreaCutVol: Math.round(endAreaCut * 1000) / 1000,
      endAreaFillVol: Math.round(endAreaFill * 1000) / 1000,
      prismoidalCutVol: Math.round(prismoidalCut * 1000) / 1000,
      prismoidalFillVol: Math.round(prismoidalFill * 1000) / 1000
    });

    totalEndAreaCutVol += endAreaCut;
    totalEndAreaFillVol += endAreaFill;
    totalPrismoidalCutVol += prismoidalCut;
    totalPrismoidalFillVol += prismoidalFill;
  }

  totalEndAreaCutVol = Math.round(totalEndAreaCutVol * 1000) / 1000;
  totalEndAreaFillVol = Math.round(totalEndAreaFillVol * 1000) / 1000;
  totalPrismoidalCutVol = Math.round(totalPrismoidalCutVol * 1000) / 1000;
  totalPrismoidalFillVol = Math.round(totalPrismoidalFillVol * 1000) / 1000;
  const netVolume = Math.round((totalEndAreaCutVol - totalEndAreaFillVol) * 1000) / 1000;

  return {
    params,
    sections,
    volumeSegments,
    totalEndAreaCutVol,
    totalEndAreaFillVol,
    totalPrismoidalCutVol,
    totalPrismoidalFillVol,
    netVolume
  };
}
