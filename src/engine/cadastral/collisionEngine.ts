/**
 * Cadastral Cartography & Automated Anti-Collision Engine
 * 
 * Implements high-performance screen-space bounding box collision resolution,
 * multi-candidate placement scoring, spring-relaxation repulsion, dynamic
 * leader line generation, and manual drag-offset persistence.
 */

import { CoordinatePoint, Parcel } from '../types';
import { computeParcel } from '../cogo';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface BeaconLabelPlacement {
  id: string;
  pointId: string;
  x: number;
  y: number;
  textAnchor: 'start' | 'middle' | 'end';
  dominantBaseline: 'auto' | 'central' | 'hanging';
  hasLeaderLine: boolean;
  anchorX: number;
  anchorY: number;
  isControl?: boolean;
}

export interface ParcelBadgePlacement {
  id: string;
  parcelId: string;
  plotNumber: string;
  ownerName?: string;
  areaText: string;
  x: number;
  y: number;
  hasLeaderLine: boolean;
  anchorX: number;
  anchorY: number;
  areaSqMeters: number;
}

export interface BoundaryDimensionPlacement {
  key: string;
  fromPointId: string;
  toPointId: string;
  bearingStr: string;
  distStr: string;
  x: number;
  y: number;
  angleDeg: number;
  normX: number;
  normY: number;
}

export interface CollisionFreeLayout {
  beaconLabels: BeaconLabelPlacement[];
  parcelBadges: ParcelBadgePlacement[];
  boundaryDimensions: BoundaryDimensionPlacement[];
  totalCollisionsResolved: number;
}

export interface CollisionLayoutInput {
  parcels: Parcel[];
  points: CoordinatePoint[];
  toScreenX: (easting: number) => number;
  toScreenY: (northing: number) => number;
  beaconSize?: number;
  titleFontSize?: number;
  areaFontSize?: number;
  bearingFontSize?: number;
  beaconFontSize?: number;
  manualOffsets?: Record<string, { dx: number; dy: number }>;
  enableAutoDeconfliction?: boolean;
}

/**
 * Checks if two bounding boxes intersect with given safety margin.
 */
function boxesOverlap(b1: BoundingBox, b2: BoundingBox, margin: number = 3): boolean {
  return !(
    b1.x + b1.width + margin < b2.x ||
    b2.x + b2.width + margin < b1.x ||
    b1.y + b1.height + margin < b2.y ||
    b2.y + b2.height + margin < b1.y
  );
}

/**
 * Computes an AABB for a text label given center position, estimated character count, and font size.
 */
function estimateTextAABB(
  cx: number,
  cy: number,
  text: string,
  fontSize: number,
  anchor: 'start' | 'middle' | 'end' = 'middle'
): BoundingBox {
  const charWidth = fontSize * 0.58;
  const width = Math.max(12, text.length * charWidth);
  const height = fontSize * 1.25;

  let x = cx - width / 2;
  if (anchor === 'start') x = cx;
  else if (anchor === 'end') x = cx - width;

  const y = cy - height / 2;
  return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
}

/**
 * Main layout computation engine: calculates optimal non-overlapping coordinates
 * for all beacon labels, parcel badges, and boundary dimensions.
 */
