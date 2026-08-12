export interface CoordinatePoint {
  id: string;
  easting: number;
  northing: number;
  elevation?: number;
  code?: string;
  description?: string;
  isControl?: boolean;
}

export interface DMSAngle {
  degrees: number;
  minutes: number;
  seconds: number;
  decimalDegrees: number;
  formatted: string; // e.g. 142° 35' 20.4"
}

export interface BearingDistance {
  fromPoint: CoordinatePoint;
  toPoint: CoordinatePoint;
  deltaEasting: number;
  deltaNorthing: number;
  distance: number;
  bearing: DMSAngle;
}

export interface Parcel {
  id: string;
  plotNumber: string;
  ownerName?: string;
  blockNumber?: string;
  pointIds: string[]; // Order of vertices
  color?: string;
}

export interface ParcelComputationResult {
  parcel: Parcel;
  vertices: CoordinatePoint[];
  areaSquareMeters: number;
  areaHectares: number;
  perimeter: number;
  isClosed: boolean;
  closureMisclose: number;
  legs: BearingDistance[];
}

export enum NigerianGridBelt {
  WEST_BELT = 4.5,
  MID_BELT = 8.5,
  EAST_BELT = 12.5
}

export interface ProjectMetadata {
  code: string;
  title: string;
  location: string;
  surveyFirm: string;
  surveyorName: string;
  surveyorNumber: string;
  clientName: string;
  address: string;
  phone: string;
  date: string;
  gridBelt: NigerianGridBelt;
  scale: number; // e.g. 1000 for 1:1000
}

export interface CadLayers {
  beacons: boolean;
  beaconLabels: boolean;
  coordinates: boolean;
  boundaryLines: boolean;
  bearings: boolean;
  distances: boolean;
  parcelFill: boolean;
  gridCrosses: boolean;
  controls: boolean;
  // DTM / Contour Layer
  contours: boolean;
  contourInterval: number;       // metres between contour lines, e.g. 2
  majorContourEvery: number;     // every N minor contours is a major, e.g. 5
  showContourLabels: boolean;
  // Road Alignment Layer
  alignments: boolean;
  chainages: boolean;
}

export type CadTool = 'select' | 'pan' | 'add_beacon' | 'draw_parcel' | 'measure' | 'inverse';

export interface HistorySnapshot {
  points: CoordinatePoint[];
  parcels: Parcel[];
  project: ProjectMetadata;
  description: string;
  timestamp?: number;
}

/** Live setout overlay drawn on the CAD canvas while SetoutStudio is open */
export interface SetoutOverlay {
  stationEasting: number;
  stationNorthing: number;
  targets: Array<{ easting: number; northing: number; label: string }>;
}

/** Horizontal alignment overlay rendered on CAD canvas */
export interface AlignmentOverlay {
  tangentSegments: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  curveArcs: Array<{
    centerX: number;
    centerY: number;
    radius: number;
    startAngleRad: number;
    endAngleRad: number;
    counterClockwise: boolean;
  }>;
  chainagePoints: Array<{
    chainageStr: string;
    easting: number;
    northing: number;
    isTangentPoint?: boolean;
    label?: string;
  }>;
}
