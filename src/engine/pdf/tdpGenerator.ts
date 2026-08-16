import jsPDF from 'jspdf';
import { CoordinatePoint, Parcel, ProjectMetadata } from '../types';
import { computeParcel, computeExtents } from '../cogo';
import { getDatumBeltName } from '../datums';
import { determineCadastralSheets } from '../cadastral/sheetIndex';
import { computeCollisionFreeLayout } from '../cadastral/collisionEngine';

export interface ParcelShadingStyle {
  fillColor?: string; // Hex color e.g. '#10b981'
  fillOpacity?: number; // 0 to 1.0 (e.g. 0.08, 0.25)
  hatchPattern?: 'none' | 'tint' | 'diagonal' | 'cross' | 'solid';
  boundaryColor?: string; // Hex color
  boundaryLineWidth?: number; // mm in PDF
  boundaryLineStyle?: 'solid' | 'dashed' | 'dashdot';
}

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

  // Plot Fill / Shading (Global Default)
  fillColor: string; // Hex color
  fillOpacity: number; // 0 to 1.0
  hatchPattern: 'none' | 'tint' | 'diagonal' | 'cross' | 'solid';

  // Beacon Markers
  beaconColor: string; // Hex color e.g. '#dc2626'
  controlColor: string; // Hex color e.g. '#f59e0b'
  beaconSize: number; // radius mm (0.5 to 4.0mm)
  beaconLineWidth?: number; // stroke width mm (0.1 to 1.5mm)
  beaconSymbolStyle?: 'circle_cross' | 'filled_circle' | 'open_circle' | 'square' | 'triangle';

  // Granular Per-Plot Overrides
  parcelShadingOverrides?: Record<string, ParcelShadingStyle>;

  // Theme Preset
  themePreset?: 'federal_standard' | 'state_lands' | 'executive_deed' | 'cad_blueprint' | 'custom';
}

export interface TdpCustomAnnotation {
  id: string;
  type: 'building' | 'drainage' | 'utility' | 'road_curve' | 'text' | 'tie_dimension';
  easting: number;
  northing: number;
  width?: number;
  height?: number;
  rotation?: number;
  label: string;
  subText?: string;
  color?: string;
  hatchPattern?: 'none' | 'diagonal' | 'cross' | 'solid';
}

