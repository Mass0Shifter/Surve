import jsPDF from 'jspdf';
import { CoordinatePoint, Parcel, ProjectMetadata } from '../types';
import { computeParcel, computeExtents } from '../cogo';
import { getDatumBeltName } from '../datums';
import { determineCadastralSheets } from '../cadastral/sheetIndex';
import { computeCollisionFreeLayout } from '../cadastral/collisionEngine';

export interface TdpStyleConfig {
  // Typography (pt)
  titleFontSize: number;
  bearingFontSize: number;
  beaconFontSize: number;
  areaFontSize: number;

  // Boundary Linework
  boundaryColor: string; // Hex color e.g. '#10b981'
  boundaryLineWidth: number; // mm in PDF
  boundaryLineStyle: 'solid' | 'dashed' | 'dashdot';

  // Plot Fill / Shading
  fillColor: string; // Hex color
  fillOpacity: number; // 0 to 0.4
  hatchPattern: 'none' | 'tint' | 'diagonal' | 'cross';

  // Beacon Markers
  beaconColor: string; // Hex color e.g. '#dc2626'
  controlColor: string; // Hex color e.g. '#f59e0b'
  beaconSize: number; // radius mm

  // Theme Preset
  themePreset?: 'federal_standard' | 'state_lands' | 'executive_deed' | 'cad_blueprint' | 'custom';
}

export interface TdpAdjoiningConfig {
  showAdjoining: boolean;
  adjoiningParcelIds: string[];
  renderMode: 'dashed_full' | 'stub_extension';
  stubDepthMeters: number; // 3m to 15m (default 8m)
  showRoadCorridor: boolean;
  roadCorridorLabel: string; // e.g. "12.00m ACCESS ROAD"
  roadCorridorWidth: number; // e.g. 12m
  /** Indices of boundary legs that face a road. Multi-select: [0] = frontage, [0,2] = corner plot, etc. */
  roadFrontageLegIndices: number[];
}

export const DEFAULT_TDP_STYLE: TdpStyleConfig = {
  titleFontSize: 10,
  bearingFontSize: 5.5,
  beaconFontSize: 6.0,
  areaFontSize: 7.5,
  boundaryColor: '#10b981',
  boundaryLineWidth: 0.6,
  boundaryLineStyle: 'solid',
  fillColor: '#10b981',
  fillOpacity: 0.04,
  hatchPattern: 'tint',
  beaconColor: '#dc2626',
  controlColor: '#f59e0b',
  beaconSize: 1.4,
  themePreset: 'federal_standard'
};

export const TDP_THEME_PRESETS: Record<string, TdpStyleConfig> = {
  federal_standard: {
    ...DEFAULT_TDP_STYLE,
    themePreset: 'federal_standard'
  },
  state_lands: {
    titleFontSize: 11,
    bearingFontSize: 6.0,
    beaconFontSize: 6.5,
    areaFontSize: 8.0,
    boundaryColor: '#1e3a8a',
    boundaryLineWidth: 0.7,
    boundaryLineStyle: 'solid',
    fillColor: '#3b82f6',
    fillOpacity: 0.08,
    hatchPattern: 'diagonal',
    beaconColor: '#dc2626',
    controlColor: '#f59e0b',
    beaconSize: 1.5,
    themePreset: 'state_lands'
  },
  executive_deed: {
    titleFontSize: 12,
    bearingFontSize: 6.0,
    beaconFontSize: 6.5,
    areaFontSize: 8.5,
    boundaryColor: '#0f172a',
    boundaryLineWidth: 0.8,
    boundaryLineStyle: 'solid',
    fillColor: '#d97706',
    fillOpacity: 0.06,
    hatchPattern: 'tint',
    beaconColor: '#0f172a',
    controlColor: '#d97706',
    beaconSize: 1.6,
    themePreset: 'executive_deed'
  },
  cad_blueprint: {
    titleFontSize: 10,
    bearingFontSize: 5.5,
    beaconFontSize: 6.0,
    areaFontSize: 7.5,
    boundaryColor: '#0284c7',
    boundaryLineWidth: 0.7,
    boundaryLineStyle: 'solid',
    fillColor: '#0ea5e9',
    fillOpacity: 0.12,
    hatchPattern: 'cross',
    beaconColor: '#ef4444',
    controlColor: '#f59e0b',
    beaconSize: 1.4,
    themePreset: 'cad_blueprint'
  }
};

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || '#10b981').replace('#', '').trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) || 16,
      g: parseInt(clean[1] + clean[1], 16) || 185,
      b: parseInt(clean[2] + clean[2], 16) || 129
    };
  }
  if (clean.length === 6) {
    return {
      r: parseInt(clean.substring(0, 2), 16) || 16,
      g: parseInt(clean.substring(2, 4), 16) || 185,
      b: parseInt(clean.substring(4, 6), 16) || 129
    };
  }
  return { r: 16, g: 185, b: 129 };
}

export interface TdpLayoutArrangement {
  preset: 'surcon_standard' | 'state_lands_boxed' | 'right_sidebar' | 'compact_split' | 'custom_free';
  headerAlign: 'center' | 'left' | 'split';
  headerYOffset: number; // in mm
  coordTablePosition: 'bottom_left' | 'bottom_right' | 'right_column' | 'top_right' | 'hidden';
  sealBoxPosition: 'bottom_right' | 'bottom_left' | 'bottom_center' | 'right_column';
  scaleBarPosition: 'bottom_right' | 'bottom_left' | 'top_left';
  northArrowPosition: 'top_right' | 'top_left' | 'bottom_right';
  customTitleText?: string;
  customSubtitleText?: string;
  customLocationText?: string;
  customPlanNoText?: string;
}

export const DEFAULT_TDP_LAYOUT: TdpLayoutArrangement = {
  preset: 'surcon_standard',
  headerAlign: 'center',
  headerYOffset: 0,
  coordTablePosition: 'bottom_left',
  sealBoxPosition: 'bottom_right',
  scaleBarPosition: 'bottom_left',
  northArrowPosition: 'top_right',
};

