import { CoordinatePoint, Parcel, ProjectMetadata } from '../types';
import { computeParcel } from '../cogo';

/**
 * Sanitizes strings for strict AutoCAD DXF R12/2000 ASCII compatibility.
 */
function sanitizeDxfText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\\/g, '/')
    .replace(/[^\x20-\x7E]/g, '') // Keep printable ASCII
    .trim();
}

/**
 * Generates an industry-standard ASCII DXF (Release 12/2000 format)
 * readable by all versions of AutoCAD, Civil 3D, QGIS, ArcGIS, and LibreCAD.
 */
export function generateDXF(
  project: ProjectMetadata,
  points: CoordinatePoint[],
  parcels: Parcel[]
): string {
  const lines: string[] = [];

  // DXF HEADER
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('999', `NSurvey CAD Export - ${sanitizeDxfText(project.code)}: ${sanitizeDxfText(project.title)}`);
  lines.push('9', '$ACADVER', '1', 'AC1009'); // AutoCAD R12 compatible DXF
  lines.push('9', '$INSUNITS', '70', '6'); // 6 = Meters
  lines.push('0', 'ENDSEC');

  // DXF TABLES (Layers)
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '4');

  // Layer BEACONS (Red = 1)
  lines.push('0', 'LAYER', '2', 'BEACONS', '70', '0', '62', '1', '6', 'CONTINUOUS');
  // Layer BOUNDARY (Yellow = 2)
  lines.push('0', 'LAYER', '2', 'BOUNDARY', '70', '0', '62', '2', '6', 'CONTINUOUS');
  // Layer ANNOTATIONS (Green = 3)
  lines.push('0', 'LAYER', '2', 'ANNOTATIONS', '70', '0', '62', '3', '6', 'CONTINUOUS');
  // Layer GRID (White/Gray = 7)
  lines.push('0', 'LAYER', '2', 'GRID', '70', '0', '62', '7', '6', 'CONTINUOUS');

  lines.push('0', 'ENDTAB');
  lines.push('0', 'ENDSEC');

  // DXF ENTITIES
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  // 1. Write Points (Beacons)
  for (const pt of points) {
    lines.push('0', 'POINT');
    lines.push('8', 'BEACONS');
    lines.push('10', pt.easting.toFixed(4));
    lines.push('20', pt.northing.toFixed(4));
    lines.push('30', (pt.elevation || 0).toFixed(4));

    // Text Label for Point ID
    lines.push('0', 'TEXT');
    lines.push('8', 'ANNOTATIONS');
    lines.push('10', (pt.easting + 0.5).toFixed(4));
    lines.push('20', (pt.northing + 0.5).toFixed(4));
    lines.push('30', '0.0');
    lines.push('40', '1.0'); // Text Height
    lines.push('1', sanitizeDxfText(pt.id));
  }

  // 2. Write Parcels as Polyline Entities
  for (const parcel of parcels) {
    const comp = computeParcel(parcel, points);
    if (!comp || comp.vertices.length < 3) continue;

    // Polyline header
    lines.push('0', 'POLYLINE');
    lines.push('8', 'BOUNDARY');
    lines.push('66', '1'); // Vertices follow
    lines.push('70', '1'); // Closed polyline
    lines.push('10', '0.0', '20', '0.0', '30', '0.0');

    for (const v of comp.vertices) {
      lines.push('0', 'VERTEX');
      lines.push('8', 'BOUNDARY');
      lines.push('10', v.easting.toFixed(4));
      lines.push('20', v.northing.toFixed(4));
      lines.push('30', '0.0');
    }

    lines.push('0', 'SEQEND');

    // Parcel Center Text
    const centE = comp.vertices.reduce((s, v) => s + v.easting, 0) / comp.vertices.length;
    const centN = comp.vertices.reduce((s, v) => s + v.northing, 0) / comp.vertices.length;

    lines.push('0', 'TEXT');
    lines.push('8', 'ANNOTATIONS');
    lines.push('10', centE.toFixed(4));
    lines.push('20', centN.toFixed(4));
    lines.push('30', '0.0');
    lines.push('40', '1.8');
    lines.push('1', sanitizeDxfText(parcel.plotNumber));

    lines.push('0', 'TEXT');
    lines.push('8', 'ANNOTATIONS');
    lines.push('10', centE.toFixed(4));
    lines.push('20', (centN - 2.5).toFixed(4));
    lines.push('30', '0.0');
    lines.push('40', '1.2');
    lines.push('1', `Area: ${comp.areaSquareMeters.toFixed(2)} sq.m`);
  }

  lines.push('0', 'ENDSEC');
  lines.push('0', 'EOF');

  return lines.join('\r\n');
}

/**
 * Generates an AutoCAD DXF for a specific parcel or custom subset of parcels.
 */
export function generateParcelsDXF(
  project: ProjectMetadata,
  points: CoordinatePoint[],
  targetParcels: Parcel[]
): string {
  const pointMap = new Map(points.map(p => [p.id, p]));
  const ptIdSet = new Set<string>();
  targetParcels.forEach(p => p.pointIds.forEach(id => ptIdSet.add(id)));
  const relevantPoints = Array.from(ptIdSet).map(id => pointMap.get(id)).filter(Boolean) as CoordinatePoint[];

  const titleSuffix = targetParcels.length === 1 ? targetParcels[0].plotNumber : `${targetParcels.length}_PLOTS`;
  return generateDXF(
    { ...project, title: `${project.title || 'CAD'} - ${titleSuffix}` },
    relevantPoints,
    targetParcels
  );
}
