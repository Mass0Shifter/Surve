import React, { useState, useEffect, useRef } from 'react';
import {
  StoredProject,
  listProjects,
  deleteProjectFromLibrary,
  cloneProjectInLibrary,
  saveProjectToLibrary,
  batchSaveProjectsToLibrary,
  exportProjectLibraryPack
} from '../../engine/storage/projectDatabase';
import {
  NSurveyBundle,
  parseNSurvBundle,
  downloadNSurvBundle,
  parseProjectPack
} from '../../engine/storage/nsurvBundle';
import { ProjectMetadata, CoordinatePoint, Parcel } from '../../engine/types';
import { UserProfile } from '../../engine/auth/authTypes';
import { Organization } from '../../engine/organization/orgTypes';
import {
  FolderKanban,
  Search,
  Plus,
  Upload,
  Download,
  Copy,
  Trash2,
  ExternalLink,
  Save,
  Building2,
  User,
  Layers,
  MapPin,
  Calendar,
  Compass,
  CheckCircle2,
  AlertCircle,
  Archive
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface ProjectLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: ProjectMetadata;
  currentPoints: CoordinatePoint[];
  currentParcels: Parcel[];
  currentUser: UserProfile | null;
  activeOrg: Organization | null;
  onLoadProject: (bundle: NSurveyBundle) => void;
  onNewProject: () => void;
}

