import { CoordinatePoint, Parcel } from '../types';
import { detectDelimiter, splitLine } from './csvImporterEngine';
import { computeParcel } from '../cogo';

export interface ParsedParcelItem {
  plotNumber: string;
  blockNumber?: string;
  ownerName?: string;
  beaconIds: string[];
  isValid: boolean;
  computedAreaSqMeters?: number;
  missingBeaconIds: string[];
  statusMessage: string;
}

export interface ParcelCsvParseResult {
  detectedFormat: 'manifest' | 'traverse_schedule' | 'all_in_one' | 'unknown';
  detectedDelimiter: string;
  totalParcelsFound: number;
  validParcelsCount: number;
  invalidParcelsCount: number;
  parcels: ParsedParcelItem[];
  embeddedPoints: CoordinatePoint[];
  errors: string[];
  warnings: string[];
}

/**
 * Extracts beacon IDs from a string cell (supporting comma, hyphen, space, semicolon delimiters).
 */
export function extractBeaconIds(rawCell: string): string[] {
  if (!rawCell || !rawCell.trim()) return [];

  // Replace common arrow symbols or dashes between points
  const normalized = rawCell
    .replace(/->|→|—|–/g, ' ')
    .replace(/[;,\t|]/g, ' ')
    .trim();

  const tokens = normalized.split(/\s+/).filter(t => t.trim().length > 0);
  return tokens;
}

/**
 * Parses raw CSV text and automatically identifies the parcel structure:
 * 1. Manifest Format (Plot Number, Block, Owner, Beacon IDs)
 * 2. Traverse Schedule (Plot Number, Block, Owner, From Beacon, To Beacon...)
 * 3. All-in-One Point Format (Plot Number, Block, Owner, Beacon ID, Easting, Northing, Elevation)
 */
