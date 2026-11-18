/**
 * Local Project Library Repository (Native IndexedDB with Session Persistence)
 * Provides high-capacity, robust client-side storage for survey projects (hundreds of megabytes/gigabytes).
 * Manages scoped storage for Personal and Organization Team survey projects.
 */

import { NSurveyBundle, downloadProjectPack } from './nsurvBundle';
import { NigerianGridBelt, ProjectMetadata, CoordinatePoint, Parcel, CadLayers, TdpProjectConfig } from '../types';
import { SAMPLE_PROJECT_METADATA, SAMPLE_COORDINATES, SAMPLE_PARCELS } from '../sampleData';

const DB_NAME = 'NSurvey_Geomatics_DB';
const DB_VERSION = 2;
const STORE_NAME = 'projects';
const SESSION_STORE_NAME = 'active_session';
const LEGACY_STORAGE_KEY = 'nsurvey_project_library_v1';

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

export interface ActiveSessionState {
  id: string; // 'current_workspace'
  project: ProjectMetadata;
  points: CoordinatePoint[];
  parcels: Parcel[];
  tdpConfig?: TdpProjectConfig;
  currentLoadedProjectId?: string | null;
  savedAt: number;
}

// A single neutral sample project, visible to every user, so the library isn't empty on first run.
const SEED_LIBRARY_PROJECTS: StoredProject[] = [
  {
    id: 'proj_sample_001',
    title: SAMPLE_PROJECT_METADATA.title,
    code: SAMPLE_PROJECT_METADATA.code,
    clientName: SAMPLE_PROJECT_METADATA.clientName,
    location: SAMPLE_PROJECT_METADATA.location,
    surveyFirm: SAMPLE_PROJECT_METADATA.surveyFirm,
    surveyorName: SAMPLE_PROJECT_METADATA.surveyorName,
    ownerUserId: 'guest',
    pointsCount: SAMPLE_COORDINATES.length,
    parcelsCount: SAMPLE_PARCELS.length,
    gridBelt: NigerianGridBelt.MID_BELT,
    bundle: {
      format: 'NSURVEY_PROJECT_BUNDLE',
      version: '1.0.0',
      exportedAt: Date.now(),
      app: 'NSurvey PRO',
      scope: { ownerUserId: 'guest', ownerName: 'Sample' },
      project: SAMPLE_PROJECT_METADATA,
      points: SAMPLE_COORDINATES,
      parcels: SAMPLE_PARCELS
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

/**
 * Opens and initializes the IndexedDB database instance.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('code', 'code', { unique: false });
        store.createIndex('ownerUserId', 'ownerUserId', { unique: false });
        store.createIndex('organizationId', 'organizationId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
        db.createObjectStore(SESSION_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

let isMigrated = false;

/**
 * Performs one-time migration from localStorage / seeds to IndexedDB.
 */
async function ensureInitialized(): Promise<void> {
  if (isMigrated) return;
  try {
    const db = await openDatabase();
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (count === 0) {
      let initialProjects = SEED_LIBRARY_PROJECTS;
      try {
        const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            initialProjects = parsed;
          }
        }
      } catch (e) {
        console.warn('Could not read legacy localStorage projects:', e);
      }

      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const p of initialProjects) {
        store.put(p);
      }
      await new Promise((resolve) => {
        tx.oncomplete = resolve;
      });
    }

    isMigrated = true;
  } catch (err) {
    console.error('Error initializing NSurvey IndexedDB:', err);
  }
}

/**
 * Dispatches a reactive update event across the application.
 */
function notifyLibraryChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nsurvey_library_changed'));
  }
}

// ─── Query Operations ─────────────────────────────────────────────────────────

export async function listProjects(filter?: {
  userId?: string;
  organizationId?: string;
  search?: string;
  scopeTab?: 'all' | 'personal' | 'organization';
}): Promise<StoredProject[]> {
  await ensureInitialized();
  try {
    const db = await openDatabase();
    const allProjects: StoredProject[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    let filtered = allProjects;

    if (filter?.scopeTab === 'personal') {
      // Include projects belonging to the user or unassigned guest projects
      filtered = filtered.filter(p => !p.organizationId && (!filter.userId || p.ownerUserId === filter.userId || p.ownerUserId === 'guest' || !p.ownerUserId));
    } else if (filter?.scopeTab === 'organization' && filter?.organizationId) {
      filtered = filtered.filter(p => p.organizationId === filter.organizationId);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase().trim();
      filtered = filtered.filter(
        p =>
          p.title.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          p.clientName.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q)
      );
    }

    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.error('Failed to list projects from IndexedDB:', err);
    return [];
  }
}

export async function getProjectFromLibrary(projectId: string): Promise<StoredProject | null> {
  await ensureInitialized();
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(projectId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error(`Failed to get project "${projectId}" from IndexedDB:`, err);
    return null;
  }
}

// ─── Mutation Operations ──────────────────────────────────────────────────────