export const ProjectLibraryModal: React.FC<ProjectLibraryModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  currentPoints,
  currentParcels,
  currentUser,
  activeOrg,
  onLoadProject,
  onNewProject
}) => {
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [scopeTab, setScopeTab] = useState<'all' | 'personal' | 'organization'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const packInputRef = useRef<HTMLInputElement | null>(null);

  const refreshList = async () => {
    setLoading(true);
    try {
      const list = await listProjects({
        userId: currentUser?.id,
        organizationId: activeOrg?.id,
        search: searchQuery,
        scopeTab
      });
      setProjects(list);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshList();
    }
  }, [isOpen, scopeTab, searchQuery, currentUser, activeOrg]);

  useEffect(() => {
    const handleLibraryChanged = () => {
      if (isOpen) {
        refreshList();
      }
    };
    window.addEventListener('nsurvey_library_changed', handleLibraryChanged);
    return () => window.removeEventListener('nsurvey_library_changed', handleLibraryChanged);
  }, [isOpen, scopeTab, searchQuery, currentUser, activeOrg]);

  if (!isOpen) return null;

  const handleSaveCurrentWorkspace = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const bundle: NSurveyBundle = {
        format: 'NSURVEY_PROJECT_BUNDLE',
        version: '1.0.0',
        exportedAt: Date.now(),
        app: 'NSurvey PRO',
        scope: {
          ownerUserId: currentUser?.id || 'guest',
          ownerName: currentUser ? `${currentUser.title || ''} ${currentUser.fullName}`.trim() : 'Guest Surveyor',
          organizationId: activeOrg?.id,
          organizationName: activeOrg?.name
        },
        project: currentProject,
        points: currentPoints,
        parcels: currentParcels
      };

      const saved = await saveProjectToLibrary(
        bundle,
        currentUser?.id || 'guest',
        activeOrg?.id,
        activeOrg?.name
      );

      setSuccessMsg(`Project "${saved.title}" (${saved.code}) saved to library!`);
      refreshList();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportNSurvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = ev.target?.result as string;
        const bundle = parseNSurvBundle(raw);

        // Auto save to library
        const saved = await saveProjectToLibrary(
          bundle,
          currentUser?.id || 'guest',
          activeOrg?.id,
          activeOrg?.name
        );

        setSuccessMsg(`Imported "${saved.title}" (${saved.code}) successfully!`);
        refreshList();
      } catch (err: any) {
        setErrorMsg(`Failed to import .nsurv: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportPackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const raw = ev.target?.result as string;
        const { packTitle, projects: unpackedBundles } = parseProjectPack(raw);

        const saved = await batchSaveProjectsToLibrary(
          unpackedBundles,
          currentUser?.id || 'guest',
          activeOrg?.id,
          activeOrg?.name
        );

        setSuccessMsg(`Successfully imported ${saved.length} projects from "${packTitle}"!`);
        refreshList();
      } catch (err: any) {
        setErrorMsg(`Failed to import project pack: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportLibraryPack = async () => {
    try {
      await exportProjectLibraryPack({
        scopeTab,
        userId: currentUser?.id,
        organizationId: activeOrg?.id,
        organizationName: activeOrg?.name
      });
      setSuccessMsg('Project Pack exported successfully!');
    } catch (err: any) {
      setErrorMsg(`Export failed: ${err.message}`);
    }
  };

  const handleOpenProjectInWorkspace = (p: StoredProject) => {
    if (currentPoints.length > 0) {
      if (!confirm(`Switch workspace to "${p.title}"? Any unsaved changes in current workspace should be saved first.`)) {
        return;
      }
    }
    onLoadProject(p.bundle);
    onClose();
  };

  const handleCloneProject = async (p: StoredProject) => {
    const newTitle = prompt('Enter title for cloned project duplicate:', `${p.title} (COPY)`);
    if (!newTitle) return;

    try {
      const cloned = await cloneProjectInLibrary(p.id, newTitle, currentUser?.id || 'guest');
      setSuccessMsg(`Project cloned as "${cloned.title}"!`);
      refreshList();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleDeleteProject = async (p: StoredProject) => {
    if (!confirm(`Are you sure you want to delete "${p.title}" (${p.code}) from your library?`)) return;

    try {
      await deleteProjectFromLibrary(p.id);
      setSuccessMsg(`Deleted "${p.title}" from library.`);
      refreshList();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleExportNSurv = (p: StoredProject) => {
    downloadNSurvBundle(p.bundle.project, p.bundle.points, p.bundle.parcels, {
      scope: p.bundle.scope,
      layers: p.bundle.layers
    });
  };

  return (
    <ErrorBoundary>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content library-modal-box" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="auth-modal-header">
            <div className="auth-badge-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              <FolderKanban size={22} className="text-emerald" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 className="auth-title">Project Library &amp; Repositories</h2>
                <span className="proj-code-badge" style={{ fontSize: '10px' }}>
                  {loading ? 'Loading...' : `${projects.length} ${projects.length === 1 ? 'Project' : 'Projects'}`}
                </span>
              </div>
              <p className="auth-subtitle">
                Manage, backup, export multi-project packs (.nsurvpack), and collaborate across survey teams.
              </p>
            </div>
            <button className="icon-btn auth-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* Controls Bar */}
          <div className="library-toolbar">
            {/* Search */}
            <div className="library-search-box">
              <Search size={14} className="search-icon" style={{ left: '10px' }} />
              <input
                type="text"
                placeholder="Search by Job Code, Client, Title, or Location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="library-search-input"
              />
            </div>

            {/* Actions */}
            <div className="library-actions-group" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                className="btn-primary-sm"
                onClick={handleSaveCurrentWorkspace}
                disabled={loading}
                title="Save current workspace state as a project in library"
              >
                <Save size={13} />
                <span>{loading ? 'Saving...' : 'Save Workspace'}</span>
              </button>

              <button
                type="button"
                className="btn-secondary-sm"
                onClick={handleExportLibraryPack}
                disabled={projects.length === 0}
                title="Export all projects in this view as a single portable .nsurvpack archive"
              >
                <Download size={13} />
                <span>Export Pack (.nsurvpack)</span>
              </button>

              <input
                type="file"
                ref={packInputRef}
                onChange={handleImportPackFile}
                accept=".nsurvpack,.nsurv,.json"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => packInputRef.current?.click()}
                title="Import multi-project pack (.nsurvpack) or single .nsurv file"
              >
                <Archive size={13} />
                <span>Import Pack...</span>
              </button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportNSurvFile}
                accept=".nsurv,application/json"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => fileInputRef.current?.click()}
                title="Import single native .nsurv survey bundle"
              >
                <Upload size={13} />
                <span>Import .nsurv</span>
              </button>

              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => {
                  onNewProject();
                  onClose();
                }}
                title="Start a new blank survey workspace"
              >
                <Plus size={13} />
                <span>New Project</span>
              </button>
            </div>
          </div>

          {/* Tabs for Workspace Scoping */}
          <div className="auth-tabs">
            <button
              className={`auth-tab-btn ${scopeTab === 'all' ? 'active' : ''}`}
              onClick={() => setScopeTab('all')}
            >
              All Projects ({projects.length})
            </button>
            <button
              className={`auth-tab-btn ${scopeTab === 'personal' ? 'active' : ''}`}
              onClick={() => setScopeTab('personal')}
            >
              <User size={13} style={{ display: 'inline', marginRight: '6px' }} />
              Personal Scope
            </button>
            {activeOrg && (
              <button
                className={`auth-tab-btn ${scopeTab === 'organization' ? 'active' : ''}`}
                onClick={() => setScopeTab('organization')}
              >
                <Building2 size={13} style={{ display: 'inline', marginRight: '6px' }} />
                {activeOrg.name} (Team)
              </button>
            )}
          </div>

          {/* Notifications */}
          {successMsg && (
            <div className="auth-alert success" style={{ margin: '0 24px 12px' }}>
              <CheckCircle2 size={14} />
              <span>{successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="auth-alert error" style={{ margin: '0 24px 12px' }}>
              <AlertCircle size={14} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Projects Grid / List */}
          <div className="library-grid-container">
            {loading ? (
              <div className="library-empty-state">
                <p>Loading projects...</p>
              </div>
            ) : projects.length === 0 ? (
              <div className="library-empty-state">
                <FolderKanban size={48} className="text-muted" style={{ opacity: 0.4 }} />
                <h3>No Survey Projects Found</h3>
                <p>
                  {searchQuery
                    ? `No projects matched "${searchQuery}". Try a different search term.`
                    : 'Save your active CAD workspace or import .nsurv and .nsurvpack bundles to start building your firm repository.'}
                </p>
                <button
                  type="button"
                  className="btn-primary-sm"
                  style={{ marginTop: '12px' }}
                  onClick={handleSaveCurrentWorkspace}
                >
                  <Save size={13} />
                  <span>Save Current Workspace as First Project</span>
                </button>
              </div>
            ) : (
              <div className="library-cards-grid">
                {projects.map((p) => {
                  const isOrg = !!p.organizationId;
                  const dateStr = new Date(p.updatedAt).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  });

                  return (
                    <div key={p.id} className="library-project-card">
                      {/* Card Header */}
                      <div className="lib-card-header">
                        <div>
                          <span className="lib-card-code">{p.code}</span>
                          <h3 className="lib-card-title">{p.title}</h3>
                        </div>
                        {isOrg ? (
                          <span className="lib-badge org" title={`Shared with ${p.organizationName}`}>
                            <Building2 size={11} />
                            <span>Team</span>
                          </span>
                        ) : (
                          <span className="lib-badge personal" title="Private personal project">
                            <User size={11} />
                            <span>Personal</span>
                          </span>
                        )}
                      </div>

                      {/* Card Metadata */}
                      <div className="lib-card-meta">
                        <div className="lib-meta-item">
                          <User size={12} className="text-muted" />
                          <span>Client: <strong>{p.clientName}</strong></span>
                        </div>
                        <div className="lib-meta-item">
                          <MapPin size={12} className="text-muted" />
                          <span>{p.location}</span>
                        </div>
                        <div className="lib-meta-item">
                          <Compass size={12} className="text-muted" />
                          <span>
                            {p.gridBelt === 4.5
                              ? 'Minna West Belt'
                              : p.gridBelt === 8.5
                              ? 'Minna Mid Belt'
                              : 'Minna East Belt'}
                          </span>
                        </div>
                        <div className="lib-meta-item">
                          <Calendar size={12} className="text-muted" />
                          <span>Updated {dateStr}</span>
                        </div>
                      </div>

                      {/* Stats Pills */}
                      <div className="lib-stats-bar">
                        <span className="lib-stat-pill">
                          <Layers size={11} />
                          <span>{p.pointsCount} Beacons</span>
                        </span>
                        <span className="lib-stat-pill">
                          <span>{p.parcelsCount} Plots</span>
                        </span>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="lib-card-footer">
                        <div className="lib-card-footer-left">
                          <button
                            type="button"
                            className="lib-action-btn"
                            title="Export standalone .nsurv file"
                            onClick={() => handleExportNSurv(p)}
                          >
                            <Download size={13} />
                          </button>
                          <button
                            type="button"
                            className="lib-action-btn"
                            title="Clone/Duplicate this project"
                            onClick={() => handleCloneProject(p)}
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            type="button"
                            className="lib-action-btn danger"
                            title="Delete this project from library"
                            onClick={() => handleDeleteProject(p)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <button
                          type="button"
                          className="btn-primary-sm"
                          onClick={() => handleOpenProjectInWorkspace(p)}
                          style={{ padding: '6px 12px', fontSize: '11px' }}
                        >
                          <ExternalLink size={12} />
                          <span>Open in CAD</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};
