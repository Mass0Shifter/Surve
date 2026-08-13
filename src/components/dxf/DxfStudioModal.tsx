import React, { useState } from 'react';
import { CoordinatePoint, Parcel, SetoutOverlay, AlignmentOverlay } from '../../engine/types';
import { ContourSegment } from '../../engine/dtm/dtmEngine';
import { parseDXF, generateDXF, DXFParseResult } from '../../engine/dxf/dxfEngine';
import { FileUp, Download, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface DxfStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePoints: CoordinatePoint[];
  workspaceParcels: Parcel[];
  contours?: ContourSegment[];
  alignmentOverlay?: AlignmentOverlay | null;
  setoutOverlay?: SetoutOverlay | null;
  onImportToWorkspace: (points: CoordinatePoint[], parcels: Parcel[]) => void;
}

export const DxfStudioModal: React.FC<DxfStudioModalProps> = ({
  isOpen,
  onClose,
  workspacePoints,
  workspaceParcels,
  contours = [],
  alignmentOverlay = null,
  setoutOverlay = null,
  onImportToWorkspace
}) => {
  const [activeTab, setActiveTab] = useState<'IMPORT' | 'EXPORT'>('IMPORT');

  // Import State
  const [dxfFileName, setDxfFileName] = useState<string>('');
  const [parseResult, setParseResult] = useState<DXFParseResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Export State
  const [exportBeacons, setExportBeacons] = useState<boolean>(true);
  const [exportParcels, setExportParcels] = useState<boolean>(true);
  const [exportContours, setExportContours] = useState<boolean>(true);
  const [exportAlignments, setExportAlignments] = useState<boolean>(true);
  const [exportSetout, setExportSetout] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDxfFileName(file.name);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const res = parseDXF(text);
        setParseResult(res);
      } catch (err: any) {
        setImportError(err.message || 'Failed to parse DXF file.');
        setParseResult(null);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (!parseResult) return;
    onImportToWorkspace(parseResult.importedPoints, parseResult.importedParcels);
    alert(`Successfully imported ${parseResult.importedPoints.length} beacons and ${parseResult.importedParcels.length} parcels into CAD workspace!`);
    onClose();
  };

  const handleExportDXF = () => {
    const dxfString = generateDXF({
      projectTitle: 'NSURVEY_EXPORT',
      points: workspacePoints,
      parcels: workspaceParcels,
      contours,
      alignmentOverlay,
      setoutOverlay,
      exportBeacons,
      exportParcels,
      exportContours,
      exportAlignments,
      exportSetout
    });

    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Survey_Plan_${new Date().toISOString().slice(0, 10)}.dxf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ErrorBoundary fallbackTitle="DXF Studio Recovery">
      <div className="modal-overlay">
        <div className="modal-content leveling-modal-studio">
          
          {/* Header */}
          <div className="modal-header">
            <div className="modal-title">
              <Layers size={18} className="text-cyan" />
              <span>AutoCAD DXF Import &amp; Export Studio</span>
            </div>
            <div className="header-actions-group">
              {activeTab === 'IMPORT' && parseResult && (
                <button className="btn-primary-sm" onClick={handleConfirmImport}>
                  <CheckCircle2 size={13} /> <span>Import to Workspace</span>
                </button>
              )}
              {activeTab === 'EXPORT' && (
                <button className="btn-primary-sm" onClick={handleExportDXF}>
                  <Download size={13} /> <span>Download .DXF File</span>
                </button>
              )}
              <button className="icon-btn" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="traverse-tabs-bar">
            <button
              className={`traverse-tab-btn ${activeTab === 'IMPORT' ? 'active' : ''}`}
              onClick={() => setActiveTab('IMPORT')}
            >
              <FileUp size={14} /> <span>Import .DXF to Workspace</span>
            </button>
            <button
              className={`traverse-tab-btn ${activeTab === 'EXPORT' ? 'active' : ''}`}
              onClick={() => setActiveTab('EXPORT')}
            >
              <Download size={14} /> <span>Export CAD Workspace to .DXF</span>
            </button>
          </div>

          {/* Content Body */}
          <div className="traverse-studio-body">
            {activeTab === 'IMPORT' && (
              <div className="traverse-fieldbook-view">
                {/* File Upload Box */}
                <div style={{
                  border: '2px dashed rgba(6,182,212,0.3)',
                  borderRadius: '10px',
                  padding: '24px',
                  background: 'rgba(15,23,42,0.5)',
                  textAlign: 'center',
                  position: 'relative',
                  cursor: 'pointer'
                }}>
                  <input
                    type="file"
                    accept=".dxf"
                    onChange={handleFileUpload}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer'
                    }}
                  />
                  <FileUp size={36} style={{ color: 'var(--cyan)', margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                    {dxfFileName ? `Selected File: ${dxfFileName}` : 'Click to choose or drag & drop an AutoCAD .DXF file'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Supports POINT, LINE, LWPOLYLINE, POLYLINE, TEXT, MTEXT entities
                  </div>
                </div>

                {importError && (
                  <div style={{
                    padding: '12px',
                    background: 'rgba(244,63,94,0.1)',
                    border: '1px solid rgba(244,63,94,0.3)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#fda4af',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertCircle size={14} /> <span>{importError}</span>
                  </div>
                )}

                {parseResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Summary Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      <div className="control-card" style={{ padding: '12px' }}>
                        <div className="control-card-title">Total Entities</div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>{parseResult.totalEntitiesParsed}</div>
                      </div>
                      <div className="control-card" style={{ padding: '12px', borderColor: 'rgba(16,185,129,0.3)' }}>
                        <div className="control-card-title" style={{ color: '#34d399' }}>Imported Beacons</div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#34d399' }}>{parseResult.importedPoints.length}</div>
                      </div>
                      <div className="control-card" style={{ padding: '12px', borderColor: 'rgba(6,182,212,0.3)' }}>
                        <div className="control-card-title" style={{ color: 'var(--cyan)' }}>Imported Parcels</div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--cyan)' }}>{parseResult.importedParcels.length}</div>
                      </div>
                      <div className="control-card" style={{ padding: '12px', borderColor: 'rgba(245,158,11,0.3)' }}>
                        <div className="control-card-title" style={{ color: '#fbbf24' }}>Layers Found</div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#fbbf24' }}>{parseResult.layersFound.length}</div>
                      </div>
                    </div>

                    {/* Preview Table */}
                    <div className="table-wrapper">
                      <table className="traverse-table">
                        <thead>
                          <tr>
                            <th>Point ID</th>
                            <th>Easting (m)</th>
                            <th>Northing (m)</th>
                            <th>Elevation (m)</th>
                            <th>Code</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parseResult.importedPoints.slice(0, 15).map((pt, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 700, color: 'var(--cyan)' }}>{pt.id}</td>
                              <td className="mono-cell">{pt.easting.toFixed(3)}</td>
                              <td className="mono-cell">{pt.northing.toFixed(3)}</td>
                              <td className="mono-cell">{pt.elevation !== undefined ? pt.elevation.toFixed(3) : '-'}</td>
                              <td style={{ color: 'var(--text-muted)' }}>{pt.code || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'EXPORT' && (
              <div className="traverse-fieldbook-view">
                <div className="control-card">
                  <div className="control-card-title">Select Content Layers to Export</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginTop: '12px' }}>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'rgba(15,23,42,0.6)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={exportBeacons}
                        onChange={e => setExportBeacons(e.target.checked)}
                      />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>Beacons &amp; Point Labels</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{workspacePoints.length} points (POINT &amp; TEXT)</div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'rgba(15,23,42,0.6)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={exportParcels}
                        onChange={e => setExportParcels(e.target.checked)}
                      />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>Cadastral Parcels</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{workspaceParcels.length} parcels (LWPOLYLINE)</div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'rgba(15,23,42,0.6)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={exportContours}
                        onChange={e => setExportContours(e.target.checked)}
                      />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>DTM Elevation Contours</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{contours.length} contour segments</div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'rgba(15,23,42,0.6)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={exportAlignments}
                        onChange={e => setExportAlignments(e.target.checked)}
                      />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>Road Alignment Tangents &amp; Chainages</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {alignmentOverlay ? `${alignmentOverlay.tangentSegments.length} tangents, ${alignmentOverlay.chainagePoints.length} chainage ticks` : 'No active alignment'}
                        </div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', background: 'rgba(15,23,42,0.6)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', gridColumn: 'span 2' }}>
                      <input
                        type="checkbox"
                        checked={exportSetout}
                        onChange={e => setExportSetout(e.target.checked)}
                      />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>Setout / Stakeout Rays</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {setoutOverlay ? `${setoutOverlay.targets.length} setout target rays` : 'No active setout overlay'}
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </ErrorBoundary>
  );
};
