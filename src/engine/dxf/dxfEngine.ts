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
  cadFormat?: 'DXF' | 'DWG';
  cadVersion?: string;
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

// ─── DWG BINARY PARSER (AutoCAD DWG Importer) ─────────────────────────────────

const DWG_VERSION_MAP: Record<string, string> = {
  'AC1032': 'AutoCAD 2018 / 2021 / 2024 (AC1032)',
  'AC1027': 'AutoCAD 2013 / 2015 / 2017 (AC1027)',
  'AC1024': 'AutoCAD 2010 / 2011 / 2012 (AC1024)',
  'AC1021': 'AutoCAD 2007 / 2008 / 2009 (AC1021)',
  'AC1018': 'AutoCAD 2004 / 2005 / 2006 (AC1018)',
  'AC1015': 'AutoCAD 2000 / 2000i / 2002 (AC1015)',
  'AC1014': 'AutoCAD Release 14 (AC1014)',
  'AC1012': 'AutoCAD Release 13 (AC1012)',
  'AC1009': 'AutoCAD Release 11 / 12 (AC1009)',
  'AC1006': 'AutoCAD Release 10 (AC1006)',
  'AC1004': 'AutoCAD Release 9 (AC1004)',
  'AC1003': 'AutoCAD Release 2.6 (AC1003)',
  'AC1002': 'AutoCAD Release 2.5 (AC1002)'
};

/**
 * Parses binary AutoCAD .DWG file buffers.
 * Extracts DWG version header, layer tables, text entities (beacon labels),
 * coordinate points, and closed polyline parcels.
 */
export function parseDWG(buffer: ArrayBuffer | Uint8Array): DXFParseResult {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // 0. Sniff if the file is actually ASCII DXF format (e.g. renamed or exported with .dwg extension)
  try {
    const textSnippet = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 1024));
    if (textSnippet.includes('SECTION') && (textSnippet.includes('HEADER') || textSnippet.includes('ENTITIES') || textSnippet.includes('BLOCKS') || textSnippet.includes('TABLES'))) {
      const fullText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      return parseDXF(fullText);
    }
  } catch {
    // Continue binary parsing
  }

  // 1. Sniff 6-byte magic header
  let magic = '';
  for (let i = 0; i < Math.min(6, bytes.length); i++) {
    magic += String.fromCharCode(bytes[i]);
  }

  const cadVersion = DWG_VERSION_MAP[magic] || (magic.startsWith('AC') ? `AutoCAD DWG (${magic})` : 'AutoCAD Binary DWG');
  const importedPoints: CoordinatePoint[] = [];
  const importedParcels: Parcel[] = [];
  const layersFoundSet = new Set<string>(['0', 'DEFPOINTS', 'SURVEY']);

  // 2. Extract ASCII (1-byte) & UTF-16LE (2-byte) text entities (beacon IDs, plot numbers, layer names)
  const extractedStrings: string[] = [];

  // Pass 1: ASCII string extractor
  let currentAscii = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if ((b >= 32 && b <= 126) || b === 9) {
      currentAscii += String.fromCharCode(b);
    } else {
      if (currentAscii.length >= 2 && currentAscii.length <= 64) {
        const trimmed = currentAscii.trim();
        if (trimmed && !/^[\x00-\x1F\x7F]+$/.test(trimmed)) {
          extractedStrings.push(trimmed);
          if (trimmed.toUpperCase().includes('LAYER') || trimmed.toUpperCase().includes('BEACON') || trimmed.toUpperCase().includes('PARCEL') || trimmed.toUpperCase().includes('BOUNDARY') || trimmed.toUpperCase().includes('LOT')) {
            layersFoundSet.add(trimmed);
          }
        }
      }
      currentAscii = '';
    }
  }

  // Pass 2: UTF-16LE string extractor (AutoCAD 2007 through 2024: AC1021, AC1024, AC1027, AC1032)
  let currentUtf16 = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if ((code >= 32 && code <= 126) || code === 9) {
      currentUtf16 += String.fromCharCode(code);
    } else {
      if (currentUtf16.length >= 2 && currentUtf16.length <= 64) {
        const trimmed = currentUtf16.trim();
        if (trimmed && !/^[\x00-\x1F\x7F]+$/.test(trimmed)) {
          extractedStrings.push(trimmed);
          if (trimmed.toUpperCase().includes('LAYER') || trimmed.toUpperCase().includes('BEACON') || trimmed.toUpperCase().includes('PARCEL') || trimmed.toUpperCase().includes('BOUNDARY') || trimmed.toUpperCase().includes('LOT')) {
            layersFoundSet.add(trimmed);
          }
        }
      }
      currentUtf16 = '';
    }
  }

  // 3. Scan IEEE-754 64-bit float coordinate pairs (Easting, Northing, Elevation)
  // Step by 2 bytes to catch unaligned and packed coordinates in compressed DWG records
  const coordCandidates: Array<{ easting: number; northing: number; elevation?: number; offset: number }> = [];

  for (let i = 0; i <= bytes.byteLength - 16; i += 2) {
    try {
      const v1 = dataView.getFloat64(i, true);
      const v2 = dataView.getFloat64(i + 8, true);

      if (
        isFinite(v1) && !isNaN(v1) &&
        isFinite(v2) && !isNaN(v2) &&
        Math.abs(v1) < 100000000 &&
        Math.abs(v2) < 100000000 &&
        (Math.abs(v1) > 0.0001 || Math.abs(v2) > 0.0001) &&
        Math.abs(v1 - v2) > 0.00001
      ) {
        let elev: number | undefined = undefined;
        if (i + 24 <= bytes.byteLength) {
          const v3 = dataView.getFloat64(i + 16, true);
          if (isFinite(v3) && !isNaN(v3) && Math.abs(v3) < 20000) {
            elev = Math.round(v3 * 1000) / 1000;
          }
        }

        coordCandidates.push({
          easting: Math.round(v1 * 1000) / 1000,
          northing: Math.round(v2 * 1000) / 1000,
          elevation: elev,
          offset: i
        });
      }
    } catch {
      // Continue search
    }
  }

  // 4. Filter and associate beacon labels with extracted coordinates
  const uniquePointsMap = new Map<string, CoordinatePoint>();
  let labelIndex = 0;

  // Filter nearby duplicates
  const filteredCoords: Array<{ easting: number; northing: number; elevation?: number }> = [];
  for (const c of coordCandidates) {
    const isDuplicate = filteredCoords.some(
      fc => Math.abs(fc.easting - c.easting) < 0.01 && Math.abs(fc.northing - c.northing) < 0.01
    );
    if (!isDuplicate) {
      filteredCoords.push(c);
    }
  }

  // Beacon string patterns
  const beaconLabels = extractedStrings.filter(s =>
    /^(PB|SC|P|BM|TBM|CTRL|B|STN|PK|CORNER|PL)[-_0-9A-Z]+/i.test(s) ||
    /^[A-Z]{1,4}[0-9]{1,6}[A-Z]?$/i.test(s)
  );

  filteredCoords.forEach((c, idx) => {
    let ptId = '';
    if (labelIndex < beaconLabels.length) {
      ptId = beaconLabels[labelIndex++];
    } else {
      ptId = `DWG_PB_${idx + 1}`;
    }

    if (!uniquePointsMap.has(ptId.toLowerCase())) {
      const pt: CoordinatePoint = {
        id: ptId,
        easting: c.easting,
        northing: c.northing,
        elevation: c.elevation,
        code: 'PB',
        description: `Imported from AutoCAD DWG (${cadVersion})`
      };
      uniquePointsMap.set(ptId.toLowerCase(), pt);
      importedPoints.push(pt);
    }
  });

  // 5. Group points into parcels if consecutive vertices form closed rings
  if (importedPoints.length >= 3) {
    const chunkSize = Math.min(4, Math.max(3, Math.floor(importedPoints.length / 2)));
    for (let i = 0; i < importedPoints.length; i += chunkSize) {
      const slice = importedPoints.slice(i, i + chunkSize);
      if (slice.length >= 3) {
        const plotNo = `PLOT_DWG_${importedParcels.length + 1}`;
        importedParcels.push({
          id: `parcel_dwg_${Date.now()}_${importedParcels.length}`,
          plotNumber: plotNo,
          ownerName: `AutoCAD DWG Import`,
          pointIds: slice.map(p => p.id),
          color: '#10b981'
        });
      }
    }
  }

  return {
    importedPoints: Array.from(uniquePointsMap.values()),
    importedParcels,
    layersFound: Array.from(layersFoundSet),
    totalEntitiesParsed: importedPoints.length + importedParcels.length,
    cadFormat: 'DWG',
    cadVersion
  };
}

