import React, { useState, useEffect, useRef } from 'react';
import { StoredProject, listProjects, deleteProjectFromLibrary, cloneProjectInLibrary, saveProjectToLibrary } from '../../engine/storage/projectDatabase';
import { NSurveyBundle, parseNSurvBundle, downloadNSurvBundle } from '../../engine/storage/nsurvBundle';
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
  AlertCircle
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
                Manage, backup, clone, and collaborate on your personal and organizational survey job files (.nsurv).
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
            <div className="library-actions-group">
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
                title="Import native .nsurv survey bundle"
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
              All Projects
            </button>
            <button
              className={`auth-tab-btn ${scopeTab === 'personal' ? 'active' : ''}`}
              onClick={() => setScopeTab('personal')}
            >
              <User size={12} style={{ display: 'inline', marginRight: '4px' }} />
              Personal Projects
            </button>
            {activeOrg && (
              <button
                className={`auth-tab-btn ${scopeTab === 'organization' ? 'active' : ''}`}
                onClick={() => setScopeTab('organization')}
              >
                <Building2 size={12} style={{ display: 'inline', marginRight: '4px' }} />
                {activeOrg.name}
              </button>
            )}
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div className="form-error-banner" style={{ margin: '10px 20px 0' }}>
              <AlertCircle size={14} />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="form-warning-banner" style={{ margin: '10px 20px 0', background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', color: '#6ee7b7' }}>
              <CheckCircle2 size={14} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Project List / Grid */}
          <div className="library-projects-grid">
            {projects.length === 0 ? (
              <div className="library-empty-state">
                <FolderKanban size={42} className="text-muted" />
                <h4>No Survey Projects Found</h4>
                <p>
                  {searchQuery
                    ? `No projects matching "${searchQuery}".`
                    : 'Your library is empty. Save the active workspace or import an .nsurv file to get started.'}
                </p>
                <button
                  type="button"
                  className="btn-primary-sm"
                  onClick={handleSaveCurrentWorkspace}
                  style={{ marginTop: '8px' }}
                >
                  <Save size={13} /> <span>Save Active Workspace to Library</span>
                </button>
              </div>
            ) : (
              projects.map((p) => (
                <div key={p.id} className="project-card">
                  {/* Card Header */}
                  <div className="project-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="proj-code-badge">{p.code}</span>
                      {p.organizationId ? (
                        <span className="role-badge role-admin" title={`Organization Team Project: ${p.organizationName}`}>
                          <Building2 size={10} style={{ marginRight: '3px' }} /> TEAM
                        </span>
                      ) : (
                        <span className="role-badge role-surveyor" title="Personal Surveyor Project">
                          <User size={10} style={{ marginRight: '3px' }} /> PERSONAL
                        </span>
                      )}
                    </div>
                    <span className="datum-belt-badge" style={{ fontSize: '9px' }}>
                      {p.gridBelt === 8.5 ? 'Mid Belt' : p.gridBelt === 4.5 ? 'West Belt' : 'East Belt'}
                    </span>
                  </div>

                  {/* Card Title & Info */}
                  <div className="project-card-body">
                    <h4 className="project-card-title" title={p.title}>{p.title}</h4>
                    <div className="project-card-meta">
                      <span className="project-meta-item">
                        <strong>Client:</strong> {p.clientName}
                      </span>
                      <span className="project-meta-item">
                        <MapPin size={11} className="text-dim" /> {p.location}
                      </span>
                    </div>

                    {/* Stats Badges */}
                    <div className="project-stats-row">
                      <span className="stat-chip">
                        <Compass size={11} className="text-cyan" /> {p.pointsCount} Beacons
                      </span>
                      <span className="stat-chip">
                        <Layers size={11} className="text-emerald" /> {p.parcelsCount} Parcels
                      </span>
                      <span className="stat-chip date-chip">
                        <Calendar size={11} className="text-dim" /> {new Date(p.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="project-card-actions">
                    <button
                      type="button"
                      className="btn-primary-sm"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => handleOpenProjectInWorkspace(p)}
                      title="Load this project into CAD canvas"
                    >
                      <ExternalLink size={12} />
                      <span>Open in CAD</span>
                    </button>

                    <button
                      type="button"
                      className="icon-btn"
                      title="Download native .nsurv bundle to disk"
                      onClick={() => handleExportNSurv(p)}
                    >
                      <Download size={13} className="text-cyan" />
                    </button>

                    <button
                      type="button"
                      className="icon-btn"
                      title="Clone / Duplicate project"
                      onClick={() => handleCloneProject(p)}
                    >
                      <Copy size={13} />
                    </button>

                    <button
                      type="button"
                      className="icon-btn"
                      title="Delete project from library"
                      onClick={() => handleDeleteProject(p)}
                    >
                      <Trash2 size={13} className="text-rose" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};
