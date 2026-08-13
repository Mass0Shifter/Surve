/**
 * AutoCAD DXF Engine (Import & Export)
 * Parser & Generator for ASCII DXF files (AutoCAD R12 / 2000 standard).
 * Supports POINT, LINE, LWPOLYLINE, POLYLINE, TEXT, and MTEXT entities.
 */

import { CoordinatePoint, Parcel, SetoutOverlay, AlignmentOverlay } from '../types';
import { ContourSegment } from '../dtm/dtmEngine';

export interface DXFParseResult {
  importedPoints: CoordinatePoint[];
  importedParcels: Parcel[];
  layersFound: string[];
  totalEntitiesParsed: number;
}

export interface DXFExportParams {
  projectTitle?: string;
  points?: CoordinatePoint[];
  parcels?: Parcel[];
  contours?: ContourSegment[];
  alignmentOverlay?: AlignmentOverlay | null;
  setoutOverlay?: SetoutOverlay | null;
  exportBeacons?: boolean;
  exportParcels?: boolean;
  exportContours?: boolean;
  exportAlignments?: boolean;
  exportSetout?: boolean;
}

// ─── DXF PARSER (Importer) ───────────────────────────────────────────────────

export function parseDXF(dxfContent: string): DXFParseResult {
  const lines = dxfContent.split(/\r?\n/);
  const importedPoints: CoordinatePoint[] = [];
  const importedParcels: Parcel[] = [];
  const layersFoundSet = new Set<string>();

  let inEntitiesSection = false;
  let currentEntityType = '';
  let currentLayer = '0';
  let totalEntities = 0;

  // Temporary entity buffers
  let ptX = 0, ptY = 0, ptZ: number | undefined = undefined, ptText = '';
  let polyVertices: Array<{ x: number; y: number; z?: number }> = [];
  let isPolyClosed = false;

  const flushEntity = () => {
    if (!currentEntityType) return;
    totalEntities++;
    if (currentLayer) layersFoundSet.add(currentLayer);

    if (currentEntityType === 'POINT') {
      const autoId = ptText || `DXF_PT_${importedPoints.length + 1}`;
      importedPoints.push({
        id: autoId,
        easting: Math.round(ptX * 1000) / 1000,
        northing: Math.round(ptY * 1000) / 1000,
        elevation: typeof ptZ === 'number' ? Math.round(ptZ * 1000) / 1000 : undefined,
        code: 'DXF',
        description: `Imported from layer "${currentLayer}"`
      });
    } else if (currentEntityType === 'TEXT' || currentEntityType === 'MTEXT') {
      if (ptText && ptText.trim() && !ptText.includes(' ') && ptText.length <= 16) {
        // Text that looks like a beacon ID
        importedPoints.push({
          id: ptText.trim(),
          easting: Math.round(ptX * 1000) / 1000,
          northing: Math.round(ptY * 1000) / 1000,
          elevation: typeof ptZ === 'number' ? Math.round(ptZ * 1000) / 1000 : undefined,
          code: 'DXF_TXT',
          description: `Text entity from layer "${currentLayer}"`
        });
      }
    } else if (currentEntityType === 'LWPOLYLINE' || currentEntityType === 'POLYLINE') {
      if (polyVertices.length >= 3 && isPolyClosed) {
        const plotNo = `PLOT_DXF_${importedParcels.length + 1}`;
        const ptIds: string[] = [];

        // Convert vertices to survey points
        polyVertices.forEach((v, idx) => {
          const ptId = `${plotNo}_PB${idx + 1}`;
          importedPoints.push({
            id: ptId,
            easting: Math.round(v.x * 1000) / 1000,
            northing: Math.round(v.y * 1000) / 1000,
            elevation: typeof v.z === 'number' ? Math.round(v.z * 1000) / 1000 : undefined,
            code: 'PB'
          });
          ptIds.push(ptId);
        });

        importedParcels.push({
          id: `parcel_dxf_${Date.now()}_${importedParcels.length}`,
          plotNumber: plotNo,
          ownerName: `DXF Layer: ${currentLayer}`,
          pointIds: ptIds,
          color: '#10b981'
        });
      }
    }

    // Reset temporary variables
    currentEntityType = '';
    ptX = 0; ptY = 0; ptZ = undefined; ptText = '';
    polyVertices = [];
    isPolyClosed = false;
  };

  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1] ? lines[i + 1].trim() : '';

    if (code === 0) {
      if (value === 'SECTION') {
        // Checking section type next line
        const nextCode = lines[i + 2] ? parseInt(lines[i + 2].trim(), 10) : -1;
        const nextVal = lines[i + 3] ? lines[i + 3].trim() : '';
        if (nextCode === 2 && nextVal === 'ENTITIES') {
          inEntitiesSection = true;
        }
      } else if (value === 'ENDSEC') {
        if (inEntitiesSection) {
          flushEntity();
          inEntitiesSection = false;
        }
      } else if (inEntitiesSection) {
        flushEntity();
        currentEntityType = value;
      }
    } else if (inEntitiesSection) {
      if (code === 8) {
        currentLayer = value;
      } else if (code === 10) {
        ptX = parseFloat(value) || 0;
        if (currentEntityType === 'LWPOLYLINE' || currentEntityType === 'POLYLINE') {
          polyVertices.push({ x: ptX, y: 0 });
        }
      } else if (code === 20) {
        ptY = parseFloat(value) || 0;
        if ((currentEntityType === 'LWPOLYLINE' || currentEntityType === 'POLYLINE') && polyVertices.length > 0) {
          polyVertices[polyVertices.length - 1].y = ptY;
        }
      } else if (code === 30) {
        ptZ = parseFloat(value);
        if ((currentEntityType === 'LWPOLYLINE' || currentEntityType === 'POLYLINE') && polyVertices.length > 0) {
          polyVertices[polyVertices.length - 1].z = ptZ;
        }
      } else if (code === 1) {
        ptText = value;
      } else if (code === 70 && (currentEntityType === 'LWPOLYLINE' || currentEntityType === 'POLYLINE')) {
        const flag = parseInt(value, 10) || 0;
        if ((flag & 1) !== 0) isPolyClosed = true;
      }
    }
  }

  flushEntity();

  // Deduplicate imported points by ID
  const uniquePointsMap = new Map<string, CoordinatePoint>();
  importedPoints.forEach(p => {
    if (!uniquePointsMap.has(p.id.toLowerCase())) {
      uniquePointsMap.set(p.id.toLowerCase(), p);
    }
  });

  return {
    importedPoints: Array.from(uniquePointsMap.values()),
    importedParcels,
    layersFound: Array.from(layersFoundSet),
    totalEntitiesParsed: totalEntities
  };
}

