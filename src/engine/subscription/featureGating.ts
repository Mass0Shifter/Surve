/**
 * Feature Gating & Subscription Access Control Engine
 * Controls tool permissions, export limits, and tier requirements.
 */

import { SubscriptionTier, UserProfile } from '../auth/authTypes';

export type FeatureId =
  | 'TRAVERSE_BALANCING'
  | 'LEVELING_STUDIO'
  | 'TACHEOMETRY_DTM'
  | 'SETOUT_STAKING'
  | 'DATUM_TRANSFORM'
  | 'ALIGNMENT_STUDIO'
  | 'VERTICAL_ALIGNMENT'
  | 'SUBDIVISION_STUDIO'
  | 'DXF_STUDIO'
  | 'RESECTION_STUDIO'
  | 'TDP_PRINT_STUDIO'
  | 'OFFLINE_BUSH_LICENSE'
  | 'ORGANIZATION_CREATE'
  | 'SURCON_STAMPING'
  | 'LEGACY_BATCH_IMPORT';

export interface FeatureDefinition {
  id: FeatureId;
  name: string;
  minTier: SubscriptionTier;
  tagline: string;
  benefits: string[];
}

export const FEATURE_REGISTRY: Record<FeatureId, FeatureDefinition> = {
  TRAVERSE_BALANCING: {
    id: 'TRAVERSE_BALANCING',
    name: 'Traverse Reduction & Loop Balancing Studio',
    minTier: 'PROFESSIONAL',
    tagline: 'Electronic field book with Bowditch (Compass) and Transit rule mathematical adjustments.',
    benefits: [
      'Automatic angular misclosure & 1:50,000 linear precision verification',
      'Instant adjusted coordinate export to CAD workspace',
      'Electronic DMS field book reduction sheet generator'
    ]
  },
  LEVELING_STUDIO: {
    id: 'LEVELING_STUDIO',
    name: 'Spirit Leveling Field Book & Reduction Studio',
    minTier: 'PROFESSIONAL',
    tagline: 'Height of Collimation (HPC) and Rise & Fall leveling reductions with 3D Z elevation synchronization.',
    benefits: [
      'Automatic arithmetic checks (ΣBS - ΣFS = Last RL - First RL)',
      '1st & 2nd Order engineering closure tolerance verification',
      '1-Click 3D Elevation (Z) injection into CAD beacon database'
    ]
  },
  TACHEOMETRY_DTM: {
    id: 'TACHEOMETRY_DTM',
    name: 'Stadia & Total Station Tacheometry / 3D TIN DTM',
    minTier: 'PROFESSIONAL',
    tagline: 'Reduction of optical theodolite & total station observations into 3D Delaunay TIN surfaces & contours.',
    benefits: [
      'Real-time 3D Delaunay Triangulated Irregular Network (TIN) surface mesh',
      'Vector contour line interpolator with index & intermediate labels',
      'Direct spot height elevation injection into CAD database'
    ]
  },
  SETOUT_STAKING: {
    id: 'SETOUT_STAKING',
    name: 'Setout / Setting-Out Field Staking Engine',
    minTier: 'PROFESSIONAL',
    tagline: 'Polar setting-out computation for Total Stations with real-time CAD canvas staking sightlines.',
    benefits: [
      'Calculates Whole Circle Bearings (WCB), horizontal distance, and vertical angle',
      'Real-time Amber dashed sightlines and peg flags on the CAD canvas',
      'Polar staking schedule CSV export for field crews'
    ]
  },
  DATUM_TRANSFORM: {
    id: 'DATUM_TRANSFORM',
    name: 'Minna ↔ WGS84 Datum Transformation Studio',
    minTier: 'PROFESSIONAL',
    tagline: '3-Parameter Helmert transformation between Nigerian Minna Datum (Clarke 1880) and GPS WGS84.',
    benefits: [
      'Official Nigerian West, Mid, and East Belt UTM coordinate projections',
      'Google Earth .KML export for drone & GIS reconnaissance',
      'Instant geographic Lat/Long conversion'
    ]
  },
  ALIGNMENT_STUDIO: {
    id: 'ALIGNMENT_STUDIO',
    name: 'Road Horizontal Alignment & Earthworks Studio',
    minTier: 'PROFESSIONAL',
    tagline: 'Road centerline circular curve geometry, stationing (0+000), cross-sections, and cut/fill volumes.',
    benefits: [
      'Intersection Point (IP) method with Tangent, Arc Length, Chord, and External distance',
      'Cross-section terrain sampling from 3D DTM surface',
      'Average End Area & Prismoidal earthworks volume calculation'
    ]
  },
  VERTICAL_ALIGNMENT: {
    id: 'VERTICAL_ALIGNMENT',
    name: 'Road Vertical Curve Profile Studio',
    minTier: 'PROFESSIONAL',
    tagline: 'Parabolic sag & crest vertical curves with PVI stationing and longitudinal elevation profile.',
    benefits: [
      'Interactive SVG longitudinal profile elevation plot',
      'Calculates grades g1, g2, algebraic difference A, and K-factors',
      '1-Click 3D Vertical profile elevation injection to CAD beacons'
    ]
  },
  SUBDIVISION_STUDIO: {
    id: 'SUBDIVISION_STUDIO',
    name: 'Area Sub-Division & Land Splitting Engine',
    minTier: 'PROFESSIONAL',
    tagline: 'Parallel boundary cuts and pivot-point polygon partitioning for cadastral layouts.',
    benefits: [
      'Exact Cramer’s Rule parametric polygon intersection solver',
      'Automatic sub-parcel boundary creation & division beacon injection',
      'Subdivision layout schedule report'
    ]
  },
  DXF_STUDIO: {
    id: 'DXF_STUDIO',
    name: 'AutoCAD DXF Import & Export Studio',
    minTier: 'PROFESSIONAL',
    tagline: 'Bidirectional ASCII AutoCAD DXF drawing file parser and generator.',
    benefits: [
      'Imports POINT, LINE, LWPOLYLINE, TEXT entities directly into project',
      'Generates R12/2000 ASCII DXF files for AutoCAD and Civil 3D',
      'Layer filtering and survey beacon coordinate extraction'
    ]
  },
  RESECTION_STUDIO: {
    id: 'RESECTION_STUDIO',
    name: 'Resection & COGO Intersections Studio',
    minTier: 'PROFESSIONAL',
    tagline: 'Tienstra 3-point angular resection, trilateration distance resection, and COGO intersection solvers.',
    benefits: [
      'Solves total station free setup coordinates with standard error residuals',
      'Bearing-Bearing, Distance-Distance, and Bearing-Distance intersection solvers',
      '1-Click injection of solved free station or intersection points to CAD'
    ]
  },
  TDP_PRINT_STUDIO: {
    id: 'TDP_PRINT_STUDIO',
    name: 'Title Deed Plan (TDP) Print & Cadastral Suite',
    minTier: 'PROFESSIONAL',
    tagline: 'Official Nigerian Survey Plan generator for Certificate of Occupancy (C of O).',
    benefits: [
      'Print-ready vector PDF generation with legal borders & grid crosses',
      'Nigerian Cadastral Sheet Number auto-indexing (1:500, 1:1000, 1:2000)',
      'Official SURCON digital seal stamping & registered signature blocks'
    ]
  },
  OFFLINE_BUSH_LICENSE: {
    id: 'OFFLINE_BUSH_LICENSE',
    name: '30-Day Offline Fieldwork Cryptographic License',
    minTier: 'PROFESSIONAL',
    tagline: 'Deploy fully unlocked professional tools in remote bush locations without internet connection.',
    benefits: [
      'Generate 30-day encrypted offline tokens before leaving for site',
      '100% offline access to all engineering calculation studios',
      'No internet required for cadastral calculations and TDP prints'
    ]
  },
  SURCON_STAMPING: {
    id: 'SURCON_STAMPING',
    name: 'Official SURCON Seal & Signature Stamping',
    minTier: 'PROFESSIONAL',
    tagline: 'Embed registered SURCON digital seals and surveyor signatures on survey deliverables.',
    benefits: [
      'Cryptographically verified digital seal placement',
      'Official surveyor registration number branding',
      'Compliance with Surveyors Council of Nigeria (SURCON) standards'
    ]
  },
  ORGANIZATION_CREATE: {
    id: 'ORGANIZATION_CREATE',
    name: 'Multi-User Organization Teams & Workspaces',
    minTier: 'PROFESSIONAL',
    tagline: 'Create shared cadastral firm workspaces and manage team surveyor seats.',
    benefits: [
      'Up to 3 Surveyor Seats (Professional) or 20 Seats (Enterprise)',
      'Shared cloud project library and centralized firm coordinate database',
      'Role-based permissions (Director, Surveyor, Drafter, Assistant)'
    ]
  },
  LEGACY_BATCH_IMPORT: {
    id: 'LEGACY_BATCH_IMPORT',
    name: 'SurvPack Legacy Project Batch Importer',
    minTier: 'ENTERPRISE',
    tagline: 'Batch convert legacy SurvPack 3.0 project archives (.SUR, .DAT, .PNT) into modern workspaces.',
    benefits: [
      'Enterprise batch migration of historical cadastral archives',
      'Automatic coordinate system & Minna Belt projection detection',
      'Consortium shared project repository access'
    ]
  }
};

/** Checks whether a user has access to a specific feature */
export function hasFeatureAccess(
  user: UserProfile | null | undefined,
  featureId: FeatureId
): boolean {
  if (!user) return false;
  const def = FEATURE_REGISTRY[featureId];
  if (!def) return true;

  const tier = user.subscriptionTier || 'COMMUNITY';

  if (tier === 'ENTERPRISE') return true;
  if (tier === 'PROFESSIONAL') {
    return def.minTier !== 'ENTERPRISE';
  }

  // Community Tier
  return def.minTier === 'COMMUNITY';
}

/** Get definition details for a feature */
export function getFeatureDefinition(featureId: FeatureId): FeatureDefinition {
  return FEATURE_REGISTRY[featureId] || {
    id: featureId,
    name: 'Professional Feature',
    minTier: 'PROFESSIONAL',
    tagline: 'This capability requires a Professional or Enterprise subscription.',
    benefits: ['Upgrade your subscription to unlock this feature']
  };
}
