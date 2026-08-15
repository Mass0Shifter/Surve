/**
 * NSurvey CAD Core Engine
 * 
 * Provides vector database primitives, layers management, OSNAP snapping,
 * 2D transformation matrices, and CAD entity lifecycle for interactive drafting.
 */

import { CoordinatePoint, Parcel } from '../types';
import { computeParcel } from '../cogo';

export type CadEntityType = 'POINT' | 'LINE' | 'POLYLINE' | 'CIRCLE' | 'ARC' | 'TEXT' | 'DIMENSION' | 'HATCH';

export interface BaseCadEntity {
  id: string;
  type: CadEntityType;
  layer: string;
  color?: string;
  lineWeight?: number;
  lineType?: 'CONTINUOUS' | 'DASHED' | 'DASHDOT';
  selected?: boolean;
}

export interface CadPointEntity extends BaseCadEntity {
  type: 'POINT';
  x: number;
  y: number;
  z?: number;
  label?: string;
}

export interface CadLineEntity extends BaseCadEntity {
  type: 'LINE';
  x1: number;
  y1: number;
  z1?: number;
  x2: number;
  y2: number;
  z2?: number;
}

export interface CadPolylineEntity extends BaseCadEntity {
  type: 'POLYLINE';
  vertices: Array<{ x: number; y: number; z?: number }>;
  isClosed: boolean;
  plotNumber?: string;
}

export interface CadCircleEntity extends BaseCadEntity {
  type: 'CIRCLE';
  cx: number;
  cy: number;
  cz?: number;
  radius: number;
}

export interface CadArcEntity extends BaseCadEntity {
  type: 'ARC';
  cx: number;
  cy: number;
  cz?: number;
  radius: number;
  startAngle: number;
  endAngle: number;
}

export interface CadTextEntity extends BaseCadEntity {
  type: 'TEXT';
  x: number;
  y: number;
  z?: number;
  text: string;
  height: number;
  rotation: number;
  anchor?: 'start' | 'middle' | 'end';
}

export interface CadDimensionEntity extends BaseCadEntity {
  type: 'DIMENSION';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  bearingStr?: string;
  distanceStr?: string;
}

export interface CadHatchEntity extends BaseCadEntity {
  type: 'HATCH';
  boundaryVertices: Array<{ x: number; y: number }>;
  pattern: 'diagonal' | 'cross' | 'solid';
  opacity?: number;
}

export type CadEntity =
  | CadPointEntity
  | CadLineEntity
  | CadPolylineEntity
  | CadCircleEntity
  | CadArcEntity
  | CadTextEntity
  | CadDimensionEntity
  | CadHatchEntity;

export interface CadLayerDef {
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  lineWeight: number;
}

export interface SnapResult {
  x: number;
  y: number;
  type: 'ENDPOINT' | 'MIDPOINT' | 'CENTER' | 'INTERSECTION' | 'NODE' | 'NEAREST';
  entityId: string;
}

/**
 * Converts workspace CoordinatePoints and Parcels into native CAD entities.
 */