export async function saveProjectToLibrary(
  bundle: NSurveyBundle,
  ownerUserId: string,
  organizationId?: string,
  organizationName?: string,
  existingProjectId?: string | null
): Promise<StoredProject> {
  await ensureInitialized();
  const db = await openDatabase();

  const code = (bundle.project.code || `JOB-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`).trim();
  const pointsCount = bundle.points.length;
  const parcelsCount = bundle.parcels.length;
  const gridBelt = bundle.project.gridBelt || NigerianGridBelt.MID_BELT;

  const existingProjects = await listProjects();
  let existing: StoredProject | undefined;

  // 1. If explicit projectId provided, find exact record
  if (existingProjectId) {
    existing = existingProjects.find(p => p.id === existingProjectId);
  }

  // 2. Fallback: match by code + ownership only if no explicit ID
  if (!existing && code) {
    existing = existingProjects.find(
      p => p.code.toUpperCase() === code.toUpperCase() &&
      (p.ownerUserId === ownerUserId || p.ownerUserId === 'guest' || (organizationId && p.organizationId === organizationId))
    );
  }

  let projectToSave: StoredProject;

  if (existing) {
    projectToSave = {
      ...existing,
      title: bundle.project.title || existing.title,
      code: code || existing.code,
      clientName: bundle.project.clientName || existing.clientName || 'UNKNOWN CLIENT',
      location: bundle.project.location || existing.location || 'NIGERIA',
      surveyFirm: bundle.project.surveyFirm || existing.surveyFirm || '',
      surveyorName: bundle.project.surveyorName || existing.surveyorName || '',
      ownerUserId: ownerUserId || existing.ownerUserId,
      organizationId: organizationId || undefined,
      organizationName: organizationName || undefined,
      pointsCount,
      parcelsCount,
      gridBelt,
      bundle,
      updatedAt: Date.now()
    };
  } else {
    projectToSave = {
      id: existingProjectId || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${Math.floor(Math.random() * 1000)}`,
      title: bundle.project.title || 'UNTITLED SURVEY PLAN',
      code,
      clientName: bundle.project.clientName || 'NEW CLIENT',
      location: bundle.project.location || 'NIGERIA',
      surveyFirm: bundle.project.surveyFirm || '',
      surveyorName: bundle.project.surveyorName || '',
      ownerUserId,
      organizationId: organizationId || undefined,
      organizationName: organizationName || undefined,
      pointsCount,
      parcelsCount,
      gridBelt,
      bundle,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  if (projectToSave.bundle && projectToSave.bundle.scope) {
    projectToSave.bundle.scope.organizationId = organizationId || undefined;
    projectToSave.bundle.scope.organizationName = organizationName || undefined;
    if (ownerUserId) projectToSave.bundle.scope.ownerUserId = ownerUserId;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(projectToSave);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  notifyLibraryChanged();
  return projectToSave;
}

export async function deleteProjectFromLibrary(projectId: string): Promise<boolean> {
  await ensureInitialized();
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(projectId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    notifyLibraryChanged();
    return true;
  } catch (err) {
    console.error(`Failed to delete project "${projectId}":`, err);
    return false;
  }
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
    source.organizationName,
    null // Force new ID
  );
}

/**
 * Transfers a project between Personal Scope and Organization Scope in-place.
 */
export async function transferProjectScope(
  projectId: string,
  targetOrgId: string | null,
  targetOrgName?: string
): Promise<StoredProject> {
  const project = await getProjectFromLibrary(projectId);
  if (!project) throw new Error('Project not found in library.');

  project.organizationId = targetOrgId || undefined;
  project.organizationName = targetOrgName || undefined;
  if (project.bundle.scope) {
    project.bundle.scope.organizationId = targetOrgId || undefined;
    project.bundle.scope.organizationName = targetOrgName || undefined;
  }
  project.updatedAt = Date.now();

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(project);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  notifyLibraryChanged();
  return project;
}

/**
 * Batch saves multiple NSurveyBundle objects into IndexedDB in a single transaction.
 */
export async function batchSaveProjectsToLibrary(
  bundles: NSurveyBundle[],
  ownerUserId: string,
  organizationId?: string,
  organizationName?: string
): Promise<StoredProject[]> {
  await ensureInitialized();
  const db = await openDatabase();
  const existingProjects = await listProjects();
  const existingMap = new Map<string, StoredProject>();
  for (const ep of existingProjects) {
    existingMap.set(`${ep.code.toUpperCase()}_${ep.ownerUserId}`, ep);
  }

  const savedList: StoredProject[] = [];

  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  for (const bundle of bundles) {
    const code = (bundle.project.code || `JOB-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`).trim();
    const key = `${code.toUpperCase()}_${ownerUserId}`;
    const existing = existingMap.get(key);

    const pointsCount = bundle.points.length;
    const parcelsCount = bundle.parcels.length;
    const gridBelt = bundle.project.gridBelt || NigerianGridBelt.MID_BELT;

    let projectToSave: StoredProject;

    if (existing) {
      projectToSave = {
        ...existing,
        title: bundle.project.title,
        clientName: bundle.project.clientName || 'UNKNOWN CLIENT',
        location: bundle.project.location || 'NIGERIA',
        surveyFirm: bundle.project.surveyFirm || '',
        surveyorName: bundle.project.surveyorName || '',
        organizationId: organizationId || existing.organizationId,
        organizationName: organizationName || existing.organizationName,
        pointsCount,
        parcelsCount,
        gridBelt,
        bundle,
        updatedAt: Date.now()
      };
    } else {
      projectToSave = {
        id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${Math.floor(Math.random() * 1000)}`,
        title: bundle.project.title || 'UNTITLED SURVEY PLAN',
        code,
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
    }

    store.put(projectToSave);
    savedList.push(projectToSave);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Transaction aborted'));
  });

  notifyLibraryChanged();
  return savedList;
}

