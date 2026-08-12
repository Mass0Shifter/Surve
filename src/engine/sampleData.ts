import { CoordinatePoint, Parcel, ProjectMetadata, NigerianGridBelt } from './types';

export const SAMPLE_PROJECT_METADATA: ProjectMetadata = {
  code: 'CKCEXTEN',
  title: 'FINAL SURVEY DATA FOR C.K.C EXTENSION LAYOUT',
  location: 'GWARKO TOWN, GWAGWALADA AREA COUNCIL - FCT ABUJA',
  surveyFirm: 'C. S. AGHA & ASSOCIATES',
  surveyorName: 'SURV. C. S. AGHA (mnis)',
  surveyorNumber: 'SURV/FCT/2021/042',
  clientName: 'CHIEF K. C. ESTATE DEVELOPMENTS LTD',
  address: 'PLOT 1422, MAITAMA DISTRICT, ABUJA',
  phone: '0803 606 2993',
  date: '2021-04-26',
  gridBelt: NigerianGridBelt.MID_BELT,
  scale: 1000
};

export const SAMPLE_COORDINATES: CoordinatePoint[] = [
  { id: 'PB1736', easting: 294312.450, northing: 992100.125, elevation: 345.20, isControl: true, code: 'CTRL' },
  { id: 'PB1737', easting: 294366.001, northing: 992113.559, elevation: 346.10, isControl: true, code: 'CTRL' },
  { id: 'PB1738', easting: 294350.210, northing: 992080.330, elevation: 345.80, isControl: false, code: 'PB' },
  { id: 'PB1739', easting: 294295.105, northing: 992065.800, elevation: 344.90, isControl: false, code: 'PB' },

  { id: 'PB3076', easting: 294410.500, northing: 992125.000, elevation: 347.00, isControl: false, code: 'PB' },
  { id: 'PB3077', easting: 294395.200, northing: 992090.500, elevation: 346.50, isControl: false, code: 'PB' },

  { id: 'PB201A', easting: 294312.450, northing: 992150.000, elevation: 346.00, isControl: false, code: 'PB' },
  { id: 'PB201B', easting: 294366.001, northing: 992163.559, elevation: 347.10, isControl: false, code: 'PB' },

  { id: 'PB202A', easting: 294410.500, northing: 992175.000, elevation: 348.00, isControl: false, code: 'PB' },
  { id: 'PB202B', easting: 294366.001, northing: 992215.000, elevation: 348.50, isControl: false, code: 'PB' },
  { id: 'PB202C', easting: 294410.500, northing: 992225.000, elevation: 349.20, isControl: false, code: 'PB' },

  { id: 'PB203A', easting: 294250.000, northing: 992080.000, elevation: 343.80, isControl: false, code: 'PB' },
  { id: 'PB203B', easting: 294250.000, northing: 992130.000, elevation: 344.50, isControl: false, code: 'PB' }
];

export const SAMPLE_PARCELS: Parcel[] = [
  {
    id: 'plot-201',
    plotNumber: 'PLOT 201',
    ownerName: 'Alhaji Musa Ibrahim',
    blockNumber: 'BLOCK 4',
    pointIds: ['PB1736', 'PB1737', 'PB1738', 'PB1739'],
    color: '#10b981'
  },
  {
    id: 'plot-202',
    plotNumber: 'PLOT 202',
    ownerName: 'Hadiza Isah',
    blockNumber: 'BLOCK 4',
    pointIds: ['PB1737', 'PB3076', 'PB3077', 'PB1738'],
    color: '#06b6d4'
  },
  {
    id: 'plot-203',
    plotNumber: 'PLOT 203',
    ownerName: 'Dr. Emeka Okafor',
    blockNumber: 'BLOCK 4',
    pointIds: ['PB1736', 'PB201A', 'PB201B', 'PB1737'],
    color: '#8b5cf6'
  },
  {
    id: 'plot-204',
    plotNumber: 'PLOT 204',
    ownerName: 'Engr. Folake Adeleke',
    blockNumber: 'BLOCK 4',
    pointIds: ['PB201B', 'PB202B', 'PB202C', 'PB202A', 'PB3076', 'PB1737'],
    color: '#f59e0b'
  }
];