export const TDP_LAYOUT_PRESETS: Record<string, TdpLayoutArrangement> = {
  surcon_standard: {
    preset: 'surcon_standard',
    headerAlign: 'center',
    headerYOffset: 0,
    coordTablePosition: 'bottom_left',
    sealBoxPosition: 'bottom_right',
    scaleBarPosition: 'bottom_left',
    northArrowPosition: 'top_right',
  },
  state_lands_boxed: {
    preset: 'state_lands_boxed',
    headerAlign: 'left',
    headerYOffset: 0,
    coordTablePosition: 'bottom_left',
    sealBoxPosition: 'bottom_right',
    scaleBarPosition: 'bottom_left',
    northArrowPosition: 'top_right',
  },
  right_sidebar: {
    preset: 'right_sidebar',
    headerAlign: 'left',
    headerYOffset: 0,
    coordTablePosition: 'right_column',
    sealBoxPosition: 'right_column',
    scaleBarPosition: 'bottom_left',
    northArrowPosition: 'top_left',
  },
  compact_split: {
    preset: 'compact_split',
    headerAlign: 'split',
    headerYOffset: 0,
    coordTablePosition: 'top_right',
    sealBoxPosition: 'bottom_right',
    scaleBarPosition: 'bottom_left',
    northArrowPosition: 'top_left',
  }
};

export interface TdpElementTransform {
  dx: number;
  dy: number;
  scale?: number;     // 0.5x to 3.0x multiplier
  rotation?: number;  // -180 to 180 degrees
  hidden?: boolean;   // true = omit from render
  locked?: boolean;   // true = prevent accidental repositioning
}

export interface TdpRenderOptions {
  pageSize: 'a4' | 'a3' | 'legal';
  orientation: 'portrait' | 'landscape';
  planType: 'single_plot' | 'selected_plots' | 'layout';
  scaleRatio?: number; // e.g. 500, 1000, 2000 (if undefined, auto-fits)
  selectedParcelId?: string;
  selectedParcelIds?: string[];
  showCoordinateTable: boolean;
  showSealBox: boolean;
  showGridCrosses: boolean;
  showAdjoiningLabels: boolean;
  surveyorSealUrl?: string;
  surveyorSignatureUrl?: string;
  firmSealUrl?: string;
  surconNumber?: string;
  surveyorTitle?: string;
  style?: TdpStyleConfig;
  adjoining?: TdpAdjoiningConfig;
  layout?: TdpLayoutArrangement;
  manualOffsets?: Record<string, { dx: number; dy: number }>;
  elementTransforms?: Record<string, TdpElementTransform>;
  enableCollisionDeconfliction?: boolean;
}

/**
 * Generates an official, print-ready Vector PDF Title Deed Plan (TDP)
 * conforming to Nigerian SURCON, FCDA, and State Surveyor General standards.
 */
