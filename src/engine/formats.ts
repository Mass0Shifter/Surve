import { DMSAngle } from './types';

/**
 * Converts decimal degrees to DMS structure (Degrees, Minutes, Seconds).
 */
export function decimalToDMS(decDeg: number): DMSAngle {
  // Normalize angle to [0, 360)
  let normalized = decDeg % 360;
  if (normalized < 0) normalized += 360;

  const deg = Math.floor(normalized);
  const minFrac = (normalized - deg) * 60;
  const min = Math.floor(minFrac);
  const sec = Math.round((minFrac - min) * 60 * 10) / 10; // Round to 1 decimal place

  // Handle rounding overflow (e.g. 59.99" -> 60")
  let adjustedSec = sec;
  let adjustedMin = min;
  let adjustedDeg = deg;

  if (adjustedSec >= 60) {
    adjustedSec = 0;
    adjustedMin += 1;
  }
  if (adjustedMin >= 60) {
    adjustedMin = 0;
    adjustedDeg = (adjustedDeg + 1) % 360;
  }

  const formatted = `${adjustedDeg}° ${adjustedMin.toString().padStart(2, '0')}' ${adjustedSec.toFixed(1).padStart(4, '0')}"`;

  return {
    degrees: adjustedDeg,
    minutes: adjustedMin,
    seconds: adjustedSec,
    decimalDegrees: normalized,
    formatted
  };
}

/**
 * Converts Degrees, Minutes, Seconds to Decimal Degrees.
 */
export function dmsToDecimal(deg: number, min: number, sec: number): number {
  return deg + min / 60 + sec / 3600;
}

/**
 * Parses DMS string like "142 35 20" or "142°35'20\"" to Decimal Degrees.
 */
export function parseDMSToDecimal(dmsStr: string): number {
  if (!dmsStr) return 0;
  const cleaned = dmsStr.replace(/[°'"]/g, ' ').trim();
  const parts = cleaned.split(/[\s,:]+/).map(Number).filter(n => !isNaN(n));
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  if (parts.length >= 3) return parts[0] + parts[1] / 60 + parts[2] / 3600;
  return 0;
}

/**
 * Formats a metric number with precision.
 */
export function formatMetric(val: number, decimals: number = 3): string {
  return val.toFixed(decimals);
}

/**
 * Formats an area in Square Metres and Hectares.
 */
export function formatArea(sqMeters: number): { sqMetersStr: string; hectaresStr: string } {
  const sqMetersStr = sqMeters.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' sq.m';
  const hectares = sqMeters / 10000;
  const hectaresStr = hectares.toFixed(4) + ' Ha';
  return { sqMetersStr, hectaresStr };
}
