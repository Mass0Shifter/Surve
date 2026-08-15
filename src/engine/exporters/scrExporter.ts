import { CoordinatePoint, Parcel, ProjectMetadata } from '../types';
import { computeParcel, computeExtents } from '../cogo';

/**
 * Generates an AutoCAD Script (.SCR) file that precisely automates the creation of
 * cadastral layout plans, grid lines, boundary polylines, beacon markers, and text labels.
 * 100% syntactically compatible with legacy SurvPack 3.0 scripts.
 */
export function generateAutoCADScript(
  _project: ProjectMetadata,
  points: CoordinatePoint[],
  parcels: Parcel[]
): string {
  const extents = computeExtents(points);
  const buffer = Math.max(20, extents.width * 0.1);
  const minE = Math.floor(extents.minX - buffer);
  const maxE = Math.ceil(extents.maxX + buffer);
  const minN = Math.floor(extents.minY - buffer);
  const maxN = Math.ceil(extents.maxY + buffer);

  const lines: string[] = [];

  // Environment Initialization & Universal Survey Units (Zero dialogs, zero comment repetitions)
  lines.push('UCS W');
  lines.push('OSMODE 0');
  lines.push('LUNITS 2');
  lines.push('LUPREC 4');
  lines.push('AUNITS 4');
  lines.push('AUPREC 4');
  lines.push('ANGBASE 90');
  lines.push('ANGDIR 1');
  lines.push('PDMODE 32');
  lines.push('PDSIZE 0.5');
  lines.push('SETVAR REMEMBERFOLDERS 0');
  lines.push(`LIMITS ${minE},${minN} ${maxE},${maxN}`);
  lines.push('-STYLE STANDARD Arial 0.0 1.0 0.0 N N');

  // Batch Create All Layers at Once in Header (Trailing space exits -LAYER back to Command:)
  lines.push('-LAYER N modelGridcrosses,BEACONS,ANNOTATIONS,BOUNDARY C 7 modelGridcrosses C 1 BEACONS C 3 ANNOTATIONS C 2 BOUNDARY ');

  // 1. Grid Crosses Layer (Switched via direct CLAYER system variable)
  lines.push('CLAYER modelGridcrosses');
  const gridStep = 50; // 50m standard survey grid
  const startGridE = Math.floor(minE / gridStep) * gridStep;
  const startGridN = Math.floor(minN / gridStep) * gridStep;

  for (let e = startGridE; e <= maxE; e += gridStep) {
    for (let n = startGridN; n <= maxN; n += gridStep) {
      lines.push(`POINT ${e},${n}`);
      lines.push(`LINE ${e - 2},${n} ${e + 2},${n} `);
      lines.push(`LINE ${e},${n - 2} ${e},${n + 2} `);
    }
  }

  // 2. Beacons Layer
  lines.push('CLAYER BEACONS');
  for (const pt of points) {
    lines.push(`POINT ${pt.easting.toFixed(3)},${pt.northing.toFixed(3)}`);
  }

  // 3. Annotations Layer (Beacon IDs & Coordinates)
  lines.push('CLAYER ANNOTATIONS');
  for (const pt of points) {
    // Bottom-Center text offset by 1m
    lines.push(`TEXT J BC ${pt.easting.toFixed(3)},${(pt.northing + 1.0).toFixed(3)} 1.2 0 ${pt.id}`);
  }

  // 4. Parcel Boundaries Layer
  lines.push('CLAYER BOUNDARY');
  for (const parcel of parcels) {
    const comp = computeParcel(parcel, points);
    if (!comp || comp.vertices.length < 3) continue;

    const coordsStr = comp.vertices.map(v => `${v.easting.toFixed(3)},${v.northing.toFixed(3)}`).join(' ');
    lines.push(`PLINE ${coordsStr} C`);

    // Plot Centroid Label & Owner Info
    const centE = comp.vertices.reduce((s, v) => s + v.easting, 0) / comp.vertices.length;
    const centN = comp.vertices.reduce((s, v) => s + v.northing, 0) / comp.vertices.length;

    lines.push(`TEXT J MC ${centE.toFixed(3)},${centN.toFixed(3)} 2.0 0 ${parcel.plotNumber}`);
    if (parcel.ownerName) {
      lines.push(`TEXT J MC ${centE.toFixed(3)},${(centN - 2.5).toFixed(3)} 1.4 0 ${parcel.ownerName}`);
    }
    lines.push(`TEXT J MC ${centE.toFixed(3)},${(centN - 4.5).toFixed(3)} 1.2 0 Area: ${comp.areaSquareMeters.toFixed(2)} sq.m`);
  }

  lines.push('ZOOM E');

  return lines.filter(l => l.trim().length > 0).join('\r\n') + '\r\n';
}

/**
 * Generates an AutoCAD Script (.SCR) for an individual parcel or custom subset of parcels.
 */
export function generateParcelsSCR(
  project: ProjectMetadata,
  points: CoordinatePoint[],
  targetParcels: Parcel[]
): string {
  const pointMap = new Map(points.map(p => [p.id, p]));
  const ptIdSet = new Set<string>();
  targetParcels.forEach(p => p.pointIds.forEach(id => ptIdSet.add(id)));
  const relevantPoints = Array.from(ptIdSet).map(id => pointMap.get(id)).filter(Boolean) as CoordinatePoint[];

  const titleSuffix = targetParcels.length === 1 ? targetParcels[0].plotNumber : `${targetParcels.length}_PLOTS`;
  return generateAutoCADScript(
    { ...project, title: `${project.title || 'CAD'} - ${titleSuffix}` },
    relevantPoints,
    targetParcels
  );
}
