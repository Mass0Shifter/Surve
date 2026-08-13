/**
 * Universal Field CSV & Raw Data Importer Engine
 * Supports flexible column mapping (ID, Easting, Northing, Elevation, Code, Description),
 * delimiter auto-detection (comma, tab, semicolon, pipe, space), header detection, and coordinate validation.
 */

import { CoordinatePoint } from '../types';

export type ColumnFieldType = 'ID' | 'EASTING' | 'NORTHING' | 'ELEVATION' | 'CODE' | 'DESCRIPTION' | 'IGNORE';

export interface ColumnMappingConfig {
  [columnIndex: number]: ColumnFieldType;
}

export interface CsvImportParseResult {
  points: CoordinatePoint[];
  previewRows: string[][];
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: string[];
  detectedDelimiter: string;
  hasHeader: boolean;
  columnCount: number;
  initialMapping: ColumnMappingConfig;
}

/** Auto-detect Delimiter from raw sample text */
export function detectDelimiter(rawText: string): string {
  const lines = rawText.trim().split(/\r?\n/).slice(0, 10);
  const sample = lines.join('\n');

  const commaCount = (sample.match(/,/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;
  const pipeCount = (sample.match(/\|/g) || []).length;

  if (tabCount > commaCount && tabCount > semiCount && tabCount > pipeCount) return '\t';
  if (semiCount > commaCount && semiCount > tabCount && semiCount > pipeCount) return ';';
  if (pipeCount > commaCount && pipeCount > tabCount && pipeCount > semiCount) return '|';
  if (commaCount > 0) return ',';

  // Fallback to whitespace / space-delimited
  return ' ';
}

/** Split a line by delimiter (handling quoted fields and multiple spaces) */
export function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ' ') {
    return line.trim().split(/\s+/).map(s => s.trim().replace(/^["']|["']$/g, ''));
  }

  // Regex for standard delimiters with quotes
  const pattern = new RegExp(
    `(${delimiter}|\\r?\\n|\\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^"${delimiter}\\r\\n]*))`,
    'gi'
  );

  const entries: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(line))) {
    const matchedDelimiter = match[1];
    if (matchedDelimiter.length && matchedDelimiter !== delimiter) {
      // Newline or start
    }
    let val = match[2] ? match[2].replace(/""/g, '"') : match[3] || '';
    entries.push(val.trim());
  }

  return entries.length > 0 ? entries : line.split(delimiter).map(s => s.trim().replace(/^["']|["']$/g, ''));
}

/** Auto-guess Column Mapping based on header names or sample data */
export function guessColumnMapping(rows: string[][], hasHeader: boolean): ColumnMappingConfig {
  const mapping: ColumnMappingConfig = {};
  if (rows.length === 0) return mapping;

  const header = hasHeader ? rows[0] : null;
  const colCount = Math.max(...rows.slice(0, 5).map(r => r.length));

  for (let c = 0; c < colCount; c++) {
    const headerStr = (header && header[c]) ? header[c].toLowerCase() : '';

    if (headerStr.match(/^(id|pt|point|name|station|stn|no|pnt)$/)) {
      mapping[c] = 'ID';
    } else if (headerStr.match(/^(e|east|easting|x|lon|lng|longitude)$/)) {
      mapping[c] = 'EASTING';
    } else if (headerStr.match(/^(n|north|northing|y|lat|latitude)$/)) {
      mapping[c] = 'NORTHING';
    } else if (headerStr.match(/^(z|elev|elevation|h|height|rl|level)$/)) {
      mapping[c] = 'ELEVATION';
    } else if (headerStr.match(/^(code|desc|description|feature|type|remark)$/)) {
      mapping[c] = 'CODE';
    }
  }

  // If mapping not found from header, use standard survey default: Col 0=ID, Col 1=Easting, Col 2=Northing, Col 3=Elev, Col 4=Code
  if (!Object.values(mapping).includes('EASTING') || !Object.values(mapping).includes('NORTHING')) {
    if (colCount >= 1) mapping[0] = 'ID';
    if (colCount >= 2) mapping[1] = 'EASTING';
    if (colCount >= 3) mapping[2] = 'NORTHING';
    if (colCount >= 4) mapping[3] = 'ELEVATION';
    if (colCount >= 5) mapping[4] = 'CODE';
  }

  return mapping;
}

/** Parse full text into survey CoordinatePoint objects using specified mapping */
export function parseSurveyCSV(
  rawText: string,
  mapping: ColumnMappingConfig,
  hasHeader: boolean,
  customDelimiter?: string
): CsvImportParseResult {
  const delimiter = customDelimiter || detectDelimiter(rawText);
  const rawLines = rawText.trim().split(/\r?\n/).filter(l => l.trim().length > 0);

  const allRows: string[][] = rawLines.map(line => splitLine(line, delimiter));
  const dataRows = hasHeader ? allRows.slice(1) : allRows;

  const points: CoordinatePoint[] = [];
  const errors: string[] = [];
  const existingIds = new Set<string>();

  dataRows.forEach((row, idx) => {
    const rowNum = hasHeader ? idx + 2 : idx + 1;
    let id = '';
    let easting: number | null = null;
    let northing: number | null = null;
    let elevation: number | undefined = undefined;
    let code = 'IMPORT';
    let description = '';

    for (const [colIdxStr, fieldType] of Object.entries(mapping)) {
      const colIdx = parseInt(colIdxStr);
      const val = row[colIdx]?.trim() || '';

      switch (fieldType) {
        case 'ID':
          id = val;
          break;
        case 'EASTING': {
          const num = parseFloat(val);
          if (!isNaN(num)) easting = num;
          break;
        }
        case 'NORTHING': {
          const num = parseFloat(val);
          if (!isNaN(num)) northing = num;
          break;
        }
        case 'ELEVATION': {
          const num = parseFloat(val);
          if (!isNaN(num)) elevation = num;
          break;
        }
        case 'CODE':
          if (val) code = val;
          break;
        case 'DESCRIPTION':
          if (val) description = val;
          break;
        default:
          break;
      }
    }

    if (!id) id = `PT_${rowNum}`;
    if (existingIds.has(id.toLowerCase())) {
      id = `${id}_${rowNum}`;
    }
    existingIds.add(id.toLowerCase());

    if (easting === null || northing === null) {
      errors.push(`Row ${rowNum}: Missing or invalid numeric Easting/Northing.`);
      return;
    }

    points.push({
      id,
      easting,
      northing,
      elevation,
      code,
      description: description || `Imported via Universal CSV Importer`
    });
  });

  return {
    points,
    previewRows: allRows.slice(0, 15),
    totalRows: dataRows.length,
    validCount: points.length,
    errorCount: errors.length,
    errors,
    detectedDelimiter: delimiter === '\t' ? 'TAB' : delimiter === ' ' ? 'SPACE' : delimiter,
    hasHeader,
    columnCount: Math.max(0, ...allRows.slice(0, 5).map(r => r.length)),
    initialMapping: mapping
  };
}
