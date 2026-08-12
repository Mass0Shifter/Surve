/**
 * DTM Engine: Bowyer-Watson Delaunay Triangulation + Linear Contour Interpolation
 *
 * Input: Array of 3D points {x: Easting, y: Northing, z: Elevation}
 * Output: TIN triangles + contour polyline segments at given interval
 */

export interface DTMPoint {
  id: string;
  x: number; // Easting
  y: number; // Northing
  z: number; // Elevation
}

export interface DTMTriangle {
  a: DTMPoint;
  b: DTMPoint;
  c: DTMPoint;
}

export interface ContourSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  elevation: number;
  isMajor: boolean;
}

export interface DTMResult {
  triangles: DTMTriangle[];
  contours: ContourSegment[];
  minZ: number;
  maxZ: number;
  pointCount: number;
}

// =============================================
// Bowyer-Watson Delaunay Triangulation
// =============================================

interface SuperTriangleVertex {
  x: number;
  y: number;
  z: number;
  id: string;
  _super?: boolean;
}

type Vertex = DTMPoint | SuperTriangleVertex;

interface Triangle {
  a: Vertex;
  b: Vertex;
  c: Vertex;
  circumcenter: { x: number; y: number };
  circumradiusSq: number;
}

function circumcircle(a: Vertex, b: Vertex, c: Vertex): { cx: number; cy: number; rSq: number } | null {
  const ax = b.x - a.x;
  const ay = b.y - a.y;
  const bx = c.x - a.x;
  const by = c.y - a.y;
  const D = 2 * (ax * by - ay * bx);
  if (Math.abs(D) < 1e-10) return null;

  const ux = (by * (ax * ax + ay * ay) - ay * (bx * bx + by * by)) / D;
  const uy = (ax * (bx * bx + by * by) - bx * (ax * ax + ay * ay)) / D;

  const cx = a.x + ux;
  const cy = a.y + uy;
  const rSq = ux * ux + uy * uy;
  return { cx, cy, rSq };
}

function buildTriangle(a: Vertex, b: Vertex, c: Vertex): Triangle | null {
  const cc = circumcircle(a, b, c);
  if (!cc) return null;
  return {
    a, b, c,
    circumcenter: { x: cc.cx, y: cc.cy },
    circumradiusSq: cc.rSq
  };
}

function edgeKey(p1: Vertex, p2: Vertex): string {
  const ids = [p1.id, p2.id].sort();
  return `${ids[0]}_${ids[1]}`;
}

function isSuperVertex(v: Vertex): boolean {
  return !!(v as SuperTriangleVertex)._super;
}

export function delaunayTriangulate(points: DTMPoint[]): DTMTriangle[] {
  if (points.length < 3) return [];

  // Bounding super-triangle
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const dx = maxX - minX;
  const dy = maxY - minY;
  const delta = Math.max(100, Math.max(dx, dy) * 10);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const st0: SuperTriangleVertex = { id: '__st0', x: midX - 2 * delta, y: midY - delta, z: 0, _super: true };
  const st1: SuperTriangleVertex = { id: '__st1', x: midX, y: midY + 2 * delta, z: 0, _super: true };
  const st2: SuperTriangleVertex = { id: '__st2', x: midX + 2 * delta, y: midY - delta, z: 0, _super: true };

  const superTri = buildTriangle(st0, st1, st2);
  if (!superTri) return [];

  let triangulation: Triangle[] = [superTri];

  for (const point of points) {
    // Find all triangles whose circumcircle contains the point
    const badTriangles: Triangle[] = [];
    for (const tri of triangulation) {
      const dx2 = point.x - tri.circumcenter.x;
      const dy2 = point.y - tri.circumcenter.y;
      if (dx2 * dx2 + dy2 * dy2 <= tri.circumradiusSq + 1e-10) {
        badTriangles.push(tri);
      }
    }

    // Find boundary polygon of bad triangles (edges not shared by 2 bad triangles)
    const edgeCount = new Map<string, { p1: Vertex; p2: Vertex; count: number }>();
    for (const tri of badTriangles) {
      const edges: [Vertex, Vertex][] = [[tri.a, tri.b], [tri.b, tri.c], [tri.c, tri.a]];
      for (const [p1, p2] of edges) {
        const key = edgeKey(p1, p2);
        if (!edgeCount.has(key)) edgeCount.set(key, { p1, p2, count: 0 });
        edgeCount.get(key)!.count++;
      }
    }

    // Remove bad triangles
    triangulation = triangulation.filter(t => !badTriangles.includes(t));

    // Re-triangulate from boundary polygon
    for (const { p1, p2, count } of edgeCount.values()) {
      if (count === 1) {
        const newTri = buildTriangle(p1, p2, point);
        if (newTri) triangulation.push(newTri);
      }
    }
  }

  // Remove triangles touching super-triangle vertices
  const result: DTMTriangle[] = [];
  for (const tri of triangulation) {
    if (isSuperVertex(tri.a) || isSuperVertex(tri.b) || isSuperVertex(tri.c)) continue;
    result.push({ a: tri.a as DTMPoint, b: tri.b as DTMPoint, c: tri.c as DTMPoint });
  }

  return result;
}