export function workspaceToCadEntities(points: CoordinatePoint[], parcels: Parcel[]): CadEntity[] {
  const entities: CadEntity[] = [];

  // 1. Convert Beacons to POINT and TEXT entities
  for (const pt of points) {
    if (pt.hidden) continue;
    entities.push({
      id: `pt_${pt.id}`,
      type: 'POINT',
      layer: 'BEACONS',
      x: pt.easting,
      y: pt.northing,
      z: pt.elevation || 0,
      label: pt.id,
      color: pt.isControl ? '#f59e0b' : '#ef4444'
    });

    entities.push({
      id: `txt_${pt.id}`,
      type: 'TEXT',
      layer: 'BEACON_LABELS',
      x: pt.easting + 1.2,
      y: pt.northing + 1.2,
      z: pt.elevation || 0,
      text: pt.id,
      height: 1.5,
      rotation: 0,
      color: '#f8fafc'
    });
  }

  // 2. Convert Parcels to POLYLINE, TEXT, and DIMENSION entities
  for (const parcel of parcels) {
    if (parcel.hidden) continue;
    const comp = computeParcel(parcel, points);
    if (!comp || comp.vertices.length < 3) continue;

    const vertices = comp.vertices.map(v => ({ x: v.easting, y: v.northing, z: 0 }));

    entities.push({
      id: `poly_${parcel.id}`,
      type: 'POLYLINE',
      layer: 'PARCEL_BOUNDARIES',
      vertices,
      isClosed: true,
      plotNumber: parcel.plotNumber,
      color: parcel.color || '#10b981',
      lineWeight: 2
    });

    // Centroid Plot & Area Text
    const centX = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
    const centY = vertices.reduce((s, v) => s + v.y, 0) / vertices.length;

    entities.push({
      id: `txt_plot_${parcel.id}`,
      type: 'TEXT',
      layer: 'PARCEL_LABELS',
      x: centX,
      y: centY,
      text: parcel.plotNumber,
      height: 2.2,
      rotation: 0,
      anchor: 'middle',
      color: '#ffffff'
    });

    entities.push({
      id: `txt_area_${parcel.id}`,
      type: 'TEXT',
      layer: 'PARCEL_LABELS',
      x: centX,
      y: centY - 2.5,
      text: `${comp.areaSquareMeters.toFixed(2)} sq.m`,
      height: 1.6,
      rotation: 0,
      anchor: 'middle',
      color: '#10b981'
    });

    // Boundary Leg Dimensions
    for (const leg of comp.legs) {
      entities.push({
        id: `dim_${leg.fromPoint.id}_${leg.toPoint.id}`,
        type: 'DIMENSION',
        layer: 'DIMENSIONS',
        x1: leg.fromPoint.easting,
        y1: leg.fromPoint.northing,
        x2: leg.toPoint.easting,
        y2: leg.toPoint.northing,
        bearingStr: leg.bearing.formatted,
        distanceStr: `${leg.distance.toFixed(2)}m`,
        color: '#94a3b8'
      });
    }
  }

  return entities;
}

/**
 * Finds the closest snapping point (Endpoint, Midpoint, Node) within screen-space tolerance.
 */
export function findSnapPoint(
  entities: CadEntity[],
  targetWorld: { x: number; y: number },
  snapToleranceWorld: number = 2.0
): SnapResult | null {
  let closest: SnapResult | null = null;
  let minDistance = snapToleranceWorld;

  for (const ent of entities) {
    if (ent.type === 'POINT') {
      const dist = Math.hypot(ent.x - targetWorld.x, ent.y - targetWorld.y);
      if (dist < minDistance) {
        minDistance = dist;
        closest = { x: ent.x, y: ent.y, type: 'NODE', entityId: ent.id };
      }
    } else if (ent.type === 'LINE') {
      // Endpoint 1
      let dist = Math.hypot(ent.x1 - targetWorld.x, ent.y1 - targetWorld.y);
      if (dist < minDistance) {
        minDistance = dist;
        closest = { x: ent.x1, y: ent.y1, type: 'ENDPOINT', entityId: ent.id };
      }
      // Endpoint 2
      dist = Math.hypot(ent.x2 - targetWorld.x, ent.y2 - targetWorld.y);
      if (dist < minDistance) {
        minDistance = dist;
        closest = { x: ent.x2, y: ent.y2, type: 'ENDPOINT', entityId: ent.id };
      }
      // Midpoint
      const midX = (ent.x1 + ent.x2) / 2;
      const midY = (ent.y1 + ent.y2) / 2;
      dist = Math.hypot(midX - targetWorld.x, midY - targetWorld.y);
      if (dist < minDistance) {
        minDistance = dist;
        closest = { x: midX, y: midY, type: 'MIDPOINT', entityId: ent.id };
      }
    } else if (ent.type === 'POLYLINE') {
      for (let i = 0; i < ent.vertices.length; i++) {
        const v = ent.vertices[i];
        const dist = Math.hypot(v.x - targetWorld.x, v.y - targetWorld.y);
        if (dist < minDistance) {
          minDistance = dist;
          closest = { x: v.x, y: v.y, type: 'ENDPOINT', entityId: ent.id };
        }

        // Midpoints between vertices
        const nextIdx = (i + 1) % ent.vertices.length;
        if (ent.isClosed || i < ent.vertices.length - 1) {
          const nextV = ent.vertices[nextIdx];
          const midX = (v.x + nextV.x) / 2;
          const midY = (v.y + nextV.y) / 2;
          const mDist = Math.hypot(midX - targetWorld.x, midY - targetWorld.y);
          if (mDist < minDistance) {
            minDistance = mDist;
            closest = { x: midX, y: midY, type: 'MIDPOINT', entityId: ent.id };
          }
        }
      }
    } else if (ent.type === 'CIRCLE') {
      const dist = Math.hypot(ent.cx - targetWorld.x, ent.cy - targetWorld.y);
      if (dist < minDistance) {
        minDistance = dist;
        closest = { x: ent.cx, y: ent.cy, type: 'CENTER', entityId: ent.id };
      }
    }
  }

  return closest;
}

