/**
 * Local Project Library Repository (IndexedDB & LocalStorage Hybrid)
 * Manages scoped storage for Personal and Organization Team survey projects.
 */

import { NSurveyBundle } from './nsurvBundle';
import { NigerianGridBelt } from '../types';
import { SAMPLE_PROJECT_METADATA, SAMPLE_COORDINATES, SAMPLE_PARCELS } from '../sampleData';

const LIBRARY_STORAGE_KEY = 'nsurvey_project_library_v1';

export interface StoredProject {
  id: string;
  title: string;
  code: string;
  clientName: string;
  location: string;
  surveyFirm: string;
  surveyorName: string;
  ownerUserId: string;
  organizationId?: string;
  organizationName?: string;
  pointsCount: number;
  parcelsCount: number;
  gridBelt: NigerianGridBelt;
  bundle: NSurveyBundle;
  createdAt: number;
  updatedAt: number;
}

// Default seed projects for demonstration
const SEED_LIBRARY_PROJECTS: StoredProject[] = [
  {
    id: 'proj_seed_abuja_001',
    title: 'ABUJA CENTRAL CADASTRAL BOUNDARY',
    code: 'JOB-2026-603',
    clientName: 'FEDERAL HOUSING AUTHORITY',
    location: 'CBD, FCT ABUJA',
    surveyFirm: 'GEOTREK SURVEY & ENGINEERING SERVICES LTD',
    surveyorName: 'SURV. (DR.) PRECIOUS CHIKEZIE',
    ownerUserId: 'usr_pro_001',
    organizationId: 'org_geotrek_001',
    organizationName: 'Geotrek Survey & Engineering Services Ltd',
    pointsCount: SAMPLE_COORDINATES.length,
    parcelsCount: SAMPLE_PARCELS.length,
    gridBelt: NigerianGridBelt.MID_BELT,
    bundle: {
      format: 'NSURVEY_PROJECT_BUNDLE',
      version: '1.0.0',
      exportedAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
      app: 'NSurvey PRO',
      scope: {
        ownerUserId: 'usr_pro_001',
        ownerName: 'Surv. (Dr.) Precious Chikezie',
        organizationId: 'org_geotrek_001',
        organizationName: 'Geotrek Survey & Engineering Services Ltd'
      },
      project: SAMPLE_PROJECT_METADATA,
      points: SAMPLE_COORDINATES,
      parcels: SAMPLE_PARCELS
    },
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 2
  },
  {
    id: 'proj_seed_lekki_002',
    title: 'LEKKI PHASE 1 RESIDENTIAL PERIMETER',
    code: 'JOB-2026-104',
    clientName: 'CHIEF E. A. OKAFOR',
    location: 'ETI-OSA LGA, LAGOS STATE',
    surveyFirm: 'GEOMATICS & SURVEY ASSOCIATES',
    surveyorName: 'SURV. CHIEF O. C. EZE',
    ownerUserId: 'usr_pro_001',
    pointsCount: 8,
    parcelsCount: 1,
    gridBelt: NigerianGridBelt.WEST_BELT,
    bundle: {
      format: 'NSURVEY_PROJECT_BUNDLE',
      version: '1.0.0',
      exportedAt: Date.now() - 1000 * 60 * 60 * 24 * 15,
      app: 'NSurvey PRO',
      scope: {
        ownerUserId: 'usr_pro_001',
        ownerName: 'Surv. (Dr.) Precious Chikezie'
      },
      project: {
        title: 'LEKKI PHASE 1 RESIDENTIAL PERIMETER',
        location: 'ETI-OSA LGA, LAGOS STATE',
        code: 'JOB-2026-104',
        surveyFirm: 'GEOMATICS & SURVEY ASSOCIATES',
        surveyorName: 'SURV. CHIEF O. C. EZE',
        surveyorNumber: 'SURCON/REG/2014/4891',
        clientName: 'CHIEF E. A. OKAFOR',
        address: 'LAGOS STATE, NIGERIA',
        phone: '+234 802 333 4455',
        date: '10/01/2026',
        scale: 500,
        gridBelt: NigerianGridBelt.WEST_BELT
      },
      points: [
        { id: 'SC1', easting: 284100.25, northing: 712050.8, code: 'PB' },
        { id: 'SC2', easting: 284220.6, northing: 712065.12, code: 'PB' },
        { id: 'SC3', easting: 284240.15, northing: 711950.45, code: 'PB' },
        { id: 'SC4', easting: 284115.8, northing: 711935.2, code: 'PB' }
      ],
      parcels: [
        {
          id: 'parcel_lekki_01',
          plotNumber: 'PLOT 12, BLOCK 4',
          pointIds: ['SC1', 'SC2', 'SC3', 'SC4'],
          ownerName: 'CHIEF E. A. OKAFOR',
          color: '#10b981'
        }
      ]
    },
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 20,
    updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 14
  }
];

