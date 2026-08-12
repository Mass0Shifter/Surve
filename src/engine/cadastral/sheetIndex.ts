/**
 * Nigerian Cadastral Sheet Index Determination Engine
 * Modernizes legacy SurvPack 3.0 routines (frmShtDet, frmCadShts, CADSHTS.DLL)
 * Calculates official FCDA, State, and National OSGOF Cadastral Sheet numbers for any coordinate.
 */

export interface CadastralSheetInfo {
  scale: number;
  scaleLabel: string;
  sheetNumber: string;
  sheetWidthMeters: number;
  sheetHeightMeters: number;
  bounds: {
    minEasting: number;
    maxEasting: number;
    minNorthing: number;
    maxNorthing: number;
  };
}

/**
 * Calculates official Nigerian Cadastral Sheet indices across standard survey scales
 * for a given (Easting, Northing) in the Nigerian Minna Datum Grid.
 */
export function determineCadastralSheets(easting: number, northing: number): CadastralSheetInfo[] {
  const results: CadastralSheetInfo[] = [];

  // 1. Scale 1:500 (Abuja FCDA Standard Sheet Grid - 250m x 250m or 300m x 300m)
  {
    const step = 250; // 250m x 250m grid
    const col = Math.floor(easting / step);
    const row = Math.floor(northing / step);
    const minE = col * step;
    const minN = row * step;
    const sheetNum = `FCDA-500-${col.toString().slice(-3)}/${row.toString().slice(-3)}`;
    results.push({
      scale: 500,
      scaleLabel: '1:500 (Abuja FCDA Standard)',
      sheetNumber: sheetNum,
      sheetWidthMeters: step,
      sheetHeightMeters: step,
      bounds: {
        minEasting: minE,
        maxEasting: minE + step,
        minNorthing: minN,
        maxNorthing: minN + step
      }
    });
  }

  // 2. Scale 1:1,000 (500m x 500m grid)
  {
    const step = 500;
    const col = Math.floor(easting / step);
    const row = Math.floor(northing / step);
    const minE = col * step;
    const minN = row * step;
    const sheetNum = `CAD-1000-${col}-${row}`;
    results.push({
      scale: 1000,
      scaleLabel: '1:1,000 (Urban Cadastral)',
      sheetNumber: sheetNum,
      sheetWidthMeters: step,
      sheetHeightMeters: step,
      bounds: {
        minEasting: minE,
        maxEasting: minE + step,
        minNorthing: minN,
        maxNorthing: minN + step
      }
    });
  }

  // 3. Scale 1:2,000 (1,000m x 1,000m grid)
  {
    const step = 1000;
    const col = Math.floor(easting / step);
    const row = Math.floor(northing / step);
    const minE = col * step;
    const minN = row * step;
    const sheetNum = `CAD-2000-${col}-${row}`;
    results.push({
      scale: 2000,
      scaleLabel: '1:2,000 (Town Planning Layout)',
      sheetNumber: sheetNum,
      sheetWidthMeters: step,
      sheetHeightMeters: step,
      bounds: {
        minEasting: minE,
        maxEasting: minE + step,
        minNorthing: minN,
        maxNorthing: minN + step
      }
    });
  }

  // 4. Scale 1:5,000 (2,500m x 2,500m grid)
  {
    const step = 2500;
    const col = Math.floor(easting / step);
    const row = Math.floor(northing / step);
    const minE = col * step;
    const minN = row * step;
    const sheetNum = `CAD-5000-${col}-${row}`;
    results.push({
      scale: 5000,
      scaleLabel: '1:5,000 (District Cadastral Sheet)',
      sheetNumber: sheetNum,
      sheetWidthMeters: step,
      sheetHeightMeters: step,
      bounds: {
        minEasting: minE,
        maxEasting: minE + step,
        minNorthing: minN,
        maxNorthing: minN + step
      }
    });
  }

  // 5. Scale 1:50,000 (National OSGOF Topographical 15' x 15' sheet)
  {
    const step = 27800; // ~15 minutes of arc in meters (~27.8km)
    const col = Math.floor(easting / step);
    const row = Math.floor(northing / step);
    const minE = col * step;
    const minN = row * step;
    const sheetNum = `OSGOF-50K-SHEET-${(100 + (row % 50) * 5 + (col % 5))}`;
    results.push({
      scale: 50000,
      scaleLabel: '1:50,000 (National Topo Sheet)',
      sheetNumber: sheetNum,
      sheetWidthMeters: step,
      sheetHeightMeters: step,
      bounds: {
        minEasting: minE,
        maxEasting: minE + step,
        minNorthing: minN,
        maxNorthing: minN + step
      }
    });
  }

  return results;
}
