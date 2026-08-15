import { CoordinatePoint, Parcel, ProjectMetadata } from '../types';
import { computeParcel, computeExtents } from '../cogo';
import { determineCadastralSheets, CadastralSheetInfo } from '../cadastral/sheetIndex';
import { getDatumBeltName } from '../datums';

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
 * Calibrated for 100% mathematical and visual parity with the Vector PDF engine:
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
    northArrowMode?: 'corner' | 'origin_beacon' | 'both';
    trueNorthStyle?: 'UN' | 'TN' | 'N';
    originBeaconId?: string;
    trueNorthMaskParcel?: boolean;
    trueNorthLengthNorth?: number;
    trueNorthLengthSouth?: number;
    trueNorthLengthEast?: number;
    trueNorthLengthWest?: number;
    trueNorthColor?: string;
    trueNorthStrokeWidth?: number;
    trueNorthTextOffset?: number;
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
  const centE = extents.centerX;
  const centN = extents.centerY;

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

  // Exact Drawing Window Dimensions in mm (Matching tdpGenerator.ts)
  const drawAreaW = paperW_mm - 32;
  const drawAreaH = paperH_mm - 110;

  // Compute Auto-Fit Scale Ratio (Identical to PDF engine)
  const autoScale = Math.min((drawAreaW - 20) / Math.max(10, extents.width), (drawAreaH - 20) / Math.max(10, extents.height));
  const autoFitRatio = Math.round(1000 / (autoScale > 0 ? autoScale : 1));
  const effectiveScale = (options.scaleRatio && options.scaleRatio > 0) ? options.scaleRatio : autoFitRatio;
  const scaleFactor = effectiveScale / 1000; // In Model Space, 1mm on paper = scaleFactor meters

  // Cadastral Sheet Index
  const centPoint = activePoints[0] || { easting: 294312, northing: 992100 };
  const sheetIndices = determineCadastralSheets(centPoint.easting, centPoint.northing);
  const primarySheet = sheetIndices.find((s: CadastralSheetInfo) => s.scale === effectiveScale) || sheetIndices[0];

  // Header Titles
  const selectedParcel = parcels[0];
  const planSub = selectedParcel
    ? `PLAN SHOWING ${selectedParcel.plotNumber} ${selectedParcel.ownerName ? `(ALLOTTEE: ${selectedParcel.ownerName.toUpperCase()})` : ''}`
    : `SURVEY PLAN OF ${(project.title || 'THE PROPERTY').toUpperCase()}`;
  const locText = `SITUATED AT: ${(project.location || 'NIGERIA').toUpperCase()} | DATUM: MINNA (${getDatumBeltName(project.gridBelt).toUpperCase()})`;

  const lines: string[] = [];

  // ==========================================
  // A. MODEL SPACE: 1:1 Geodetic Cadastral Plan
  // ==========================================
  lines.push('TILEMODE 1');
  lines.push('UCS W');
  lines.push('MEASUREMENT 1');
  lines.push('INSUNITS 4');
  lines.push('OSMODE 0');
  lines.push('LUNITS 2');
  lines.push('LUPREC 4');
  lines.push('AUNITS 4');
  lines.push('AUPREC 4');
  lines.push('ANGBASE 0');
  lines.push('ANGDIR 0');
  lines.push('PDMODE 32');
  lines.push('PDSIZE 0.5');
  lines.push('PLTSCALE 1');
  lines.push('PSLTSCALE 0');
  lines.push('SETVAR REMEMBERFOLDERS 0');
  lines.push('-STYLE STANDARD Arial 0.0 1.0 0.0 N N');

  // Batch Create All SurvPack TDP Layers
  lines.push('-LAYER N TDP_GRID,TDP_BEACONS,TDP_ANNOTATIONS,TDP_BOUNDARY,TDP_BEARINGS,TDP_TRUENORTH,TDP_BORDER,TDP_NEATLINE,TDP_TITLEBLOCK,TDP_TABLE,TDP_CERTIFICATION,TDP_VIEWPORT C 8 TDP_GRID C 1 TDP_BEACONS C 3 TDP_ANNOTATIONS C 2 TDP_BOUNDARY C 4 TDP_BEARINGS C 7 TDP_TRUENORTH C 7 TDP_BORDER C 7 TDP_NEATLINE C 7 TDP_TITLEBLOCK C 7 TDP_TABLE C 7 TDP_CERTIFICATION C 7 TDP_VIEWPORT ');

  // 1. Geodetic Grid Crosses (Matching PDF step)
  lines.push('CLAYER TDP_GRID');
  const gridStep = effectiveScale <= 250 ? 10 : effectiveScale <= 500 ? 25 : effectiveScale <= 1000 ? 50 : 100;
  const buffer = Math.max(25, extents.width * 0.2);
  const minE = Math.floor(extents.minX - buffer);
  const maxE = Math.ceil(extents.maxX + buffer);
  const minN = Math.floor(extents.minY - buffer);
  const maxN = Math.ceil(extents.maxY + buffer);
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
    const centPlotE = comp.vertices.reduce((s, v) => s + v.easting, 0) / comp.vertices.length;
    const centPlotN = comp.vertices.reduce((s, v) => s + v.northing, 0) / comp.vertices.length;

    lines.push(`TEXT J MC ${centPlotE.toFixed(3)},${centPlotN.toFixed(3)} ${(2.4 * scaleFactor).toFixed(2)} 0 ${parcel.plotNumber}`);
    if (parcel.ownerName) {
      lines.push(`TEXT J MC ${centPlotE.toFixed(3)},${(centPlotN - 3.2 * scaleFactor).toFixed(3)} ${(1.6 * scaleFactor).toFixed(2)} 0 ${parcel.ownerName}`);
    }
    lines.push(`TEXT J MC ${centPlotE.toFixed(3)},${(centPlotN - 5.8 * scaleFactor).toFixed(3)} ${(1.4 * scaleFactor).toFixed(2)} 0 Area: ${comp.areaSquareMeters.toFixed(2)} sq.m`);
  }

  // 5. Boundary Leg Bearings & Distances (Aligned parallel to line segment, cartographic readability)
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

  // 6. True North / Origin Meridian Grid Cross on Starting Beacon (Bi-Directional 4-Way)
  const showOriginMeridian = options.northArrowMode === 'origin_beacon' || options.northArrowMode === 'both' || !options.northArrowMode;
  if (showOriginMeridian) {
    const tnAci = (() => {
      const hex = (options.trueNorthColor || '#0f172a').replace('#', '').toLowerCase();
      if (hex.startsWith('ff0000') || hex.startsWith('ef4444') || hex.startsWith('dc2626')) return 1;
      if (hex.startsWith('ffff00') || hex.startsWith('eab308')) return 2;
      if (hex.startsWith('00ff00') || hex.startsWith('10b981') || hex.startsWith('22c55e')) return 3;
      if (hex.startsWith('00ffff') || hex.startsWith('06b6d4') || hex.startsWith('38bdf8')) return 4;
      if (hex.startsWith('0000ff') || hex.startsWith('2563eb') || hex.startsWith('3b82f6') || hex.startsWith('1d4ed8')) return 5;
      if (hex.startsWith('ff00ff') || hex.startsWith('ec4899') || hex.startsWith('a855f7')) return 6;
      return 7;
    })();

    lines.push(`-LAYER C ${tnAci} TDP_TRUENORTH `);
    lines.push('CLAYER TDP_TRUENORTH');
    const originPt = (options.originBeaconId ? pointMap.get(options.originBeaconId) : null) || activePoints[0];
    if (originPt) {
      const oE = originPt.easting;
      const oN = originPt.northing;

      const lenN_m = (options.trueNorthLengthNorth ?? 45) * scaleFactor;
      const lenS_m = (options.trueNorthLengthSouth ?? 18) * scaleFactor;
      const lenE_m = (options.trueNorthLengthEast ?? 45) * scaleFactor;
      const lenW_m = (options.trueNorthLengthWest ?? 12) * scaleFactor;
      const maskInterior = options.trueNorthMaskParcel !== false;

      const topN = oN + lenN_m;
      const botN = oN - lenS_m;
      const leftE = oE - lenW_m;
      const circleR = 3.6 * scaleFactor;
      const circleCy = topN;
      const needleTipN = topN + 6 * scaleFactor;
      const stemStopN = circleCy - circleR;

      const symStyle = options.trueNorthStyle || 'UN';
      const symLabel = symStyle === 'UN' ? 'U N' : symStyle === 'TN' ? 'T N' : 'N';

      // Vertical Meridian (North Stem)
      lines.push(`LINE ${oE.toFixed(3)},${oN.toFixed(3)} ${oE.toFixed(3)},${stemStopN.toFixed(3)} `);
      const textGap_m = (options.trueNorthTextOffset ?? 0.8) * scaleFactor;
      lines.push(`TEXT J BC ${(oE - textGap_m).toFixed(3)},${((oN + stemStopN) / 2).toFixed(3)} ${(1.4 * scaleFactor).toFixed(2)} 90 ${oE.toFixed(3)} m E`);

      // Vertical Meridian (South Stem with Masking)
      if (maskInterior) {
        const jumpStartN = extents.minY - 6 * scaleFactor;
        const jumpEndN = Math.min(jumpStartN - 15 * scaleFactor, oN - lenS_m);
        lines.push(`LINE ${oE.toFixed(3)},${jumpStartN.toFixed(3)} ${oE.toFixed(3)},${jumpEndN.toFixed(3)} `);
      } else {
        lines.push(`LINE ${oE.toFixed(3)},${botN.toFixed(3)} ${oE.toFixed(3)},${oN.toFixed(3)} `);
      }

      // Horizontal Parallel (Westward stem)
      lines.push(`LINE ${leftE.toFixed(3)},${oN.toFixed(3)} ${oE.toFixed(3)},${oN.toFixed(3)} `);

      // Horizontal Parallel (Eastward stem with Masking)
      if (maskInterior) {
        const jumpStartE = extents.maxX + 8 * scaleFactor;
        const jumpEndE = Math.max(jumpStartE + 20 * scaleFactor, oE + lenE_m);
        lines.push(`LINE ${jumpStartE.toFixed(3)},${oN.toFixed(3)} ${jumpEndE.toFixed(3)},${oN.toFixed(3)} `);
        lines.push(`TEXT J BL ${((jumpStartE + jumpEndE) / 2).toFixed(3)},${(oN + 1.2 * scaleFactor).toFixed(3)} ${(1.4 * scaleFactor).toFixed(2)} 0 ${oN.toFixed(3)} m N`);
      } else {
        const rightE = oE + lenE_m;
        lines.push(`LINE ${oE.toFixed(3)},${oN.toFixed(3)} ${rightE.toFixed(3)},${oN.toFixed(3)} `);
        lines.push(`TEXT J BL ${((oE + rightE) / 2).toFixed(3)},${(oN + 1.2 * scaleFactor).toFixed(3)} ${(1.4 * scaleFactor).toFixed(2)} 0 ${oN.toFixed(3)} m N`);
      }

      // Universal North / True North Symbol at top of meridian
      lines.push(`CIRCLE ${oE.toFixed(3)},${circleCy.toFixed(3)} ${circleR.toFixed(2)}`);
      lines.push(`LINE ${oE.toFixed(3)},${(circleCy + circleR).toFixed(3)} ${oE.toFixed(3)},${needleTipN.toFixed(3)} `);
      lines.push(`TEXT J MC ${oE.toFixed(3)},${circleCy.toFixed(3)} ${(1.8 * scaleFactor).toFixed(2)} 0 ${symLabel}`);
    }
  }

  lines.push('ZOOM E');

  // ==========================================
  // B. PAPER SPACE (LAYOUT 1): True Paper Millimeters (1:1 Parity with PDF)
  // ==========================================
  lines.push('TILEMODE 0');
  lines.push('PSPACE');

  // Exact Viewport Boundaries matching PDF drawing area
  const vpMinX = 16;
  const vpMaxX = paperW_mm - 16;
  const vpMinY = 70;
  const vpMaxY = paperH_mm - 40;

  // Create & Scale Floating Viewport (MVIEW)
  lines.push('CLAYER TDP_VIEWPORT');
  lines.push(`MVIEW ${vpMinX},${vpMinY} ${vpMaxX},${vpMaxY}`);
  lines.push('MSPACE');
  lines.push(`ZOOM C ${centE.toFixed(3)},${centN.toFixed(3)} ${(1000 / effectiveScale).toFixed(4)}XP`);
  lines.push('PSPACE');
  lines.push('MVIEW L ON ALL '); // Lock Viewport Scale to prevent accidental zooming

  // 1. Sheet Outer Border & Double Neatlines (in mm)
  lines.push('CLAYER TDP_BORDER');
  lines.push(`RECTANG 12,12 ${paperW_mm - 12},${paperH_mm - 12}`);

  lines.push('CLAYER TDP_NEATLINE');
  lines.push(`RECTANG 13.5,13.5 ${paperW_mm - 13.5},${paperH_mm - 13.5}`);

  // 2. Title Block & Header (Top of Paper Space in mm)
  lines.push('CLAYER TDP_TITLEBLOCK');
  const midPaperX = paperW_mm / 2;
  const headerTopY = paperH_mm - 16;

  lines.push(`TEXT J MC ${midPaperX},${headerTopY} 4.0 0 TITLE DEED PLAN`);
  lines.push(`TEXT J MC ${midPaperX},${headerTopY - 6} 3.2 0 ${planSub.toUpperCase()}`);
  lines.push(`TEXT J MC ${midPaperX},${headerTopY - 11.5} 2.4 0 ${locText.toUpperCase()}`);
  lines.push(`LINE 15,${headerTopY - 16} ${paperW_mm - 15},${headerTopY - 16} `);

  // Top-Right Sheet Metadata
  lines.push(`TEXT J MR ${paperW_mm - 16},${headerTopY} 2.4 0 SHEET NO: ${primarySheet.sheetNumber}`);
  lines.push(`TEXT J MR ${paperW_mm - 16},${headerTopY - 5} 2.4 0 SCALE 1:${effectiveScale}`);
  lines.push(`TEXT J MR ${paperW_mm - 16},${headerTopY - 10} 2.4 0 JOB NO: ${project.code || 'SURV/TDP/001'}`);

  // 3. Tabulated Coordinate Schedule Table (Bottom-Left in mm)
  if (options.showCoordinateTable !== false && activePoints.length > 0) {
    lines.push('CLAYER TDP_TABLE');
    const tableX = 16;
    const tableTopY = 64;
    const rowH = 4.5;
    const colW1 = 20;
    const colW2 = 35;
    const colW3 = 35;
    const totalW = colW1 + colW2 + colW3;

    // Header box
    lines.push(`RECTANG ${tableX},${tableTopY - rowH} ${tableX + totalW},${tableTopY}`);
    lines.push(`TEXT J MC ${tableX + colW1 / 2},${tableTopY - rowH / 2} 1.6 0 BEACON`);
    lines.push(`TEXT J MC ${tableX + colW1 + colW2 / 2},${tableTopY - rowH / 2} 1.6 0 EASTING (m)`);
    lines.push(`TEXT J MC ${tableX + colW1 + colW2 + colW3 / 2},${tableTopY - rowH / 2} 1.6 0 NORTHING (m)`);

    const ptsToShow = activePoints.slice(0, 9);
    ptsToShow.forEach((pt, idx) => {
      const y = tableTopY - (idx + 2) * rowH;
      lines.push(`RECTANG ${tableX},${y} ${tableX + totalW},${y + rowH}`);
      lines.push(`TEXT J MC ${tableX + colW1 / 2},${y + rowH / 2} 1.4 0 ${pt.id}`);
      lines.push(`TEXT J MC ${tableX + colW1 + colW2 / 2},${y + rowH / 2} 1.4 0 ${pt.easting.toFixed(3)}`);
      lines.push(`TEXT J MC ${tableX + colW1 + colW2 + colW3 / 2},${y + rowH / 2} 1.4 0 ${pt.northing.toFixed(3)}`);
    });
  }

  // 4. Surveyor Certification Block & Seal Box (Bottom-Right in mm)
  if (options.showSealBox !== false) {
    lines.push('CLAYER TDP_CERTIFICATION');
    const certW = 85;
    const certH = 48;
    const certX = paperW_mm - 16 - certW;
    const certY = 16;

    lines.push(`RECTANG ${certX},${certY} ${certX + certW},${certY + certH}`);
    lines.push(`TEXT J MC ${certX + certW / 2},${certY + certH - 5} 1.8 0 SURVEYED & CERTIFIED BY:`);
    
    const survTitle = (currentUser?.title ? currentUser.title + ' ' : 'SURV. ') + (currentUser?.name || project.surveyorName || 'REGISTERED SURVEYOR');
    lines.push(`TEXT J MC ${certX + certW / 2},${certY + certH - 12} 2.4 0 ${survTitle.toUpperCase()}`);
    lines.push(`TEXT J MC ${certX + certW / 2},${certY + certH - 18} 1.6 0 SURCON REG. NO: ${currentUser?.surconNumber || project.surveyorNumber || 'SURCON/REG/2026'}`);
    lines.push(`TEXT J MC ${certX + certW / 2},${certY + certH - 24} 1.5 0 DATE: ${project.date || new Date().toLocaleDateString()}`);
    lines.push(`RECTANG ${certX + 10},${certY + 4} ${certX + certW - 10},${certY + 20}`);
    lines.push(`TEXT J MC ${certX + certW / 2},${certY + 12} 1.3 0 [ OFFICIAL SURVEYOR SEAL ]`);
  }

  // 5. Vector North Arrow Symbol (Top-Right in mm, if corner arrow enabled)
  const showCornerNorth = options.northArrowMode === 'corner' || options.northArrowMode === 'both';
  if (showCornerNorth) {
    lines.push('CLAYER TDP_TITLEBLOCK');
    const naX = paperW_mm - 25;
    const naY = paperH_mm - 55;
    const naH = 14;

    lines.push(`LINE ${naX},${naY - naH / 2} ${naX},${naY + naH / 2} `);
    lines.push(`LINE ${naX},${naY + naH / 2} ${naX - 2.5},${naY + naH / 2 - 4} `);
    lines.push(`LINE ${naX},${naY + naH / 2} ${naX + 2.5},${naY + naH / 2 - 4} `);
    lines.push(`LINE ${naX - 2.5},${naY + naH / 2 - 4} ${naX + 2.5},${naY + naH / 2 - 4} `);
    lines.push(`TEXT J BC ${naX},${naY + naH / 2 + 1.5} 2.8 0 N`);
  }

  lines.push('ZOOM E');

  return lines.filter(l => l.trim().length > 0).join('\r\n') + '\r\n';
}
