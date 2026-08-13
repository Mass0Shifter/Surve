import React, { useState } from 'react';
import { ProjectMetadata, CoordinatePoint, Parcel, NigerianGridBelt } from '../../engine/types';
import { UserProfile } from '../../engine/auth/authTypes';
import { Organization } from '../../engine/organization/orgTypes';
import { FeatureId } from '../../engine/subscription/featureGating';
import { generateAutoCADScript } from '../../engine/exporters/scrExporter';
import { generateDXF } from '../../engine/exporters/dxfExporter';
import { exportCoordinatesToCSV, downloadFile } from '../../engine/exporters/csvExporter';
import { MenuBar } from './MenuBar';
import { Compass, Settings, Save, FileText, Globe, User, LogOut, Crown, ChevronDown, Building2, Plus, FolderKanban } from 'lucide-react';

interface HeaderProps {
  project: ProjectMetadata;
  points: CoordinatePoint[];
  parcels: Parcel[];
  autoSaveEnabled: boolean;
  lastSavedTime: string | null;
  onToggleAutoSave: () => void;
  onUpdateProject: (proj: ProjectMetadata) => void;
  onNewProject: () => void;
  onOpenProjectLibrary?: () => void;
  onExportNSurv?: () => void;
  onImportNSurv?: () => void;
  onLoadSample: () => void;
  onOpenCogo: () => void;
  onOpenRenumber: () => void;
  onOpenTdp: () => void;
  onOpenTraverse: () => void;
  onOpenLeveling: () => void;
  onOpenTacheometry: () => void;
  onOpenSetout: () => void;
  onOpenDatumTransform: () => void;
  onOpenAlignment: () => void;
  onOpenVerticalAlignment: () => void;
  onOpenSubdivision: () => void;
  onOpenDxf: () => void;
  onOpenResection: () => void;
  onOpenCsvImporter: () => void;
  onOpenSurvpackImporter?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenHistory: () => void;

  currentUser: UserProfile | null;
  organizations: Organization[];
  activeOrg: Organization | null;
  onSelectOrg: (orgId: string | null) => void;
  onOpenOrgStudio: () => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onOpenSubscription: () => void;
  onRequestUpgrade?: (featureId: FeatureId) => void;
  onLogout: () => void;