// =============================================
// Linear Contour Interpolation
// =============================================

function interpolateEdge(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  targetZ: number
): { x: number; y: number } | null {
  if (z1 === z2) return null;
  if ((targetZ - z1) * (targetZ - z2) > 0) return null; // Not crossing
  const t = (targetZ - z1) / (z2 - z1);
  return {
    x: x1 + t * (x2 - x1),
    y: y1 + t * (y2 - y1)
  };
}

export function computeContours(
  triangles: DTMTriangle[],
  minZ: number,
  maxZ: number,
  interval: number,
  majorEvery: number = 5
): ContourSegment[] {
  if (triangles.length === 0 || interval <= 0 || isNaN(interval)) return [];

  const safeInterval = Math.max(0.1, interval);
  const segments: ContourSegment[] = [];

  let startLevel = Math.ceil(minZ / safeInterval) * safeInterval;
  let endLevel = Math.floor(maxZ / safeInterval) * safeInterval;

  // Cap maximum contour levels to 500 to prevent browser thread freeze
  const totalLevels = Math.round((endLevel - startLevel) / safeInterval);
  let effectiveInterval = safeInterval;
  if (totalLevels > 500) {
    effectiveInterval = (maxZ - minZ) / 500;
    startLevel = Math.ceil(minZ / effectiveInterval) * effectiveInterval;
    endLevel = Math.floor(maxZ / effectiveInterval) * effectiveInterval;
  }

  for (let z = startLevel; z <= endLevel + 1e-6; z += effectiveInterval) {
    const level = Math.round(z * 1000) / 1000;
    const isMajor = Math.round(level / effectiveInterval) % majorEvery === 0;

    for (const tri of triangles) {
      const { a, b, c } = tri;

      // Check each edge of the triangle for crossing
      const edges: [DTMPoint, DTMPoint][] = [[a, b], [b, c], [c, a]];
      const crossings: { x: number; y: number }[] = [];

      for (const [p1, p2] of edges) {
        const pt = interpolateEdge(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, level);
        if (pt) crossings.push(pt);
      }

      if (crossings.length >= 2) {
        segments.push({
          x1: crossings[0].x,
          y1: crossings[0].y,
          x2: crossings[1].x,
          y2: crossings[1].y,
          elevation: level,
          isMajor
        });
      }
    }
  }

  return segments;
}

/**
 * Top-level DTM builder: triangulates points and generates contours.
 */
export function buildDTM(
  points: DTMPoint[],
  contourInterval: number,
  majorContourEvery: number
): DTMResult {
  const validPoints = points.filter(p => typeof p.z === 'number' && !isNaN(p.z));

  if (validPoints.length < 3) {
    return { triangles: [], contours: [], minZ: 0, maxZ: 0, pointCount: validPoints.length };
  }

  const minZ = Math.min(...validPoints.map(p => p.z));
  const maxZ = Math.max(...validPoints.map(p => p.z));

  const triangles = delaunayTriangulate(validPoints);
  const contours = computeContours(triangles, minZ, maxZ, contourInterval, majorContourEvery);

  return { triangles, contours, minZ, maxZ, pointCount: validPoints.length };
}
