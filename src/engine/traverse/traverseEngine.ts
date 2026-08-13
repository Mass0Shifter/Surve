import { CoordinatePoint } from '../types';
import { dmsToDecimal, decimalToDMS, normalizeBearing } from '../formats';

export type TraverseAdjustmentMethod = 'BOWDITCH' | 'TRANSIT';
export type SurveyOrder = '1ST_ORDER' | '2ND_ORDER' | '3RD_ORDER';

export interface TraverseStationEntry {
  id: string;
  stationId: string;
  observedDeg: number;
  observedMin: number;
  observedSec: number;
  distance: number; // ground slope or horizontal distance in meters
}

export interface TraverseReductionLeg {
  fromStation: string;
  toStation: string;
  rawAngleDeg: number;
  rawAngleDms: string;
  adjustedAngleDeg: number;
  adjustedAngleDms: string;
  forwardBearingDeg: number;
  forwardBearingDms: string;
  distance: number;
  rawDeltaEasting: number;
  rawDeltaNorthing: number;
  correctionEasting: number;
  correctionNorthing: number;
  balancedDeltaEasting: number;
  balancedDeltaNorthing: number;
  balancedEasting: number;
  balancedNorthing: number;
}

export interface TraverseAdjustmentResult {
  legs: TraverseReductionLeg[];
  balancedStations: CoordinatePoint[];
  totalPerimeter: number;
  theoreticalAngleSum: number;
  observedAngleSum: number;
  angularMiscloseSec: number;
  angularToleranceSec: number;
  isAngularPassed: boolean;
  linearMiscloseE: number;
  linearMiscloseN: number;
  totalLinearMisclose: number;
  precisionDenominator: number;
  precisionRatioStr: string; // e.g. "1:34,250"
  orderClassification: string;
  isPrecisionPassed: boolean;
  adjustmentMethod: TraverseAdjustmentMethod;
}

/**
 * Benchmark 8-Station Closed Loop Traverse from Legacy SurvPack Benchmark Dataset
 */
export const BENCHMARK_TRAVERSE_STATIONS: TraverseStationEntry[] = [
  { id: '1', stationId: 'STN_1', observedDeg: 125, observedMin: 14, observedSec: 20, distance: 165.420 },
  { id: '2', stationId: 'STN_2', observedDeg: 98, observedMin: 32, observedSec: 45, distance: 182.110 },
  { id: '3', stationId: 'STN_3', observedDeg: 142, observedMin: 5, observedSec: 10, distance: 215.680 },
  { id: '4', stationId: 'STN_4', observedDeg: 110, observedMin: 48, observedSec: 35, distance: 148.950 },
  { id: '5', stationId: 'STN_5', observedDeg: 135, observedMin: 22, observedSec: 15, distance: 195.340 },
  { id: '6', stationId: 'STN_6', observedDeg: 88, observedMin: 15, observedSec: 40, distance: 172.880 },
  { id: '7', stationId: 'STN_7', observedDeg: 154, observedMin: 50, observedSec: 25, distance: 198.450 },
  { id: '8', stationId: 'STN_8', observedDeg: 124, observedMin: 50, observedSec: 30, distance: 150.270 }
];

export const BENCHMARK_START_CONTROL: CoordinatePoint = {
  id: 'CP_KUBWA_01',
  easting: 294200.000,
  northing: 992000.000,
  elevation: 345.0,
  isControl: true
};

/**
 * Computes full Traverse Loop Angular and Linear Balancing using Bowditch or Transit rule.
 */