  isLeftVisible: boolean;
  isRightVisible: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleMaximize: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  points,
  parcels,
  autoSaveEnabled,
  lastSavedTime,
  onToggleAutoSave,
  onUpdateProject,
  onNewProject,
  onLoadSample,
  onOpenCogo,
  onOpenRenumber,
  onOpenTdp,
  onOpenTraverse,
  onOpenLeveling,
  onOpenTacheometry,
  onOpenSetout,
  onOpenDatumTransform,
  onOpenAlignment,
  onOpenVerticalAlignment,
  onOpenSubdivision,
  onOpenDxf,
  onOpenResection,
  onOpenCsvImporter,
  onOpenSurvpackImporter,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenHistory,
  currentUser,
  organizations,
  activeOrg,
  onSelectOrg,
  onOpenOrgStudio,
  onOpenProjectLibrary,
  onExportNSurv,
  onImportNSurv,
  onOpenAuth,
  onOpenProfile,
  onOpenSubscription,
  onRequestUpgrade,
  onLogout,
  isLeftVisible,
  isRightVisible,
  onToggleLeft,
  onToggleRight,
  onToggleMaximize
}) => {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);

  const handleExportSCR = () => {
    if (points.length === 0) {
      alert('Cannot export AutoCAD Script: No survey coordinates exist.');
      return;
    }
    const scr = generateAutoCADScript(project, points, parcels);
    downloadFile(scr, `${project.code || 'SURVPACK'}_LAYOUT.SCR`, 'text/plain');
  };

  const handleExportDXF = () => {
    if (points.length === 0) {
      alert('Cannot export DXF Drawing: No survey coordinates exist.');
      return;
    }
    const dxf = generateDXF(project, points, parcels);
    downloadFile(dxf, `${project.code || 'SURVPACK'}_PLAN.DXF`, 'application/dxf');
  };

  const handleExportCSV = () => {
    if (points.length === 0) {
      alert('Cannot export CSV: No survey coordinates exist.');
      return;
    }
    const csv = exportCoordinatesToCSV(points);
    downloadFile(csv, `${project.code || 'SURVPACK'}_COORDINATES.CSV`, 'text/csv');
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="brand-logo">
          <Compass size={20} className="text-emerald animate-pulse" />
          <div className="brand-text">
            <span className="brand-title">NSurvey</span>
            <span className="brand-badge">Pro</span>
          </div>
        </div>

        {/* Traditional Desktop CAD Application Menu Bar */}
        <MenuBar
          onNewProject={onNewProject}
          onOpenProjectLibrary={onOpenProjectLibrary}
          onExportNSurv={onExportNSurv}
          onImportNSurv={onImportNSurv}
          onLoadDemo={onLoadSample}
          onExportSCR={handleExportSCR}
          onExportDXF={handleExportDXF}
          onExportCSV={handleExportCSV}
          onOpenTdp={onOpenTdp}
          onOpenProjectSettings={() => setShowSettingsModal(true)}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onOpenHistory={onOpenHistory}
          onOpenRenumber={onOpenRenumber}
          isLeftVisible={isLeftVisible}
          isRightVisible={isRightVisible}
          onToggleLeft={onToggleLeft}
          onToggleRight={onToggleRight}
          onToggleMaximize={onToggleMaximize}
          onOpenTraverse={onOpenTraverse}
          onOpenLeveling={onOpenLeveling}
          onOpenTacheometry={onOpenTacheometry}
          onOpenSetout={onOpenSetout}
          onOpenDatumTransform={onOpenDatumTransform}
          onOpenAlignment={onOpenAlignment}
          onOpenVerticalAlignment={onOpenVerticalAlignment}
          onOpenSubdivision={onOpenSubdivision}
          onOpenDxf={onOpenDxf}
          onOpenResection={onOpenResection}
          onOpenCsvImporter={onOpenCsvImporter}
          onOpenCogo={onOpenCogo}
          gridBelt={project.gridBelt}
          onSelectBelt={(belt) => onUpdateProject({ ...project, gridBelt: belt })}
          autoSaveEnabled={autoSaveEnabled}
          onToggleAutoSave={onToggleAutoSave}
          currentUser={currentUser}
          onRequestUpgrade={onRequestUpgrade}
          onOpenSurvpackImporter={onOpenSurvpackImporter}
        />
      </div>

      <div className="header-right">
        {/* Workspace Switcher (Personal vs Organization) */}
        {currentUser && (
          <div style={{ position: 'relative' }}>
            <button
              className="workspace-switcher-btn"
              onClick={() => setShowWorkspaceDropdown(!showWorkspaceDropdown)}
              title="Switch between Personal Workspace and Organization Projects"
            >
              {activeOrg ? <Building2 size={13} className="text-cyan" /> : <User size={13} className="text-emerald" />}
              <span style={{ maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeOrg ? activeOrg.name : 'Personal Workspace'}
              </span>
              <ChevronDown size={11} className="text-muted" />
            </button>

            {showWorkspaceDropdown && (
              <div className="workspace-dropdown-menu" onClick={() => setShowWorkspaceDropdown(false)}>
                <div className="user-dropdown-header">
                  <div className="user-dropdown-name">Select Workspace Repository</div>
                </div>

                <div
                  className={`menu-dropdown-item ${!activeOrg ? 'active' : ''}`}
                  onClick={() => onSelectOrg(null)}
                >
                  <div className="menu-item-left">
                    <User size={13} className="text-emerald" />
                    <span>Personal Workspace</span>
                  </div>
                </div>

                {organizations.map(org => (
                  <div
                    key={org.id}
                    className={`menu-dropdown-item ${activeOrg?.id === org.id ? 'active' : ''}`}
                    onClick={() => onSelectOrg(org.id)}
                  >
                    <div className="menu-item-left">
                      <Building2 size={13} className="text-cyan" />
                      <span style={{ maxWidth: '170px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {org.name}
                      </span>
                    </div>
                  </div>
                ))}

                <div className="menu-dropdown-divider" />

                {onOpenProjectLibrary && (
                  <div className="menu-dropdown-item" onClick={onOpenProjectLibrary}>
                    <div className="menu-item-left">
                      <FolderKanban size={13} className="text-emerald" />
                      <span>Project Library...</span>
                    </div>
                  </div>
                )}

                <div className="menu-dropdown-item" onClick={onOpenOrgStudio}>
                  <div className="menu-item-left">
                    <Plus size={13} className="text-cyan" />
                    <span>Manage Organizations...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Project Info Pill */}
        <div
          className="project-info-bar"
          onClick={() => setShowSettingsModal(true)}
          title="Click to edit project metadata"
        >
          <div className="proj-code-badge">{project.code}</div>
          <div className="proj-title-text">{project.title}</div>
          <Settings size={13} className="proj-settings-icon" />
        </div>

        {/* Datum Belt Indicator */}
        <div className="datum-indicator-pill" title="Active Coordinate Projection Datum">
          <Globe size={12} className="text-emerald" />
          <span>
            {project.gridBelt === NigerianGridBelt.MID_BELT
              ? 'Mid Belt (8.5°E)'
              : project.gridBelt === NigerianGridBelt.WEST_BELT
              ? 'West Belt (4.5°E)'
              : 'East Belt (12.5°E)'}
          </span>
        </div>

        {/* Toggleable Auto-Save Indicator */}
        <div
          className={`autosave-toggle-pill ${autoSaveEnabled ? 'active' : 'paused'}`}
          onClick={onToggleAutoSave}
          title={`Click to ${autoSaveEnabled ? 'pause' : 'enable'} project auto-save`}
        >
          <Save size={12} className={autoSaveEnabled ? 'text-emerald' : 'text-muted'} />
          <span>{autoSaveEnabled ? (lastSavedTime ? `Saved ${lastSavedTime}` : 'Auto-Save ON') : 'Auto-Save Paused'}</span>
        </div>

        {/* Quick Access Highlights */}
        {onOpenProjectLibrary && (
          <button
            id="btn-open-project-library"
            className="btn-traverse-highlight"
            style={{ color: '#6ee7b7', borderColor: 'rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.12)' }}
            title="Open Project Library & Repositories (.nsurv)"
            onClick={onOpenProjectLibrary}
          >
            <FolderKanban size={13} className="text-emerald" />
            <span>Library</span>
          </button>
        )}

        <button
          id="btn-open-traverse-modal"
          className="btn-traverse-highlight"
          title="Traverse Field Book & Loop Balancing Studio"
          onClick={onOpenTraverse}
        >
          <Compass size={13} className="text-cyan" />
          <span>Traverse</span>
        </button>

        <button
          className="btn-tdp-highlight"
          title="Generate Official Title Deed Plan (PDF / Print)"
          onClick={onOpenTdp}
        >
          <FileText size={13} />
          <span>TDP Studio</span>
        </button>

        {/* User Account / Profile Button */}
        {currentUser ? (
          <div style={{ position: 'relative' }}>
            <button
              className="header-user-btn"
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              title={`${currentUser.title || ''} ${currentUser.fullName} (${currentUser.subscriptionTier})`}
            >
              <div className="user-avatar-circle">
                {currentUser.fullName ? currentUser.fullName.charAt(0).toUpperCase() : 'S'}
                <span className={`user-avatar-dot ${currentUser.subscriptionTier === 'COMMUNITY' ? 'free' : 'pro'}`} />
              </div>
              <span className="user-name-text">
                {currentUser.title ? `${currentUser.title} ` : ''}{currentUser.fullName.split(' ')[0]}
              </span>
              <ChevronDown size={12} className="text-muted" />
            </button>

            {showUserDropdown && (
              <div className="user-dropdown-menu" onClick={() => setShowUserDropdown(false)}>
                <div className="user-dropdown-header">
                  <div className="user-dropdown-name">{currentUser.title || ''} {currentUser.fullName}</div>
                  <div className="user-dropdown-email">{currentUser.email}</div>
                  {currentUser.surconNumber && (
                    <div style={{ fontSize: '9px', color: '#10b981', marginTop: '2px', fontWeight: 600 }}>
                      {currentUser.surconNumber}
                    </div>
                  )}
                </div>

                <div className="menu-dropdown-item" onClick={onOpenProfile}>
                  <div className="menu-item-left">
                    <User size={13} className="text-emerald" />
                    <span>My Profile &amp; Seal</span>
                  </div>
                </div>

                <div className="menu-dropdown-item" onClick={onOpenOrgStudio}>
                  <div className="menu-item-left">
                    <Building2 size={13} className="text-cyan" />
                    <span>My Organization &amp; Team</span>
                  </div>
                </div>

                <div className="menu-dropdown-item" onClick={onOpenSubscription}>
                  <div className="menu-item-left">
                    <Crown size={13} className="text-amber" />
                    <span>Subscription ({currentUser.subscriptionTier})</span>
                  </div>
                </div>

                <div className="menu-dropdown-divider" />

                <div className="menu-dropdown-item" onClick={onLogout}>
                  <div className="menu-item-left">
                    <LogOut size={13} className="text-danger" style={{ color: '#ef4444' }} />
                    <span style={{ color: '#fca5a5' }}>Sign Out</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            className="header-login-btn"
            onClick={onOpenAuth}
            title="Sign in or register your surveyor account"
          >
            <User size={13} />
            <span>Sign In</span>
          </button>
        )}
      </div>

      {/* Project Metadata Modal */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-title">
                <Settings size={18} className="text-emerald" />
                <span>Project Metadata & Cadastral Settings</span>
              </div>
              <button className="icon-btn" onClick={() => setShowSettingsModal(false)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label>Job Code / File Number</label>
                <input
                  type="text"
                  value={project.code}
                  onChange={(e) => onUpdateProject({ ...project, code: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Project Title / Description</label>
                <input
                  type="text"
                  value={project.title}
                  onChange={(e) => onUpdateProject({ ...project, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Location / Cadastral District</label>
                <input
                  type="text"
                  value={project.location}
                  onChange={(e) => onUpdateProject({ ...project, location: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Surveyor General / Supervising Surveyor</label>
                <input
                  type="text"
                  value={project.surveyorName}
                  onChange={(e) => onUpdateProject({ ...project, surveyorName: e.target.value })}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Minna Datum Belt</label>
                  <select
                    value={project.gridBelt}
                    onChange={(e) => onUpdateProject({ ...project, gridBelt: parseFloat(e.target.value) as NigerianGridBelt })}
                  >
                    <option value={NigerianGridBelt.WEST_BELT}>West Belt (4.5°E)</option>
                    <option value={NigerianGridBelt.MID_BELT}>Mid Belt (8.5°E - Abuja)</option>
                    <option value={NigerianGridBelt.EAST_BELT}>East Belt (12.5°E)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Default Scale (1:N)</label>
                  <input
                    type="number"
                    value={project.scale}
                    onChange={(e) => onUpdateProject({ ...project, scale: parseInt(e.target.value) || 1000 })}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowSettingsModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
