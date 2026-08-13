import { CoordinatePoint } from '../types';

/**
 * Parses raw text content (CSV, TSV, space-delimited, SurvPack coordinate format)
 * into structured CoordinatePoint objects with automatic duplicate ID resolution.
 */
export function parseCoordinatesText(text: string): { points: CoordinatePoint[]; errors: string[]; duplicateCount: number } {
  const lines = text.split(/\r?\n/);
  const points: CoordinatePoint[] = [];
  const errors: string[] = [];
  const existingIds = new Set<string>();
  let duplicateCount = 0;

  let lineNum = 0;
  for (const rawLine of lines) {
    lineNum++;
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('//')) {
      continue;
    }

    // Check if line is a header
    const lower = line.toLowerCase();
    if (lower.includes('easting') && lower.includes('northing')) {
      continue;
    }

    // Split by comma, tab, or whitespace
    let parts: string[] = [];
    if (line.includes(',')) {
      parts = line.split(',').map(s => s.replace(/["']/g, '').trim());
    } else if (line.includes('\t')) {
      parts = line.split('\t').map(s => s.trim());
    } else {
      parts = line.split(/\s+/).map(s => s.trim());
    }

    if (parts.length < 2) {
      errors.push(`Line ${lineNum}: Not enough columns ("${line}")`);
      continue;
    }

    let id = '';
    let easting = 0;
    let northing = 0;
    let elevation: number | undefined = undefined;
    let code: string | undefined = undefined;

    const num1 = parseFloat(parts[0]);
    const num2 = parseFloat(parts[1]);

    if (!isNaN(num1) && !isNaN(num2) && parts.length >= 2 && num1 > 10000 && num2 > 10000) {
      // Easting, Northing format
      easting = num1;
      northing = num2;
      id = `PT_${points.length + 1}`;
      if (parts.length >= 3 && !isNaN(parseFloat(parts[2]))) {
        elevation = parseFloat(parts[2]);
      }
    } else {
      // ID, Easting, Northing format
      id = parts[0];
      easting = parseFloat(parts[1]);
      northing = parseFloat(parts[2]);
      if (parts.length >= 4 && !isNaN(parseFloat(parts[3]))) {
        elevation = parseFloat(parts[3]);
      }
      if (parts.length >= 5) {
        code = parts[4];
      }
    }

    if (isNaN(easting) || isNaN(northing)) {
      errors.push(`Line ${lineNum}: Invalid numeric coordinates in "${line}"`);
      continue;
    }

    // Duplicate ID resolution: auto-suffix if ID already seen
    const lowerId = id.toLowerCase();
    if (existingIds.has(lowerId)) {
      duplicateCount++;
      let counter = 1;
      let newId = `${id}_${counter}`;
      while (existingIds.has(newId.toLowerCase())) {
        counter++;
        newId = `${id}_${counter}`;
      }
      id = newId;
    }
    existingIds.add(id.toLowerCase());

    const isControl = id.toUpperCase().startsWith('CTRL') || id.toUpperCase().startsWith('SC') || id.toUpperCase().startsWith('BM');

    points.push({
      id,
      easting,
      northing,
      elevation,
      code,
      isControl
    });
  }

  return { points, errors, duplicateCount };
}
