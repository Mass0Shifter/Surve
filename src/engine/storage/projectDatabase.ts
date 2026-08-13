/**
 * Local Project Library Repository (Native IndexedDB with LocalStorage Fallback)
 * Provides high-capacity, robust client-side storage for survey projects (hundreds of megabytes/gigabytes).
 * Manages scoped storage for Personal and Organization Team survey projects.
 */

import { NSurveyBundle, downloadProjectPack } from './nsurvBundle';
import { NigerianGridBelt } from '../types';
import { SAMPLE_PROJECT_METADATA, SAMPLE_COORDINATES, SAMPLE_PARCELS } from '../sampleData';

const DB_NAME = 'NSurvey_Geomatics_DB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
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

// Default seed projects
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
      // Migrate from localStorage if present, else seed
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
  organizationName?: string
): Promise<StoredProject> {
  await ensureInitialized();
  const db = await openDatabase();

  const code = bundle.project.code || `JOB-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
  const pointsCount = bundle.points.length;
  const parcelsCount = bundle.parcels.length;
  const gridBelt = bundle.project.gridBelt || NigerianGridBelt.MID_BELT;

  const existingProjects = await listProjects();
  const existing = existingProjects.find(p => p.code === code && p.ownerUserId === ownerUserId);

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
      id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
    source.organizationName
  );
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
    existingMap.set(`${ep.code}_${ep.ownerUserId}`, ep);
  }

  const savedList: StoredProject[] = [];

  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  for (const bundle of bundles) {
    const code = bundle.project.code || `JOB-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
    const key = `${code}_${ownerUserId}`;
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