export function generateTitleDeedPlanPDF(
  project: ProjectMetadata,
  points: CoordinatePoint[],
  parcels: Parcel[],
  options: TdpRenderOptions
): jsPDF {
  const style = { ...DEFAULT_TDP_STYLE, ...(options.style || {}) };
  const layout = { ...DEFAULT_TDP_LAYOUT, ...(options.layout || {}) };
  const doc = new jsPDF({
    orientation: options.orientation,
    unit: 'mm',
    format: options.pageSize
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const margin = 12; // 12mm page margin
  const outerX = margin;
  const outerY = margin;
  const outerW = pageWidth - margin * 2;
  const outerH = pageHeight - margin * 2;

  // 1. Determine Selected Parcel and Relevant Datasets
  const selectedParcel = parcels.find(p => p.id === options.selectedParcelId) || parcels[0] || null;
  const isSinglePlot = options.planType === 'single_plot' && selectedParcel !== null;

  // Relevant parcels to render
  let targetParcels: Parcel[] = [];
  if (isSinglePlot && selectedParcel) {
    targetParcels = [selectedParcel];
  } else if (options.planType === 'selected_plots' && options.selectedParcelIds && options.selectedParcelIds.length > 0) {
    const idSet = new Set(options.selectedParcelIds);
    targetParcels = parcels.filter(p => idSet.has(p.id));
    if (targetParcels.length === 0 && selectedParcel) targetParcels = [selectedParcel];
  } else {
    targetParcels = parcels;
  }

  let targetPoints: CoordinatePoint[] = [];
  if (options.planType !== 'layout' && targetParcels.length > 0) {
    const pointMap = new Map(points.map(p => [p.id, p]));
    const ptIdSet = new Set<string>();
    targetParcels.forEach(p => p.pointIds.forEach(id => ptIdSet.add(id)));
    targetPoints = Array.from(ptIdSet).map(pid => pointMap.get(pid)).filter(Boolean) as CoordinatePoint[];
  } else {
    targetPoints = points;
  }

  // 2. Draw Double Neatline Outer Borders
  doc.setLineWidth(0.8);
  doc.setDrawColor(15, 23, 42);
  doc.rect(outerX, outerY, outerW, outerH);

  doc.setLineWidth(0.3);
  doc.rect(outerX + 1.5, outerY + 1.5, outerW - 3, outerH - 3);

  // 3. Header & Title Block with Dynamic Layout Alignment
  const headerY = outerY + 6 + (layout.headerYOffset || 0);
  const titleText = layout.customTitleText || 'TITLE DEED PLAN';
  const planSub = layout.customSubtitleText || (isSinglePlot && selectedParcel
    ? `PLAN SHOWING ${selectedParcel.plotNumber} ${selectedParcel.ownerName ? `(ALLOTTEE: ${selectedParcel.ownerName.toUpperCase()})` : ''}`
    : `SURVEY PLAN OF ${project.title.toUpperCase()}`);
  const locText = layout.customLocationText || `SITUATED AT: ${project.location.toUpperCase()} | DATUM: MINNA (${getDatumBeltName(project.gridBelt).toUpperCase()})`;
  const planNo = layout.customPlanNoText || project.code;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);

  const isLeftHeader = layout.headerAlign === 'left';
  const isSplitHeader = layout.headerAlign === 'split';
  const titleX = isLeftHeader ? outerX + 6 : isSplitHeader ? outerX + 6 : pageWidth / 2;
  const titleAlign: 'left' | 'center' = isLeftHeader || isSplitHeader ? 'left' : 'center';
  const maxTitleW = isLeftHeader || isSplitHeader ? outerW - 65 : outerW - 60;

  doc.text(titleText, titleX, headerY + 4, { align: titleAlign });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(planSub, titleX, headerY + 9, { align: titleAlign, maxWidth: maxTitleW });

  doc.setFontSize(7.5);
  doc.text(locText, titleX, headerY + 13.5, { align: titleAlign, maxWidth: maxTitleW });

  // Divider Line
  doc.setLineWidth(0.3);
  doc.setDrawColor(203, 213, 225);
  doc.line(outerX + 3, headerY + 16, outerX + outerW - 3, headerY + 16);

  // 4. Drawing Area Dimensions & Scale Ratio Determination
  const isRightSidebar = layout.coordTablePosition === 'right_column' || layout.sealBoxPosition === 'right_column';
  const rightColW = isRightSidebar ? outerW * 0.36 : 0;
  const bottomPanelHeight = isRightSidebar
    ? 15
    : (options.showCoordinateTable && layout.coordTablePosition !== 'hidden') || (options.showSealBox)
      ? 55
      : 25;

  const drawAreaX = outerX + 6;
  const drawAreaY = headerY + 20;
  const drawAreaW = outerW - 12 - rightColW;
  const drawAreaH = outerH - (drawAreaY - outerY) - bottomPanelHeight;

  // Extents calculated based on target points (focused purely on parcel in single plot mode)
  const extents = computeExtents(targetPoints.length > 0 ? targetPoints : points);
  const centE = extents.centerX;
  const centN = extents.centerY;

  const autoScale = Math.min((drawAreaW - 20) / Math.max(10, extents.width), (drawAreaH - 20) / Math.max(10, extents.height));
  const autoFitRatio = Math.round(1000 / (autoScale > 0 ? autoScale : 1));
  const effectiveScale = (options.scaleRatio && options.scaleRatio > 0) ? options.scaleRatio : autoFitRatio;
  const mapScale = (1000 / effectiveScale);

  const centX = drawAreaX + drawAreaW / 2;
  const centY = drawAreaY + drawAreaH / 2;

  const toMapX = (easting: number) => centX + (easting - centE) * mapScale;
  const toMapY = (northing: number) => centY - (northing - centN) * mapScale;

  // 5. Cadastral Sheet Index Determination
  const centPoint = targetPoints[0] || points[0] || { easting: 294312, northing: 992100 };
  const sheetIndices = determineCadastralSheets(centPoint.easting, centPoint.northing);
  const primarySheet = sheetIndices.find(s => s.scale === effectiveScale) || sheetIndices[0];

  // Draw Sheet Info in Top Right
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`SHEET NO: ${primarySheet.sheetNumber}`, outerX + outerW - 6, headerY + 4, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`SCALE 1:${effectiveScale}`, outerX + outerW - 6, headerY + 8, { align: 'right' });
  doc.text(`JOB NO: ${planNo}`, outerX + outerW - 6, headerY + 12, { align: 'right' });

  // 6. Draw Coordinate Grid Crosses
  if (options.showGridCrosses) {
    const gridStep = effectiveScale <= 250 ? 10 : effectiveScale <= 500 ? 25 : effectiveScale <= 1000 ? 50 : 100;
    const minE = centE - (drawAreaW / (2 * mapScale));
    const maxE = centE + (drawAreaW / (2 * mapScale));
    const minN = centN - (drawAreaH / (2 * mapScale));
    const maxN = centN + (drawAreaH / (2 * mapScale));

    const gStartE = Math.floor(minE / gridStep) * gridStep;
    const gEndE = Math.ceil(maxE / gridStep) * gridStep;
    const gStartN = Math.floor(minN / gridStep) * gridStep;
    const gEndN = Math.ceil(maxN / gridStep) * gridStep;

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.15);
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);

    for (let e = gStartE; e <= gEndE; e += gridStep) {
      for (let n = gStartN; n <= gEndN; n += gridStep) {
        const mx = toMapX(e);
        const my = toMapY(n);

        if (mx >= drawAreaX && mx <= drawAreaX + drawAreaW && my >= drawAreaY && my <= drawAreaY + drawAreaH) {
          doc.line(mx - 2, my, mx + 2, my);
          doc.line(mx, my - 2, mx, my + 2);
        }
      }
    }
  }

  // 6.5. Draw Adjoining (Abutting) Parcels & Road Corridors
  if (options.adjoining?.showAdjoining && isSinglePlot && selectedParcel) {
    const adjConfig = options.adjoining;
    const adjIds = new Set(adjConfig.adjoiningParcelIds || []);
    const abuttingParcels = parcels.filter(p => p.id !== selectedParcel.id && (adjIds.size === 0 || adjIds.has(p.id)));

    // Set dashed style for adjoining lines
    doc.setDrawColor(148, 163, 184); // Slate 400
    doc.setLineWidth(0.35);
    doc.setLineDashPattern([2.5, 1.5], 0);

    for (const adj of abuttingParcels) {
      const compAdj = computeParcel(adj, points);
      if (!compAdj || compAdj.vertices.length < 3) continue;

      if (adjConfig.renderMode === 'dashed_full') {
        // Draw full dashed polygon
        const adjMapVerts = compAdj.vertices.map(v => ({ x: toMapX(v.easting), y: toMapY(v.northing) }));
        for (let i = 0; i < adjMapVerts.length; i++) {
          const p1 = adjMapVerts[i];
          const p2 = adjMapVerts[(i + 1) % adjMapVerts.length];
          doc.line(p1.x, p1.y, p2.x, p2.y);
        }

        // Adjoining Plot Centroid Label
        const aCentX = adjMapVerts.reduce((s, v) => s + v.x, 0) / adjMapVerts.length;
        const aCentY = adjMapVerts.reduce((s, v) => s + v.y, 0) / adjMapVerts.length;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(adj.plotNumber, aCentX, aCentY, { align: 'center' });
      } else {
        // Stub Extension Mode (5m to 15m outward from shared boundary)
        const focusPointIds = new Set(selectedParcel.pointIds);
        const sharedPointIds = adj.pointIds.filter(id => focusPointIds.has(id));

        if (sharedPointIds.length >= 2) {
          const sharedPts = sharedPointIds.map(id => points.find(p => p.id === id)).filter(Boolean) as CoordinatePoint[];
          if (sharedPts.length >= 2) {
            const p1 = { x: toMapX(sharedPts[0].easting), y: toMapY(sharedPts[0].northing) };
            const p2 = { x: toMapX(sharedPts[1].easting), y: toMapY(sharedPts[1].northing) };

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy);
            if (len > 1) {
              let nx = -dy / len;
              let ny = dx / len;
              const midX = (p1.x + p2.x) / 2;
              const midY = (p1.y + p2.y) / 2;
              const toFocusCentX = midX - centX;
              const toFocusCentY = midY - centY;
              if (nx * toFocusCentX + ny * toFocusCentY < 0) {
                nx = -nx;
                ny = -ny;
              }

              const stubDepthMm = (adjConfig.stubDepthMeters || 8) * mapScale;
              const s1 = { x: p1.x + nx * stubDepthMm, y: p1.y + ny * stubDepthMm };
              const s2 = { x: p2.x + nx * stubDepthMm, y: p2.y + ny * stubDepthMm };

              doc.line(p1.x, p1.y, s1.x, s1.y);
              doc.line(p2.x, p2.y, s2.x, s2.y);
              doc.line(s1.x, s1.y, s2.x, s2.y);

              const stubCentX = (midX + (s1.x + s2.x) / 2) / 2;
              const stubCentY = (midY + (s1.y + s2.y) / 2) / 2;
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(6.0);
              doc.setTextColor(100, 116, 139);
              doc.text(adj.plotNumber, stubCentX, stubCentY, { align: 'center' });
            }
          }
        }
      }
    }

    // Road Corridor Depiction
    if (adjConfig.showRoadCorridor && adjConfig.roadCorridorLabel) {
      const compFocus = computeParcel(selectedParcel, points);
      if (compFocus && compFocus.legs.length > 0) {
        const frontageLeg = compFocus.legs[0];
        const p1 = { x: toMapX(frontageLeg.fromPoint.easting), y: toMapY(frontageLeg.fromPoint.northing) };
        const p2 = { x: toMapX(frontageLeg.toPoint.easting), y: toMapY(frontageLeg.toPoint.northing) };

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len > 1) {
          let nx = -dy / len;
          let ny = dx / len;
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          if (nx * (midX - centX) + ny * (midY - centY) < 0) {
            nx = -nx;
            ny = -ny;
          }

          const roadWidthMm = (adjConfig.roadCorridorWidth || 12) * mapScale;
          const r1 = { x: p1.x + nx * roadWidthMm, y: p1.y + ny * roadWidthMm };
          const r2 = { x: p2.x + nx * roadWidthMm, y: p2.y + ny * roadWidthMm };

          doc.setDrawColor(100, 116, 139);
          doc.setLineWidth(0.4);
          doc.setLineDashPattern([3, 2], 0);
          doc.line(r1.x, r1.y, r2.x, r2.y);

          const roadMidX = (midX + (r1.x + r2.x) / 2) / 2;
          const roadMidY = (midY + (r1.y + r2.y) / 2) / 2;
          let angleRad = Math.atan2(dy, dx);
          if (angleRad > Math.PI / 2) angleRad -= Math.PI;
          if (angleRad <= -Math.PI / 2) angleRad += Math.PI;

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.2);
          doc.setTextColor(71, 85, 105);
          const roadText = `═ ${adjConfig.roadCorridorLabel.toUpperCase()} ═`;
          const rtw = doc.getTextWidth(roadText);
          const rux = Math.cos(angleRad);
          const ruy = Math.sin(angleRad);
          doc.text(roadText, roadMidX - rux * (rtw / 2), roadMidY - ruy * (rtw / 2), { angle: -(angleRad * 180 / Math.PI) });
        }
      }
    }

    doc.setLineDashPattern([], 0); // Reset
  }

  // 7. Draw Parcels (Shaded Polygons, Boundaries, Centroid & Line Dimensions)
  const renderedEdges = new Set<string>();
  const bRgb = hexToRgb(style.boundaryColor);
  const fillRgb = hexToRgb(style.fillColor);
  const beaconRgb = hexToRgb(style.beaconColor);
  const controlRgb = hexToRgb(style.controlColor);

  const elemTransforms = options.elementTransforms || {};
  const getTransform = (key: string): TdpElementTransform => {
    if (elemTransforms[key]) return elemTransforms[key];
    const offset = (options.manualOffsets || {})[key];
    return { dx: offset?.dx || 0, dy: offset?.dy || 0, scale: 1.0, rotation: 0, hidden: false, locked: false };
  };

  // Compile combined manual offsets
  const combinedOffsets: Record<string, { dx: number; dy: number }> = {
    ...(options.manualOffsets || {})
  };
  Object.entries(elemTransforms).forEach(([key, tf]) => {
    if (tf.dx !== 0 || tf.dy !== 0) {
      combinedOffsets[key] = { dx: tf.dx, dy: tf.dy };
    }
  });

  // Compute Anti-Collision Layout for PDF space (mm coordinates)
  const resolvedLayout = computeCollisionFreeLayout({
    parcels: targetParcels,
    points: targetPoints,
    toScreenX: toMapX,
    toScreenY: toMapY,
    beaconSize: style.beaconSize || 1.4,
    titleFontSize: (isSinglePlot ? style.titleFontSize : Math.max(6, style.titleFontSize - 2)) * 0.35,
    areaFontSize: (isSinglePlot ? style.areaFontSize : Math.max(5.5, style.areaFontSize - 1.5)) * 0.35,
    bearingFontSize: (style.bearingFontSize || 5.5) * 0.35,
    beaconFontSize: (style.beaconFontSize || 6.0) * 0.35,
    manualOffsets: combinedOffsets,
    enableAutoDeconfliction: options.enableCollisionDeconfliction === true
  });

  const badgeMap = new Map(resolvedLayout.parcelBadges.map(b => [b.parcelId, b]));

  for (const parcel of targetParcels) {
    const comp = computeParcel(parcel, points);
    if (!comp || comp.vertices.length < 3) continue;

    const mapVerts = comp.vertices.map(v => ({ x: toMapX(v.easting), y: toMapY(v.northing) }));

    // Plot Shading / Hatching
    if (style.fillOpacity > 0) {
      if (style.hatchPattern === 'diagonal' || style.hatchPattern === 'cross') {
        doc.setDrawColor(fillRgb.r, fillRgb.g, fillRgb.b);
        doc.setLineWidth(0.18);
        doc.setLineDashPattern([1.5, 1.5], 0);

        const pMinX = Math.min(...mapVerts.map(v => v.x));
        const pMaxX = Math.max(...mapVerts.map(v => v.x));
        const pMinY = Math.min(...mapVerts.map(v => v.y));
        const pMaxY = Math.max(...mapVerts.map(v => v.y));

        const hatchStep = 4.0;
        for (let x = pMinX - (pMaxY - pMinY); x <= pMaxX; x += hatchStep) {
          doc.line(Math.max(pMinX, x), pMinY, Math.min(pMaxX, x + (pMaxY - pMinY)), pMaxY);
        }
        if (style.hatchPattern === 'cross') {
          for (let x = pMaxX + (pMaxY - pMinY); x >= pMinX; x -= hatchStep) {
            doc.line(Math.min(pMaxX, x), pMinY, Math.max(pMinX, x - (pMaxY - pMinY)), pMaxY);
          }
        }
        doc.setLineDashPattern([], 0);
      }
    }

    // Boundary Polyline
    doc.setDrawColor(bRgb.r, bRgb.g, bRgb.b);
    doc.setLineWidth(style.boundaryLineWidth || 0.6);
    if (style.boundaryLineStyle === 'dashed') {
      doc.setLineDashPattern([2.5, 1.5], 0);
    } else if (style.boundaryLineStyle === 'dashdot') {
      doc.setLineDashPattern([2.5, 1.2, 0.6, 1.2], 0);
    }

    for (let i = 0; i < mapVerts.length; i++) {
      const p1 = mapVerts[i];
      const p2 = mapVerts[(i + 1) % mapVerts.length];
      doc.line(p1.x, p1.y, p2.x, p2.y);
    }
    doc.setLineDashPattern([], 0);

    // Centroid / De-conflicted Badge
    const parcelTf = getTransform(`parcel_${parcel.id}`);
    if (!parcelTf.hidden) {
      const badge = badgeMap.get(parcel.id);
      const pCentX = badge ? badge.x : mapVerts.reduce((s, v) => s + v.x, 0) / mapVerts.length;
      const pCentY = badge ? badge.y : mapVerts.reduce((s, v) => s + v.y, 0) / mapVerts.length;
      const badgeScale = parcelTf.scale || 1.0;

      // Draw Leader line if badge was displaced
      if (badge && badge.hasLeaderLine) {
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.2);
        doc.setLineDashPattern([1.0, 1.0], 0);
        doc.line(badge.anchorX, badge.anchorY, badge.x, badge.y);
        doc.setLineDashPattern([], 0);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize((isSinglePlot ? style.titleFontSize : Math.max(6, style.titleFontSize - 2)) * badgeScale);
      doc.setTextColor(15, 23, 42);
      doc.text(parcel.plotNumber, pCentX, pCentY - (isSinglePlot ? 3 : 1.2), { align: 'center' });

      if (parcel.ownerName && isSinglePlot) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(Math.max(6, style.titleFontSize * 0.75) * badgeScale);
        doc.setTextColor(71, 85, 105);
        doc.text(parcel.ownerName, pCentX, pCentY + 1.5, { align: 'center' });
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize((isSinglePlot ? style.areaFontSize : Math.max(5.5, style.areaFontSize - 1.5)) * badgeScale);
      doc.setTextColor(bRgb.r, bRgb.g, bRgb.b);
      doc.text(`${comp.areaSquareMeters.toFixed(2)} m² (${comp.areaHectares.toFixed(4)} Ha)`, pCentX, pCentY + (isSinglePlot ? 6 : 2.2), { align: 'center' });
    }

    // Leg Bearings & Distances (Deduplicated per Unique Boundary Edge)
    for (const leg of comp.legs) {
      const edgeKey = [leg.fromPoint.id, leg.toPoint.id].sort().join('__');
      if (renderedEdges.has(edgeKey)) continue;
      renderedEdges.add(edgeKey);

      const dimTf = getTransform(`dim_${edgeKey}`);
      if (dimTf.hidden) continue;

      const p1 = { x: toMapX(leg.fromPoint.easting), y: toMapY(leg.fromPoint.northing) };
      const p2 = { x: toMapX(leg.toPoint.easting), y: toMapY(leg.toPoint.northing) };

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 0.5) continue;

      const midX = (p1.x + p2.x) / 2 + dimTf.dx;
      const midY = (p1.y + p2.y) / 2 + dimTf.dy;

      let angleRad = Math.atan2(dy, dx);
      if (angleRad > Math.PI / 2) angleRad -= Math.PI;
      if (angleRad <= -Math.PI / 2) angleRad += Math.PI;

      // Unit tangent vector in direction of reading
      const ux = Math.cos(angleRad);
      const uy = Math.sin(angleRad);

      // Perpendicular normal vector
      let nx = -uy;
      let ny = ux;

      const toCentX = midX - (toMapX(comp.vertices[0].easting));
      const toCentY = midY - (toMapY(comp.vertices[0].northing));
      if (nx * toCentX + ny * toCentY < 0) {
        nx = -nx;
        ny = -ny;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize((style.bearingFontSize || 5.5) * (dimTf.scale || 1.0));
      doc.setTextColor(30, 41, 59);

      const legText = `${leg.bearing.formatted} (${leg.distance.toFixed(2)}m)`;
      const textWidth = doc.getTextWidth(legText);
      const offDist = 2.3;

      const startX = midX - ux * (textWidth / 2) + nx * offDist;
      const startY = midY - uy * (textWidth / 2) + ny * offDist;
      const angleDeg = angleRad * (180 / Math.PI) + (dimTf.rotation || 0);

      doc.text(legText, startX, startY, { angle: -angleDeg });
    }
  }

  // 8. Draw Concrete Beacon Symbols & De-conflicted Labels
  const bRadius = style.beaconSize || 1.4;
  const beaconLabelMap = new Map(resolvedLayout.beaconLabels.map(l => [l.pointId, l]));

  for (const pt of targetPoints) {
    const sx = toMapX(pt.easting);
    const sy = toMapY(pt.northing);
    const beaconTf = getTransform(`beacon_${pt.id}`);

    if (!beaconTf.hidden) {
      if (pt.isControl) {
        doc.setDrawColor(controlRgb.r, controlRgb.g, controlRgb.b);
        doc.setLineWidth(0.4);
        doc.triangle(sx, sy - (bRadius * 1.5), sx + (bRadius * 1.5), sy + (bRadius * 1.1), sx - (bRadius * 1.5), sy + (bRadius * 1.1));
      } else {
        doc.setDrawColor(beaconRgb.r, beaconRgb.g, beaconRgb.b);
        doc.setLineWidth(0.3);
        doc.circle(sx, sy, bRadius);
        doc.line(sx - bRadius, sy, sx + bRadius, sy);
        doc.line(sx, sy - bRadius, sx, sy + bRadius);
      }

      // Beacon ID Label (De-conflicted position)
      const lbl = beaconLabelMap.get(pt.id);
      if (lbl) {
        if (lbl.hasLeaderLine) {
          doc.setDrawColor(100, 116, 139);
          doc.setLineWidth(0.2);
          doc.setLineDashPattern([1.0, 1.0], 0);
          doc.line(lbl.anchorX, lbl.anchorY, lbl.x, lbl.y);
          doc.setLineDashPattern([], 0);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize((style.beaconFontSize || 6.0) * (beaconTf.scale || 1.0));
        doc.setTextColor(15, 23, 42);
        const align = lbl.textAnchor === 'start' ? 'left' : lbl.textAnchor === 'end' ? 'right' : 'center';
        doc.text(pt.id, lbl.x, lbl.y, { align: align as any });
      }
    }
  }

  // 9. Vector North Arrow
  let naX = drawAreaX + drawAreaW - 14;
  let naY = drawAreaY + 14;
  if (layout.northArrowPosition === 'top_left') {
    naX = drawAreaX + 14;
    naY = drawAreaY + 14;
  } else if (layout.northArrowPosition === 'bottom_right') {
    naX = drawAreaX + drawAreaW - 14;
    naY = drawAreaY + drawAreaH - 18;
  }

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(naX, naY + 10, naX, naY - 10);
  doc.triangle(naX, naY - 10, naX - 2.5, naY - 4, naX, naY - 6, 'FD');
  doc.triangle(naX, naY - 10, naX + 2.5, naY - 4, naX, naY - 6, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('N', naX, naY - 12, { align: 'center' });
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.text('GRID NORTH', naX, naY + 13, { align: 'center' });

  // 10. Metric Bar Scale (Dynamically Scaled for Generous Spacing)
  let sbX = drawAreaX + 6;
  let sbY = drawAreaY + drawAreaH - 8;
  if (layout.scaleBarPosition === 'bottom_right') {
    sbX = drawAreaX + drawAreaW - 45;
  } else if (layout.scaleBarPosition === 'top_left') {
    sbX = drawAreaX + 6;
    sbY = drawAreaY + 14;
  }

  const targetBarMm = 35;
  const rawMeters = targetBarMm / mapScale;
  const niceIntervals = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const scaleBarMeters = niceIntervals.find(n => n >= rawMeters * 0.75) || 50;
  const scaleBarMm = Math.min(drawAreaW * 0.35, scaleBarMeters * mapScale);

  if (scaleBarMm > 15) {
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.rect(sbX, sbY, scaleBarMm, 1.8, 'S');
    doc.rect(sbX, sbY, scaleBarMm / 2, 1.8, 'F');

    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text('0', sbX, sbY - 1.5);
    doc.text(`${scaleBarMeters / 2}m`, sbX + scaleBarMm / 2, sbY - 1.5, { align: 'center' });
    doc.text(`${scaleBarMeters} METRES`, sbX + scaleBarMm, sbY - 1.5, { align: 'right' });
    doc.text(`SCALE 1:${effectiveScale}`, sbX + scaleBarMm / 2, sbY + 4.5, { align: 'center' });
  }

  // 11. Coordinate Schedule Table & Surveyor Seal Box Layout Arrangement
  const footerY = outerY + outerH - bottomPanelHeight;
  if (!isRightSidebar) {
    doc.setLineWidth(0.3);
    doc.setDrawColor(203, 213, 225);
    doc.line(outerX + 3, footerY, outerX + outerW - 3, footerY);
  }

  // Coordinate Schedule Placement
  if (options.showCoordinateTable && layout.coordTablePosition !== 'hidden') {
    let tableX = outerX + 4;
    let tableY = footerY + 3;
    let tableW = outerW * 0.53;

    if (layout.coordTablePosition === 'bottom_right') {
      tableX = outerX + outerW * 0.45;
      tableW = outerW * 0.53;
    } else if (layout.coordTablePosition === 'right_column') {
      tableX = outerX + outerW - rightColW + 2;
      tableY = drawAreaY;
      tableW = rightColW - 4;
    } else if (layout.coordTablePosition === 'top_right') {
      tableX = drawAreaX + drawAreaW - 75;
      tableY = drawAreaY + 4;
      tableW = 70;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('COORDINATE SCHEDULE (MINNA DATUM)', tableX, tableY + 2);

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(tableX, tableY + 3.5, tableW, 4, 'F');
    doc.setFontSize(5.8);
    doc.setTextColor(71, 85, 105);
    const colStep = tableW / 4;
    doc.text('BEACON ID', tableX + 2, tableY + 6.2);
    doc.text('EASTING (m)', tableX + colStep, tableY + 6.2);
    doc.text('NORTHING (m)', tableX + colStep * 2, tableY + 6.2);
    doc.text('ORIGIN', tableX + colStep * 3, tableY + 6.2);

    // Table Rows
    const schedulePoints = isSinglePlot ? targetPoints : points.slice(0, 8);
    let rowY = tableY + 10.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(15, 23, 42);

    for (const pt of schedulePoints) {
      doc.text(pt.id, tableX + 2, rowY);
      doc.text(pt.easting.toFixed(3), tableX + colStep, rowY);
      doc.text(pt.northing.toFixed(3), tableX + colStep * 2, rowY);
      doc.text(pt.isControl ? 'CONTROL' : 'CONCRETE', tableX + colStep * 3, rowY);
      rowY += 3.8;
    }
  }

  // Surveyor Seal Box Placement
  if (options.showSealBox) {
    let sealX = outerX + outerW * 0.55;
    let sealY = footerY + 2;
    let sealW = outerW * 0.43;

    if (layout.sealBoxPosition === 'bottom_left') {
      sealX = outerX + 4;
      sealW = outerW * 0.43;
    } else if (layout.sealBoxPosition === 'bottom_center') {
      sealX = outerX + outerW * 0.2;
      sealW = outerW * 0.6;
    } else if (layout.sealBoxPosition === 'right_column') {
      sealX = outerX + outerW - rightColW + 2;
      sealY = drawAreaY + 55;
      sealW = rightColW - 4;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    doc.text("SURVEYOR'S CERTIFICATION", sealX, sealY + 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(71, 85, 105);
    const certText = `I hereby certify that this plan was surveyed by me or under my direct supervision on the ground in accordance with Survey Regulations.`;
    doc.text(certText, sealX, sealY + 5.5, { maxWidth: sealW - 22 });

    const survTitle = options.surveyorTitle ? `${options.surveyorTitle} ` : '';
    const survName = `${survTitle}${project.surveyorName}`.toUpperCase();
    const surconNum = options.surconNumber || project.surveyorNumber || 'SURCON REG.';

    // Embed Signature Image if uploaded
    if (options.surveyorSignatureUrl) {
      try {
        doc.addImage(options.surveyorSignatureUrl, 'PNG', sealX, sealY + 8.5, 24, 7);
      } catch (e) {
        console.warn('Failed to embed signature image in PDF', e);
      }
    }

    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(survName, sealX, sealY + 16.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.2);
    doc.setTextColor(51, 65, 85);
    doc.text(surconNum, sealX, sealY + 19);
    doc.text(`FIRM: ${project.surveyFirm.toUpperCase()}`, sealX, sealY + 21.5);
    doc.text(`DATE: ${project.date}`, sealX, sealY + 24);

    // Embed Official Seal Stamp Image (Surveyor Seal or Firm Seal)
    const sealStampUrl = options.surveyorSealUrl || options.firmSealUrl;
    const sealBoxW = 22;
    const sealBoxH = 18;
    const sealImgX = sealX + sealW - sealBoxW - 1;
    const sealImgY = sealY + 4;

    if (sealStampUrl) {
      try {
        doc.addImage(sealStampUrl, 'PNG', sealImgX, sealImgY, sealBoxW, sealBoxH, undefined, 'FAST');
      } catch (e) {
        console.warn('Failed to embed seal stamp image in PDF', e);
        doc.setDrawColor(203, 213, 225);
        doc.rect(sealImgX, sealImgY, sealBoxW, sealBoxH);
        doc.setFontSize(5);
        doc.setTextColor(148, 163, 184);
        doc.text('SURCON\nSEAL', sealImgX + sealBoxW / 2, sealImgY + sealBoxH / 2, { align: 'center' });
      }
    } else {
      doc.setDrawColor(203, 213, 225);
      doc.rect(sealImgX, sealImgY, sealBoxW, sealBoxH);
      doc.setFontSize(5);
      doc.setTextColor(148, 163, 184);
      doc.text('SURCON\nOFFICIAL SEAL', sealImgX + sealBoxW / 2, sealImgY + sealBoxH / 2, { align: 'center' });
    }
  }

  return doc;
}

/**
 * Generates an official Standalone A4 Beacon Coordinate Schedule & Boundary Traverse Report PDF.
 */
export function generateCoordinateSchedulePDF(
  project: ProjectMetadata,
  points: CoordinatePoint[],
  parcels: Parcel[],
  options: Partial<TdpRenderOptions> = {},
  currentUser?: { fullName?: string; title?: string; surconNumber?: string; signatureUrl?: string; digitalSealUrl?: string } | null,
  activeOrg?: { name?: string; officialSealUrl?: string } | null
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageW = 210;
  const pageH = 297;
  const margin = 12;

  // Outer Border Box
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.7);
  doc.rect(margin, margin, pageW - 2 * margin, pageH - 2 * margin);

  // Inner Subtle Neatline
  doc.setLineWidth(0.2);
  doc.rect(margin + 1.5, margin + 1.5, pageW - 2 * margin - 3, pageH - 2 * margin - 3);

  let currentY = margin + 8;

  // 1. Official Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('BEACON COORDINATE & BOUNDARY SCHEDULE', pageW / 2, currentY, { align: 'center' });

  currentY += 5;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text((activeOrg?.name || project.surveyFirm || 'CADASTRAL SURVEY SERVICES').toUpperCase(), pageW / 2, currentY, { align: 'center' });

  currentY += 4;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`PROJECT: ${project.title.toUpperCase()} | LOCATION: ${project.location.toUpperCase()}`, pageW / 2, currentY, { align: 'center' });

  currentY += 4;
  doc.text(`DATUM: MINNA GRID (CLARKE 1880) | PLAN NO: ${project.code || 'PLAN-001'} | DATE: ${project.date || new Date().toISOString().split('T')[0]}`, pageW / 2, currentY, { align: 'center' });

  currentY += 4;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin + 4, currentY, pageW - margin - 4, currentY);

  currentY += 6;

  // 2. Beacon Coordinate Schedule Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('1. BEACON COORDINATE SCHEDULE', margin + 4, currentY);

  currentY += 3.5;

  const tableX = margin + 4;
  const tableW = pageW - 2 * margin - 8;
  const cols = [
    { header: 'S/N', w: 10 },
    { header: 'BEACON ID', w: 32 },
    { header: 'EASTING (m)', w: 38 },
    { header: 'NORTHING (m)', w: 38 },
    { header: 'HEIGHT (m)', w: 26 },
    { header: 'MONUMENT TYPE', w: 36 }
  ];

  // Table Header Background
  doc.setFillColor(241, 245, 249);
  doc.rect(tableX, currentY, tableW, 6, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(tableX, currentY, tableW, 6, 'S');

  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);

  let hX = tableX;
  for (const c of cols) {
    doc.text(c.header, hX + 2, currentY + 4.2);
    hX += c.w;
  }

  currentY += 6;

  // Table Rows
  const sortedPoints = [...points].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(15, 23, 42);

  const rowHeight = 4.8;
  sortedPoints.forEach((pt, index) => {
    // Alternating Row Background
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(tableX, currentY, tableW, rowHeight, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(tableX, currentY, tableW, rowHeight, 'S');

    let rX = tableX;
    doc.text(String(index + 1), rX + 2, currentY + 3.4);
    rX += cols[0].w;

    doc.setFont('helvetica', pt.isControl ? 'bold' : 'normal');
    doc.text(pt.id, rX + 2, currentY + 3.4);
    doc.setFont('helvetica', 'normal');
    rX += cols[1].w;

    doc.text(pt.easting.toFixed(3), rX + 2, currentY + 3.4);
    rX += cols[2].w;

    doc.text(pt.northing.toFixed(3), rX + 2, currentY + 3.4);
    rX += cols[3].w;

    doc.text(pt.elevation !== undefined ? pt.elevation.toFixed(3) : '-', rX + 2, currentY + 3.4);
    rX += cols[4].w;

    doc.text(pt.isControl ? 'PRIMARY CONTROL PILLAR' : 'BURIED CONCRETE BEACON', rX + 2, currentY + 3.4);

    currentY += rowHeight;
  });

  currentY += 6;

  // 3. Parcel Area & Perimeter Schedule Table
  if (parcels.length > 0 && currentY < pageH - 75) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('2. PARCEL COMPUTATION SUMMARY', margin + 4, currentY);

    currentY += 3.5;

    const pCols = [
      { header: 'PLOT NO', w: 32 },
      { header: 'OWNER / ALLOTTEE', w: 48 },
      { header: 'AREA (SQ.M)', w: 36 },
      { header: 'AREA (HECTARES)', w: 34 },
      { header: 'PERIMETER (m)', w: 30 }
    ];

    doc.setFillColor(241, 245, 249);
    doc.rect(tableX, currentY, tableW, 6, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(tableX, currentY, tableW, 6, 'S');

    doc.setFontSize(6.8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);

    let phX = tableX;
    for (const c of pCols) {
      doc.text(c.header, phX + 2, currentY + 4.2);
      phX += c.w;
    }

    currentY += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(15, 23, 42);

    parcels.forEach((pcl, pIdx) => {
      const comp = computeParcel(pcl, points);
      if (pIdx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(tableX, currentY, tableW, rowHeight, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.rect(tableX, currentY, tableW, rowHeight, 'S');

      let prX = tableX;
      doc.setFont('helvetica', 'bold');
      doc.text(pcl.plotNumber, prX + 2, currentY + 3.4);
      doc.setFont('helvetica', 'normal');
      prX += pCols[0].w;

      doc.text(pcl.ownerName || 'UNASSIGNED', prX + 2, currentY + 3.4);
      prX += pCols[1].w;

      doc.text(comp ? `${comp.areaSquareMeters.toFixed(2)} m²` : '-', prX + 2, currentY + 3.4);
      prX += pCols[2].w;

      doc.text(comp ? `${comp.areaHectares.toFixed(4)} Ha` : '-', prX + 2, currentY + 3.4);
      prX += pCols[3].w;

      doc.text(comp ? `${comp.perimeter.toFixed(2)} m` : '-', prX + 2, currentY + 3.4);

      currentY += rowHeight;
    });

    currentY += 6;
  }

  // 4. Surveyor's Official Certification Block (Pinned to bottom of page)
  const sealBlockY = pageH - margin - 42;
  const sealBlockW = tableW;
  const sealBlockH = 38;

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(250, 250, 250);
  doc.rect(tableX, sealBlockY, sealBlockW, sealBlockH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text("SURVEYOR'S STATUTORY CERTIFICATION", tableX + 4, sealBlockY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(71, 85, 105);
  const certText = `I hereby certify that the coordinates and measurements stated in this schedule have been computed and checked in accordance with the Survey Regulations of the Federal Republic of Nigeria and the Surveyors Council of Nigeria (SURCON).`;
  doc.text(certText, tableX + 4, sealBlockY + 9.5, { maxWidth: sealBlockW - 40 });

  const survTitle = currentUser?.title || options.surveyorTitle ? `${currentUser?.title || options.surveyorTitle} ` : 'SURV. ';
  const survName = `${survTitle}${currentUser?.fullName || project.surveyorName}`.toUpperCase();
  const surconNum = currentUser?.surconNumber || options.surconNumber || project.surveyorNumber || 'SURCON REG.';

  // Embed Signature if present
  const sigUrl = currentUser?.signatureUrl || options.surveyorSignatureUrl;
  if (sigUrl) {
    try {
      doc.addImage(sigUrl, 'PNG', tableX + 4, sealBlockY + 16, 26, 7.5);
    } catch (e) {
      console.warn('Failed to embed signature image', e);
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(15, 23, 42);
  doc.text(survName, tableX + 4, sealBlockY + 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(16, 185, 129);
  doc.text(surconNum, tableX + 4, sealBlockY + 29.5);

  doc.setTextColor(71, 85, 105);
  doc.text(`FIRM: ${(activeOrg?.name || project.surveyFirm).toUpperCase()} | DATE: ${project.date}`, tableX + 4, sealBlockY + 33.5);

  // Official Seal Stamp
  const sealStampUrl = currentUser?.digitalSealUrl || activeOrg?.officialSealUrl || options.surveyorSealUrl || options.firmSealUrl;
  const sealBoxW = 28;
  const sealBoxH = 28;
  const sealImgX = tableX + sealBlockW - sealBoxW - 4;
  const sealImgY = sealBlockY + 5;

  if (sealStampUrl) {
    try {
      doc.addImage(sealStampUrl, 'PNG', sealImgX, sealImgY, sealBoxW, sealBoxH, undefined, 'FAST');
    } catch {
      doc.setDrawColor(203, 213, 225);
      doc.rect(sealImgX, sealImgY, sealBoxW, sealBoxH);
      doc.setFontSize(6);
      doc.setTextColor(148, 163, 184);
      doc.text('SURCON\nOFFICIAL SEAL', sealImgX + sealBoxW / 2, sealImgY + sealBoxH / 2, { align: 'center' });
    }
  } else {
    doc.setDrawColor(203, 213, 225);
    doc.rect(sealImgX, sealImgY, sealBoxW, sealBoxH);
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text('SURCON\nOFFICIAL SEAL', sealImgX + sealBoxW / 2, sealImgY + sealBoxH / 2, { align: 'center' });
  }

  return doc;
}