/**
 * Translates selected CAD entities by delta offset (dx, dy).
 */
export function translateEntities(entities: CadEntity[], selectedIds: Set<string>, dx: number, dy: number): CadEntity[] {
  return entities.map(ent => {
    if (!selectedIds.has(ent.id)) return ent;

    switch (ent.type) {
      case 'POINT':
        return { ...ent, x: ent.x + dx, y: ent.y + dy };
      case 'LINE':
        return { ...ent, x1: ent.x1 + dx, y1: ent.y1 + dy, x2: ent.x2 + dx, y2: ent.y2 + dy };
      case 'POLYLINE':
        return { ...ent, vertices: ent.vertices.map(v => ({ ...v, x: v.x + dx, y: v.y + dy })) };
      case 'CIRCLE':
      case 'ARC':
        return { ...ent, cx: ent.cx + dx, cy: ent.cy + dy };
      case 'TEXT':
        return { ...ent, x: ent.x + dx, y: ent.y + dy };
      case 'DIMENSION':
        return { ...ent, x1: ent.x1 + dx, y1: ent.y1 + dy, x2: ent.x2 + dx, y2: ent.y2 + dy };
      case 'HATCH':
        return { ...ent, boundaryVertices: ent.boundaryVertices.map(v => ({ x: v.x + dx, y: v.y + dy })) };
      default:
        return ent;
    }
  });
}

/**
 * Rotates selected CAD entities around origin point (origX, origY) by angle in radians.
 */
export function rotateEntities(
  entities: CadEntity[],
  selectedIds: Set<string>,
  origX: number,
  origY: number,
  angleRad: number
): CadEntity[] {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const rot = (x: number, y: number) => ({
    x: origX + (x - origX) * cos - (y - origY) * sin,
    y: origY + (x - origX) * sin + (y - origY) * cos
  });

  return entities.map(ent => {
    if (!selectedIds.has(ent.id)) return ent;

    switch (ent.type) {
      case 'POINT': {
        const p = rot(ent.x, ent.y);
        return { ...ent, x: p.x, y: p.y };
      }
      case 'LINE': {
        const p1 = rot(ent.x1, ent.y1);
        const p2 = rot(ent.x2, ent.y2);
        return { ...ent, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      }
      case 'POLYLINE':
        return { ...ent, vertices: ent.vertices.map(v => ({ ...v, ...rot(v.x, v.y) })) };
      case 'CIRCLE':
      case 'ARC': {
        const p = rot(ent.cx, ent.cy);
        return { ...ent, cx: p.x, cy: p.y };
      }
      case 'TEXT': {
        const p = rot(ent.x, ent.y);
        return { ...ent, x: p.x, y: p.y, rotation: ent.rotation + (angleRad * 180) / Math.PI };
      }
      case 'DIMENSION': {
        const p1 = rot(ent.x1, ent.y1);
        const p2 = rot(ent.x2, ent.y2);
        return { ...ent, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      }
      default:
        return ent;
    }
  });
}