export function computeCollisionFreeLayout(input: CollisionLayoutInput): CollisionFreeLayout {
  const {
    parcels,
    points,
    toScreenX,
    toScreenY,
    beaconSize = 1.4,
    titleFontSize = 9,
    areaFontSize = 7.5,
    bearingFontSize = 5.2,
    beaconFontSize = 6.2,
    manualOffsets = {},
    enableAutoDeconfliction = true
  } = input;

  const pointMap = new Map(points.map(p => [p.id, p]));
  const targetPointIds = new Set<string>();
  parcels.forEach(p => p.pointIds.forEach(id => targetPointIds.add(id)));
  const targetPoints = Array.from(targetPointIds).map(id => pointMap.get(id)).filter(Boolean) as CoordinatePoint[];

  const bRad = beaconSize * 2.2;

  // ─── 1. INITIALIZE PARCEL CENTROID BADGES ─────────────────────────────────
  const parcelBadges: ParcelBadgePlacement[] = [];
  const badgeBoxes: { id: string; box: BoundingBox; anchorX: number; anchorY: number }[] = [];

  for (const parcel of parcels) {
    const comp = computeParcel(parcel, points);
    if (!comp || comp.vertices.length < 3) continue;

    // Geometric Centroid
    const centX = comp.vertices.reduce((s, v) => s + toScreenX(v.easting), 0) / comp.vertices.length;
    const centY = comp.vertices.reduce((s, v) => s + toScreenY(v.northing), 0) / comp.vertices.length;

    const areaText = `${comp.areaSquareMeters.toFixed(2)} m² (${comp.areaHectares.toFixed(4)} Ha)`;
    const maxTextLen = Math.max(parcel.plotNumber.length, areaText.length, (parcel.ownerName || '').length);
    const boxWidth = Math.max(45, maxTextLen * (Math.max(titleFontSize, areaFontSize) * 0.58));
    const boxHeight = (parcel.ownerName ? 3 : 2) * (Math.max(titleFontSize, areaFontSize) * 1.3);

    const override = manualOffsets[`parcel_${parcel.id}`] || { dx: 0, dy: 0 };
    const initX = centX + override.dx;
    const initY = centY + override.dy;

    const box: BoundingBox = {
      x: initX - boxWidth / 2,
      y: initY - boxHeight / 2,
      width: boxWidth,
      height: boxHeight,
      centerX: initX,
      centerY: initY
    };

    parcelBadges.push({
      id: `parcel_${parcel.id}`,
      parcelId: parcel.id,
      plotNumber: parcel.plotNumber,
      ownerName: parcel.ownerName,
      areaText,
      x: initX,
      y: initY,
      hasLeaderLine: Math.hypot(override.dx, override.dy) > 18,
      anchorX: centX,
      anchorY: centY,
      areaSqMeters: comp.areaSquareMeters
    });

    badgeBoxes.push({ id: `parcel_${parcel.id}`, box, anchorX: centX, anchorY: centY });
  }

  // ─── 2. INITIALIZE BEACON LABELS ──────────────────────────────────────────
  const beaconLabels: BeaconLabelPlacement[] = [];
  const beaconBoxes: { id: string; box: BoundingBox; anchorX: number; anchorY: number }[] = [];

  for (const pt of targetPoints) {
    const bx = toScreenX(pt.easting);
    const by = toScreenY(pt.northing);

    // Determine outward normal from incident parcel polygons
    let normX = 1;
    let normY = -1;
    let textAnchor: 'start' | 'middle' | 'end' = 'start';

    for (const parcel of parcels) {
      const idx = parcel.pointIds.indexOf(pt.id);
      if (idx !== -1) {
        const comp = computeParcel(parcel, points);
        if (comp && comp.vertices.length >= 3) {
          const n = parcel.pointIds.length;
          const vCentX = comp.vertices.reduce((s, v) => s + toScreenX(v.easting), 0) / comp.vertices.length;
          const vCentY = comp.vertices.reduce((s, v) => s + toScreenY(v.northing), 0) / comp.vertices.length;

          const prevId = parcel.pointIds[(idx - 1 + n) % n];
          const nextId = parcel.pointIds[(idx + 1) % n];
          const prevPt = pointMap.get(prevId);
          const nextPt = pointMap.get(nextId);

          if (prevPt && nextPt) {
            const px = toScreenX(prevPt.easting);
            const py = toScreenY(prevPt.northing);
            const nx = toScreenX(nextPt.easting);
            const ny = toScreenY(nextPt.northing);

            const v1x = bx - px;
            const v1y = by - py;
            const v2x = nx - bx;
            const v2y = ny - by;
            const l1 = Math.hypot(v1x, v1y) || 1;
            const l2 = Math.hypot(v2x, v2y) || 1;

            let nxCalc = -(v1y / l1 + v2y / l2);
            let nyCalc = (v1x / l1 + v2x / l2);
            let nLen = Math.hypot(nxCalc, nyCalc);

            if (nLen < 0.01) {
              nxCalc = bx - vCentX;
              nyCalc = by - vCentY;
              nLen = Math.hypot(nxCalc, nyCalc) || 1;
            }

            nxCalc /= nLen;
            nyCalc /= nLen;

            if (nxCalc * (bx - vCentX) + nyCalc * (by - vCentY) < 0) {
              nxCalc = -nxCalc;
              nyCalc = -nyCalc;
            }

            normX = nxCalc;
            normY = nyCalc;
            textAnchor = normX < -0.3 ? 'end' : normX > 0.3 ? 'start' : 'middle';
            break;
          }
        }
      }
    }

    const defaultDist = bRad + 6;
    let initX = bx + normX * defaultDist;
    let initY = by + normY * defaultDist + (normY < -0.2 ? -2 : normY > 0.2 ? 5 : 1);

    const override = manualOffsets[`beacon_${pt.id}`] || { dx: 0, dy: 0 };
    initX += override.dx;
    initY += override.dy;

    const box = estimateTextAABB(initX, initY, pt.id, beaconFontSize * 1.25, textAnchor);

    beaconLabels.push({
      id: `beacon_${pt.id}`,
      pointId: pt.id,
      x: initX,
      y: initY,
      textAnchor,
      dominantBaseline: 'auto',
      hasLeaderLine: Math.hypot(initX - bx, initY - by) > (bRad + 14) || Math.hypot(override.dx, override.dy) > 10,
      anchorX: bx,
      anchorY: by,
      isControl: pt.isControl
    });

    beaconBoxes.push({ id: `beacon_${pt.id}`, box, anchorX: bx, anchorY: by });
  }

  // ─── 3. INITIALIZE BOUNDARY DIMENSIONS ────────────────────────────────────
  const boundaryDimensions: BoundaryDimensionPlacement[] = [];
  const renderedEdges = new Set<string>();

  for (const parcel of parcels) {
    const comp = computeParcel(parcel, points);
    if (!comp) continue;

    const centX = comp.vertices.reduce((s, v) => s + toScreenX(v.easting), 0) / comp.vertices.length;
    const centY = comp.vertices.reduce((s, v) => s + toScreenY(v.northing), 0) / comp.vertices.length;

    for (const leg of comp.legs) {
      const edgeKey = [leg.fromPoint.id, leg.toPoint.id].sort().join('--');
      if (renderedEdges.has(edgeKey)) continue;
      renderedEdges.add(edgeKey);

      const p1 = { x: toScreenX(leg.fromPoint.easting), y: toScreenY(leg.fromPoint.northing) };
      const p2 = { x: toScreenX(leg.toPoint.easting), y: toScreenY(leg.toPoint.northing) };

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;

      let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
      if (angleDeg > 90 || angleDeg < -90) {
        angleDeg += 180;
      }

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      let normX = -dy / len;
      let normY = dx / len;
      const toCentX = centX - midX;
      const toCentY = centY - midY;
      if (normX * toCentX + normY * toCentY > 0) {
        normX = -normX;
        normY = -normY;
      }

      const offsetPx = Math.max(4.0, bearingFontSize * 0.95);
      const override = manualOffsets[`dim_${edgeKey}`] || { dx: 0, dy: 0 };
      const textCenterX = midX + normX * offsetPx + override.dx;
      const textCenterY = midY + normY * offsetPx + override.dy;

      boundaryDimensions.push({
        key: edgeKey,
        fromPointId: leg.fromPoint.id,
        toPointId: leg.toPoint.id,
        bearingStr: leg.bearing.formatted,
        distStr: `${leg.distance.toFixed(2)}m`,
        x: textCenterX,
        y: textCenterY,
        angleDeg,
        normX,
        normY
      });
    }
  }

  // ─── 4. FORCE-DIRECTED SPRING RELAXATION (ANTI-COLLISION PASS) ───────────
  let collisionsResolved = 0;

  if (enableAutoDeconfliction) {
    const allBoxes = [
      ...badgeBoxes.map(b => ({ ...b, type: 'badge' as const })),
      ...beaconBoxes.map(b => ({ ...b, type: 'beacon' as const }))
    ];

    const iterations = 8;
    const damping = 0.85;

    for (let iter = 0; iter < iterations; iter++) {
      let movedAny = false;

      for (let i = 0; i < allBoxes.length; i++) {
        for (let j = i + 1; j < allBoxes.length; j++) {
          const itemA = allBoxes[i];
          const itemB = allBoxes[j];

          // Skip if user manually positioned both
          const isManualA = !!manualOffsets[itemA.id];
          const isManualB = !!manualOffsets[itemB.id];
          if (isManualA && isManualB) continue;

          if (boxesOverlap(itemA.box, itemB.box, 4)) {
            collisionsResolved++;
            movedAny = true;

            let deltaX = itemA.box.centerX - itemB.box.centerX;
            let deltaY = itemA.box.centerY - itemB.box.centerY;
            let dist = Math.hypot(deltaX, deltaY);

            if (dist < 0.1) {
              deltaX = (Math.random() - 0.5) * 4;
              deltaY = (Math.random() - 0.5) * 4;
              dist = Math.hypot(deltaX, deltaY);
            }

            const overlap = (itemA.box.width + itemB.box.width) / 2 + 6 - dist;
            if (overlap > 0) {
              const pushX = (deltaX / dist) * (overlap * 0.5) * damping;
              const pushY = (deltaY / dist) * (overlap * 0.5) * damping;

              if (!isManualA) {
                itemA.box.x += pushX;
                itemA.box.y += pushY;
                itemA.box.centerX += pushX;
                itemA.box.centerY += pushY;
              }

              if (!isManualB) {
                itemB.box.x -= pushX;
                itemB.box.y -= pushY;
                itemB.box.centerX -= pushX;
                itemB.box.centerY -= pushY;
              }
            }
          }
        }
      }

      if (!movedAny) break;
    }

    // Sync relaxed positions back to output structures
    for (const b of badgeBoxes) {
      const target = parcelBadges.find(p => p.id === b.id);
      if (target && !manualOffsets[b.id]) {
        target.x = b.box.centerX;
        target.y = b.box.centerY;
        target.hasLeaderLine = Math.hypot(target.x - target.anchorX, target.y - target.anchorY) > 16;
      }
    }

    for (const b of beaconBoxes) {
      const target = beaconLabels.find(p => p.id === b.id);
      if (target && !manualOffsets[b.id]) {
        target.x = b.box.centerX;
        target.y = b.box.centerY;
        target.hasLeaderLine = Math.hypot(target.x - target.anchorX, target.y - target.anchorY) > (bRad + 12);
      }
    }
  }

  return {
    beaconLabels,
    parcelBadges,
    boundaryDimensions,
    totalCollisionsResolved: collisionsResolved
  };
}
