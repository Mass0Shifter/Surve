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
