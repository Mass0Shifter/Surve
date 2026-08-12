import React, { useState } from 'react';
import { ProjectMetadata, CoordinatePoint, Parcel, NigerianGridBelt } from '../../engine/types';
import { generateAutoCADScript } from '../../engine/exporters/scrExporter';
import { generateDXF } from '../../engine/exporters/dxfExporter';
import { exportCoordinatesToCSV, downloadFile } from '../../engine/exporters/csvExporter';
import { MenuBar } from './MenuBar';
import { Compass, Settings, Save, FileText, Globe } from 'lucide-react';

interface HeaderProps {
  project: ProjectMetadata;
  points: CoordinatePoint[];
  parcels: Parcel[];
  autoSaveEnabled: boolean;
  lastSavedTime: string | null;
  onToggleAutoSave: () => void;
  onUpdateProject: (proj: ProjectMetadata) => void;
  onNewProject: () => void;
  onImportCoordinates: () => void;
  onLoadSample: () => void;
  onOpenCogo: () => void;
  onOpenRenumber: () => void;
  onOpenTdp: () => void;
  onOpenTraverse: () => void;
  onOpenLeveling: () => void;
  onOpenTacheometry: () => void;
  onOpenSetout: () => void;
  onOpenDatumTransform: () => void;

  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenHistory: () => void;

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
  onImportCoordinates,
  onLoadSample,
  onOpenCogo,
  onOpenRenumber,
  onOpenTdp,
  onOpenTraverse,
  onOpenLeveling,
  onOpenTacheometry,
  onOpenSetout,
  onOpenDatumTransform,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenHistory,
  isLeftVisible,
  isRightVisible,
  onToggleLeft,
  onToggleRight,
  onToggleMaximize
}) => {
  const [showSettingsModal, setShowSettingsModal] = useState(false);

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
      alert('Cannot export Coordinate Book: No survey coordinates exist.');
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
          onImportCoordinates={onImportCoordinates}
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
          onOpenCogo={onOpenCogo}
          gridBelt={project.gridBelt}
          onSelectBelt={(belt) => onUpdateProject({ ...project, gridBelt: belt })}
          autoSaveEnabled={autoSaveEnabled}
          onToggleAutoSave={onToggleAutoSave}
        />
      </div>

      <div className="header-right">
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
