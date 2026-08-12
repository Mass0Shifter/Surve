export type LevelingMethod = 'HPC' | 'RISE_FALL';
export type LevelingOrder = '1ST_ORDER_PRECISE' | '2ND_ORDER_ENGINEERING' | '3RD_ORDER_TOPO';

export interface LevelingRowEntry {
  id: string;
  stationId: string;
  backsight?: number | null;
  intermediateSight?: number | null;
  foresight?: number | null;
  distanceFromStart?: number | null; // in meters for profile
  remarks?: string;
}

export interface LevelingReductionRow {
  stationId: string;
  backsight: number | null;
  intermediateSight: number | null;
  foresight: number | null;
  rise: number | null;
  fall: number | null;
  hpc: number | null;
  computedRL: number;
  correction: number;
  adjustedRL: number;
  distanceFromStart: number | null;
  remarks: string;
  isChangePoint: boolean;
}

export interface ArithmeticCheck {
  sumBacksight: number;
  sumForesight: number;
  diffBS_FS: number;

  sumRise: number;
  sumFall: number;
  diffRise_Fall: number;

  firstRL: number;
  lastRL: number;
  diffLast_FirstRL: number;

  isPassed: boolean;
}

export interface LevelingAdjustmentResult {
  rows: LevelingReductionRow[];
  method: LevelingMethod;
  arithmeticCheck: ArithmeticCheck;
  totalDistanceKm: number;
  loopMisclosureMeters: number;
  loopMisclosureMm: number;
  permissibleToleranceMm: number;
  isTolerancePassed: boolean;
  orderClassification: string;
}

/**
 * 10-Station Benchmark Leveling Run from Legacy SurvPack Dataset (ABJ_LEV.DAT)
 */
export const BENCHMARK_LEVELING_ROWS: LevelingRowEntry[] = [
  { id: '1', stationId: 'TBM_01', backsight: 1.450, intermediateSight: null, foresight: null, distanceFromStart: 0, remarks: 'Known Benchmark (TBM 01)' },
  { id: '2', stationId: 'STN_A', backsight: null, intermediateSight: 1.230, foresight: null, distanceFromStart: 30, remarks: 'Road Edge' },
  { id: '3', stationId: 'STN_B', backsight: null, intermediateSight: 1.890, foresight: null, distanceFromStart: 65, remarks: 'Drain Invert' },
  { id: '4', stationId: 'CP_01', backsight: 2.140, intermediateSight: null, foresight: 0.980, distanceFromStart: 100, remarks: 'Change Point 1 (Peg on Berm)' },
  { id: '5', stationId: 'STN_C', backsight: null, intermediateSight: 1.560, foresight: null, distanceFromStart: 140, remarks: 'Ground Centerline' },
  { id: '6', stationId: 'STN_D', backsight: null, intermediateSight: 1.110, foresight: null, distanceFromStart: 180, remarks: 'Culvert Top' },
  { id: '7', stationId: 'CP_02', backsight: 1.670, intermediateSight: null, foresight: 1.950, distanceFromStart: 220, remarks: 'Change Point 2 (Manhole Ring)' },
  { id: '8', stationId: 'STN_E', backsight: null, intermediateSight: 1.340, foresight: null, distanceFromStart: 260, remarks: 'Building Corner' },
  { id: '9', stationId: 'STN_F', backsight: null, intermediateSight: 1.780, foresight: null, distanceFromStart: 295, remarks: 'Spot Height on Path' },
  { id: '10', stationId: 'TBM_02', backsight: null, intermediateSight: null, foresight: 1.140, distanceFromStart: 330, remarks: 'Closing Benchmark (TBM 02)' }
];

export const BENCHMARK_START_RL = 345.500; // meters
export const BENCHMARK_KNOWN_CLOSE_RL = 346.690; // meters

/**
 * Computes complete Spirit Leveling reduction using Height of Collimation (HPC)
 * or Rise & Fall method, with arithmetic check and loop misclosure adjustment.
 */