function getStoredProjects(): StoredProject[] {
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(SEED_LIBRARY_PROJECTS));
      return SEED_LIBRARY_PROJECTS;
    }
    return JSON.parse(raw);
  } catch {
    return SEED_LIBRARY_PROJECTS;
  }
}

function saveProjects(projects: StoredProject[]): void {
  try {
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(projects));
    window.dispatchEvent(new CustomEvent('nsurvey_library_changed'));
  } catch (err) {
    console.error('Failed to save project library database', err);
  }
}

// ─── Query Operations ─────────────────────────────────────────────────────────

export async function listProjects(filter?: {
  userId?: string;
  organizationId?: string;
  search?: string;
  scopeTab?: 'all' | 'personal' | 'organization';
}): Promise<StoredProject[]> {
  const projects = getStoredProjects();
  let filtered = projects;

  if (filter?.scopeTab === 'personal' && filter?.userId) {
    filtered = filtered.filter(p => !p.organizationId && p.ownerUserId === filter.userId);
  } else if (filter?.scopeTab === 'organization' && filter?.organizationId) {
    filtered = filtered.filter(p => p.organizationId === filter.organizationId);
  }

  if (filter?.search) {
    const q = filter.search.toLowerCase();
    filtered = filtered.filter(
      p =>
        p.title.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q)
    );
  }

  return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProjectFromLibrary(projectId: string): Promise<StoredProject | null> {
  const projects = getStoredProjects();
  return projects.find(p => p.id === projectId) || null;
}

// ─── Mutation Operations ──────────────────────────────────────────────────────

export async function saveProjectToLibrary(
  bundle: NSurveyBundle,
  ownerUserId: string,
  organizationId?: string,
  organizationName?: string
): Promise<StoredProject> {
  const projects = getStoredProjects();
  const existingIdx = projects.findIndex(p => p.code === bundle.project.code && p.ownerUserId === ownerUserId);

  const pointsCount = bundle.points.length;
  const parcelsCount = bundle.parcels.length;
  const gridBelt = bundle.project.gridBelt || NigerianGridBelt.MID_BELT;

  if (existingIdx !== -1) {
    // Update existing project
    const existing = projects[existingIdx];
    existing.title = bundle.project.title;
    existing.clientName = bundle.project.clientName || 'UNKNOWN CLIENT';
    existing.location = bundle.project.location || 'NIGERIA';
    existing.surveyFirm = bundle.project.surveyFirm || '';
    existing.surveyorName = bundle.project.surveyorName || '';
    existing.organizationId = organizationId || existing.organizationId;
    existing.organizationName = organizationName || existing.organizationName;
    existing.pointsCount = pointsCount;
    existing.parcelsCount = parcelsCount;
    existing.gridBelt = gridBelt;
    existing.bundle = bundle;
    existing.updatedAt = Date.now();

    projects[existingIdx] = existing;
    saveProjects(projects);
    return existing;
  } else {
    // Create new project entry
    const newProject: StoredProject = {
      id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: bundle.project.title || 'UNTITLED SURVEY PLAN',
      code: bundle.project.code || `JOB-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      clientName: bundle.project.clientName || 'NEW CLIENT',
      location: bundle.project.location || 'NIGERIA',
      surveyFirm: bundle.project.surveyFirm || '',
      surveyorName: bundle.project.surveyorName || '',
      ownerUserId,
      organizationId,
      organizationName,
      pointsCount,
      parcelsCount,
      gridBelt,
      bundle,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    projects.unshift(newProject);
    saveProjects(projects);
    return newProject;
  }
}

export async function deleteProjectFromLibrary(projectId: string): Promise<boolean> {
  const projects = getStoredProjects();
  const filtered = projects.filter(p => p.id !== projectId);
  if (filtered.length !== projects.length) {
    saveProjects(filtered);
    return true;
  }
  return false;
}

export async function cloneProjectInLibrary(
  projectId: string,
  newTitle: string,
  currentUserId: string
): Promise<StoredProject> {
  const source = await getProjectFromLibrary(projectId);
  if (!source) throw new Error('Source project not found in library.');

  const clonedBundle: NSurveyBundle = JSON.parse(JSON.stringify(source.bundle));
  clonedBundle.project.title = newTitle;
  clonedBundle.project.code = `JOB-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;

  return saveProjectToLibrary(
    clonedBundle,
    currentUserId,
    source.organizationId,
    source.organizationName
  );
}