export function parseParcelCSV(
  rawText: string,
  existingPoints: CoordinatePoint[]
): ParcelCsvParseResult {
  // Strip UTF-8 BOM
  const cleanedText = rawText.replace(/^\uFEFF/, '').trim();
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!cleanedText) {
    return {
      detectedFormat: 'unknown',
      detectedDelimiter: ',',
      totalParcelsFound: 0,
      validParcelsCount: 0,
      invalidParcelsCount: 0,
      parcels: [],
      embeddedPoints: [],
      errors: ['File is empty.'],
      warnings: []
    };
  }

  const delimiter = detectDelimiter(cleanedText);
  const rawLines = cleanedText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  if (rawLines.length === 0) {
    return {
      detectedFormat: 'unknown',
      detectedDelimiter: delimiter,
      totalParcelsFound: 0,
      validParcelsCount: 0,
      invalidParcelsCount: 0,
      parcels: [],
      embeddedPoints: [],
      errors: ['No data rows found.'],
      warnings: []
    };
  }

  const rows = rawLines.map(l => splitLine(l, delimiter));
  const headerRow = rows[0].map(h => h.toLowerCase().trim());

  // Detect Schema Type from Headers
  const hasPlot = headerRow.some(h => /^(plot|plot\s*no|plot\s*number|parcel|parcel\s*id|lot)$/.test(h));
  const hasBeaconsList = headerRow.some(h => /^(beacons|beacon\s*ids|corners|vertices|points|point\s*ids|beacons\s*list)$/.test(h));
  const hasFromTo = headerRow.some(h => /^(from\s*beacon|from|start\s*beacon)$/.test(h)) && headerRow.some(h => /^(to\s*beacon|to|end\s*beacon)$/.test(h));
  const hasCoordinates = headerRow.some(h => /^(easting|east|x)$/.test(h)) && headerRow.some(h => /^(northing|north|y)$/.test(h));

  let format: 'manifest' | 'traverse_schedule' | 'all_in_one' | 'unknown' = 'unknown';

  if (hasPlot && hasBeaconsList) {
    format = 'manifest';
  } else if (hasPlot && hasFromTo) {
    format = 'traverse_schedule';
  } else if (hasPlot && hasCoordinates) {
    format = 'all_in_one';
  } else {
    // Fallback detection based on column count and data content
    if (rows.length > 1) {
      const sampleRow = rows[1];
      if (sampleRow.length >= 2 && extractBeaconIds(sampleRow[sampleRow.length - 1] || sampleRow[1] || '').length >= 3) {
        format = 'manifest';
      } else {
        format = 'manifest'; // Default assumption
      }
    }
  }

  const existingPointMap = new Map<string, CoordinatePoint>(
    existingPoints.map(p => [p.id.toUpperCase().trim(), p])
  );

  const embeddedPointsMap = new Map<string, CoordinatePoint>();
  const parcelBuilderMap = new Map<string, { plotNumber: string; blockNumber?: string; ownerName?: string; pointIds: string[] }>();

  // Column Index Resolvers
  const plotColIdx = Math.max(0, headerRow.findIndex(h => /^(plot|plot\s*no|plot\s*number|parcel|lot)$/.test(h)));
  const blockColIdx = headerRow.findIndex(h => /^(block|block\s*no|block\s*number|blk)$/.test(h));
  const ownerColIdx = headerRow.findIndex(h => /^(owner|allottee|client|name)$/.test(h));
  const beaconsColIdx = headerRow.findIndex(h => /^(beacons|beacon\s*ids|corners|vertices|points|point\s*ids)$/.test(h));
  const fromBeaconColIdx = headerRow.findIndex(h => /^(from\s*beacon|from|start)$/.test(h));
  const toBeaconColIdx = headerRow.findIndex(h => /^(to\s*beacon|to|end)$/.test(h));
  const beaconIdColIdx = headerRow.findIndex(h => /^(beacon\s*id|beacon|pt|point|pt_id)$/.test(h));
  const eastColIdx = headerRow.findIndex(h => /^(easting|east|x)$/.test(h));
  const northColIdx = headerRow.findIndex(h => /^(northing|north|y)$/.test(h));
  const elevColIdx = headerRow.findIndex(h => /^(elevation|elev|height|h|z)$/.test(h));

  // Process Rows
  const startRowIdx = hasPlot ? 1 : 0;

  for (let r = startRowIdx; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0 || (row.length === 1 && !row[0].trim())) continue;

    const plotNo = (row[plotColIdx >= 0 ? plotColIdx : 0] || `PLOT_${r}`).trim();
    if (!plotNo) continue;

    const blockNo = blockColIdx >= 0 ? row[blockColIdx]?.trim() : undefined;
    const ownerName = ownerColIdx >= 0 ? row[ownerColIdx]?.trim() : undefined;
    const plotKey = plotNo.toUpperCase();

    if (!parcelBuilderMap.has(plotKey)) {
      parcelBuilderMap.set(plotKey, {
        plotNumber: plotNo,
        blockNumber: blockNo || undefined,
        ownerName: ownerName || undefined,
        pointIds: []
      });
    }
    const currentParcel = parcelBuilderMap.get(plotKey)!;
    if (blockNo && !currentParcel.blockNumber) currentParcel.blockNumber = blockNo;
    if (ownerName && !currentParcel.ownerName) currentParcel.ownerName = ownerName;

    if (format === 'manifest') {
      const beaconCell = beaconsColIdx >= 0 ? row[beaconsColIdx] : row[1] || '';
      const extracted = extractBeaconIds(beaconCell);
      for (const b of extracted) {
        if (!currentParcel.pointIds.includes(b)) {
          currentParcel.pointIds.push(b);
        }
      }
    } else if (format === 'traverse_schedule') {
      const fromPt = row[fromBeaconColIdx >= 0 ? fromBeaconColIdx : 3]?.trim();
      const toPt = row[toBeaconColIdx >= 0 ? toBeaconColIdx : 4]?.trim();
      if (fromPt && !currentParcel.pointIds.includes(fromPt)) {
        currentParcel.pointIds.push(fromPt);
      }
      if (toPt && !currentParcel.pointIds.includes(toPt)) {
        currentParcel.pointIds.push(toPt);
      }
    } else if (format === 'all_in_one') {
      const bId = (row[beaconIdColIdx >= 0 ? beaconIdColIdx : 3] || `PB_${r}`).trim();
      if (bId && !currentParcel.pointIds.includes(bId)) {
        currentParcel.pointIds.push(bId);
      }

      // Check coordinates
      if (eastColIdx >= 0 && northColIdx >= 0) {
        const eastVal = parseFloat(row[eastColIdx]);
        const northVal = parseFloat(row[northColIdx]);
        const elevVal = elevColIdx >= 0 ? parseFloat(row[elevColIdx]) : 0;

        if (!isNaN(eastVal) && !isNaN(northVal)) {
          const ptKey = bId.toUpperCase();
          if (!embeddedPointsMap.has(ptKey) && !existingPointMap.has(ptKey)) {
            embeddedPointsMap.set(ptKey, {
              id: bId,
              easting: eastVal,
              northing: northVal,
              elevation: isNaN(elevVal) ? 0 : elevVal,
              code: 'PB'
            });
          }
        }
      }
    }
  }

  // Combine coordinate lookups
  const allAvailablePointsMap = new Map<string, CoordinatePoint>([
    ...existingPointMap,
    ...embeddedPointsMap
  ]);
  const allAvailablePoints = Array.from(allAvailablePointsMap.values());

  // Validate and Build Parsed Items
  const parsedParcels: ParsedParcelItem[] = [];

  for (const [, builder] of parcelBuilderMap) {
    const missing: string[] = [];
    const resolvedPoints: CoordinatePoint[] = [];

    for (const pid of builder.pointIds) {
      const pt = allAvailablePointsMap.get(pid.toUpperCase().trim());
      if (pt) {
        resolvedPoints.push(pt);
      } else {
        missing.push(pid);
      }
    }

    let isValid = builder.pointIds.length >= 3 && missing.length === 0;
    let statusMessage = 'Valid Cadastral Parcel';
    let computedAreaSqM: number | undefined = undefined;

    if (builder.pointIds.length < 3) {
      isValid = false;
      statusMessage = `Requires at least 3 beacons (found ${builder.pointIds.length})`;
    } else if (missing.length > 0) {
      isValid = false;
      statusMessage = `Missing ${missing.length} beacon coordinate(s): ${missing.join(', ')}`;
    } else {
      // Test geometry computation
      const tempPcl: Parcel = {
        id: `import_${builder.plotNumber}`,
        plotNumber: builder.plotNumber,
        pointIds: builder.pointIds
      };
      const comp = computeParcel(tempPcl, allAvailablePoints);
      if (comp && comp.areaSquareMeters > 0.01) {
        computedAreaSqM = comp.areaSquareMeters;
      } else {
        isValid = false;
        statusMessage = 'Vertices produce self-intersecting or zero area';
      }
    }

    parsedParcels.push({
      plotNumber: builder.plotNumber,
      blockNumber: builder.blockNumber,
      ownerName: builder.ownerName,
      beaconIds: builder.pointIds,
      isValid,
      computedAreaSqMeters: computedAreaSqM,
      missingBeaconIds: missing,
      statusMessage
    });
  }

  const validCount = parsedParcels.filter(p => p.isValid).length;
  const invalidCount = parsedParcels.length - validCount;

  return {
    detectedFormat: format,
    detectedDelimiter: delimiter,
    totalParcelsFound: parsedParcels.length,
    validParcelsCount: validCount,
    invalidParcelsCount: invalidCount,
    parcels: parsedParcels,
    embeddedPoints: Array.from(embeddedPointsMap.values()),
    errors,
    warnings
  };
}

/**
 * Generates sample CSV template for Manifest format.
 */
export function getSampleParcelManifestCSV(): string {
  return `Plot Number,Block,Owner,Beacon IDs\r\n"Plot 1","Block A","Chief John Okon","PB101, PB102, PB103, PB104"\r\n"Plot 2","Block A","Engr. Bello Musa","PB102, PB105, PB106, PB103"\r\n"Plot 3","Block B","Dr. Amadi Nnamdi","PB107, PB108, PB109, PB110"`;
}

/**
 * Generates sample CSV template for All-in-One Point-Plot format.
 */
export function getSampleParcelAllInOneCSV(): string {
  return `Plot Number,Block,Owner,Beacon ID,Easting,Northing,Elevation\r\n"Plot 1","Block A","John Doe","PB101",294312.450,992100.125,345.20\r\n"Plot 1","Block A","John Doe","PB102",294366.001,992113.559,346.10\r\n"Plot 1","Block A","John Doe","PB103",294350.210,992080.330,345.80\r\n"Plot 1","Block A","John Doe","PB104",294295.105,992065.800,344.90`;
}