export function computeTraverseAdjustment(
  startControl: CoordinatePoint,
  closeControl: CoordinatePoint,
  initialBearingDecDeg: number,
  stations: TraverseStationEntry[],
  method: TraverseAdjustmentMethod = 'BOWDITCH',
  order: SurveyOrder = '2ND_ORDER'
): TraverseAdjustmentResult {
  const n = stations.length;
  if (n < 3) {
    throw new Error('A traverse loop requires at least 3 stations.');
  }

  // 1. Angular Reductions
  const observedAnglesDeg = stations.map(s => dmsToDecimal(s.observedDeg, s.observedMin, s.observedSec));
  const observedAngleSum = observedAnglesDeg.reduce((sum, val) => sum + val, 0);

  // For a closed polygon traverse, theoretical sum = (n - 2) * 180 degrees (for internal angles)
  // or (n + 2) * 180 (for external angles). Pick the closest multiple of 180.
  const intSum = (n - 2) * 180;
  const extSum = (n + 2) * 180;
  const theoreticalAngleSum = Math.abs(observedAngleSum - intSum) < Math.abs(observedAngleSum - extSum) ? intSum : extSum;

  const angularMiscloseDeg = observedAngleSum - theoreticalAngleSum;
  const angularMiscloseSec = angularMiscloseDeg * 3600;

  // SURCON / OSGOF Tolerance: T = c * sqrt(n)
  const cSec = order === '1ST_ORDER' ? 10 : order === '2ND_ORDER' ? 20 : 30;
  const angularToleranceSec = cSec * Math.sqrt(n);
  const isAngularPassed = Math.abs(angularMiscloseSec) <= angularToleranceSec;

  // Even correction per station in degrees
  const angleCorrectionPerStn = -angularMiscloseDeg / n;
  const adjustedAnglesDeg = observedAnglesDeg.map(a => a + angleCorrectionPerStn);

  // 2. Propagate Whole Circle Bearings (WCB)
  const forwardBearingsDeg: number[] = [];
  let currentBearing = initialBearingDecDeg;

  for (let i = 0; i < n; i++) {
    // Standard surveyor angle to bearing propagation
    currentBearing = normalizeBearing(currentBearing + 180 + adjustedAnglesDeg[i]);
    forwardBearingsDeg.push(currentBearing);
  }

  // 3. Compute Latitudes (ΔN) and Departures (ΔE)
  const distances = stations.map(s => s.distance);
  const totalPerimeter = distances.reduce((sum, d) => sum + d, 0);

  if (totalPerimeter <= 0 || isNaN(totalPerimeter) || !isFinite(totalPerimeter)) {
    throw new Error('Traverse Calculation Error: Total perimeter distance must be greater than 0.000m.');
  }

  const rawDeltaE: number[] = [];
  const rawDeltaN: number[] = [];

  for (let i = 0; i < n; i++) {
    const rad = (forwardBearingsDeg[i] * Math.PI) / 180;
    const de = distances[i] * Math.sin(rad);
    const dn = distances[i] * Math.cos(rad);
    rawDeltaE.push(de);
    rawDeltaN.push(dn);
  }

  const sumRawDeltaE = rawDeltaE.reduce((sum, v) => sum + v, 0);
  const sumRawDeltaN = rawDeltaN.reduce((sum, v) => sum + v, 0);

  // Linear Misclosure
  const expectedTotalDeltaE = closeControl.easting - startControl.easting;
  const expectedTotalDeltaN = closeControl.northing - startControl.northing;

  const linearMiscloseE = sumRawDeltaE - expectedTotalDeltaE;
  const linearMiscloseN = sumRawDeltaN - expectedTotalDeltaN;
  const totalLinearMisclose = Math.sqrt(linearMiscloseE * linearMiscloseE + linearMiscloseN * linearMiscloseN);

  const precisionDenominator = totalLinearMisclose > 0.00001 ? Math.round(totalPerimeter / totalLinearMisclose) : 999999;
  const precisionRatioStr = `1:${precisionDenominator.toLocaleString()}`;

  // Precision Order Thresholds (SURCON Standards)
  let orderClassification = '3rd Order Cadastral';
  let isPrecisionPassed = precisionDenominator >= 5000;

  if (precisionDenominator >= 50000) {
    orderClassification = '1st Order Geodetic (Primary)';
    isPrecisionPassed = true;
  } else if (precisionDenominator >= 20000) {
    orderClassification = '2nd Order Control (Secondary)';
    isPrecisionPassed = true;
  } else if (precisionDenominator >= 10000) {
    orderClassification = '3rd Order Cadastral (Standard)';
    isPrecisionPassed = true;
  } else if (precisionDenominator >= 5000) {
    orderClassification = 'Minor Traverse (Tertiary)';
    isPrecisionPassed = true;
  } else {
    orderClassification = 'Substandard (Misclose Exceeds Limit)';
    isPrecisionPassed = false;
  }

  // 4. Balance Coordinates using Bowditch or Transit Rule
  const sumAbsE = rawDeltaE.reduce((sum, v) => sum + Math.abs(v), 0);
  const sumAbsN = rawDeltaN.reduce((sum, v) => sum + Math.abs(v), 0);

  const correctionE: number[] = [];
  const correctionN: number[] = [];
  const balancedDeltaE: number[] = [];
  const balancedDeltaN: number[] = [];

  for (let i = 0; i < n; i++) {
    let corrE = 0;
    let corrN = 0;

    if (method === 'BOWDITCH') {
      // Bowditch (Compass Rule): correction proportional to distance
      corrE = -linearMiscloseE * (distances[i] / totalPerimeter);
      corrN = -linearMiscloseN * (distances[i] / totalPerimeter);
    } else {
      // Transit Rule: correction proportional to absolute delta
      corrE = -linearMiscloseE * (Math.abs(rawDeltaE[i]) / Math.max(0.001, sumAbsE));
      corrN = -linearMiscloseN * (Math.abs(rawDeltaN[i]) / Math.max(0.001, sumAbsN));
    }

    correctionE.push(corrE);
    correctionN.push(corrN);
    balancedDeltaE.push(rawDeltaE[i] + corrE);
    balancedDeltaN.push(rawDeltaN[i] + corrN);
  }

  // 5. Accumulate Balanced Coordinates
  const legs: TraverseReductionLeg[] = [];
  const balancedStations: CoordinatePoint[] = [];

  let curE = startControl.easting;
  let curN = startControl.northing;

  for (let i = 0; i < n; i++) {
    const fromStn = i === 0 ? startControl.id : stations[i - 1].stationId;
    const toStn = stations[i].stationId;

    curE += balancedDeltaE[i];
    curN += balancedDeltaN[i];

    const rawDms = decimalToDMS(observedAnglesDeg[i]);
    const adjDms = decimalToDMS(adjustedAnglesDeg[i]);
    const wcbDms = decimalToDMS(forwardBearingsDeg[i]);

    legs.push({
      fromStation: fromStn,
      toStation: toStn,
      rawAngleDeg: observedAnglesDeg[i],
      rawAngleDms: rawDms.formatted,
      adjustedAngleDeg: adjustedAnglesDeg[i],
      adjustedAngleDms: adjDms.formatted,
      forwardBearingDeg: forwardBearingsDeg[i],
      forwardBearingDms: wcbDms.formatted,
      distance: distances[i],
      rawDeltaEasting: rawDeltaE[i],
      rawDeltaNorthing: rawDeltaN[i],
      correctionEasting: correctionE[i],
      correctionNorthing: correctionN[i],
      balancedDeltaEasting: balancedDeltaE[i],
      balancedDeltaNorthing: balancedDeltaN[i],
      balancedEasting: Math.round(curE * 1000) / 1000,
      balancedNorthing: Math.round(curN * 1000) / 1000
    });

    balancedStations.push({
      id: toStn,
      easting: Math.round(curE * 1000) / 1000,
      northing: Math.round(curN * 1000) / 1000,
      code: 'TRAV_STN',
      description: `Traverse Station (Balanced via ${method})`,
      isControl: true
    });
  }

  return {
    legs,
    balancedStations,
    totalPerimeter,
    theoreticalAngleSum,
    observedAngleSum,
    angularMiscloseSec: Math.round(angularMiscloseSec * 10) / 10,
    angularToleranceSec: Math.round(angularToleranceSec * 10) / 10,
    isAngularPassed,
    linearMiscloseE: Math.round(linearMiscloseE * 1000) / 1000,
    linearMiscloseN: Math.round(linearMiscloseN * 1000) / 1000,
    totalLinearMisclose: Math.round(totalLinearMisclose * 1000) / 1000,
    precisionDenominator,
    precisionRatioStr,
    orderClassification,
    isPrecisionPassed,
    adjustmentMethod: method
  };
}
