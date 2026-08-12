/**
 * Area Sub-Division & Land Partitioning Engine
 * Splits an existing polygon parcel into two child sub-plots
 * matching a target area using Parallel Line or Pivot Point methods.
 */

import { CoordinatePoint, Parcel, ParcelComputationResult } from '../types';
import { shoelaceArea, inversePoints } from '../cogo';

export type SubdivisionMethod = 'PARALLEL' | 'PIVOT';

export interface SubdivisionParams {
  parentParcel: Parcel;
  allPoints: CoordinatePoint[];
  method: SubdivisionMethod;
  targetAreaSqM: number;       // Target area for Child Plot A (m²)
  referenceEdgeIndex?: number;  // Index of edge V_i -> V_{i+1} for Parallel method
  pivotPointId?: string;       // ID of pivot vertex beacon for Pivot method
  childAName?: string;          // e.g. "Plot 1A"
  childBName?: string;          // e.g. "Plot 1B"
}

export interface PartitionPoint {
  id: string;
  easting: number;
  northing: number;
  edgeFromId: string;
  edgeToId: string;
}

export interface SubdivisionResult {
  childParcelA: Parcel;
  childParcelB: Parcel;
  childCompA: ParcelComputationResult;
  childCompB: ParcelComputationResult;
  newBeacons: CoordinatePoint[];
  methodUsed: SubdivisionMethod;
  targetAreaSqM: number;
  actualAreaASqM: number;
  actualAreaBSqM: number;
  areaResidualSqM: number;
}

/** Intersects an infinite line (passing through L1 with direction Ldir) with segment (S1 -> S2) */
function intersectLineSegment(
  L1: { x: number; y: number },
  Ldir: { x: number; y: number },
  S1: { x: number; y: number },
  S2: { x: number; y: number }
): { x: number; y: number; tSegment: number } | null {
  const dx = S2.x - S1.x;
  const dy = S2.y - S1.y;

  const denom = Ldir.x * dy - Ldir.y * dx;
  if (Math.abs(denom) < 1e-10) return null; // Parallel

  const tSegment = ((L1.x - S1.x) * Ldir.y - (L1.y - S1.y) * Ldir.x) / denom;
  if (tSegment < -1e-6 || tSegment > 1 + 1e-6) return null; // Outside segment

  const tClamped = Math.max(0, Math.min(1, tSegment));
  return {
    x: S1.x + tClamped * dx,
    y: S1.y + tClamped * dy,
    tSegment: tClamped
  };
}

/**
 * Computes Area Sub-Division for a parcel.
 */