export interface TdpAdjoiningConfig {
  showAdjoining: boolean;
  adjoiningParcelIds: string[];
  renderMode: 'dashed_full' | 'stub_extension';
  stubDepthMeters: number; // 3m to 15m (default 8m)
  showRoadCorridor: boolean;
  roadCorridorLabel: string; // e.g. "12.00m ACCESS ROAD"
  roadCorridorWidth: number; // e.g. 12m
  roadSetbackMeters?: number; // Distance from parcel boundary before road line (e.g. 0m to 20m)
  roadDirectionFrom?: string; // e.g. "ORANYAN"
  roadDirectionTo?: string; // e.g. "BEYERUNKA"
  roadExtensionMeters?: number; // Extension past corner beacons (e.g. 5m to 25m)
  roadGeometryMode?: 'straight' | 'curved';
  /** Indices of boundary legs that face a road. Multi-select: [0] = frontage, [0,2] = corner plot, etc. */
  roadFrontageLegIndices: number[];
  customAnnotations?: TdpCustomAnnotation[];
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
  beaconLineWidth: 0.3,
  beaconSymbolStyle: 'circle_cross',
  parcelShadingOverrides: {},
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

export type TdpLayoutPreset =
  | 'fct_abuja_rofo'
  | 'surcon_standard'
  | 'lagos_lasg_cadastral'
  | 'state_lands_boxed'
  | 'subdivision_layout'
  | 'right_sidebar'
  | 'compact_split'
  | 'custom_free';

export interface TdpFctRofOConfig {
  rOfONumber?: string;         // e.g. "FCT RLA/ 2002/ 0184"
  allotteeName?: string;       // e.g. "E-NOCK BAKSON KANAWA"
  districtArea?: string;       // e.g. "GWAGWALADA"
  cadastralZone?: string;      // e.g. "CADASTRAL ZONE 04-07"
  zonalSurveyorTitle?: string; // e.g. "ZONAL LAND SURVEYOR"
  fullBeaconNumber?: string;   // e.g. "FCT PB 6371"
  coordinateSystemText?: string; // e.g. "COORDINATE SYSTEM UTM 32N"
  drawnBy?: string;
  checkedBy?: string;
  passedBy?: string;
  dateSurveyed?: string;
  layoutName?: string;         // e.g. "CKC EXT. LAYOUT"
  cadastralMapScaleText?: string; // e.g. "CADASTRAL MAP 1: 1000"
  tieLegFromBeacon?: string;
  tieLegToBeacon?: string;
  tieLegDistance?: number;
  tieLegBearing?: string;
}

export interface TdpLayoutArrangement {
  preset: TdpLayoutPreset;
  headerAlign: 'center' | 'left' | 'split';
  headerYOffset: number; // in mm
  headerTemplate?: 'fct_rofo' | 'shewing_property' | 'being_plot' | 'survey_plan_of' | 'custom';
  clientName?: string;
  locationLocality?: string; // e.g. "AT ABAYOMI STREET, IDI-ISIN AREA, IBADAN"
  locationLgaState?: string; // e.g. "IBADAN NORTH WEST LOCAL GOVT. AREA, OYO STATE"
  originDatumName?: string; // e.g. "U.T.M (ZONE 31)" or "N.N.O" or "MINNA DATUM (MID BELT)"
  showAreaUnderline?: boolean;
  showNeatlineFrame?: boolean;
  footerStyle?: 'surcon_3box' | 'fct_staff_grid' | 'schedule_seal' | 'compact' | 'none';
  fctConfig?: TdpFctRofOConfig;
  surveyorFirmAddress?: string;
  surveyorPhone?: string;
  certifiedTrueCopyText?: string;
  showQrCode?: boolean;
  coordTablePosition: 'bottom_left' | 'bottom_right' | 'right_column' | 'top_right' | 'hidden';
  sealBoxPosition: 'bottom_right' | 'bottom_left' | 'bottom_center' | 'right_column' | 'hidden';
  scaleBarPosition: 'bottom_right' | 'bottom_left' | 'top_left' | 'bottom_center';
  northArrowPosition: 'top_right' | 'top_left' | 'bottom_right' | 'right_mid';
  northArrowMode?: 'corner' | 'origin_beacon' | 'both' | 'fct_needle';
  trueNorthStyle?: 'UN' | 'TN' | 'N';
  originBeaconId?: string;
  trueNorthMaskParcel?: boolean;
  trueNorthLengthNorth?: number;
  trueNorthLengthSouth?: number;
  trueNorthLengthEast?: number;
  trueNorthLengthWest?: number;
  trueNorthColor?: string;
  trueNorthStrokeWidth?: number;
  trueNorthFontSize?: number;
  trueNorthTextOffset?: number;
  customTitleText?: string;
  customSubtitleText?: string;
  customLocationText?: string;
  customPlanNoText?: string;
  customAnnotations?: TdpCustomAnnotation[];
  shortLegScheduleMode?: 'auto' | 'all_on_drawing' | 'all_in_schedule' | 'manual';
  shortLegThresholdMeters?: number;
  omittedLegKeys?: string[];
  showScheduledDimensionsOnDrawing?: boolean;
}

export interface TdpScheduledLeg {
  fromPointId: string;
  toPointId: string;
  distance: number;
  bearingFormatted: string;
  key: string;
}

export function getScheduledBoundaryLegs(
  parcels: Parcel[],
  points: CoordinatePoint[],
  layout: TdpLayoutArrangement
): TdpScheduledLeg[] {
  const result: TdpScheduledLeg[] = [];
  const renderedEdges = new Set<string>();
  const mode = layout.shortLegScheduleMode || 'auto';
  const threshold = layout.shortLegThresholdMeters ?? 6.0;
  const omittedSet = new Set(layout.omittedLegKeys || []);

  for (const parcel of parcels) {
    const comp = computeParcel(parcel, points);
    if (!comp) continue;

    for (const leg of comp.legs) {
      const p1Id = leg.fromPoint.id;
      const p2Id = leg.toPoint.id;
      const edgeKey = [p1Id, p2Id].sort().join('--');
      if (renderedEdges.has(edgeKey)) continue;
      renderedEdges.add(edgeKey);

      let isIncluded = false;
      if (mode === 'all_in_schedule') {
        isIncluded = true;
      } else if (mode === 'all_on_drawing') {
        isIncluded = false;
      } else if (mode === 'manual') {
        isIncluded = omittedSet.has(edgeKey);
      } else {
        // 'auto' mode: include if leg distance <= threshold OR explicitly added in omittedSet
        isIncluded = leg.distance <= threshold || omittedSet.has(edgeKey);
      }

      if (isIncluded) {
        result.push({
          fromPointId: p1Id,
          toPointId: p2Id,
          distance: leg.distance,
          bearingFormatted: leg.bearing.formatted,
          key: edgeKey
        });
      }
    }
  }

  // Fallback: if no short legs were found, include the first leg if FCT preset or tie leg specified
  if (result.length === 0 && (layout.preset === 'fct_abuja_rofo' || layout.fctConfig?.tieLegFromBeacon)) {
    const fct = layout.fctConfig || {};
    const firstComp = parcels[0] ? computeParcel(parcels[0], points) : null;
    const firstLeg = firstComp?.legs?.[0];
    if (firstLeg) {
      result.push({
        fromPointId: fct.tieLegFromBeacon || firstLeg.fromPoint.id,
        toPointId: fct.tieLegToBeacon || firstLeg.toPoint.id,
        distance: fct.tieLegDistance || firstLeg.distance,
        bearingFormatted: fct.tieLegBearing || firstLeg.bearing.formatted,
        key: [firstLeg.fromPoint.id, firstLeg.toPoint.id].sort().join('--')
      });
    }
  }

  return result;
}

export const DEFAULT_TDP_LAYOUT: TdpLayoutArrangement = {
  preset: 'surcon_standard',
  headerAlign: 'center',
  headerYOffset: 0,
  headerTemplate: 'shewing_property',
  footerStyle: 'surcon_3box',
  showAreaUnderline: true,
  showNeatlineFrame: true,
  coordTablePosition: 'bottom_left',
  sealBoxPosition: 'bottom_right',
  scaleBarPosition: 'bottom_left',
  northArrowPosition: 'top_right',
  northArrowMode: 'origin_beacon',
  trueNorthStyle: 'UN',
  trueNorthMaskParcel: true,
  trueNorthLengthNorth: 45,
  trueNorthLengthSouth: 18,
  trueNorthLengthEast: 45,
  trueNorthLengthWest: 12,
  trueNorthColor: '#0f172a',
  trueNorthStrokeWidth: 0.25,
  trueNorthFontSize: 7.0,
  trueNorthTextOffset: 0.8,
  shortLegScheduleMode: 'auto',
  shortLegThresholdMeters: 6.0,
  omittedLegKeys: [],
  showScheduledDimensionsOnDrawing: false,
};

export const TDP_LAYOUT_PRESETS: Record<string, TdpLayoutArrangement> = {
  fct_abuja_rofo: {
    preset: 'fct_abuja_rofo',
    headerAlign: 'center',
    headerYOffset: 0,
    headerTemplate: 'fct_rofo',
    footerStyle: 'fct_staff_grid',
    showAreaUnderline: false,
    showNeatlineFrame: false,
    coordTablePosition: 'hidden',
    sealBoxPosition: 'hidden',
    scaleBarPosition: 'bottom_center',
    northArrowPosition: 'right_mid',
    northArrowMode: 'fct_needle',
    trueNorthStyle: 'TN',
    fctConfig: {
      rOfONumber: 'FCT RLA/ 2002/ 0184',
      allotteeName: 'E-NOCK BAKSON KANAWA',
      districtArea: 'GWAGWALADA',
      cadastralZone: 'CADASTRAL ZONE 04-07',
      zonalSurveyorTitle: 'ZONAL LAND SURVEYOR',
      coordinateSystemText: 'COORDINATE SYSTEM UTM 32N',
      drawnBy: '___________________',
      checkedBy: '_________________',
      passedBy: '__________________',
      dateSurveyed: '27TH OF JUNE, 2002',
      layoutName: 'CKC EXT.   LAYOUT',
      cadastralMapScaleText: 'CADASTRAL MAP 1: 1000'
    }
  },
  surcon_standard: {
    preset: 'surcon_standard',
    headerAlign: 'center',
    headerYOffset: 0,
    headerTemplate: 'shewing_property',
    footerStyle: 'surcon_3box',
    showAreaUnderline: true,
    showNeatlineFrame: true,
    coordTablePosition: 'bottom_left',
    sealBoxPosition: 'bottom_right',
    scaleBarPosition: 'bottom_left',
    northArrowPosition: 'top_right',
    northArrowMode: 'origin_beacon',
    trueNorthStyle: 'UN',
    trueNorthMaskParcel: true,
    trueNorthLengthNorth: 45,
    trueNorthLengthSouth: 18,
    trueNorthLengthEast: 45,
    trueNorthLengthWest: 12,
    trueNorthColor: '#0f172a',
    trueNorthStrokeWidth: 0.25,
    trueNorthFontSize: 7.0,
    trueNorthTextOffset: 0.8,
  },
  lagos_lasg_cadastral: {
    preset: 'lagos_lasg_cadastral',
    headerAlign: 'center',
    headerYOffset: 0,
    headerTemplate: 'shewing_property',
    footerStyle: 'surcon_3box',
    showAreaUnderline: true,
    showNeatlineFrame: true,
    originDatumName: 'U.T.M (ZONE 31)',
    coordTablePosition: 'bottom_left',
    sealBoxPosition: 'bottom_right',
    scaleBarPosition: 'bottom_left',
    northArrowPosition: 'top_right',
    northArrowMode: 'origin_beacon',
    trueNorthStyle: 'UN',
    trueNorthMaskParcel: true,
    trueNorthLengthNorth: 45,
    trueNorthLengthSouth: 18,
    trueNorthLengthEast: 45,
    trueNorthLengthWest: 12,
    trueNorthColor: '#0f172a',
    trueNorthStrokeWidth: 0.25,
    trueNorthFontSize: 7.0,
    trueNorthTextOffset: 0.8,
  },
  state_lands_boxed: {
    preset: 'state_lands_boxed',
    headerAlign: 'left',
    headerYOffset: 0,
    headerTemplate: 'shewing_property',
    footerStyle: 'surcon_3box',
    showAreaUnderline: true,
    showNeatlineFrame: true,
    coordTablePosition: 'bottom_left',
    sealBoxPosition: 'bottom_right',
    scaleBarPosition: 'bottom_left',
    northArrowPosition: 'top_right',
    northArrowMode: 'origin_beacon',
    trueNorthStyle: 'UN',
    trueNorthMaskParcel: true,
    trueNorthLengthNorth: 45,
    trueNorthLengthSouth: 18,
    trueNorthLengthEast: 45,
    trueNorthLengthWest: 12,
    trueNorthColor: '#0f172a',
    trueNorthStrokeWidth: 0.25,
    trueNorthFontSize: 7.0,
    trueNorthTextOffset: 0.8,
  },
  subdivision_layout: {
    preset: 'subdivision_layout',
    headerAlign: 'center',
    headerYOffset: 0,
    headerTemplate: 'being_plot',
    footerStyle: 'surcon_3box',
    showAreaUnderline: true,
    showNeatlineFrame: true,
    coordTablePosition: 'bottom_left',
    sealBoxPosition: 'bottom_right',
    scaleBarPosition: 'bottom_left',
    northArrowPosition: 'top_right',
    northArrowMode: 'origin_beacon',
    trueNorthStyle: 'UN',
    trueNorthMaskParcel: true,
  },
  right_sidebar: {
    preset: 'right_sidebar',
    headerAlign: 'left',
    headerYOffset: 0,
    headerTemplate: 'custom',
    footerStyle: 'schedule_seal',
    showAreaUnderline: false,
    showNeatlineFrame: true,
    coordTablePosition: 'right_column',
    sealBoxPosition: 'right_column',
    scaleBarPosition: 'bottom_left',
    northArrowPosition: 'top_left',
    northArrowMode: 'origin_beacon',
    trueNorthStyle: 'UN',
    trueNorthMaskParcel: true,
    trueNorthLengthNorth: 45,
    trueNorthLengthSouth: 18,
    trueNorthLengthEast: 45,
    trueNorthLengthWest: 12,
    trueNorthColor: '#0f172a',
    trueNorthStrokeWidth: 0.25,
    trueNorthFontSize: 7.0,
    trueNorthTextOffset: 0.8,
  },
  compact_split: {
    preset: 'compact_split',
    headerAlign: 'split',
    headerYOffset: 0,
    headerTemplate: 'custom',
    footerStyle: 'compact',
    showAreaUnderline: false,
    showNeatlineFrame: true,
    coordTablePosition: 'top_right',
    sealBoxPosition: 'bottom_right',
    scaleBarPosition: 'bottom_left',
    northArrowPosition: 'top_left',
    northArrowMode: 'origin_beacon',
    trueNorthStyle: 'UN',
    trueNorthMaskParcel: true,
    trueNorthLengthNorth: 45,
    trueNorthLengthSouth: 18,
    trueNorthLengthEast: 45,
    trueNorthLengthWest: 12,
    trueNorthColor: '#0f172a',
    trueNorthStrokeWidth: 0.25,
    trueNorthFontSize: 7.0,
    trueNorthTextOffset: 0.8,
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
  surveyorName?: string;
  style?: TdpStyleConfig;
  adjoining?: TdpAdjoiningConfig;
  layout?: TdpLayoutArrangement;
  manualOffsets?: Record<string, { dx: number; dy: number }>;
  elementTransforms?: Record<string, TdpElementTransform>;
  parcelShadingOverrides?: Record<string, ParcelShadingStyle>;
  enableCollisionDeconfliction?: boolean;
  previewPixelsPerMeter?: number;
}

/**
 * Mathematically clips and draws hatch lines strictly inside an arbitrary 2D polygon
 * using exact ray-segment intersection and even-odd interior filling.
 */
function clipAndDrawPolygonHatch(
  doc: jsPDF,
  vertices: { x: number; y: number }[],
  angleDeg: number,
  hatchStepMm: number = 3.5
) {
  if (vertices.length < 3) return;

  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  // Normal vector: (-sinA, cosA), Tangent vector: (cosA, sinA)
  // Projection of vertex along normal: d = -x * sinA + y * cosA
  const projections = vertices.map(v => -v.x * sinA + v.y * cosA);
  const minD = Math.min(...projections);
  const maxD = Math.max(...projections);

  const n = vertices.length;

  for (let d = minD + hatchStepMm * 0.5; d <= maxD; d += hatchStepMm) {
    const intersections: { s: number; x: number; y: number }[] = [];

    for (let i = 0; i < n; i++) {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % n];
      const d1 = projections[i];
      const d2 = projections[(i + 1) % n];

      // Check if scanline d crosses edge segment (p1, p2)
      if ((d1 <= d && d2 > d) || (d2 <= d && d1 > d)) {
        const t = (d - d1) / (d2 - d1);
        const ix = p1.x + t * (p2.x - p1.x);
        const iy = p1.y + t * (p2.y - p1.y);
        const s = ix * cosA + iy * sinA;
        intersections.push({ s, x: ix, y: iy });
      }
    }

    // Sort intersections along tangent line
    intersections.sort((a, b) => a.s - b.s);

    // Draw pairwise line segments (Even-Odd interior fill rule)
    for (let j = 0; j < intersections.length - 1; j += 2) {
      doc.line(intersections[j].x, intersections[j].y, intersections[j + 1].x, intersections[j + 1].y);
    }
  }
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

  // 2. Draw Neatline Outer Borders
  if (layout.showNeatlineFrame !== false) {
    doc.setLineWidth(0.8);
    doc.setDrawColor(15, 23, 42);
    doc.rect(outerX, outerY, outerW, outerH);

    doc.setLineWidth(0.3);
    doc.rect(outerX + 1.5, outerY + 1.5, outerW - 3, outerH - 3);
  } else {
    // Subtle border for open/FCT layout
    doc.setLineWidth(0.3);
    doc.setDrawColor(203, 213, 225);
    doc.rect(outerX, outerY, outerW, outerH);
  }

  // 3. Header & Title Block with Dynamic Regional Templates
  const headerY = outerY + 6 + (layout.headerYOffset || 0);
  const isFctRofO = layout.preset === 'fct_abuja_rofo' || layout.headerTemplate === 'fct_rofo';
  const isShewingProperty = layout.preset === 'surcon_standard' || layout.preset === 'lagos_lasg_cadastral' || layout.headerTemplate === 'shewing_property';
  const isBeingPlot = layout.preset === 'subdivision_layout' || layout.headerTemplate === 'being_plot';

  if (isFctRofO) {
    const fct = layout.fctConfig || {};

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`RIGHT OF OCCUPANCY NO. ${fct.rOfONumber || project.code || 'FCT RLA/'}`, pageWidth / 2, headerY + 1, { align: 'center' });

    doc.setFontSize(7.8);
    doc.setFont('helvetica', 'normal');
    doc.text(`LAND GRANTED TO ${(fct.allotteeName || selectedParcel?.ownerName || layout.clientName || 'ALLOTTEE NAME').toUpperCase()}`, pageWidth / 2, headerY + 5.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text((fct.districtArea || project.location || 'GWAGWALADA').toUpperCase(), pageWidth / 2, headerY + 11, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('FEDERAL CAPITAL TERRITORY', pageWidth / 2, headerY + 15, { align: 'center' });
    doc.text('OF FEDERAL REPUBLIC OF NIGERIA', pageWidth / 2, headerY + 18.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.text(`PLOT No. ${selectedParcel?.plotNumber || '7853C'}`, pageWidth / 2, headerY + 22.5, { align: 'center' });

    doc.setFontSize(9.5);
    doc.text(fct.cadastralZone || 'CADASTRAL ZONE 04-07', pageWidth / 2, headerY + 26.5, { align: 'center' });

    // Zonal Land Surveyor Divider
    doc.setLineWidth(0.35);
    doc.setDrawColor(15, 23, 42);
    doc.line(pageWidth / 2 - 40, headerY + 29.5, pageWidth / 2 + 40, headerY + 29.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.0);
    doc.text(fct.zonalSurveyorTitle || 'ZONAL LAND SURVEYOR', pageWidth / 2, headerY + 33, { align: 'center' });

  } else if (isShewingProperty) {
    const client = (layout.clientName || selectedParcel?.ownerName || targetParcels[0]?.ownerName || 'MR. & MRS. TUNDE BAKARE').toUpperCase();
    const loc1 = (layout.locationLocality || project.location || 'AT OFF OLD IFE ROAD, KUMAPAYI AREA, OLODO').toUpperCase();
    const loc2 = (layout.locationLgaState || 'EGBEDA LOCAL GOVERNMENT, OYO STATE').toUpperCase();
    const origin = layout.originDatumName || 'ORIGIN: - OYO SOUTH BEACON (OSB 12T) NATIONAL CADASTRAL DATUM';

    // Line 1: Header Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('PLAN SHEWING PROPERTY SAID TO BELONG TO', pageWidth / 2, headerY + 2, { align: 'center' });

    // Line 2: Client Name with Vector Underline
    doc.setFontSize(11.5);
    doc.text(client, pageWidth / 2, headerY + 7.5, { align: 'center', maxWidth: outerW - 30 });
    if (layout.showAreaUnderline !== false) {
      const clientW = Math.min(doc.getTextWidth(client), outerW - 30);
      doc.setDrawColor(15, 23, 42);
      doc.setLineWidth(0.4);
      doc.line(pageWidth / 2 - clientW / 2, headerY + 8.8, pageWidth / 2 + clientW / 2, headerY + 8.8);
    }

    // Line 3 & 4: Locality & LGA/State
    doc.setFontSize(8.0);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(loc1, pageWidth / 2, headerY + 13.0, { align: 'center', maxWidth: outerW - 30 });
    doc.text(loc2, pageWidth / 2, headerY + 16.8, { align: 'center', maxWidth: outerW - 30 });

    // Line 5: Origin Datum Note
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(origin, pageWidth / 2, headerY + 20.5, { align: 'center', maxWidth: outerW - 30 });

  } else if (isBeingPlot) {
    const plotNo = selectedParcel?.plotNumber || '1';
    const client = layout.clientName || selectedParcel?.ownerName || 'ALLOTTEE';
    const loc = layout.locationLocality || project.location;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`BEING PLOT ${plotNo} (${project.title.toUpperCase()})`, pageWidth / 2, headerY + 2, { align: 'center' });

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`SAID TO BELONG TO: ${client.toUpperCase()}`, pageWidth / 2, headerY + 7, { align: 'center' });

    doc.setFontSize(7.0);
    doc.setTextColor(71, 85, 105);
    doc.text(`SITUATED AT: ${loc.toUpperCase()} | DATUM: MINNA`, pageWidth / 2, headerY + 11.5, { align: 'center' });

    // Divider Line
    doc.setLineWidth(0.3);
    doc.setDrawColor(203, 213, 225);
    doc.line(outerX + 3, headerY + 15, outerX + outerW - 3, headerY + 15);

  } else {
    // Custom / Default Freeform Header
    const titleText = layout.customTitleText || 'TITLE DEED PLAN';
    const clientDisplay = layout.clientName || selectedParcel?.ownerName;
    const planSub = layout.customSubtitleText || (isSinglePlot && selectedParcel
      ? `PLAN SHOWING ${selectedParcel.plotNumber} ${clientDisplay ? `(ALLOTTEE: ${clientDisplay.toUpperCase()})` : ''}`
      : `SURVEY PLAN OF ${clientDisplay ? `${clientDisplay.toUpperCase()} - ` : ''}${project.title.toUpperCase()}`);
    const locText = layout.customLocationText || `SITUATED AT: ${(layout.locationLocality || project.location).toUpperCase()}${layout.locationLgaState ? `, ${layout.locationLgaState.toUpperCase()}` : ''} | DATUM: MINNA (${getDatumBeltName(project.gridBelt).toUpperCase()})`;

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
  }

  // 4. Drawing Area Dimensions & Scale Ratio Determination
  const isRightSidebar = layout.coordTablePosition === 'right_column' || layout.sealBoxPosition === 'right_column';
  const rightColW = isRightSidebar ? outerW * 0.36 : 0;
  const bottomPanelHeight = isRightSidebar
    ? 15
    : (options.showCoordinateTable && layout.coordTablePosition !== 'hidden') || (options.showSealBox)
      ? 55
      : 25;

  const drawAreaX = outerX + 6;
  const drawAreaY = headerY + 22;
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

  // Draw Sheet Info in Top Right (Only for custom/standard layout, NOT for shewing_property or fct_rofo)
  if (!isShewingProperty && !isFctRofO && layout.headerTemplate !== 'shewing_property' && layout.headerTemplate !== 'fct_rofo') {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`SHEET NO: ${primarySheet.sheetNumber}`, outerX + outerW - 6, headerY + 4, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`SCALE 1:${effectiveScale}`, outerX + outerW - 6, headerY + 8, { align: 'right' });
    doc.text(`JOB NO: ${layout.customPlanNoText || project.code || 'TDP'}`, outerX + outerW - 6, headerY + 12, { align: 'right' });
  }

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

