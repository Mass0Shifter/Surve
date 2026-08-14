import jsPDF from 'jspdf';
import { CoordinatePoint, Parcel, ProjectMetadata } from '../types';
import { computeParcel, computeExtents } from '../cogo';
import { getDatumBeltName } from '../datums';
import { determineCadastralSheets } from '../cadastral/sheetIndex';

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

  // 3. Header & Title Block (Top)
  const headerY = outerY + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('TITLE DEED PLAN', pageWidth / 2, headerY + 4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const maxTitleW = outerW - 60;
  const planSub = isSinglePlot && selectedParcel
    ? `PLAN SHOWING ${selectedParcel.plotNumber} ${selectedParcel.ownerName ? `(ALLOTTEE: ${selectedParcel.ownerName.toUpperCase()})` : ''}`
    : `SURVEY PLAN OF ${project.title.toUpperCase()}`;

  doc.setFontSize(8.5);
  doc.text(planSub, pageWidth / 2, headerY + 9, { align: 'center', maxWidth: maxTitleW });

  doc.setFontSize(7.5);
  const locText = `SITUATED AT: ${project.location.toUpperCase()} | DATUM: MINNA (${getDatumBeltName(project.gridBelt).toUpperCase()})`;
  doc.text(locText, pageWidth / 2, headerY + 13.5, { align: 'center', maxWidth: maxTitleW });

  // Divider Line
  doc.setLineWidth(0.3);
  doc.setDrawColor(203, 213, 225);
  doc.line(outerX + 3, headerY + 16, outerX + outerW - 3, headerY + 16);

  // 4. Drawing Area Dimensions & Scale Ratio Determination
  const bottomPanelHeight = options.showCoordinateTable || options.showSealBox ? 55 : 30;
  const drawAreaX = outerX + 6;
  const drawAreaY = headerY + 20;
  const drawAreaW = outerW - 12;
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
  doc.text(`JOB NO: ${project.code}`, outerX + outerW - 6, headerY + 12, { align: 'right' });

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

    // Centroid Label
    const pCentX = mapVerts.reduce((s, v) => s + v.x, 0) / mapVerts.length;
    const pCentY = mapVerts.reduce((s, v) => s + v.y, 0) / mapVerts.length;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isSinglePlot ? style.titleFontSize : Math.max(6, style.titleFontSize - 2));
    doc.setTextColor(15, 23, 42);
    doc.text(parcel.plotNumber, pCentX, pCentY - (isSinglePlot ? 3 : 1.2), { align: 'center' });

    if (parcel.ownerName && isSinglePlot) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(Math.max(6, style.titleFontSize * 0.75));
      doc.setTextColor(71, 85, 105);
      doc.text(parcel.ownerName, pCentX, pCentY + 1.5, { align: 'center' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isSinglePlot ? style.areaFontSize : Math.max(5.5, style.areaFontSize - 1.5));
    doc.setTextColor(bRgb.r, bRgb.g, bRgb.b);
    doc.text(`${comp.areaSquareMeters.toFixed(2)} m² (${comp.areaHectares.toFixed(4)} Ha)`, pCentX, pCentY + (isSinglePlot ? 6 : 2.2), { align: 'center' });

    // Leg Bearings & Distances (Deduplicated per Unique Boundary Edge)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(style.bearingFontSize || 5.5);
    doc.setTextColor(30, 41, 59);

    for (const leg of comp.legs) {
      const edgeKey = [leg.fromPoint.id, leg.toPoint.id].sort().join('__');
      if (renderedEdges.has(edgeKey)) continue;
      renderedEdges.add(edgeKey);

      const p1 = { x: toMapX(leg.fromPoint.easting), y: toMapY(leg.fromPoint.northing) };
      const p2 = { x: toMapX(leg.toPoint.easting), y: toMapY(leg.toPoint.northing) };

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 0.5) continue;

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      let angleRad = Math.atan2(dy, dx);
      if (angleRad > Math.PI / 2) angleRad -= Math.PI;
      if (angleRad <= -Math.PI / 2) angleRad += Math.PI;

      // Unit tangent vector in direction of reading
      const ux = Math.cos(angleRad);
      const uy = Math.sin(angleRad);

      // Perpendicular normal vector
      let nx = -uy;
      let ny = ux;

      // Ensure normal points outward from polygon centroid
      const toCentX = midX - pCentX;
      const toCentY = midY - pCentY;
      if (nx * toCentX + ny * toCentY < 0) {
        nx = -nx;
        ny = -ny;
      }

      const legText = `${leg.bearing.formatted} (${leg.distance.toFixed(2)}m)`;
      const textWidth = doc.getTextWidth(legText);
      // Cap-height compensation (1.4mm font height + 0.9mm line clearance)
      const offDist = 2.3;

      // Analytically compute start point along line tangent and outward normal
      const startX = midX - ux * (textWidth / 2) + nx * offDist;
      const startY = midY - uy * (textWidth / 2) + ny * offDist;
      const angleDeg = angleRad * (180 / Math.PI);

      doc.text(legText, startX, startY, { angle: -angleDeg });
    }
  }

  // Helper to compute outward exterior normal offset for beacon labels
  const computeBeaconLabelPos = (pt: CoordinatePoint, sx: number, sy: number) => {
    for (const parcel of targetParcels) {
      const idx = parcel.pointIds.indexOf(pt.id);
      if (idx !== -1 && parcel.pointIds.length >= 3) {
        const comp = computeParcel(parcel, points);
        if (comp && comp.vertices.length >= 3) {
          const vCentX = comp.vertices.reduce((s, v) => s + toMapX(v.easting), 0) / comp.vertices.length;
          const vCentY = comp.vertices.reduce((s, v) => s + toMapY(v.northing), 0) / comp.vertices.length;

          const n = parcel.pointIds.length;
          const prevId = parcel.pointIds[(idx - 1 + n) % n];
          const nextId = parcel.pointIds[(idx + 1) % n];
          const prevPt = points.find(p => p.id === prevId);
          const nextPt = points.find(p => p.id === nextId);

          if (prevPt && nextPt) {
            const px = toMapX(prevPt.easting);
            const py = toMapY(prevPt.northing);
            const nx = toMapX(nextPt.easting);
            const ny = toMapY(nextPt.northing);

            const v1x = sx - px;
            const v1y = sy - py;
            const v2x = nx - sx;
            const v2y = ny - sy;
            const l1 = Math.hypot(v1x, v1y) || 1;
            const l2 = Math.hypot(v2x, v2y) || 1;

            const u1x = v1x / l1;
            const u1y = v1y / l1;
            const u2x = v2x / l2;
            const u2y = v2y / l2;

            let bx = -(u1y + u2y);
            let by = (u1x + u2x);
            let bl = Math.hypot(bx, by);

            if (bl < 0.01) {
              bx = sx - vCentX;
              by = sy - vCentY;
              bl = Math.hypot(bx, by) || 1;
            }

            bx /= bl;
            by /= bl;

            const toCentX = sx - vCentX;
            const toCentY = sy - vCentY;
            if (bx * toCentX + by * toCentY < 0) {
              bx = -bx;
              by = -by;
            }

            const dist = 3.2;
            return {
              x: sx + bx * dist + (bx < -0.3 ? -1.0 : bx > 0.3 ? 1.0 : 0),
              y: sy + by * dist + (by < -0.2 ? -1.0 : by > 0.2 ? 2.5 : 0.8),
              align: bx < -0.3 ? 'right' : bx > 0.3 ? 'left' : 'center'
            };
          }
        }
      }
    }
    return { x: sx + 2.5, y: sy - 1.2, align: 'left' };
  };

  // 8. Draw Concrete Beacon Symbols (only relevant points)
  const bRadius = style.beaconSize || 1.4;
  for (const pt of targetPoints) {
    const sx = toMapX(pt.easting);
    const sy = toMapY(pt.northing);

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

    // Beacon ID Label (Placed on Exterior Angle Bisector)
    const lbl = computeBeaconLabelPos(pt, sx, sy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(style.beaconFontSize || 6.0);
    doc.setTextColor(15, 23, 42);
    doc.text(pt.id, lbl.x, lbl.y, { align: lbl.align as any });
  }

  // 9. Vector North Arrow
  const naX = drawAreaX + drawAreaW - 14;
  const naY = drawAreaY + 14;

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
  const sbX = drawAreaX + 6;
  const sbY = drawAreaY + drawAreaH - 8;

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

  // 11. Bottom Footer: Coordinate Schedule Table & Surveyor Seal Box
  const footerY = outerY + outerH - bottomPanelHeight;
  doc.setLineWidth(0.3);
  doc.setDrawColor(203, 213, 225);
  doc.line(outerX + 3, footerY, outerX + outerW - 3, footerY);

  if (options.showCoordinateTable) {
    const tableW = outerW * 0.55;
    const tableX = outerX + 4;
    const tableY = footerY + 3;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('COORDINATE SCHEDULE (MINNA DATUM)', tableX, tableY + 2);

    // Table Header
    doc.setFillColor(241, 245, 249);
    doc.rect(tableX, tableY + 3.5, tableW, 4, 'F');
    doc.setFontSize(6);
    doc.setTextColor(71, 85, 105);
    doc.text('BEACON ID', tableX + 2, tableY + 6.2);
    doc.text('EASTING (m)', tableX + 25, tableY + 6.2);
    doc.text('NORTHING (m)', tableX + 50, tableY + 6.2);
    doc.text('ORIGIN', tableX + 75, tableY + 6.2);

    // Table Rows (only beacons for this plot in single plot mode!)
    const schedulePoints = isSinglePlot ? targetPoints : points.slice(0, 8);
    let rowY = tableY + 10.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(15, 23, 42);

    for (const pt of schedulePoints) {
      doc.text(pt.id, tableX + 2, rowY);
      doc.text(pt.easting.toFixed(3), tableX + 25, rowY);
      doc.text(pt.northing.toFixed(3), tableX + 50, rowY);
      doc.text(pt.isControl ? 'CONTROL PILLAR' : 'CONCRETE PILLAR', tableX + 75, rowY);
      rowY += 4.0;
    }
  }

  if (options.showSealBox) {
    const sealX = outerX + outerW * 0.55;
    const sealY = footerY + 2;
    const sealW = outerW * 0.43;

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
