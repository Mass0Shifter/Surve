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
}

export type CadTool = 'select' | 'pan' | 'add_beacon' | 'draw_parcel' | 'measure' | 'inverse';