// ─── DXF GENERATOR (Exporter) ────────────────────────────────────────────────

export function generateDXF(params: DXFExportParams): string {
  const {
    projectTitle = 'NSURVEY_EXPORT',
    points = [],
    parcels = [],
    contours = [],
    alignmentOverlay,
    setoutOverlay,
    exportBeacons = true,
    exportParcels = true,
    exportContours = true,
    exportAlignments = true,
    exportSetout = true
  } = params;

  let dxf = '';

  // 1. HEADER SECTION
  dxf += `999\nProject: ${projectTitle}\n`;
  dxf += `0\nSECTION\n2\nHEADER\n`;
  dxf += `9\n$ACADVER\n1\nAC1014\n`; // AutoCAD 2000
  dxf += `0\nENDSEC\n`;

  // 2. TABLES SECTION (Layer definitions)
  dxf += `0\nSECTION\n2\nTABLES\n`;
  dxf += `0\nTABLE\n2\nLAYER\n70\n5\n`;

  // Layer table entries
  const layers = [
    { name: 'BEACONS', color: 1 },    // Red
    { name: 'PARCELS', color: 3 },    // Green
    { name: 'CONTOURS', color: 4 },   // Cyan
    { name: 'ALIGNMENTS', color: 6 }, // Magenta
    { name: 'SETOUT_RAYS', color: 30 } // Amber / Orange
  ];

  for (const l of layers) {
    dxf += `0\nLAYER\n2\n${l.name}\n70\n0\n62\n${l.color}\n6\nCONTINUOUS\n`;
  }
  dxf += `0\nENDTAB\n0\nENDSEC\n`;

  // 3. ENTITIES SECTION
  dxf += `0\nSECTION\n2\nENTITIES\n`;

  // A. Export Beacons (POINT & TEXT)
  if (exportBeacons && points.length > 0) {
    for (const p of points) {
      // POINT entity
      dxf += `0\nPOINT\n8\nBEACONS\n10\n${p.easting.toFixed(3)}\n20\n${p.northing.toFixed(3)}\n30\n${(p.elevation || 0).toFixed(3)}\n`;
      // TEXT label entity
      dxf += `0\nTEXT\n8\nBEACONS\n10\n${(p.easting + 1.5).toFixed(3)}\n20\n${(p.northing + 1.5).toFixed(3)}\n30\n${(p.elevation || 0).toFixed(3)}\n40\n2.5\n1\n${p.id}\n`;
    }
  }

  // B. Export Parcels (LWPOLYLINE)
  if (exportParcels && parcels.length > 0) {
    const pointMap = new Map(points.map(p => [p.id, p]));

    for (const parcel of parcels) {
      const vertices = parcel.pointIds.map(pid => pointMap.get(pid)).filter((p): p is CoordinatePoint => p !== undefined);
      if (vertices.length < 3) continue;

      dxf += `0\nLWPOLYLINE\n8\nPARCELS\n90\n${vertices.length}\n70\n1\n`; // 70\n1 = Closed Polyline
      for (const v of vertices) {
        dxf += `10\n${v.easting.toFixed(3)}\n20\n${v.northing.toFixed(3)}\n`;
      }

      // Plot number label text at centroid
      const cX = vertices.reduce((s, v) => s + v.easting, 0) / vertices.length;
      const cY = vertices.reduce((s, v) => s + v.northing, 0) / vertices.length;
      dxf += `0\nTEXT\n8\nPARCELS\n10\n${cX.toFixed(3)}\n20\n${cY.toFixed(3)}\n30\n0.0\n40\n3.5\n1\n${parcel.plotNumber}\n`;
    }
  }

  // C. Export DTM Contours (LINE)
  if (exportContours && contours.length > 0) {
    for (const c of contours) {
      dxf += `0\nLINE\n8\nCONTOURS\n10\n${c.x1.toFixed(3)}\n20\n${c.y1.toFixed(3)}\n30\n${c.elevation.toFixed(3)}\n11\n${c.x2.toFixed(3)}\n21\n${c.y2.toFixed(3)}\n31\n${c.elevation.toFixed(3)}\n`;
    }
  }

  // D. Export Alignments (LINE & TEXT)
  if (exportAlignments && alignmentOverlay) {
    for (const tan of alignmentOverlay.tangentSegments) {
      dxf += `0\nLINE\n8\nALIGNMENTS\n10\n${tan.x1.toFixed(3)}\n20\n${tan.y1.toFixed(3)}\n30\n0.0\n11\n${tan.x2.toFixed(3)}\n21\n${tan.y2.toFixed(3)}\n31\n0.0\n`;
    }
    for (const cp of alignmentOverlay.chainagePoints) {
      dxf += `0\nTEXT\n8\nALIGNMENTS\n10\n${cp.easting.toFixed(3)}\n20\n${cp.northing.toFixed(3)}\n30\n0.0\n40\n2.0\n1\n${cp.label || cp.chainageStr}\n`;
    }
  }

  // E. Export Setout Rays (LINE)
  if (exportSetout && setoutOverlay) {
    const { stationEasting: stnE, stationNorthing: stnN } = setoutOverlay;
    for (const tgt of setoutOverlay.targets) {
      dxf += `0\nLINE\n8\nSETOUT_RAYS\n10\n${stnE.toFixed(3)}\n20\n${stnN.toFixed(3)}\n30\n0.0\n11\n${tgt.easting.toFixed(3)}\n21\n${tgt.northing.toFixed(3)}\n31\n0.0\n`;
    }
  }

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
}
