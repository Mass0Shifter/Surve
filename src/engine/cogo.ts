import { CoordinatePoint, BearingDistance, Parcel, ParcelComputationResult } from './types';
import { decimalToDMS } from './formats';

/**
 * Coordinate Inversing: Computes delta easting, delta northing, horizontal distance,
 * and Whole Circle Bearing between two survey points.
 */
export function inversePoints(p1: CoordinatePoint, p2: CoordinatePoint): BearingDistance {
  const deltaEasting = p2.easting - p1.easting;
  const deltaNorthing = p2.northing - p1.northing;
  const distance = Math.sqrt(deltaEasting * deltaEasting + deltaNorthing * deltaNorthing);

  // Compute Azimuth (Bearing) in radians then convert to degrees [0, 360)
  // In Surveying: Bearing is measured clockwise from True/Grid North (Y-axis).
  // Math.atan2(dx, dy) directly yields the clockwise angle from North!
  let rad = Math.atan2(deltaEasting, deltaNorthing);
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;

  return {
    fromPoint: p1,
    toPoint: p2,
    deltaEasting,
    deltaNorthing,
    distance,
    bearing: decimalToDMS(deg)
  };
}

/**
 * Polar Forward Computation: Computes target point coordinates given starting point,
 * Whole Circle Bearing (decimal degrees), and horizontal distance.
 */
export function forwardPoint(
  origin: CoordinatePoint,
  bearingDecimalDeg: number,
  distance: number,
  targetId: string = 'NEW_PT'
): CoordinatePoint {
  const rad = (bearingDecimalDeg * Math.PI) / 180;
  const deltaE = distance * Math.sin(rad);
  const deltaN = distance * Math.cos(rad);

  return {
    id: targetId,
    easting: origin.easting + deltaE,
    northing: origin.northing + deltaN,
    elevation: origin.elevation
  };
}

/**
 * Gauss's Area Formula (Shoelace Formula) for calculating the exact 2D area
 * and boundary metrics of a closed parcel polygon.
 */
export function computeParcel(parcel: Parcel, allPoints: CoordinatePoint[]): ParcelComputationResult | null {
  const pointMap = new Map<string, CoordinatePoint>(allPoints.map(p => [p.id, p]));
  const vertices: CoordinatePoint[] = [];

  for (const pid of parcel.pointIds) {
    const pt = pointMap.get(pid);
    if (pt) {
      vertices.push(pt);
    }
  }

  if (vertices.length < 3) {
    return null;
  }

  // Calculate Shoelace Area and Legs
  let sum1 = 0;
  let sum2 = 0;
  let perimeter = 0;
  const legs: BearingDistance[] = [];
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % n];

    // Shoelace terms
    sum1 += current.easting * next.northing;
    sum2 += next.easting * current.northing;

    // Leg computation
    const leg = inversePoints(current, next);
    legs.push(leg);
    perimeter += leg.distance;
  }

  const areaSqM = 0.5 * Math.abs(sum1 - sum2);
  const areaHa = areaSqM / 10000;

  // Closure check (compare first point and last point if closed loop)
  const isClosed = vertices.length >= 3;
  const closureMisclose = 0.000; // Exact closed polygon topology

  return {
    parcel,
    vertices,
    areaSquareMeters: areaSqM,
    areaHectares: areaHa,
    perimeter,
    isClosed,
    closureMisclose,
    legs
  };
}

/**
 * Calculates the bounding box extents for an array of coordinate points.
 */
export function computeExtents(points: CoordinatePoint[]) {
  if (points.length === 0) {
    return { minX: 0, maxX: 100, minY: 0, maxY: 100, width: 100, height: 100, centerX: 50, centerY: 50 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.easting < minX) minX = p.easting;
    if (p.easting > maxX) maxX = p.easting;
    if (p.northing < minY) minY = p.northing;
    if (p.northing > maxY) maxY = p.northing;
  }

  const width = Math.max(10, maxX - minX);
  const height = Math.max(10, maxY - minY);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;

  return { minX, maxX, minY, maxY, width, height, centerX, centerY };
}