  // 6A. Draw Adjoining (Abutting) Parcels (Stub Extensions or Full Dashed Polygons)
  const adjConfig: Partial<TdpAdjoiningConfig> = options.adjoining || {};
  if (adjConfig.showAdjoining && isSinglePlot && selectedParcel) {
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
    doc.setLineDashPattern([], 0);
  }

  // 6B. Road Corridor Depiction with Multi-Frontage & Setback Support (Independent Pass)
  if (adjConfig.showRoadCorridor && (adjConfig.roadCorridorLabel || adjConfig.roadDirectionFrom)) {
    const focusParcel = selectedParcel || targetParcels[0];
    const compFocus = focusParcel ? computeParcel(focusParcel, points) : null;
    if (compFocus && compFocus.legs.length > 0) {
      const selectedLegIndices = (adjConfig.roadFrontageLegIndices && adjConfig.roadFrontageLegIndices.length > 0)
        ? adjConfig.roadFrontageLegIndices.filter(i => i < compFocus.legs.length)
        : [0];

      for (const legIdx of selectedLegIndices) {
        const leg = compFocus.legs[legIdx];
        const p1 = { x: toMapX(leg.fromPoint.easting), y: toMapY(leg.fromPoint.northing) };
        const p2 = { x: toMapX(leg.toPoint.easting), y: toMapY(leg.toPoint.northing) };

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

          const setbackMm = (adjConfig.roadSetbackMeters || 0) * mapScale;
          const roadWidthMm = (adjConfig.roadCorridorWidth || 12) * mapScale;
          const extMm = (adjConfig.roadExtensionMeters || 6) * mapScale;

          // Unit tangent vector
          const ux = dx / len;
          const uy = dy / len;

          // Near road line (if setback > 0)
          if (setbackMm > 0.5) {
            const n1 = { x: p1.x + nx * setbackMm - ux * extMm, y: p1.y + ny * setbackMm - uy * extMm };
            const n2 = { x: p2.x + nx * setbackMm + ux * extMm, y: p2.y + ny * setbackMm + uy * extMm };
            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.3);
            doc.setLineDashPattern([3, 2], 0);
            doc.line(n1.x, n1.y, n2.x, n2.y);
          }

          // Far road line
          const totalDistMm = setbackMm + roadWidthMm;
          const r1 = { x: p1.x + nx * totalDistMm - ux * extMm, y: p1.y + ny * totalDistMm - uy * extMm };
          const r2 = { x: p2.x + nx * totalDistMm + ux * extMm, y: p2.y + ny * totalDistMm + uy * extMm };

          doc.setDrawColor(100, 116, 139);
          doc.setLineWidth(0.4);
          doc.setLineDashPattern([3, 2], 0);
          doc.line(r1.x, r1.y, r2.x, r2.y);

          // Extension stubs from beacons to far road line
          doc.setLineWidth(0.25);
          doc.setLineDashPattern([2, 2], 0);
          doc.line(p1.x, p1.y, p1.x + nx * totalDistMm, p1.y + ny * totalDistMm);
          doc.line(p2.x, p2.y, p2.x + nx * totalDistMm, p2.y + ny * totalDistMm);

          // If curved mode, draw perpendicular tick marks along road line
          if (adjConfig.roadGeometryMode === 'curved') {
            const tickStep = 6;
            const numTicks = Math.floor(len / tickStep);
            for (let t = 1; t <= numTicks; t++) {
              const tx = p1.x + ux * (t * tickStep) + nx * totalDistMm;
              const ty = p1.y + uy * (t * tickStep) + ny * totalDistMm;
              doc.line(tx - nx * 1.5, ty - ny * 1.5, tx + nx * 1.5, ty + ny * 1.5);
            }
          }

          // Road Label Annotation
          const roadMidX = midX + nx * (setbackMm + roadWidthMm * 0.5);
          const roadMidY = midY + ny * (setbackMm + roadWidthMm * 0.5);
          let angleRad = Math.atan2(dy, dx);
          if (angleRad > Math.PI / 2) angleRad -= Math.PI;
          if (angleRad <= -Math.PI / 2) angleRad += Math.PI;

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.2);
          doc.setTextColor(71, 85, 105);

          let roadText = '';
          if (adjConfig.roadDirectionFrom && adjConfig.roadDirectionTo) {
            roadText = `FROM ${adjConfig.roadDirectionFrom.toUpperCase()} ─────> TO ${adjConfig.roadDirectionTo.toUpperCase()}`;
          } else if (adjConfig.roadCorridorLabel) {
            roadText = `═ ${adjConfig.roadCorridorLabel.toUpperCase()} ═`;
          }

          if (roadText) {
            const rtw = doc.getTextWidth(roadText);
            const rux = Math.cos(angleRad);
            const ruy = Math.sin(angleRad);
            doc.text(roadText, roadMidX - rux * (rtw / 2), roadMidY - ruy * (rtw / 2), { angle: -(angleRad * 180 / Math.PI) });
          }
        }
      }
    }
    doc.setLineDashPattern([], 0);
  }

  // 6C. Topographic Feature Annotations (Buildings, Drainage, Utilities, Custom Text - Independent Pass)
  const annotations = layout.customAnnotations || adjConfig.customAnnotations || [];
  if (annotations.length > 0) {
    for (const ann of annotations) {
      const ax = toMapX(ann.easting);
      const ay = toMapY(ann.northing);
      const annRot = (ann.rotation || 0) * (Math.PI / 180);

      if (ann.type === 'building') {
        const bwMm = (ann.width || 12) * mapScale;
        const bhMm = (ann.height || 8) * mapScale;

        // Draw Building Polygon
        const halfW = bwMm / 2;
        const halfH = bhMm / 2;
        const cosR = Math.cos(annRot);
        const sinR = Math.sin(annRot);

        const bVerts = [
          { x: ax + (-halfW * cosR - -halfH * sinR), y: ay + (-halfW * sinR + -halfH * cosR) },
          { x: ax + (halfW * cosR - -halfH * sinR), y: ay + (halfW * sinR + -halfH * cosR) },
          { x: ax + (halfW * cosR - halfH * sinR), y: ay + (halfW * sinR + halfH * cosR) },
          { x: ax + (-halfW * cosR - halfH * sinR), y: ay + (-halfW * sinR + halfH * cosR) }
        ];

        doc.setDrawColor(71, 85, 105);
        doc.setLineWidth(0.35);
        doc.setLineDashPattern([], 0);
        for (let vi = 0; vi < 4; vi++) {
          doc.line(bVerts[vi].x, bVerts[vi].y, bVerts[(vi + 1) % 4].x, bVerts[(vi + 1) % 4].y);
        }

        // Building Diagonal Hatch
        clipAndDrawPolygonHatch(doc, bVerts, 45, 2.5);

        // Building Label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.5);
        doc.setTextColor(51, 65, 85);
        doc.text((ann.label || 'EXISTING BUILDING').toUpperCase(), ax, ay, { align: 'center' });

      } else if (ann.type === 'drainage') {
        const dLenMm = (ann.width || 20) * mapScale;
        const cosR = Math.cos(annRot);
        const sinR = Math.sin(annRot);
        const dHalf = dLenMm / 2;

        doc.setDrawColor(56, 189, 248);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([], 0);
        doc.line(ax - dHalf * cosR - sinR * 1.0, ay - dHalf * sinR + cosR * 1.0, ax + dHalf * cosR - sinR * 1.0, ay + dHalf * sinR + cosR * 1.0);
        doc.line(ax - dHalf * cosR + sinR * 1.0, ay - dHalf * sinR - cosR * 1.0, ax + dHalf * cosR + sinR * 1.0, ay + dHalf * sinR - cosR * 1.0);

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(5.0);
        doc.setTextColor(3, 105, 161);
        doc.text((ann.label || 'DRAINAGE').toUpperCase(), ax, ay + 0.8, { align: 'center' });

      } else if (ann.type === 'utility') {
        doc.setDrawColor(234, 88, 12);
        doc.setLineWidth(0.35);
        doc.setLineDashPattern([], 0);
        doc.rect(ax - 3, ay - 3, 6, 6);
        doc.line(ax - 3, ay - 3, ax + 3, ay + 3);
        doc.line(ax - 3, ay + 3, ax + 3, ay - 3);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.0);
        doc.setTextColor(194, 65, 12);
        doc.text((ann.label || 'TRANSFORMER').toUpperCase(), ax, ay + 5.5, { align: 'center' });

      } else if (ann.type === 'text') {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        const rotDeg = ann.rotation || 0;
        doc.text(ann.label.toUpperCase(), ax, ay, { align: 'center', angle: -rotDeg });
      }
    }
    doc.setLineDashPattern([], 0);
  }

  // 7. Draw Parcels (Shaded Polygons, Boundaries, Centroid & Line Dimensions)
  const renderedEdges = new Set<string>();
  const bRgb = hexToRgb(style.boundaryColor);
  const beaconRgb = hexToRgb(style.beaconColor);
  const controlRgb = hexToRgb(style.controlColor);

  const elemTransforms = options.elementTransforms || {};

  // Convert preview SVG pixel offsets to PDF millimeters based on actual scale ratio
  const svgPpm = options.previewPixelsPerMeter || (drawAreaW / Math.max(10, extents.width));
  const pxToMm = svgPpm > 0 ? (mapScale / svgPpm) : 0.28;

  const getTransform = (key: string): TdpElementTransform => {
    let raw: TdpElementTransform | undefined = elemTransforms[key];
    if (!raw) {
      const lowerKey = key.toLowerCase();
      for (const [k, v] of Object.entries(elemTransforms)) {
        if (k.toLowerCase() === lowerKey) {
          raw = v;
          break;
        }
      }
    }
    if (raw) {
      return {
        ...raw,
        dx: (raw.dx || 0) * pxToMm,
        dy: (raw.dy || 0) * pxToMm
      };
    }
    const offset = (options.manualOffsets || {})[key];
    return { dx: (offset?.dx || 0) * pxToMm, dy: (offset?.dy || 0) * pxToMm, scale: 1.0, rotation: 0, hidden: false, locked: false };
  };

  // Compile combined manual offsets in millimeter units for collision engine
  const combinedOffsets: Record<string, { dx: number; dy: number }> = {};
  if (options.manualOffsets) {
    Object.entries(options.manualOffsets).forEach(([k, off]) => {
      combinedOffsets[k] = { dx: off.dx * pxToMm, dy: off.dy * pxToMm };
    });
  }
  Object.entries(elemTransforms).forEach(([key, tf]) => {
    if (tf.dx !== 0 || tf.dy !== 0) {
      combinedOffsets[key] = { dx: tf.dx * pxToMm, dy: tf.dy * pxToMm };
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
    enableAutoDeconfliction: options.enableCollisionDeconfliction === true,
    unitScale: 'mm'
  });

  const badgeMap = new Map(resolvedLayout.parcelBadges.map(b => [b.parcelId, b]));

  for (const parcel of targetParcels) {
    const comp = computeParcel(parcel, points);
    if (!comp || comp.vertices.length < 3) continue;

    const mapVerts = comp.vertices.map(v => ({ x: toMapX(v.easting), y: toMapY(v.northing) }));

    // Granular Per-Plot Styling Resolution (Override vs Global Default)
    const customPlotStyle = (options.parcelShadingOverrides?.[parcel.id]) || (style.parcelShadingOverrides?.[parcel.id]);
    const plotFillColor = customPlotStyle?.fillColor || style.fillColor;
    const plotFillOpacity = customPlotStyle?.fillOpacity !== undefined ? customPlotStyle.fillOpacity : style.fillOpacity;
    const plotHatchPattern = customPlotStyle?.hatchPattern || style.hatchPattern;
    const plotBoundaryColor = customPlotStyle?.boundaryColor || style.boundaryColor;
    const plotBoundaryLineWidth = customPlotStyle?.boundaryLineWidth || style.boundaryLineWidth || 0.6;
    const plotBoundaryLineStyle = customPlotStyle?.boundaryLineStyle || style.boundaryLineStyle || 'solid';

    const pFillRgb = hexToRgb(plotFillColor);
    const pBoundRgb = hexToRgb(plotBoundaryColor);

    // 1. Solid / Tint Alpha-Blended Vector Polygon Fill
    if (plotFillOpacity > 0 && (plotHatchPattern === 'tint' || plotHatchPattern === 'solid' || plotHatchPattern === 'none')) {
      doc.setFillColor(pFillRgb.r, pFillRgb.g, pFillRgb.b);
      try {
        const gState = new (doc as any).GState({ opacity: plotFillOpacity });
        doc.setGState(gState);
      } catch (e) {
        console.warn('GState opacity not supported in current environment', e);
      }

      const lines: [number, number][] = [];
      for (let i = 1; i < mapVerts.length; i++) {
        lines.push([mapVerts[i].x - mapVerts[i - 1].x, mapVerts[i].y - mapVerts[i - 1].y]);
      }
      doc.lines(lines, mapVerts[0].x, mapVerts[0].y, [1.0, 1.0], 'F', true);

      try {
        doc.setGState(new (doc as any).GState({ opacity: 1.0 }));
      } catch (e) {
        console.warn('GState opacity reset not supported', e);
      }
    }

    // 2. Exact Even-Odd Mathematically Clipped Hatching
    if (plotFillOpacity > 0 && (plotHatchPattern === 'diagonal' || plotHatchPattern === 'cross')) {
      doc.setDrawColor(pFillRgb.r, pFillRgb.g, pFillRgb.b);
      doc.setLineWidth(0.18);
      doc.setLineDashPattern([1.5, 1.5], 0);

      clipAndDrawPolygonHatch(doc, mapVerts, 45, 3.5);
      if (plotHatchPattern === 'cross') {
        clipAndDrawPolygonHatch(doc, mapVerts, -45, 3.5);
      }

      doc.setLineDashPattern([], 0);
    }

    // Boundary Polyline with Granular Override
    doc.setDrawColor(pBoundRgb.r, pBoundRgb.g, pBoundRgb.b);
    doc.setLineWidth(plotBoundaryLineWidth);
    if (plotBoundaryLineStyle === 'dashed') {
      doc.setLineDashPattern([2.5, 1.5], 0);
    } else if (plotBoundaryLineStyle === 'dashdot') {
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
    const scheduledLegs = getScheduledBoundaryLegs(targetParcels, points, layout);
    const scheduledLegsSet = new Set(scheduledLegs.map(l => l.key));

    for (const leg of comp.legs) {
      const p1Id = leg.fromPoint.id;
      const p2Id = leg.toPoint.id;
      const edgeKeyDash = [p1Id, p2Id].sort().join('--');
      const edgeKeyUnderscore = [p1Id, p2Id].sort().join('__');

      if (renderedEdges.has(edgeKeyDash)) continue;
      renderedEdges.add(edgeKeyDash);

      // Check if routed to schedule table
      const isScheduledInTable = scheduledLegsSet.has(edgeKeyDash);
      if (isScheduledInTable && !layout.showScheduledDimensionsOnDrawing) continue;

      // Check all canonical key representations: double dash, double underscore, raw endpoints
      const dimTf = getTransform(`dim_${edgeKeyDash}`) ||
                    getTransform(`dim_${edgeKeyUnderscore}`) ||
                    getTransform(`dim_${p1Id}_${p2Id}`) ||
                    getTransform(`dim_${p2Id}_${p1Id}`);

      if (dimTf?.hidden) continue;

      const p1 = { x: toMapX(leg.fromPoint.easting), y: toMapY(leg.fromPoint.northing) };
      const p2 = { x: toMapX(leg.toPoint.easting), y: toMapY(leg.toPoint.northing) };

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 0.5) continue;

      const midX = (p1.x + p2.x) / 2 + dimTf.dx;
      const midY = (p1.y + p2.y) / 2 + dimTf.dy;

      // Draw connecting leader line if displaced
      const anchorMidX = (p1.x + p2.x) / 2;
      const anchorMidY = (p1.y + p2.y) / 2;
      const isDisplaced = Math.hypot(dimTf.dx, dimTf.dy) > 2.0;

      if (isDisplaced) {
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.2);
        doc.setLineDashPattern([2, 1.5], 0);
        doc.line(anchorMidX, anchorMidY, midX, midY);
        doc.setLineDashPattern([], 0);
        doc.setFillColor(100, 116, 139);
        doc.circle(anchorMidX, anchorMidY, 0.35, 'F');
      }

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

      const startX = isDisplaced ? (midX - ux * (textWidth / 2)) : (midX - ux * (textWidth / 2) + nx * offDist);
      const startY = isDisplaced ? (midY - uy * (textWidth / 2)) : (midY - uy * (textWidth / 2) + ny * offDist);
      const angleDeg = angleRad * (180 / Math.PI) + (dimTf.rotation || 0);

      doc.text(legText, startX, startY, { angle: -angleDeg });
    }
  }

  // 8. Draw Concrete Beacon Symbols & De-conflicted Labels
  const bRadius = style.beaconSize || 1.4;
  const bLineWidth = style.beaconLineWidth || 0.3;
  const bSymbol = style.beaconSymbolStyle || 'circle_cross';
  const beaconLabelMap = new Map(resolvedLayout.beaconLabels.map(l => [l.pointId, l]));

  for (const pt of targetPoints) {
    const sx = toMapX(pt.easting);
    const sy = toMapY(pt.northing);
    const beaconTf = getTransform(`beacon_${pt.id}`);

    if (!beaconTf.hidden) {
      const scale = beaconTf.scale || 1.0;
      const r = bRadius * scale;

      if (pt.isControl) {
        doc.setDrawColor(controlRgb.r, controlRgb.g, controlRgb.b);
        doc.setLineWidth(bLineWidth * 1.3);
        doc.triangle(sx, sy - (r * 1.5), sx + (r * 1.5), sy + (r * 1.1), sx - (r * 1.5), sy + (r * 1.1));
      } else {
        doc.setDrawColor(beaconRgb.r, beaconRgb.g, beaconRgb.b);
        doc.setLineWidth(bLineWidth);

        if (bSymbol === 'filled_circle') {
          doc.setFillColor(beaconRgb.r, beaconRgb.g, beaconRgb.b);
          doc.circle(sx, sy, r, 'F');
        } else if (bSymbol === 'open_circle') {
          doc.circle(sx, sy, r);
        } else if (bSymbol === 'square') {
          doc.rect(sx - r, sy - r, r * 2, r * 2);
          doc.line(sx - r, sy - r, sx + r, sy + r);
          doc.line(sx - r, sy + r, sx + r, sy - r);
        } else if (bSymbol === 'triangle') {
          doc.triangle(sx, sy - (r * 1.3), sx + (r * 1.3), sy + (r * 0.9), sx - (r * 1.3), sy + (r * 0.9));
        } else {
          // 'circle_cross' (Standard SURCON Federal Monument)
          doc.circle(sx, sy, r);
          doc.line(sx - r, sy, sx + r, sy);
          doc.line(sx, sy - r, sx, sy + r);
        }
      }

      // Beacon ID Label (De-conflicted position with vertical baseline compensation)
      const lbl = beaconLabelMap.get(pt.id);
      if (lbl) {
        const bFontSize = (style.beaconFontSize || 6.0) * (beaconTf.scale || 1.0);
        // Compensate for jsPDF's bottom-baseline text rendering vs SVG dominantBaseline central/hanging
        const fontSizeMm = bFontSize * 0.3527;
        const baselineOffsetY = lbl.dominantBaseline === 'hanging' ? (fontSizeMm * 0.75) : (fontSizeMm * 0.35);

        if (lbl.hasLeaderLine) {
          doc.setDrawColor(100, 116, 139);
          doc.setLineWidth(0.2);
          doc.setLineDashPattern([1.0, 1.0], 0);
          doc.line(lbl.anchorX, lbl.anchorY, lbl.x, lbl.y);
          doc.setLineDashPattern([], 0);
          doc.setFillColor(100, 116, 139);
          doc.circle(lbl.anchorX, lbl.anchorY, 0.25, 'F');
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(bFontSize);
        doc.setTextColor(15, 23, 42);
        const align = lbl.textAnchor === 'start' ? 'left' : lbl.textAnchor === 'end' ? 'right' : 'center';
        doc.text(pt.id, lbl.x, lbl.y + baselineOffsetY, { align: align as any });
      }
    }
  }

  // 9. True North / Origin Meridian Grid Cross on Starting Beacon (Bi-Directional 4-Way)
  const isFctNeedle = layout.northArrowMode === 'fct_needle' || isFctRofO;
  const showOriginMeridian = (layout.northArrowMode === 'origin_beacon' || layout.northArrowMode === 'both' || !layout.northArrowMode) && !isFctNeedle;
  const showCornerNorthArrow = layout.northArrowMode === 'corner' || layout.northArrowMode === 'both';

  if (isFctNeedle) {
    // FCT Abuja Large Needle North Arrow (Right-Center position)
    const naX = drawAreaX + drawAreaW - 12;
    const naCenterY = drawAreaY + drawAreaH * 0.42;
    const needleHeightMm = 45;
    const tipY = naCenterY - needleHeightMm / 2;
    const baseY = naCenterY + needleHeightMm / 2;

    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);

    // Left half filled black, right half open stroke
    doc.setFillColor(15, 23, 42);
    doc.triangle(naX, tipY, naX - 3.2, baseY - 12, naX, baseY - 12, 'FD');
    doc.triangle(naX, tipY, naX + 3.2, baseY - 12, naX, baseY - 12, 'S');

    // Stem down to base
    doc.line(naX, baseY - 12, naX, baseY);
    doc.line(naX - 5, baseY - 4, naX + 5, baseY - 4);

    // Label: 'N  N' or 'T  N'
    const needleLabel = layout.trueNorthStyle === 'TN' ? 'T  N' : layout.trueNorthStyle === 'UN' ? 'U  N' : 'N  N';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.0);
    doc.setTextColor(15, 23, 42);
    doc.text(needleLabel, naX, baseY - 5.5, { align: 'center' });

  } else if (showOriginMeridian) {
    const originPt = (layout.originBeaconId ? targetPoints.find(p => p.id === layout.originBeaconId) || points.find(p => p.id === layout.originBeaconId) : null) || targetPoints[0] || points[0];
    if (originPt) {
      const ox = toMapX(originPt.easting);
      const oy = toMapY(originPt.northing);

      const lenN = layout.trueNorthLengthNorth ?? 45;
      const lenS = layout.trueNorthLengthSouth ?? 18;
      const lenE = layout.trueNorthLengthEast ?? 45;
      const lenW = layout.trueNorthLengthWest ?? 12;
      const maskInterior = layout.trueNorthMaskParcel !== false;

      const topY = Math.max(drawAreaY + 12, oy - lenN);
      const bottomY = Math.min(drawAreaY + drawAreaH - 6, oy + lenS);
      const leftX = Math.max(drawAreaX + 6, ox - lenW);
      const rightX = Math.min(drawAreaX + drawAreaW - 6, ox + lenE);

      const tnColor = hexToRgb(layout.trueNorthColor || '#0f172a');
      const tnLineWidth = layout.trueNorthStrokeWidth ?? 0.25;
      const tnFontSize = layout.trueNorthFontSize ?? 7.0;

      const radius = 3.6;
      const circleCy = topY + 4;
      const needleTipY = topY - 5;
      const needleStartY = circleCy - radius;
      const stemStopY = circleCy + radius;

      // 1. Vertical Meridian Leg (North Stem)
      doc.setDrawColor(tnColor.r, tnColor.g, tnColor.b);
      doc.setLineWidth(tnLineWidth);
      doc.line(ox, oy, ox, stemStopY); // Northward stem stops cleanly at bottom edge of circle

      // Vertical Meridian Leg (South Stem with Interior Masking)
      if (maskInterior) {
        const parcelMaxY = Math.max(...targetPoints.map(p => toMapY(p.northing)));
        const jumpStartY = Math.max(oy + 6, parcelMaxY + 6);
        const jumpEndY = Math.min(drawAreaY + drawAreaH - 4, Math.max(jumpStartY + 10, oy + lenS));
        if (jumpEndY > jumpStartY + 6 && (oy + lenS) > parcelMaxY + 8) {
          doc.line(ox, jumpStartY, ox, jumpEndY);
        }
      } else {
        doc.line(ox, oy, ox, bottomY);
      }

      // 2. True North Badge
      const symStyle = layout.trueNorthStyle || 'UN';
      const symLabel = symStyle === 'UN' ? 'U  N' : symStyle === 'TN' ? 'T  N' : 'N';

      // Solid pure white filled circle to prevent linework cutting through U N
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(tnColor.r, tnColor.g, tnColor.b);
      doc.setLineWidth(tnLineWidth + 0.1);
      doc.circle(ox, circleCy, radius, 'FD');

      // Needle extending from top edge of circle to tip
      doc.setLineWidth(tnLineWidth);
      doc.line(ox, needleStartY, ox, needleTipY);
      doc.setFillColor(tnColor.r, tnColor.g, tnColor.b);
      doc.triangle(ox, needleTipY, ox - 1.2, needleTipY + 3, ox + 1.2, needleTipY + 3, 'FD');

      // Centered label inside circle with precise vertical baseline compensation
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(tnColor.r, tnColor.g, tnColor.b);
      doc.text(symLabel, ox, circleCy + 0.8, { align: 'center' });

      // Vertical Easting Text along North stem (Deterministic Vector Projection)
      const eastingText = `${originPt.easting.toFixed(3)} m E`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(tnFontSize);
      doc.setTextColor(tnColor.r, tnColor.g, tnColor.b);
      const textWidth = doc.getTextWidth(eastingText);
      const midVertY = (oy + stemStopY) / 2;
      const textGap = (layout.trueNorthTextOffset ?? 0.8) + (tnLineWidth / 2);
      const startX = ox - textGap;
      const startY = midVertY + (textWidth / 2);
      doc.text(eastingText, startX, startY, { angle: 90 });

      // 3. Horizontal Parallel Leg (West & East with Interior Masking)
      doc.setDrawColor(tnColor.r, tnColor.g, tnColor.b);
      doc.setLineWidth(tnLineWidth);
      doc.line(leftX, oy, ox, oy); // Westward stem to beacon

      if (maskInterior) {
        // Jump past the easternmost boundary of the parcel
        const parcelMaxX = Math.max(...targetPoints.map(p => toMapX(p.easting)));
        const jumpStartX = Math.max(ox + 6, parcelMaxX + 8);
        const jumpEndX = Math.min(drawAreaX + drawAreaW - 6, Math.max(jumpStartX + 15, ox + lenE));
        if (jumpEndX > jumpStartX) {
          doc.line(jumpStartX, oy, jumpEndX, oy);
          const northingText = `${originPt.northing.toFixed(3)} m N`;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(tnFontSize);
          doc.setTextColor(tnColor.r, tnColor.g, tnColor.b);
          doc.text(northingText, (jumpStartX + jumpEndX) / 2, oy - 1.5, { align: 'center' });
        }
      } else {
        // Solid line straight through
        doc.line(ox, oy, rightX, oy);
        const northingText = `${originPt.northing.toFixed(3)} m N`;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(tnFontSize);
        doc.setTextColor(tnColor.r, tnColor.g, tnColor.b);
        doc.text(northingText, (ox + rightX) / 2, oy - 1.5, { align: 'center' });
      }
    }
  }

  // 10. Floating Corner North Arrow (if selected)
  if (showCornerNorthArrow) {
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
  }

  // 10. Metric Bar Scale (Dynamically Scaled for Generous Spacing)
  let sbX = drawAreaX + 6;
  let sbY = drawAreaY + drawAreaH - 8;
  if (layout.scaleBarPosition === 'bottom_right') {
    sbX = drawAreaX + drawAreaW - 45;
  } else if (layout.scaleBarPosition === 'top_left') {
    sbX = drawAreaX + 6;
    sbY = drawAreaY + 14;
  } else if (layout.scaleBarPosition === 'bottom_center' || isFctRofO) {
    sbX = pageWidth / 2 - 25;
    sbY = drawAreaY + drawAreaH - 4;
  }

  if (isFctRofO) {
    // Centered FCT Scale Text: SCALE :- 1: 1000
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`SCALE :- 1: ${effectiveScale}`, pageWidth / 2, sbY, { align: 'center' });
  } else {
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
  }

  // 11. Coordinate Schedule Table & Surveyor Seal Box Layout Arrangement
  const footerY = outerY + outerH - bottomPanelHeight;

  if (isFctRofO || layout.footerStyle === 'fct_staff_grid') {
    // ----------------------------------------------------
    // FCT Abuja Origin Note & Staff Sign-Off Grid
    // ----------------------------------------------------
    const fct = layout.fctConfig || {};
    const fctLeftX = outerX + 6;
    const fctLeftY = footerY + 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);
    doc.text('NOTE:', fctLeftX, fctLeftY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    const originPt = targetPoints[0] || points[0] || { id: 'PB 6371', easting: 293637.434, northing: 994737.304 };
    doc.text(`FULL BEACON NUMBER = ${fct.fullBeaconNumber || 'FCT ' + originPt.id}`, fctLeftX, fctLeftY + 3.8);
    doc.text(`COORDINATE OF ${originPt.id}`, fctLeftX, fctLeftY + 7.2);
    doc.text(`N = ${originPt.northing.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`, fctLeftX, fctLeftY + 10.6);
    doc.text(`E = ${originPt.easting.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`, fctLeftX, fctLeftY + 14.0);
    doc.text(fct.coordinateSystemText || 'COORDINATE SYSTEM UTM 32N', fctLeftX, fctLeftY + 17.4);

    doc.setFont('helvetica', 'bold');
    doc.text(`SURVEYED BY: ${(project.surveyFirm || 'C. S. AGHA & ASSOCIATES').toUpperCase()}`, fctLeftX, fctLeftY + 21.2);

    doc.setFont('helvetica', 'normal');
    doc.text(`DRAWN BY: ${fct.drawnBy || '___________________'}`, fctLeftX, fctLeftY + 24.6);
    doc.text(`CHECKED BY: ${fct.checkedBy || '_________________'}`, fctLeftX, fctLeftY + 28.0);
    doc.text(`PASSED BY: ${fct.passedBy || '__________________'}`, fctLeftX, fctLeftY + 31.4);
    doc.text(`DATE: ${fct.dateSurveyed || project.date || '27TH OF JUNE, 2002'}`, fctLeftX, fctLeftY + 34.8);

    // FCT Right Side: Multi-Row Short Leg / Omitted Bearing & Distance Schedule Table
    const fctRightX = outerX + outerW - 82;
    const fctRightY = footerY + 1.5;
    const scheduledLegs = getScheduledBoundaryLegs(targetParcels, points, layout);

    if (scheduledLegs.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(15, 23, 42);
      doc.text('BEACON No.       DISTANCE      BEARING', fctRightX, fctRightY);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.3);
      doc.setTextColor(30, 41, 59);

      let rowY = fctRightY + 3.8;
      const maxRows = 5;
      scheduledLegs.slice(0, maxRows).forEach(sLeg => {
        doc.text(
          `FROM ${sLeg.fromPointId} TO ${sLeg.toPointId} = ${sLeg.distance.toFixed(2)}m  AT  ${sLeg.bearingFormatted}`,
          fctRightX,
          rowY
        );
        rowY += 3.2;
      });
    }

    // Cadastral Map Box
    const mapBoxY = fctRightY + 19;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(fct.cadastralMapScaleText || `CADASTRAL MAP 1: ${effectiveScale}`, fctRightX + 35, mapBoxY, { align: 'center' });

    doc.setLineWidth(0.4);
    doc.setDrawColor(15, 23, 42);
    doc.rect(fctRightX, mapBoxY + 3, 70, 7);
    doc.setFontSize(7.0);
    doc.text((fct.layoutName || project.title || 'CKC EXT.   LAYOUT').toUpperCase(), fctRightX + 35, mapBoxY + 7.5, { align: 'center' });

  } else if (layout.footerStyle === 'surcon_3box' || isShewingProperty) {
    // ----------------------------------------------------
    // SURCON 3-Box Standard Partitioned Footer Block
    // ----------------------------------------------------
    const boxH = 22;
    const boxY = footerY + 2;
    const col1W = outerW * 0.28;
    const col2W = outerW * 0.42;
    const col3W = outerW - col1W - col2W;

    doc.setLineWidth(0.4);
    doc.setDrawColor(15, 23, 42);

    // Outer bounding box
    doc.rect(outerX, boxY, outerW, boxH);
    // Vertical dividers
    doc.line(outerX + col1W, boxY, outerX + col1W, boxY + boxH);
    doc.line(outerX + col1W + col2W, boxY, outerX + col1W + col2W, boxY + boxH);

    // Clean Surveyor Name without duplicate prefixes
    const rawSurv = (options.surveyorName || project.surveyorName || 'SURVEYOR').toUpperCase();
    const titlePrefix = (options.surveyorTitle || '').trim().toUpperCase();
    const survName = titlePrefix && !rawSurv.startsWith(titlePrefix) ? `${titlePrefix} ${rawSurv}` : rawSurv;

    // Cell 1: PLAN NO.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.0);
    doc.setTextColor(15, 23, 42);
    doc.text('PLAN', outerX + 6, boxY + 6);
    doc.text('NO', outerX + 26, boxY + 6);

    doc.setFontSize(8.5);
    const planNoFormatted = layout.customPlanNoText || project.code || 'OY / 0327 / 2017 / 004';
    doc.text(planNoFormatted, outerX + 4, boxY + 17);

    // Cell 2: Surveyor Firm Contact
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(survName, outerX + col1W + 4, boxY + 5.5, { maxWidth: col2W - 8 });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.0);
    doc.setTextColor(51, 65, 85);
    const firmAddr = (layout.surveyorFirmAddress || project.surveyFirm || 'OFFICE ADDRESS / CONTACT').toUpperCase();
    const firmPhone = layout.surveyorPhone || 'TEL: 0800-SURVEYOR';
    doc.text(firmAddr, outerX + col1W + 4, boxY + 10.5, { maxWidth: col2W - 8 });
    doc.text(firmPhone, outerX + col1W + 4, boxY + 18.0);

    // Cell 3: Registered Surveyor Seal & Signature Block
    const c3X = outerX + col1W + col2W;
    const sealStampUrl = options.surveyorSealUrl || options.firmSealUrl;

    if (options.surveyorSignatureUrl) {
      try {
        doc.addImage(options.surveyorSignatureUrl, 'PNG', c3X + col3W / 2 - 12, boxY + 1.5, 24, 6);
      } catch (e) {
        console.warn('Failed to embed signature image', e);
      }
    } else if (sealStampUrl && options.showSealBox) {
      try {
        doc.addImage(sealStampUrl, 'PNG', c3X + col3W / 2 - 7, boxY + 1.2, 14, 6.5);
      } catch (e) {}
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.0);
    doc.setTextColor(15, 23, 42);
    doc.text(survName, c3X + col3W / 2, boxY + 11.0, { align: 'center', maxWidth: col3W - 6 });

    doc.setFontSize(6.0);
    doc.text('SURVEYOR', c3X + col3W / 2, boxY + 14.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.text(project.date || new Date().toISOString().split('T')[0], c3X + col3W / 2, boxY + 18.0, { align: 'center' });

  } else {
    // ----------------------------------------------------
    // Default Coordinate Schedule & Seal Box Layout
    // ----------------------------------------------------
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
  }

  return doc;
}

