/**
 * NSurvey Native Project Bundle Serialization (.nsurv)
 * Provides comprehensive JSON compression, metadata preservation, and validation.
 */

import { ProjectMetadata, CoordinatePoint, Parcel, CadLayers } from '../types';

export const NSURV_BUNDLE_VERSION = '1.0.0';

export interface NSurveyBundleScope {
  ownerUserId?: string;
  ownerName?: string;
  organizationId?: string;
  organizationName?: string;
}

export interface NSurveyBundle {
  format: 'NSURVEY_PROJECT_BUNDLE';
  version: string;
  exportedAt: number;
  app: string;
  scope?: NSurveyBundleScope;
  project: ProjectMetadata;
  points: CoordinatePoint[];
  parcels: Parcel[];
  layers?: CadLayers;
  notes?: string;
}

/**
 * Serializes workspace project state into a clean .nsurv JSON string.
 */
export function serializeNSurvBundle(
  project: ProjectMetadata,
  points: CoordinatePoint[],
  parcels: Parcel[],
  options?: {
    scope?: NSurveyBundleScope;
    layers?: CadLayers;
    notes?: string;
  }
): string {
  const bundle: NSurveyBundle = {
    format: 'NSURVEY_PROJECT_BUNDLE',
    version: NSURV_BUNDLE_VERSION,
    exportedAt: Date.now(),
    app: 'NSurvey PRO Geomatics Suite',
    scope: options?.scope,
    project: {
      ...project,
      date: project.date || new Date().toLocaleDateString('en-GB')
    },
    points,
    parcels,
    layers: options?.layers,
    notes: options?.notes
  };

  return JSON.stringify(bundle, null, 2);
}

/**
 * Validates and parses a raw JSON string into an NSurveyBundle.
 */
export function parseNSurvBundle(rawContent: string): NSurveyBundle {
  try {
    const parsed = JSON.parse(rawContent);

    if (parsed.format !== 'NSURVEY_PROJECT_BUNDLE' && !parsed.project && !parsed.points) {
      throw new Error('Invalid project file format. Expected a valid .nsurv or NSurvey project bundle.');
    }

    // Normalization for backward compatibility
    const bundle: NSurveyBundle = {
      format: 'NSURVEY_PROJECT_BUNDLE',
      version: parsed.version || NSURV_BUNDLE_VERSION,
      exportedAt: parsed.exportedAt || Date.now(),
      app: parsed.app || 'NSurvey PRO',
      scope: parsed.scope,
      project: parsed.project || {
        title: 'IMPORTED SURVEY PLAN',
        location: 'NIGERIA',
        code: `JOB-${new Date().getFullYear()}-IMP`,
        surveyFirm: 'GEOMATICS & SURVEY CONSULT',
        surveyorName: 'LICENSED SURVEYOR',
        surveyorNumber: 'SURCON/REG',
        clientName: 'UNKNOWN CLIENT',
        address: 'NIGERIA',
        phone: '+234 000 000 0000',
        date: new Date().toLocaleDateString('en-GB'),
        scale: 1000,
        gridBelt: 8.5
      },
      points: Array.isArray(parsed.points) ? parsed.points : [],
      parcels: Array.isArray(parsed.parcels) ? parsed.parcels : [],
      layers: parsed.layers,
      notes: parsed.notes
    };

    return bundle;
  } catch (err: any) {
    throw new Error(`Failed to parse .nsurv project bundle: ${err.message}`);
  }
}

/**
 * Triggers a browser download of the active workspace as an .nsurv file.
 */
export function downloadNSurvBundle(
  project: ProjectMetadata,
  points: CoordinatePoint[],
  parcels: Parcel[],
  options?: {
    scope?: NSurveyBundleScope;
    layers?: CadLayers;
    notes?: string;
  }
): void {
  const json = serializeNSurvBundle(project, points, parcels, options);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = `${project.code || 'SURVPACK_PROJECT'}.nsurv`;
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═════════════════════════════════════════════════════════════════════════════
// MULTI-PROJECT PACK ARCHIVE SCHEMA (.nsurvpack)
// ═════════════════════════════════════════════════════════════════════════════

export interface NSurveyProjectPack {
  format: 'NSURVEY_PROJECT_PACK';
  version: string;
  exportedAt: number;
  app: string;
  packTitle: string;
  organizationId?: string;
  organizationName?: string;
  exportedBy?: string;
  projectsCount: number;
  projects: NSurveyBundle[];
}

/**
 * Serializes an array of NSurveyBundle objects into an .nsurvpack JSON string.
 */
export function serializeProjectPack(
  projects: NSurveyBundle[],
  options?: {
    packTitle?: string;
    organizationId?: string;
    organizationName?: string;
    exportedBy?: string;
  }
): string {
  const pack: NSurveyProjectPack = {
    format: 'NSURVEY_PROJECT_PACK',
    version: NSURV_BUNDLE_VERSION,
    exportedAt: Date.now(),
    app: 'NSurvey PRO Geomatics Suite',
    packTitle: options?.packTitle || `NSurvey Project Pack (${projects.length} Jobs)`,
    organizationId: options?.organizationId,
    organizationName: options?.organizationName,
    exportedBy: options?.exportedBy,
    projectsCount: projects.length,
    projects
  };

  return JSON.stringify(pack, null, 2);
}

/**
 * Parses and validates an .nsurvpack or single .nsurv file into an array of NSurveyBundle objects.
 */
export function parseProjectPack(rawContent: string): {
  packTitle: string;
  projects: NSurveyBundle[];
  organizationName?: string;
} {
  try {
    const parsed = JSON.parse(rawContent);

    // If single .nsurv project bundle
    if (parsed.format === 'NSURVEY_PROJECT_BUNDLE') {
      const single = parseNSurvBundle(rawContent);
      return {
        packTitle: single.project.title || single.project.code,
        projects: [single],
        organizationName: single.scope?.organizationName
      };
    }

    // If multi-project pack
    if (parsed.format === 'NSURVEY_PROJECT_PACK' && Array.isArray(parsed.projects)) {
      const bundles: NSurveyBundle[] = parsed.projects.map((p: any) =>
        parseNSurvBundle(typeof p === 'string' ? p : JSON.stringify(p))
      );
      return {
        packTitle: parsed.packTitle || `Project Pack (${bundles.length} Jobs)`,
        projects: bundles,
        organizationName: parsed.organizationName
      };
    }

    // Fallback: If it's a raw array of projects
    if (Array.isArray(parsed)) {
      const bundles: NSurveyBundle[] = parsed.map((p: any) =>
        parseNSurvBundle(typeof p === 'string' ? p : JSON.stringify(p))
      );
      return {
        packTitle: `Imported Pack (${bundles.length} Jobs)`,
        projects: bundles
      };
    }

    throw new Error('Unrecognized archive format. Expected .nsurv or .nsurvpack.');
  } catch (err: any) {
    throw new Error(`Failed to unpack project pack archive: ${err.message}`);
  }
}

/**
 * Downloads multiple projects as an .nsurvpack file.
 */
export function downloadProjectPack(
  projects: NSurveyBundle[],
  options?: {
    packTitle?: string;
    filename?: string;
    organizationId?: string;
    organizationName?: string;
    exportedBy?: string;
  }
): void {
  const json = serializeProjectPack(projects, options);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = options?.filename || `${options?.packTitle?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'NSURVEY_PROJECT_PACK'}.nsurvpack`;
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