export function computeLevelingReduction(
  initialRL: number,
  knownClosingRL: number | null,
  rawRows: LevelingRowEntry[],
  method: LevelingMethod = 'HPC',
  order: LevelingOrder = '2ND_ORDER_ENGINEERING'
): LevelingAdjustmentResult {
  if (!rawRows || rawRows.length < 2) {
    throw new Error('Leveling requires at least 2 station observations.');
  }

  let sumBS = 0;
  let sumFS = 0;
  let sumRise = 0;
  let sumFall = 0;

  let currentHPC = 0;
  let currentRL = initialRL;
  let prevReading: number | null = null;

  const reducedRows: LevelingReductionRow[] = [];
  const changePointIndices: number[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const bs = typeof row.backsight === 'number' && !isNaN(row.backsight) ? row.backsight : null;
    const is = typeof row.intermediateSight === 'number' && !isNaN(row.intermediateSight) ? row.intermediateSight : null;
    const fs = typeof row.foresight === 'number' && !isNaN(row.foresight) ? row.foresight : null;

    if (bs !== null) sumBS += bs;
    if (fs !== null) sumFS += fs;

    let rise: number | null = null;
    let fall: number | null = null;
    let computedRL = currentRL;
    const isChangePoint = fs !== null && bs !== null;

    // 1. Height of Collimation (HPC) & Reduced Level Calculation
    if (i === 0) {
      // First Station (usually Backsight on Benchmark)
      if (bs !== null) {
        currentHPC = initialRL + bs;
      }
      computedRL = initialRL;
      prevReading = bs !== null ? bs : (is !== null ? is : fs);
    } else {
      const currentReading = is !== null ? is : fs;

      // Rise and Fall calculation between consecutive sights
      if (prevReading !== null && currentReading !== null) {
        const diff = prevReading - currentReading;
        if (diff > 0) {
          rise = Math.round(diff * 1000) / 1000;
          sumRise += rise;
          currentRL += rise;
        } else {
          fall = Math.round(Math.abs(diff) * 1000) / 1000;
          sumFall += fall;
          currentRL -= fall;
        }
      }

      // Height of Collimation Method
      if (method === 'HPC') {
        if (is !== null) {
          currentRL = currentHPC - is;
        } else if (fs !== null) {
          currentRL = currentHPC - fs;
        }
      }

      computedRL = currentRL;

      // If change point, setup new instrument height (HPC)
      if (bs !== null) {
        currentHPC = computedRL + bs;
        prevReading = bs;
      } else {
        prevReading = currentReading;
      }
    }

    if (fs !== null) {
      changePointIndices.push(i);
    }

    reducedRows.push({
      stationId: row.stationId || `STN_${i + 1}`,
      backsight: bs,
      intermediateSight: is,
      foresight: fs,
      rise,
      fall,
      hpc: method === 'HPC' && bs !== null ? Math.round(currentHPC * 1000) / 1000 : null,
      computedRL: Math.round(computedRL * 1000) / 1000,
      correction: 0,
      adjustedRL: Math.round(computedRL * 1000) / 1000,
      distanceFromStart: row.distanceFromStart !== undefined ? row.distanceFromStart : null,
      remarks: row.remarks || '',
      isChangePoint
    });
  }

  // 2. Arithmetic Checks
  const firstRL = reducedRows[0].computedRL;
  const lastRL = reducedRows[reducedRows.length - 1].computedRL;

  const diffBS_FS = Math.round((sumBS - sumFS) * 1000) / 1000;
  const diffRise_Fall = Math.round((sumRise - sumFall) * 1000) / 1000;
  const diffLast_FirstRL = Math.round((lastRL - firstRL) * 1000) / 1000;

  const isPassed =
    Math.abs(diffBS_FS - diffRise_Fall) < 0.002 &&
    Math.abs(diffBS_FS - diffLast_FirstRL) < 0.002;

  const arithmeticCheck: ArithmeticCheck = {
    sumBacksight: Math.round(sumBS * 1000) / 1000,
    sumForesight: Math.round(sumFS * 1000) / 1000,
    diffBS_FS,
    sumRise: Math.round(sumRise * 1000) / 1000,
    sumFall: Math.round(sumFall * 1000) / 1000,
    diffRise_Fall,
    firstRL,
    lastRL,
    diffLast_FirstRL,
    isPassed
  };

  // 3. Misclosure & Loop Adjustment
  let loopMisclosureMeters = 0;
  let loopMisclosureMm = 0;
  let permissibleToleranceMm = 12;
  let isTolerancePassed = true;
  let orderClassification = 'Engineering Leveling (Class II)';

  const lastDistMeters = rawRows[rawRows.length - 1]?.distanceFromStart || 500;
  const totalDistanceKm = Math.max(0.1, lastDistMeters / 1000);

  // Permissible Tolerance: T = c * sqrt(K) mm
  const cMm = order === '1ST_ORDER_PRECISE' ? 6 : order === '2ND_ORDER_ENGINEERING' ? 12 : 24;
  permissibleToleranceMm = Math.round(cMm * Math.sqrt(totalDistanceKm) * 10) / 10;

  if (knownClosingRL !== null && typeof knownClosingRL === 'number') {
    loopMisclosureMeters = Math.round((lastRL - knownClosingRL) * 1000) / 1000;
    loopMisclosureMm = Math.round(loopMisclosureMeters * 1000 * 10) / 10;
    isTolerancePassed = Math.abs(loopMisclosureMm) <= permissibleToleranceMm;

    // Distribute elevation correction across change points
    const totalCP = Math.max(1, changePointIndices.length);
    let cpCount = 0;

    for (let i = 0; i < reducedRows.length; i++) {
      if (reducedRows[i].foresight !== null) {
        cpCount++;
      }
      const correction = -loopMisclosureMeters * (cpCount / totalCP);
      reducedRows[i].correction = Math.round(correction * 1000) / 1000;
      reducedRows[i].adjustedRL = Math.round((reducedRows[i].computedRL + correction) * 1000) / 1000;
    }
  }

  if (Math.abs(loopMisclosureMm) <= 6 * Math.sqrt(totalDistanceKm)) {
    orderClassification = '1st Order Precise Leveling (Passed)';
  } else if (Math.abs(loopMisclosureMm) <= 12 * Math.sqrt(totalDistanceKm)) {
    orderClassification = '2nd Order Engineering Leveling (Passed)';
  } else if (Math.abs(loopMisclosureMm) <= 24 * Math.sqrt(totalDistanceKm)) {
    orderClassification = '3rd Order Topographical Leveling (Passed)';
  } else {
    orderClassification = 'Substandard (Misclosure Exceeds Limit)';
  }

  return {
    rows: reducedRows,
    method,
    arithmeticCheck,
    totalDistanceKm: Math.round(totalDistanceKm * 1000) / 1000,
    loopMisclosureMeters,
    loopMisclosureMm,
    permissibleToleranceMm,
    isTolerancePassed,
    orderClassification
  };
}