/**
 * Exports all stored projects matching a scope into an .nsurvpack multi-project file.
 */
export async function exportProjectLibraryPack(options?: {
  scopeTab?: 'all' | 'personal' | 'organization';
  userId?: string;
  organizationId?: string;
  organizationName?: string;
}): Promise<void> {
  const projects = await listProjects({
    userId: options?.userId,
    organizationId: options?.organizationId,
    scopeTab: options?.scopeTab
  });

  if (projects.length === 0) {
    alert('No projects available in the selected scope to export.');
    return;
  }

  const bundles: NSurveyBundle[] = projects.map(p => p.bundle);
  const scopeTitle = options?.scopeTab === 'organization' && options?.organizationName
    ? `${options.organizationName} Firm Repository`
    : options?.scopeTab === 'personal'
    ? 'Personal Project Repository'
    : 'Full Survey Library';

  downloadProjectPack(bundles, {
    packTitle: scopeTitle,
    filename: `NSURVEY_${scopeTitle.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.nsurvpack`,
    organizationId: options?.organizationId,
    organizationName: options?.organizationName
  });
}

/**
 * In-place update of an existing library project record (used by auto-save when editing a loaded project).
 */
export async function updateProjectInLibrary(
  projectId: string,
  data: {
    project?: ProjectMetadata;
    points?: CoordinatePoint[];
    parcels?: Parcel[];
    tdpConfig?: TdpProjectConfig;
    layers?: CadLayers;
  }
): Promise<StoredProject | null> {
  await ensureInitialized();
  try {
    const db = await openDatabase();
    const existing = await getProjectFromLibrary(projectId);
    if (!existing) return null;

    const updatedBundle: NSurveyBundle = {
      ...existing.bundle,
      project: data.project || existing.bundle.project,
      points: data.points || existing.bundle.points,
      parcels: data.parcels || existing.bundle.parcels,
      layers: data.layers !== undefined ? data.layers : existing.bundle.layers,
      tdpConfig: data.tdpConfig !== undefined ? data.tdpConfig : existing.bundle.tdpConfig
    };

    const updatedProject: StoredProject = {
      ...existing,
      title: updatedBundle.project.title || existing.title,
      code: updatedBundle.project.code || existing.code,
      clientName: updatedBundle.project.clientName || existing.clientName,
      location: updatedBundle.project.location || existing.location,
      surveyFirm: updatedBundle.project.surveyFirm || existing.surveyFirm,
      surveyorName: updatedBundle.project.surveyorName || existing.surveyorName,
      pointsCount: updatedBundle.points.length,
      parcelsCount: updatedBundle.parcels.length,
      gridBelt: updatedBundle.project.gridBelt || existing.gridBelt,
      bundle: updatedBundle,
      updatedAt: Date.now()
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(updatedProject);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    notifyLibraryChanged();
    return updatedProject;
  } catch (err) {
    console.warn(`Failed to update project "${projectId}" in IndexedDB:`, err);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ACTIVE WORKSPACE SESSION PERSISTENCE (High-Capacity Recovery Buffer)
// ═════════════════════════════════════════════════════════════════════════════

export async function saveActiveSessionState(session: {
  project: ProjectMetadata;
  points: CoordinatePoint[];
  parcels: Parcel[];
  tdpConfig?: TdpProjectConfig;
  currentLoadedProjectId?: string | null;
}): Promise<void> {
  try {
    const db = await openDatabase();
    const record: ActiveSessionState = {
      id: 'current_workspace',
      project: session.project,
      points: session.points,
      parcels: session.parcels,
      tdpConfig: session.tdpConfig,
      currentLoadedProjectId: session.currentLoadedProjectId,
      savedAt: Date.now()
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE_NAME, 'readwrite');
      const store = tx.objectStore(SESSION_STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save active session state to IndexedDB:', err);
  }
}

export async function loadActiveSessionState(): Promise<ActiveSessionState | null> {
  try {
    const db = await openDatabase();
    return await new Promise<ActiveSessionState | null>((resolve, reject) => {
      const tx = db.transaction(SESSION_STORE_NAME, 'readonly');
      const store = tx.objectStore(SESSION_STORE_NAME);
      const req = store.get('current_workspace');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
