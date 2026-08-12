import React, { useState } from 'react';
import { ProjectMetadata, CoordinatePoint, Parcel, NigerianGridBelt } from '../../engine/types';
import { generateAutoCADScript } from '../../engine/exporters/scrExporter';
import { generateDXF } from '../../engine/exporters/dxfExporter';
import { downloadFile } from '../../engine/exporters/csvExporter';
import { Compass, Download, Settings, FileCode, RefreshCw } from 'lucide-react';

interface HeaderProps {
  project: ProjectMetadata;
  points: CoordinatePoint[];
  parcels: Parcel[];
  onUpdateProject: (proj: ProjectMetadata) => void;
  onLoadSample: () => void;
  onOpenCogo: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  project,
  points,
  parcels,
  onUpdateProject,
  onLoadSample,
  onOpenCogo
}) => {
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const handleExportSCR = () => {
    const scr = generateAutoCADScript(project, points, parcels);
    downloadFile(scr, `${project.code || 'SURVPACK'}_LAYOUT.SCR`, 'text/plain');
  };

  const handleExportDXF = () => {
    const dxf = generateDXF(project, points, parcels);
    downloadFile(dxf, `${project.code || 'SURVPACK'}_PLAN.DXF`, 'application/dxf');
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="brand-logo">
          <Compass size={22} className="text-emerald animate-pulse" />
          <div className="brand-text">
            <span className="brand-title">NSurvey</span>
            <span className="brand-badge">SurvPack Pro</span>
          </div>
        </div>

        <div className="project-info-bar" onClick={() => setShowSettingsModal(true)} title="Click to edit project metadata">
          <div className="proj-code-badge">{project.code}</div>
          <div className="proj-title-text">{project.title}</div>
          <Settings size={14} className="proj-settings-icon" />
        </div>
      </div>

      <div className="header-right">
        {/* Datum Belt Selector */}
        <select
          className="datum-select"
          value={project.gridBelt}
          onChange={(e) => onUpdateProject({ ...project, gridBelt: parseFloat(e.target.value) as NigerianGridBelt })}
        >
          <option value={NigerianGridBelt.WEST_BELT}>Minna West Belt (4.5°E)</option>
          <option value={NigerianGridBelt.MID_BELT}>Minna Mid Belt (8.5°E - Abuja)</option>
          <option value={NigerianGridBelt.EAST_BELT}>Minna East Belt (12.5°E)</option>
        </select>

        {/* Load Sample Benchmark */}
        <button
          className="btn-secondary-sm"
          title="Reload CKC Extension Benchmark Data"
          onClick={onLoadSample}
        >
          <RefreshCw size={13} />
          <span>Demo Data</span>
        </button>

        {/* Quick COGO Calculator */}
        <button className="btn-secondary-sm" onClick={onOpenCogo}>
          <Compass size={13} />
          <span>COGO</span>
        </button>

        {/* Export Dropdown / Actions */}
        <div className="export-btn-group">
          <button
            className="btn-export-scr"
            title="Generate & Download AutoCAD Script (.SCR)"
            onClick={handleExportSCR}
          >
            <FileCode size={13} />
            <span>AutoCAD .SCR</span>
          </button>
          <button
            className="btn-export-dxf"
            title="Generate & Download Standard Vector DXF"
            onClick={handleExportDXF}
          >
            <Download size={13} />
            <span>Export DXF</span>
          </button>
        </div>
      </div>

      {/* Project Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Project Metadata & Survey Authority</h3>
              <button className="icon-btn" onClick={() => setShowSettingsModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row-2">
                <div className="form-group">
                  <label>Project Job Code</label>
                  <input
                    type="text"
                    value={project.code}
                    onChange={(e) => onUpdateProject({ ...project, code: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Survey Date</label>
                  <input
                    type="date"
                    value={project.date}
                    onChange={(e) => onUpdateProject({ ...project, date: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Project Title / Plan Name</label>
                <input
                  type="text"
                  value={project.title}
                  onChange={(e) => onUpdateProject({ ...project, title: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Survey Location / Cadastral District</label>
                <input
                  type="text"
                  value={project.location}
                  onChange={(e) => onUpdateProject({ ...project, location: e.target.value })}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Surveyor Name</label>
                  <input
                    type="text"
                    value={project.surveyorName}
                    onChange={(e) => onUpdateProject({ ...project, surveyorName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Firm / Organization</label>
                  <input
                    type="text"
                    value={project.surveyFirm}
                    onChange={(e) => onUpdateProject({ ...project, surveyFirm: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Client Name</label>
                  <input
                    type="text"
                    value={project.clientName}
                    onChange={(e) => onUpdateProject({ ...project, clientName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Scale Ratio (1:N)</label>
                  <input
                    type="number"
                    value={project.scale}
                    onChange={(e) => onUpdateProject({ ...project, scale: parseInt(e.target.value) || 1000 })}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowSettingsModal(false)}>Save Settings</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