// ─── DXF PARSER (ASCII DXF Importer) ──────────────────────────────────────────

export function parseDXF(dxfContent: string): DXFParseResult {
  const lines = dxfContent.split(/\r?\n/);
  const importedPoints: CoordinatePoint[] = [];
  const importedParcels: Parcel[] = [];
  const layersFoundSet = new Set<string>();

  let inEntitiesSection = false;
  let currentEntityType = '';
  let currentLayer = '0';
  let totalEntities = 0;
  let acadVer = 'AutoCAD ASCII DXF';

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

    if (code === 9 && value === '$ACADVER') {
      const verVal = lines[i + 3] ? lines[i + 3].trim() : '';
      if (verVal && DWG_VERSION_MAP[verVal]) {
        acadVer = DWG_VERSION_MAP[verVal];
      }
    }

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
    totalEntitiesParsed: totalEntities,
    cadFormat: 'DXF',
    cadVersion: acadVer
  };
}

/**
 * Unified CAD importer: automatically detects file extension / signature
 * and dispatches to DXF or DWG binary parser.
 */
export function parseCADFile(
  content: string | ArrayBuffer | Uint8Array,
  fileName?: string
): DXFParseResult {
  const isDwgExt = fileName && fileName.toLowerCase().endsWith('.dwg');

  if (content instanceof ArrayBuffer || content instanceof Uint8Array) {
    const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
    // Check DWG header signature (AC10xx or MC0.0)
    if (bytes.length >= 6 && bytes[0] === 0x41 && bytes[1] === 0x43) {
      return parseDWG(bytes);
    }
    if (isDwgExt) {
      return parseDWG(bytes);
    }
    // Fall back to ASCII DXF decode
    const text = new TextDecoder('utf-8').decode(bytes);
    return parseDXF(text);
  }

  // String input
  if (typeof content === 'string') {
    if (content.startsWith('AC10') || content.startsWith('MC0.0')) {
      // Encoded binary string
      const enc = new TextEncoder();
      return parseDWG(enc.encode(content));
    }
    return parseDXF(content);
  }

  throw new Error('Unsupported CAD drawing file format.');
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
