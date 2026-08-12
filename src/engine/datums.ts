import { NigerianGridBelt } from './types';

export interface Ellipsoid {
  name: string;
  a: number; // Semi-major axis
  invF: number; // 1 / flattening
}

export const CLARKE_1880: Ellipsoid = {
  name: 'Clarke 1880 (Modified)',
  a: 6378249.145,
  invF: 293.465
};

export const WGS84: Ellipsoid = {
  name: 'WGS 84',
  a: 6378137.0,
  invF: 298.257223563
};

/**
 * Standard parameters for the 3-Belt Nigerian Transverse Mercator System (Minna Datum).
 */
export const NIGERIAN_GRID_PARAMS = {
  scaleFactor: 0.99975,
  falseEasting: 670553.984,
  falseNorthing: 0.0,
  belts: {
    [NigerianGridBelt.WEST_BELT]: { name: 'West Belt (CM 4° 30\' E)', centralMeridian: 4.5 },
    [NigerianGridBelt.MID_BELT]: { name: 'Mid Belt (CM 8° 30\' E) - FCT Abuja', centralMeridian: 8.5 },
    [NigerianGridBelt.EAST_BELT]: { name: 'East Belt (CM 12° 30\' E)', centralMeridian: 12.5 }
  }
};

/**
 * Validates whether an Easting/Northing coordinate is in a typical Nigerian cadastral range.
 */
export function validateNigerianCoordinates(easting: number, northing: number): { valid: boolean; warning?: string } {
  if (northing < 400000 || northing > 1600000) {
    return { valid: false, warning: 'Northing appears outside typical Nigerian boundary range (400,000m - 1,600,000m).' };
  }
  if (easting < 100000 || easting > 1200000) {
    return { valid: false, warning: 'Easting appears outside typical Belt range (100,000m - 1,200,000m).' };
  }
  return { valid: true };
}