export function computeSubdivision(params: SubdivisionParams): SubdivisionResult {
  const {
    parentParcel,
    allPoints,
    method,
    targetAreaSqM,
    referenceEdgeIndex = 0,
    pivotPointId,
    childAName = `${parentParcel.plotNumber}A`,
    childBName = `${parentParcel.plotNumber}B`
  } = params;

  const pointMap = new Map<string, CoordinatePoint>(allPoints.map(p => [p.id, p]));
  const vertices: CoordinatePoint[] = parentParcel.pointIds
    .map(pid => pointMap.get(pid))
    .filter((p): p is CoordinatePoint => p !== undefined);

  if (vertices.length < 3) {
    throw new Error('Parent parcel must have at least 3 vertices to sub-divide.');
  }

  const totalArea = shoelaceArea(vertices);
  if (targetAreaSqM <= 0 || targetAreaSqM >= totalArea) {
    throw new Error(`Target area (${targetAreaSqM.toFixed(1)}m²) must be strictly between 0 and total area (${totalArea.toFixed(1)}m²).`);
  }

  const n = vertices.length;

  if (method === 'PARALLEL') {
    // ── PARALLEL EDGE SUB-DIVISION ─────────────────────────────────────────
    const edgeIdx = referenceEdgeIndex % n;
    const v1 = vertices[edgeIdx];
    const v2 = vertices[(edgeIdx + 1) % n];

    const dx = v2.easting - v1.easting;
    const dy = v2.northing - v1.northing;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) throw new Error('Invalid zero-length reference edge.');

    const u = { x: dx / len, y: dy / len };
    let nDir = { x: -u.y, y: u.x }; // Candidate normal

    // Compute polygon centroid
    const centX = vertices.reduce((sum, v) => sum + v.easting, 0) / n;
    const centY = vertices.reduce((sum, v) => sum + v.northing, 0) / n;
    const midEdgeX = (v1.easting + v2.easting) / 2;
    const midEdgeY = (v1.northing + v2.northing) / 2;

    // Align normal towards centroid interior
    const dotCent = nDir.x * (centX - midEdgeX) + nDir.y * (centY - midEdgeY);
    if (dotCent < 0) {
      nDir = { x: -nDir.x, y: -nDir.y };
    }

    const maxOffset = Math.max(...vertices.map(v => Math.hypot(v.easting - v1.easting, v.northing - v1.northing))) * 1.5;

    // Helper to evaluate Child A polygon area at offset d
    const evalAtOffset = (d: number) => {
      const L1 = { x: v1.easting + d * nDir.x, y: v1.northing + d * nDir.y };
      const intersections: Array<{ x: number; y: number; edgeIdx: number }> = [];

      for (let j = 0; j < n; j++) {
        const s1 = vertices[j];
        const s2 = vertices[(j + 1) % n];
        const res = intersectLineSegment(L1, u, { x: s1.easting, y: s1.northing }, { x: s2.easting, y: s2.northing });
        if (res) {
          intersections.push({ x: res.x, y: res.y, edgeIdx: j });
        }
      }

      if (intersections.length < 2) return null;

      const int1 = intersections[0];
      const int2 = intersections[intersections.length - 1];

      const childAPoly: { easting: number; northing: number }[] = [
        { easting: int1.x, northing: int1.y },
        { easting: int2.x, northing: int2.y }
      ];

      let curr = (int2.edgeIdx + 1) % n;
      while (curr !== (int1.edgeIdx + 1) % n) {
        childAPoly.push({ easting: vertices[curr].easting, northing: vertices[curr].northing });
        curr = (curr + 1) % n;
      }

      const area = shoelaceArea(childAPoly);
      return { area, int1, int2 };
    };

    // Step 1: Scan offset range [0, maxOffset] to find bracket
    const numSteps = 200;
    let dLow = 0;
    let dHigh = maxOffset;
    let foundBracket = false;

    let prevD = 0;
    let prevEval = evalAtOffset(0);

    for (let sIdx = 1; sIdx <= numSteps; sIdx++) {
      const currD = (sIdx / numSteps) * maxOffset;
      const currEval = evalAtOffset(currD);

      if (prevEval && currEval) {
        const minA = Math.min(prevEval.area, currEval.area);
        const maxA = Math.max(prevEval.area, currEval.area);

        if (targetAreaSqM >= minA && targetAreaSqM <= maxA) {
          dLow = prevD;
          dHigh = currD;
          foundBracket = true;
          break;
        }
      }
      prevD = currD;
      prevEval = currEval;
    }

    if (!foundBracket) {
      // Fallback range scan in negative normal direction
      for (let sIdx = 1; sIdx <= numSteps; sIdx++) {
        const currD = -(sIdx / numSteps) * maxOffset;
        const currEval = evalAtOffset(currD);
        if (prevEval && currEval) {
          const minA = Math.min(prevEval.area, currEval.area);
          const maxA = Math.max(prevEval.area, currEval.area);
          if (targetAreaSqM >= minA && targetAreaSqM <= maxA) {
            dLow = prevD;
            dHigh = currD;
            foundBracket = true;
            break;
          }
        }
        prevD = currD;
        prevEval = currEval;
      }
    }

    // Step 2: Binary search inside bracket
    let bestPoints: { p1: { x: number; y: number }; p2: { x: number; y: number }; e1Idx: number; e2Idx: number } | null = null;
    let low = dLow;
    let high = dHigh;

    for (let iter = 0; iter < 40; iter++) {
      const mid = (low + high) / 2;
      const ev = evalAtOffset(mid);

      if (ev) {
        bestPoints = { p1: ev.int1, p2: ev.int2, e1Idx: ev.int1.edgeIdx, e2Idx: ev.int2.edgeIdx };
        const evLow = evalAtOffset(low);
        if (evLow && (evLow.area < targetAreaSqM)) {
          if (ev.area < targetAreaSqM) low = mid;
          else high = mid;
        } else {
          if (ev.area > targetAreaSqM) low = mid;
          else high = mid;
        }
      } else {
        high = mid;
      }
    }

    if (!bestPoints) {
      throw new Error('Failed to find parallel partition line for the specified target area.');
    }

    // Create partition beacons
    const p1Id = `PB_${parentParcel.plotNumber}_1`;
    const p2Id = `PB_${parentParcel.plotNumber}_2`;

    const beacon1: CoordinatePoint = {
      id: p1Id,
      easting: Math.round(bestPoints.p1.x * 1000) / 1000,
      northing: Math.round(bestPoints.p1.y * 1000) / 1000,
      code: 'PB',
      description: `Partition Beacon 1 (${childAName}/${childBName})`
    };

    const beacon2: CoordinatePoint = {
      id: p2Id,
      easting: Math.round(bestPoints.p2.x * 1000) / 1000,
      northing: Math.round(bestPoints.p2.y * 1000) / 1000,
      code: 'PB',
      description: `Partition Beacon 2 (${childAName}/${childBName})`
    };

    // Construct Child A point IDs
    const childAPointIds: string[] = [p1Id, p2Id];
    let curr = (bestPoints.e2Idx + 1) % n;
    while (curr !== (bestPoints.e1Idx + 1) % n) {
      childAPointIds.push(vertices[curr].id);
      curr = (curr + 1) % n;
    }

    // Construct Child B point IDs
    const childBPointIds: string[] = [p2Id, p1Id];
    curr = (bestPoints.e1Idx + 1) % n;
    while (curr !== (bestPoints.e2Idx + 1) % n) {
      childBPointIds.push(vertices[curr].id);
      curr = (curr + 1) % n;
    }

    const newPointsMap = new Map(allPoints.map(p => [p.id, p]));
    newPointsMap.set(p1Id, beacon1);
    newPointsMap.set(p2Id, beacon2);
    const combinedPoints = Array.from(newPointsMap.values());

    const childParcelA: Parcel = {
      id: `parcel_${childAName.toLowerCase().replace(/\s+/g, '_')}`,
      plotNumber: childAName,
      ownerName: parentParcel.ownerName ? `${parentParcel.ownerName} (Part A)` : undefined,
      color: '#10b981',
      pointIds: childAPointIds
    };

    const childParcelB: Parcel = {
      id: `parcel_${childBName.toLowerCase().replace(/\s+/g, '_')}`,
      plotNumber: childBName,
      ownerName: parentParcel.ownerName ? `${parentParcel.ownerName} (Part B)` : undefined,
      color: '#06b6d4',
      pointIds: childBPointIds
    };

    const compA = buildParcelComputation(childParcelA, combinedPoints);
    const compB = buildParcelComputation(childParcelB, combinedPoints);

    return {
      childParcelA,
      childParcelB,
      childCompA: compA,
      childCompB: compB,
      newBeacons: [beacon1, beacon2],
      methodUsed: 'PARALLEL',
      targetAreaSqM,
      actualAreaASqM: compA.areaSquareMeters,
      actualAreaBSqM: compB.areaSquareMeters,
      areaResidualSqM: Math.round(Math.abs(compA.areaSquareMeters - targetAreaSqM) * 1000) / 1000
    };
  } else {
    // ── PIVOT POINT SUB-DIVISION ─────────────────────────────────────────
    const pivotIdx = vertices.findIndex(v => v.id === pivotPointId);
    const pivotPt = pivotIdx !== -1 ? vertices[pivotIdx] : vertices[0];
    const pIdx = pivotIdx !== -1 ? pivotIdx : 0;

    const evalAtAngle = (ang: number) => {
      const rayDir = { x: Math.sin(ang), y: Math.cos(ang) };
      const intersections: Array<{ x: number; y: number; edgeIdx: number }> = [];

      for (let j = 0; j < n; j++) {
        if (j === pIdx || (j + 1) % n === pIdx) continue;
        const s1 = vertices[j];
        const s2 = vertices[(j + 1) % n];
        const res = intersectLineSegment(
          { x: pivotPt.easting, y: pivotPt.northing },
          rayDir,
          { x: s1.easting, y: s1.northing },
          { x: s2.easting, y: s2.northing }
        );
        if (res) intersections.push({ x: res.x, y: res.y, edgeIdx: j });
      }

      if (intersections.length === 0) return null;
      const int1 = intersections[0];

      const childAPoly: { easting: number; northing: number }[] = [
        { easting: pivotPt.easting, northing: pivotPt.northing },
        { easting: int1.x, northing: int1.y }
      ];

      let curr = (int1.edgeIdx + 1) % n;
      while (curr !== pIdx) {
        childAPoly.push({ easting: vertices[curr].easting, northing: vertices[curr].northing });
        curr = (curr + 1) % n;
      }

      const area = shoelaceArea(childAPoly);
      return { area, int1 };
    };

    // Scan full 360 degrees to find target area bracket
    const numSteps = 360;
    let angLow = 0;
    let angHigh = 2 * Math.PI;
    let foundBracket = false;

    let prevAng = 0;
    let prevEval = evalAtAngle(0);

    for (let sIdx = 1; sIdx <= numSteps; sIdx++) {
      const currAng = (sIdx / numSteps) * 2 * Math.PI;
      const currEval = evalAtAngle(currAng);

      if (prevEval && currEval) {
        const minA = Math.min(prevEval.area, currEval.area);
        const maxA = Math.max(prevEval.area, currEval.area);

        if (targetAreaSqM >= minA && targetAreaSqM <= maxA) {
          angLow = prevAng;
          angHigh = currAng;
          foundBracket = true;
          break;
        }
      }
      prevAng = currAng;
      prevEval = currEval;
    }

    let lowAngle = foundBracket ? angLow : 0;
    let highAngle = foundBracket ? angHigh : 2 * Math.PI;
    let bestPoint: { x: number; y: number; edgeIdx: number } | null = null;

    for (let iter = 0; iter < 40; iter++) {
      const midAngle = (lowAngle + highAngle) / 2;
      const ev = evalAtAngle(midAngle);

      if (ev) {
        bestPoint = ev.int1;
        const evLow = evalAtAngle(lowAngle);
        if (evLow && evLow.area < targetAreaSqM) {
          if (ev.area < targetAreaSqM) lowAngle = midAngle;
          else highAngle = midAngle;
        } else {
          if (ev.area > targetAreaSqM) lowAngle = midAngle;
          else highAngle = midAngle;
        }
      } else {
        highAngle = midAngle;
      }
    }

    if (!bestPoint) {
      throw new Error('Failed to find pivot partition line for the specified target area.');
    }

    const p1Id = `PB_${parentParcel.plotNumber}_1`;
    const beacon1: CoordinatePoint = {
      id: p1Id,
      easting: Math.round(bestPoint.x * 1000) / 1000,
      northing: Math.round(bestPoint.y * 1000) / 1000,
      code: 'PB',
      description: `Partition Beacon (${childAName}/${childBName})`
    };

    const childAPointIds: string[] = [pivotPt.id, p1Id];
    let curr = (bestPoint.edgeIdx + 1) % n;
    while (curr !== pIdx) {
      childAPointIds.push(vertices[curr].id);
      curr = (curr + 1) % n;
    }

    const childBPointIds: string[] = [p1Id, pivotPt.id];
    curr = (pIdx + 1) % n;
    while (curr !== (bestPoint.edgeIdx + 1) % n) {
      childBPointIds.push(vertices[curr].id);
      curr = (curr + 1) % n;
    }

    const newPointsMap = new Map(allPoints.map(p => [p.id, p]));
    newPointsMap.set(p1Id, beacon1);
    const combinedPoints = Array.from(newPointsMap.values());

    const childParcelA: Parcel = {
      id: `parcel_${childAName.toLowerCase().replace(/\s+/g, '_')}`,
      plotNumber: childAName,
      ownerName: parentParcel.ownerName ? `${parentParcel.ownerName} (Part A)` : undefined,
      color: '#10b981',
      pointIds: childAPointIds
    };

    const childParcelB: Parcel = {
      id: `parcel_${childBName.toLowerCase().replace(/\s+/g, '_')}`,
      plotNumber: childBName,
      ownerName: parentParcel.ownerName ? `${parentParcel.ownerName} (Part B)` : undefined,
      color: '#06b6d4',
      pointIds: childBPointIds
    };

    const compA = buildParcelComputation(childParcelA, combinedPoints);
    const compB = buildParcelComputation(childParcelB, combinedPoints);

    return {
      childParcelA,
      childParcelB,
      childCompA: compA,
      childCompB: compB,
      newBeacons: [beacon1],
      methodUsed: 'PIVOT',
      targetAreaSqM,
      actualAreaASqM: compA.areaSquareMeters,
      actualAreaBSqM: compB.areaSquareMeters,
      areaResidualSqM: Math.round(Math.abs(compA.areaSquareMeters - targetAreaSqM) * 1000) / 1000
    };
  }
}

/** Helper to build full parcel computation object for child plot */
function buildParcelComputation(parcel: Parcel, allPoints: CoordinatePoint[]): ParcelComputationResult {
  const pointMap = new Map<string, CoordinatePoint>(allPoints.map(p => [p.id, p]));
  const vertices = parcel.pointIds.map(pid => pointMap.get(pid)).filter((p): p is CoordinatePoint => p !== undefined);

  let sum1 = 0, sum2 = 0, perimeter = 0;
  const legs = [];
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];
    sum1 += curr.easting * next.northing;
    sum2 += next.easting * curr.northing;
    const leg = inversePoints(curr, next);
    legs.push(leg);
    perimeter += leg.distance;
  }

  const areaSqM = 0.5 * Math.abs(sum1 - sum2);

  return {
    parcel,
    vertices,
    areaSquareMeters: Math.round(areaSqM * 1000) / 1000,
    areaHectares: Math.round((areaSqM / 10000) * 10000) / 10000,
    perimeter: Math.round(perimeter * 1000) / 1000,
    isClosed: true,
    closureMisclose: 0.000,
    legs
  };
}
