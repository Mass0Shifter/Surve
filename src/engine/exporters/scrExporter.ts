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
  lines.push('ANGBASE 0');
  lines.push('ANGDIR 0');
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
    // Bottom-Center text offset by 0.8m above beacon marker (100% Horizontal)
    lines.push(`TEXT J BC ${pt.easting.toFixed(3)},${(pt.northing + 0.8).toFixed(3)} 1.2 0 ${pt.id}`);
  }

  // 4. Parcel Boundaries Layer
  lines.push('CLAYER BOUNDARY');
  for (const parcel of parcels) {
    const comp = computeParcel(parcel, points);
    if (!comp || comp.vertices.length < 3) continue;

    const coordsStr = comp.vertices.map(v => `${v.easting.toFixed(3)},${v.northing.toFixed(3)}`).join(' ');
    lines.push(`PLINE ${coordsStr} C`);

    // Plot Centroid Label & Owner Info (100% Horizontal, Centered)
    const centE = comp.vertices.reduce((s, v) => s + v.easting, 0) / comp.vertices.length;
    const centN = comp.vertices.reduce((s, v) => s + v.northing, 0) / comp.vertices.length;

    lines.push(`TEXT J MC ${centE.toFixed(3)},${centN.toFixed(3)} 2.2 0 ${parcel.plotNumber}`);
    if (parcel.ownerName) {
      lines.push(`TEXT J MC ${centE.toFixed(3)},${(centN - 2.8).toFixed(3)} 1.4 0 ${parcel.ownerName}`);
    }
    lines.push(`TEXT J MC ${centE.toFixed(3)},${(centN - 5.0).toFixed(3)} 1.2 0 Area: ${comp.areaSquareMeters.toFixed(2)} sq.m`);
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

/**
 * Generates a full Title Deed Plan (.SCR) script matching SurvPack 3.0 standards.
 * - MODEL SPACE (TILEMODE 1): 1:1 Geodetic Survey Entities (Easting/Northing in meters)
 *   Only scoped points belonging to target parcels are drawn. Bearings & distances align parallel to legs.
 * - PAPER SPACE (TILEMODE 0 / Layout 1): True Paper Millimeters (1 unit = 1 mm)
 *   Floating MVIEW viewport scaled to exact cadastral scale (1000/scaleRatio)XP, double neatlines,
 *   title block, coordinate schedule table, surveyor certification & seal box, and North Arrow.
 */
export function generateTdpAutoCADScript(
  project: ProjectMetadata,
  points: CoordinatePoint[],
  parcels: Parcel[],
  options: {
    pageSize?: 'a4' | 'a3' | 'legal';
    orientation?: 'portrait' | 'landscape';
    scaleRatio?: number;
    showCoordinateTable?: boolean;
    showSealBox?: boolean;
  } = {},
  currentUser?: { name?: string; surconNumber?: string; title?: string } | null,
  _activeOrg?: any
): string {
  const pointMap = new Map(points.map(p => [p.id, p]));

  // 1. Filter points strictly scoped to the target parcels in this TDP view
  const targetPointIds = new Set<string>();
  parcels.forEach(p => p.pointIds.forEach(id => targetPointIds.add(id)));
  const relevantPoints = points.filter(p => targetPointIds.has(p.id));
  const activePoints = relevantPoints.length > 0 ? relevantPoints : points;

  const extents = computeExtents(activePoints);
  const cx = extents.minX + extents.width / 2;
  const cy = extents.minY + extents.height / 2;

  const scaleRatio = options.scaleRatio || project.scale || 1000;
  const scaleFactor = scaleRatio / 1000; // In Model Space, 1mm on paper = scaleFactor meters

  // Paper Dimensions in Millimeters
  const pageSize = options.pageSize || 'a4';
  const orientation = options.orientation || 'portrait';
  let paperW_mm = 210;
  let paperH_mm = 297;

  if (pageSize === 'a3') {
    paperW_mm = 297;
    paperH_mm = 420;
  } else if (pageSize === 'legal') {
    paperW_mm = 215.9;
    paperH_mm = 355.6;
  }

  if (orientation === 'landscape') {
    const tmp = paperW_mm;
    paperW_mm = Math.max(paperW_mm, paperH_mm);
    paperH_mm = Math.min(tmp, paperH_mm);
  } else {
    const tmp = paperW_mm;
    paperW_mm = Math.min(paperW_mm, paperH_mm);
    paperH_mm = Math.max(tmp, paperH_mm);
  }

  const lines: string[] = [];

  // ==========================================
  // A. MODEL SPACE: 1:1 Geodetic Cadastral Plan
  // ==========================================
  lines.push('TILEMODE 1');
  lines.push('UCS W');
  lines.push('OSMODE 0');
  lines.push('LUNITS 2');
  lines.push('LUPREC 4');
  lines.push('AUNITS 4');
  lines.push('AUPREC 4');
  lines.push('ANGBASE 0');
  lines.push('ANGDIR 0');
  lines.push('PDMODE 32');
  lines.push('PDSIZE 0.5');
  lines.push('SETVAR REMEMBERFOLDERS 0');
  lines.push('-STYLE STANDARD Arial 0.0 1.0 0.0 N N');

  // Batch Create All SurvPack TDP Layers
  lines.push('-LAYER N TDP_GRID,TDP_BEACONS,TDP_ANNOTATIONS,TDP_BOUNDARY,TDP_BEARINGS,TDP_BORDER,TDP_NEATLINE,TDP_TITLEBLOCK,TDP_TABLE,TDP_CERTIFICATION,TDP_VIEWPORT C 8 TDP_GRID C 1 TDP_BEACONS C 3 TDP_ANNOTATIONS C 2 TDP_BOUNDARY C 4 TDP_BEARINGS C 7 TDP_BORDER C 7 TDP_NEATLINE C 7 TDP_TITLEBLOCK C 7 TDP_TABLE C 7 TDP_CERTIFICATION C 7 TDP_VIEWPORT ');

  // 1. Geodetic Grid Crosses (50m or 100m survey grid)
  lines.push('CLAYER TDP_GRID');
  const buffer = Math.max(25, extents.width * 0.2);
  const minE = Math.floor(extents.minX - buffer);
  const maxE = Math.ceil(extents.maxX + buffer);
  const minN = Math.floor(extents.minY - buffer);
  const maxN = Math.ceil(extents.maxY + buffer);
  const gridStep = Math.max(50, Math.round(extents.width / 5 / 50) * 50);
  const startE = Math.ceil(minE / gridStep) * gridStep;
  const endE = Math.floor(maxE / gridStep) * gridStep;
  const startN = Math.ceil(minN / gridStep) * gridStep;
  const endN = Math.floor(maxN / gridStep) * gridStep;

  for (let e = startE; e <= endE; e += gridStep) {
    for (let n = startN; n <= endN; n += gridStep) {
      lines.push(`POINT ${e},${n}`);
      lines.push(`LINE ${e - 2 * scaleFactor},${n} ${e + 2 * scaleFactor},${n} `);
      lines.push(`LINE ${e},${n - 2 * scaleFactor} ${e},${n + 2 * scaleFactor} `);
    }
  }

  // 2. Survey Beacons (Only Scoped Points)
  lines.push('CLAYER TDP_BEACONS');
  for (const pt of activePoints) {
    lines.push(`POINT ${pt.easting.toFixed(3)},${pt.northing.toFixed(3)}`);
  }

  // 3. Beacon IDs (Horizontal, above beacon node)
  lines.push('CLAYER TDP_ANNOTATIONS');
  for (const pt of activePoints) {
    lines.push(`TEXT J BC ${pt.easting.toFixed(3)},${(pt.northing + 0.8 * scaleFactor).toFixed(3)} ${(1.4 * scaleFactor).toFixed(2)} 0 ${pt.id}`);
  }

  // 4. Parcel Boundary Polylines & Centroid Area
  lines.push('CLAYER TDP_BOUNDARY');
  for (const parcel of parcels) {
    const comp = computeParcel(parcel, points);
    if (!comp || comp.vertices.length < 3) continue;

    const coordsStr = comp.vertices.map(v => `${v.easting.toFixed(3)},${v.northing.toFixed(3)}`).join(' ');
    lines.push(`PLINE ${coordsStr} C`);

    // Centroid Area Text
    const centE = comp.vertices.reduce((s, v) => s + v.easting, 0) / comp.vertices.length;
    const centN = comp.vertices.reduce((s, v) => s + v.northing, 0) / comp.vertices.length;

    lines.push(`TEXT J MC ${centE.toFixed(3)},${centN.toFixed(3)} ${(2.4 * scaleFactor).toFixed(2)} 0 ${parcel.plotNumber}`);
    if (parcel.ownerName) {
      lines.push(`TEXT J MC ${centE.toFixed(3)},${(centN - 3.2 * scaleFactor).toFixed(3)} ${(1.6 * scaleFactor).toFixed(2)} 0 ${parcel.ownerName}`);
    }
    lines.push(`TEXT J MC ${centE.toFixed(3)},${(centN - 5.8 * scaleFactor).toFixed(3)} ${(1.4 * scaleFactor).toFixed(2)} 0 Area: ${comp.areaSquareMeters.toFixed(2)} sq.m`);
  }

  // 5. Boundary Leg Bearings & Distances (Aligned parallel to line segment, no upside-down text)
  lines.push('CLAYER TDP_BEARINGS');
  for (const parcel of parcels) {
    for (let i = 0; i < parcel.pointIds.length; i++) {
      const id1 = parcel.pointIds[i];
      const id2 = parcel.pointIds[(i + 1) % parcel.pointIds.length];
      const p1 = pointMap.get(id1);
      const p2 = pointMap.get(id2);
      if (!p1 || !p2) continue;

      const dE = p2.easting - p1.easting;
      const dN = p2.northing - p1.northing;
      const dist = Math.sqrt(dE * dE + dN * dN);
      if (dist < 0.001) continue;

      let azRad = Math.atan2(dE, dN);
      if (azRad < 0) azRad += 2 * Math.PI;
      const azDeg = (azRad * 180) / Math.PI;

      const deg = Math.floor(azDeg);
      const min = Math.floor((azDeg - deg) * 60);
      const sec = Math.round(((azDeg - deg) * 60 - min) * 60);
      const bearingStr = `${deg}%%d${min.toString().padStart(2, '0')}'${sec.toString().padStart(2, '0')}"`;

      // Cartesian line angle with X-axis (East)
      let lineAngleDeg = (Math.atan2(dN, dE) * 180) / Math.PI;
      if (lineAngleDeg < 0) lineAngleDeg += 360;

      // Cartographic readability: flip angle by 180 if facing West to avoid upside-down text
      let textRotDeg = lineAngleDeg;
      if (textRotDeg > 90 && textRotDeg <= 270) {
        textRotDeg = (textRotDeg + 180) % 360;
      }

      // Midpoint offset perpendicularly by 1.2m
      const midE = (p1.easting + p2.easting) / 2;
      const midN = (p1.northing + p2.northing) / 2;
      const perpE = -dN / dist;
      const perpN = dE / dist;
      const labelE = midE + perpE * 1.2 * scaleFactor;
      const labelN = midN + perpN * 1.2 * scaleFactor;

      lines.push(`TEXT J MC ${labelE.toFixed(3)},${labelN.toFixed(3)} ${(1.3 * scaleFactor).toFixed(2)} ${textRotDeg.toFixed(1)} ${bearingStr}  ${dist.toFixed(2)}m`);
    }
  }

  lines.push('ZOOM E');

  // ==========================================
  // B. PAPER SPACE (LAYOUT 1): True Paper Millimeters
  // ==========================================
  lines.push('TILEMODE 0');
  lines.push('PSPACE');

  // Viewport Frame dimensions in paper mm
  const vpMinX = 14;
  const vpMaxX = paperW_mm - 14;
  const vpMinY = 44;
  const vpMaxY = paperH_mm - 48;

  // Create & Scale Floating Viewport (MVIEW)
  lines.push('CLAYER TDP_VIEWPORT');
  lines.push(`MVIEW ${vpMinX},${vpMinY} ${vpMaxX},${vpMaxY}`);
  lines.push('MSPACE');
  lines.push(`ZOOM C ${cx.toFixed(3)},${cy.toFixed(3)} ${(1000 / scaleRatio).toFixed(4)}XP`);
  lines.push('PSPACE');

  // 1. Sheet Outer Border & Double Neatlines (in mm)
  lines.push('CLAYER TDP_BORDER');
  lines.push(`RECTANG 0,0 ${paperW_mm},${paperH_mm}`);

  lines.push('CLAYER TDP_NEATLINE');
  lines.push(`RECTANG 10,10 ${paperW_mm - 10},${paperH_mm - 10}`);
  lines.push(`RECTANG 11.5,11.5 ${paperW_mm - 11.5},${paperH_mm - 11.5}`);

  // 2. Title Block & Header (Top of Paper Space in mm)
  lines.push('CLAYER TDP_TITLEBLOCK');
  const midPaperX = paperW_mm / 2;
  const headerTopY = paperH_mm - 15;

  lines.push(`TEXT J MC ${midPaperX},${headerTopY} 3.5 0 PLAN SHOWING PROPERTY OF`);
  lines.push(`TEXT J MC ${midPaperX},${headerTopY - 6} 4.5 0 ${(project.clientName || 'THE ALLOTTEE').toUpperCase()}`);
  lines.push(`TEXT J MC ${midPaperX},${headerTopY - 12} 2.6 0 SITUATE AT ${(project.location || 'NIGERIA').toUpperCase()}`);
  lines.push(`TEXT J MC ${midPaperX},${headerTopY - 17} 2.2 0 SCALE 1:${scaleRatio}  |  ORIGIN: MINNA DATUM (NIGERIAN NATIONAL GRID)`);

  // 3. Tabulated Coordinate Schedule Table (Bottom-Left in mm)
  if (options.showCoordinateTable !== false && activePoints.length > 0) {
    lines.push('CLAYER TDP_TABLE');
    const tableX = 14;
    const tableTopY = 40;
    const rowH = 4.0;
    const colW1 = 18;
    const colW2 = 25;
    const colW3 = 25;
    const totalW = colW1 + colW2 + colW3;

    // Header box
    lines.push(`RECTANG ${tableX},${tableTopY - rowH} ${tableX + totalW},${tableTopY}`);
    lines.push(`TEXT J MC ${tableX + colW1 / 2},${tableTopY - rowH / 2} 1.5 0 BEACON`);
    lines.push(`TEXT J MC ${tableX + colW1 + colW2 / 2},${tableTopY - rowH / 2} 1.5 0 EASTING (m)`);
    lines.push(`TEXT J MC ${tableX + colW1 + colW2 + colW3 / 2},${tableTopY - rowH / 2} 1.5 0 NORTHING (m)`);

    const ptsToShow = activePoints.slice(0, 6);
    ptsToShow.forEach((pt, idx) => {
      const y = tableTopY - (idx + 2) * rowH;
      lines.push(`RECTANG ${tableX},${y} ${tableX + totalW},${y + rowH}`);
      lines.push(`TEXT J MC ${tableX + colW1 / 2},${y + rowH / 2} 1.3 0 ${pt.id}`);
      lines.push(`TEXT J MC ${tableX + colW1 + colW2 / 2},${y + rowH / 2} 1.3 0 ${pt.easting.toFixed(3)}`);
      lines.push(`TEXT J MC ${tableX + colW1 + colW2 + colW3 / 2},${y + rowH / 2} 1.3 0 ${pt.northing.toFixed(3)}`);
    });
  }

  // 4. Surveyor Certification Block & Seal Box (Bottom-Right in mm)
  if (options.showSealBox !== false) {
    lines.push('CLAYER TDP_CERTIFICATION');
    const certW = 75;
    const certH = 26;
    const certX = paperW_mm - 14 - certW;
    const certY = 14;

    lines.push(`RECTANG ${certX},${certY} ${certX + certW},${certY + certH}`);
    lines.push(`TEXT J MC ${certX + certW / 2},${certY + certH - 4} 1.6 0 SURVEYED & CERTIFIED BY:`);
    
    const survTitle = (currentUser?.title ? currentUser.title + ' ' : 'SURV. ') + (currentUser?.name || project.surveyorName || 'REGISTERED SURVEYOR');
    lines.push(`TEXT J MC ${certX + certW / 2},${certY + certH - 9} 2.0 0 ${survTitle.toUpperCase()}`);
    lines.push(`TEXT J MC ${certX + certW / 2},${certY + certH - 14} 1.4 0 SURCON REG. NO: ${currentUser?.surconNumber || project.surveyorNumber || 'SURCON/REG/2026'}`);
    lines.push(`TEXT J MC ${certX + certW / 2},${certY + certH - 19} 1.3 0 DATE: ${project.date || new Date().toLocaleDateString()}`);
    lines.push(`TEXT J MC ${certX + certW / 2},${certY + 3} 1.2 0 [ OFFICIAL SURVEYOR SEAL ]`);
  }

  // 5. Vector North Arrow Symbol (Top-Right in mm)
  lines.push('CLAYER TDP_TITLEBLOCK');
  const naX = paperW_mm - 22;
  const naY = paperH_mm - 28;
  const naH = 14;

  lines.push(`LINE ${naX},${naY - naH / 2} ${naX},${naY + naH / 2} `);
  lines.push(`LINE ${naX},${naY + naH / 2} ${naX - 2.5},${naY + naH / 2 - 4} `);
  lines.push(`LINE ${naX},${naY + naH / 2} ${naX + 2.5},${naY + naH / 2 - 4} `);
  lines.push(`LINE ${naX - 2.5},${naY + naH / 2 - 4} ${naX + 2.5},${naY + naH / 2 - 4} `);
  lines.push(`TEXT J BC ${naX},${naY + naH / 2 + 1.5} 2.8 0 N`);

  lines.push('ZOOM E');

  return lines.filter(l => l.trim().length > 0).join('\r\n') + '\r\n';
}