/**
 * Generates an official Standalone A4 Beacon Coordinate Schedule & Boundary Traverse Report PDF
 * with Plot-by-Plot boundary grouping and automatic multi-page pagination.
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
  const tableX = margin + 4;
  const tableW = pageW - 2 * margin - 8;
  const maxContentY = pageH - margin - 12;

  let currentY = margin + 8;
  let pageNum = 1;

  // Draw Page Neatlines and Running Header
  const drawPageNeatlinesAndHeader = (isContinuation: boolean = false) => {
    // Outer Border Box
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.7);
    doc.rect(margin, margin, pageW - 2 * margin, pageH - 2 * margin);

    // Inner Subtle Neatline
    doc.setLineWidth(0.2);
    doc.rect(margin + 1.5, margin + 1.5, pageW - 2 * margin - 3, pageH - 2 * margin - 3);

    let hY = margin + 7;

    if (!isContinuation) {
      // Primary Title Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(15, 23, 42);
      doc.text('BEACON COORDINATE & BOUNDARY SCHEDULE', pageW / 2, hY, { align: 'center' });

      hY += 4.5;
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text((activeOrg?.name || project.surveyFirm || 'CADASTRAL SURVEY SERVICES').toUpperCase(), pageW / 2, hY, { align: 'center' });

      hY += 3.8;
      doc.setFontSize(7.2);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`PROJECT: ${project.title.toUpperCase()} | LOCATION: ${project.location.toUpperCase()}`, pageW / 2, hY, { align: 'center' });

      hY += 3.5;
      doc.text(`DATUM: MINNA GRID (CLARKE 1880) | PLAN NO: ${project.code || 'PLAN-001'} | DATE: ${project.date || new Date().toISOString().split('T')[0]}`, pageW / 2, hY, { align: 'center' });

      hY += 3.5;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(tableX, hY, tableX + tableW, hY);

      currentY = hY + 5;
    } else {
      // Continuation Header on Subsequent Pages
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text('BEACON COORDINATE & BOUNDARY SCHEDULE (CONTINUATION)', pageW / 2, hY, { align: 'center' });

      hY += 3.8;
      doc.setFontSize(6.8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`PROJECT: ${project.title.toUpperCase()} • PLAN NO: ${project.code || 'PLAN-001'} • DATUM: MINNA GRID`, pageW / 2, hY, { align: 'center' });

      hY += 3.5;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(tableX, hY, tableX + tableW, hY);

      currentY = hY + 5;
    }
  };

  // Virtual Multi-Page Flow Manager
  const ensureSpace = (neededHeight: number, onPageBreak?: () => void) => {
    if (currentY + neededHeight > maxContentY) {
      doc.addPage();
      pageNum++;
      drawPageNeatlinesAndHeader(true);
      if (onPageBreak) onPageBreak();
    }
  };

  // 1. Initialize First Page
  drawPageNeatlinesAndHeader(false);

  // Table Column Specifications for Plot Boundary Traverse
  const plotCols = [
    { header: 'S/N', w: 10 },
    { header: 'BEACON ID', w: 30 },
    { header: 'EASTING (m)', w: 34 },
    { header: 'NORTHING (m)', w: 34 },
    { header: 'HEIGHT (m)', w: 18 },
    { header: 'BEARING TO NEXT', w: 28 },
    { header: 'DISTANCE (m)', w: 24 }
  ];

  const rowHeight = 4.6;

  // Helper to render Plot Table Header Row
  const renderPlotTableHeader = () => {
    doc.setFillColor(241, 245, 249);
    doc.rect(tableX, currentY, tableW, 5.2, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.rect(tableX, currentY, tableW, 5.2, 'S');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);

    let hX = tableX;
    for (const c of plotCols) {
      doc.text(c.header, hX + 2, currentY + 3.6);
      hX += c.w;
    }
    currentY += 5.2;
  };

  // Target Parcels & Points
  const targetParcels = parcels.length > 0 ? parcels : [];
  const assignedPointIds = new Set<string>();

  // ==========================================
  // SECTION 1: PLOT-BY-PLOT BOUNDARY TRAVERSES
  // ==========================================
  if (targetParcels.length > 0) {
    ensureSpace(12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('1. CADASTRAL BOUNDARY TRAVERSES & PLOT SCHEDULES', tableX, currentY);
    currentY += 4.5;

    targetParcels.forEach(parcel => {
      const comp = computeParcel(parcel, points);
      if (!comp || comp.vertices.length < 3) return;

      // Track assigned point IDs
      parcel.pointIds.forEach(id => assignedPointIds.add(id.toUpperCase()));

      // Ensure space for Plot Banner + Table Header + at least 2 rows (28mm)
      ensureSpace(26);

      // Plot Header Banner
      doc.setFillColor(248, 250, 252);
      doc.rect(tableX, currentY, tableW, 7, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.rect(tableX, currentY, tableW, 7, 'S');

      // Left Accent Bar (Cadastral Green)
      doc.setFillColor(16, 185, 129);
      doc.rect(tableX, currentY, 2.5, 7, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const plotTitle = `PLOT ${parcel.plotNumber} ${parcel.ownerName ? `• ALLOTTEE: ${parcel.ownerName.toUpperCase()}` : ''}`;
      doc.text(plotTitle, tableX + 5, currentY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      const metricsText = `Area: ${comp.areaSquareMeters.toFixed(2)} m² (${comp.areaHectares.toFixed(4)} Ha) | Perimeter: ${comp.perimeter.toFixed(2)} m`;
      doc.text(metricsText, tableX + tableW - 3, currentY + 4.5, { align: 'right' });

      currentY += 7.5;

      // Render Plot Table Header
      renderPlotTableHeader();

      // Render Boundary Vertices in Clockwise Sequential Order
      comp.vertices.forEach((v, vIdx) => {
        ensureSpace(rowHeight, renderPlotTableHeader);

        // Alternating background
        if (vIdx % 2 === 1) {
          doc.setFillColor(250, 250, 250);
          doc.rect(tableX, currentY, tableW, rowHeight, 'F');
        }
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.rect(tableX, currentY, tableW, rowHeight, 'S');

        const leg = comp.legs[vIdx];
        const pt = points.find(p => p.id.toUpperCase() === v.id.toUpperCase()) || v;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(15, 23, 42);

        let rX = tableX;

        // 1. S/N
        doc.text(String(vIdx + 1), rX + 2, currentY + 3.2);
        rX += plotCols[0].w;

        // 2. Beacon ID
        doc.setFont('helvetica', pt.isControl ? 'bold' : 'normal');
        doc.text(pt.id, rX + 2, currentY + 3.2);
        doc.setFont('helvetica', 'normal');
        rX += plotCols[1].w;

        // 3. Easting
        doc.text(pt.easting.toFixed(3), rX + 2, currentY + 3.2);
        rX += plotCols[2].w;

        // 4. Northing
        doc.text(pt.northing.toFixed(3), rX + 2, currentY + 3.2);
        rX += plotCols[3].w;

        // 5. Height / Elevation
        doc.text(pt.elevation !== undefined ? pt.elevation.toFixed(3) : '-', rX + 2, currentY + 3.2);
        rX += plotCols[4].w;

        // 6. Bearing to Next
        if (leg) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 41, 59);
          doc.text(leg.bearing.formatted, rX + 2, currentY + 3.2);
        } else {
          doc.text('-', rX + 2, currentY + 3.2);
        }
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        rX += plotCols[5].w;

        // 7. Distance
        if (leg) {
          doc.text(`${leg.distance.toFixed(2)}m`, rX + 2, currentY + 3.2);
        } else {
          doc.text('-', rX + 2, currentY + 3.2);
        }

        currentY += rowHeight;
      });

      currentY += 4;
    });
  }

  // ====================================================
  // SECTION 2: PRIMARY GEODETIC CONTROL & REFERENCE PILLARS
  // ====================================================
  const isSinglePlotSchedule = targetParcels.length === 1;
  const controlPoints = isSinglePlotSchedule
    ? points.filter(p => p.isControl)
    : points.filter(p => p.isControl || !assignedPointIds.has(p.id.toUpperCase()));

  const controlCols = [
    { header: 'S/N', w: 8 },
    { header: 'STATION / PILLAR ID', w: 32 },
    { header: 'EASTING (m)', w: 34 },
    { header: 'NORTHING (m)', w: 34 },
    { header: 'HEIGHT (m)', w: 18 },
    { header: 'MONUMENT TYPE & DESCRIPTION', w: 52 }
  ];

  const renderControlTableHeader = () => {
    doc.setFillColor(241, 245, 249);
    doc.rect(tableX, currentY, tableW, 5.2, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.rect(tableX, currentY, tableW, 5.2, 'S');

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);

    let hX = tableX;
    for (const c of controlCols) {
      doc.text(c.header, hX + 2, currentY + 3.6);
      hX += c.w;
    }
    currentY += 5.2;
  };

  if (controlPoints.length > 0) {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('2. PRIMARY GEODETIC CONTROL & REFERENCE STATIONS', tableX, currentY);
    currentY += 4.5;

    renderControlTableHeader();

    const sortedControl = [...controlPoints].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

    sortedControl.forEach((pt, index) => {
      ensureSpace(rowHeight, renderControlTableHeader);

      if (index % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(tableX, currentY, tableW, rowHeight, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(tableX, currentY, tableW, rowHeight, 'S');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);

      let rX = tableX;
      doc.text(String(index + 1), rX + 2, currentY + 3.2);
      rX += controlCols[0].w;

      doc.setFont('helvetica', 'bold');
      doc.text(pt.id, rX + 2, currentY + 3.2);
      doc.setFont('helvetica', 'normal');
      rX += controlCols[1].w;

      doc.text(pt.easting.toFixed(3), rX + 2, currentY + 3.2);
      rX += controlCols[2].w;

      doc.text(pt.northing.toFixed(3), rX + 2, currentY + 3.2);
      rX += controlCols[3].w;

      doc.text(pt.elevation !== undefined ? pt.elevation.toFixed(3) : '-', rX + 2, currentY + 3.2);
      rX += controlCols[4].w;

      doc.text(pt.isControl ? 'PRIMARY CONTROL PILLAR' : 'BOUNDARY REFERENCE BEACON', rX + 2, currentY + 3.2);

      currentY += rowHeight;
    });

    currentY += 6;
  }

  // ====================================================
  // SECTION 3: SURVEYOR'S STATUTORY CERTIFICATION BLOCK
  // ====================================================
  const sealBlockH = 38;
  const sealBlockW = tableW;

  // Ensure adequate clearance for certification block on final page
  ensureSpace(sealBlockH + 6);

  const sealBlockY = currentY;

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
  const certText = `I hereby certify that the coordinates and boundary measurements stated in this schedule have been computed and checked in accordance with the Survey Regulations of the Federal Republic of Nigeria and the Surveyors Council of Nigeria (SURCON).`;
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

  // ====================================================
  // TWO-PASS RUNNING FOOTER WITH TOTAL PAGE NUMBERING
  // ====================================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(6.2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('BEACON COORDINATE & BOUNDARY SCHEDULE • PRODUCED BY SURVE CADASTRAL INFRASTRUCTURE', tableX, pageH - margin + 3.5);
    doc.text(`Page ${p} of ${totalPages}`, tableX + tableW, pageH - margin + 3.5, { align: 'right' });
  }

  return doc;
}

