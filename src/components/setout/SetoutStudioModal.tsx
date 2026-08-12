import React, { useState, useMemo, useEffect } from 'react';
import {
  SetoutStation,
  SetoutDesignPoint,
  computeSetout,
  SETOUT_STATION_DEFAULT,
  SETOUT_DESIGN_POINTS_DEMO
} from '../../engine/setout/setoutEngine';
import { CoordinatePoint, SetoutOverlay } from '../../engine/types';
import { Target, Table, RefreshCw, Download, Plus, Trash2 } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface SetoutStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingPoints: CoordinatePoint[];
  onOverlayChange: (overlay: SetoutOverlay | null) => void;
}

export const SetoutStudioModal: React.FC<SetoutStudioModalProps> = ({
  isOpen,
  onClose,
  existingPoints,
  onOverlayChange
}) => {
  const [activeTab, setActiveTab] = useState<'design' | 'schedule'>('design');
  const [station, setStation] = useState<SetoutStation>(SETOUT_STATION_DEFAULT);
  const [designPoints, setDesignPoints] = useState<SetoutDesignPoint[]>(SETOUT_DESIGN_POINTS_DEMO);
  const [inputMode, setInputMode] = useState<'manual' | 'project'>('manual');

  // Compute setout schedule
  const schedule = useMemo(() => {
    try {
      if (designPoints.length === 0) return null;
      return computeSetout(station, designPoints);
    } catch {
      return null;
    }
  }, [station, designPoints]);

  // Push overlay to CAD canvas whenever schedule changes and modal is open
  useEffect(() => {
    if (!isOpen || !schedule) {
      onOverlayChange(null);
      return;
    }
    onOverlayChange({
      stationEasting:  schedule.station.easting,
      stationNorthing: schedule.station.northing,
      targets: schedule.results.map(r => ({
        easting:  r.designPoint.easting,
        northing: r.designPoint.northing,
        label:    r.designPoint.pointId
      }))
    });
  }, [isOpen, schedule, onOverlayChange]);

  // Clear overlay on close
  const handleClose = () => {
    onOverlayChange(null);
    onClose();
  };

  if (!isOpen) return null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLoadDemo = () => {
    setStation(SETOUT_STATION_DEFAULT);
    setDesignPoints(SETOUT_DESIGN_POINTS_DEMO);
  };

  const handleUpdateStation = (field: keyof SetoutStation, value: any) => {
    setStation(prev => ({ ...prev, [field]: value }));
  };

  const handleAddRow = () => {
    const newId = Date.now().toString();
    setDesignPoints(prev => [...prev, {
      id: newId,
      pointId: `PEG_${prev.length + 1}`,
      easting: station.easting + 100,
      northing: station.northing + 100,
      elevation: null,
      targetHeight: 1.5,
      notes: 'Design Point'
    }]);
  };

  const handleLoadFromProject = () => {
    const pts: SetoutDesignPoint[] = existingPoints.map(p => ({
      id: p.id,
      pointId: p.id,
      easting: p.easting,
      northing: p.northing,
      elevation: p.elevation ?? null,
      targetHeight: 1.5,
      notes: p.description || p.code || ''
    }));
    setDesignPoints(pts);
    setInputMode('project');
  };

  const handleDeleteRow = (idx: number) => {
    setDesignPoints(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateRow = (idx: number, field: keyof SetoutDesignPoint, value: any) => {
    setDesignPoints(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  // Pick occupied station from existing project points
  const handlePickStation = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pt = existingPoints.find(p => p.id === e.target.value);
    if (pt) {
      setStation(prev => ({
        ...prev,
        stationId: pt.id,
        easting:   pt.easting,
        northing:  pt.northing,
        elevation: pt.elevation ?? prev.elevation
      }));
    }
  };

  const handleExportCSV = () => {
    if (!schedule) return;
    let csv = `SETOUT / SETTING-OUT SCHEDULE\n`;
    csv += `Occupied Station: ${schedule.station.stationId} | E: ${schedule.station.easting} | N: ${schedule.station.northing} | Z: ${schedule.station.elevation}m | HI: ${schedule.station.instrumentHeight}m\n\n`;
    csv += `Point ID,Target E,Target N,Target Z,ΔE (m),ΔN (m),D_H (m),WCB (DMS),VA,Slope Dist (m),Notes\n`;
    for (const r of schedule.results) {
      csv += `"${r.designPoint.pointId}",${r.designPoint.easting.toFixed(3)},${r.designPoint.northing.toFixed(3)},${r.designPoint.elevation?.toFixed(3) ?? ''},${r.deltaE.toFixed(3)},${r.deltaN.toFixed(3)},${r.horizontalDistance.toFixed(3)},"${r.wcbDMS}","${r.verticalAngleDMS ?? ''}",${r.slopeDistance?.toFixed(3) ?? ''},"${r.notes}"\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `setout_${schedule.station.stationId}.csv`;
    a.click();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary fallbackTitle="Setout Studio Recovery">
      <div className="modal-overlay">
        <div className="modal-content leveling-modal-studio">

          {/* Header */}
          <div className="modal-header">
            <div className="modal-title">
              <Target size={18} className="text-amber" />
              <span>Setout / Setting-Out Studio</span>
            </div>
            <div className="header-actions-group">
              <button className="btn-secondary-sm" onClick={handleLoadDemo}>
                <RefreshCw size={13} /> <span>Load Demo</span>
              </button>
              <button className="btn-secondary-sm" onClick={handleExportCSV} disabled={!schedule}>
                <Download size={13} /> <span>Export CSV</span>
              </button>
              <button className="icon-btn" onClick={handleClose}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="traverse-tabs-bar">
            <button className={`traverse-tab-btn ${activeTab === 'design' ? 'active' : ''}`} onClick={() => setActiveTab('design')}>
              <Plus size={14} /> <span>Design Points ({designPoints.length})</span>
            </button>
            <button className={`traverse-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
              <Table size={14} /> <span>Setout Schedule {schedule ? `(${schedule.results.length} Pegs)` : ''}</span>
            </button>
          </div>

          <div className="traverse-studio-body">

            {activeTab === 'design' ? (
              <div className="traverse-fieldbook-view">

                {/* Occupied Station */}
                <div className="traverse-control-bar">
                  <div className="control-card">
                    <div className="control-card-title">Occupied Station (Instrument Position)</div>
                    <div className="form-group">
                      <label>Pick from Project Beacons</label>
                      <select onChange={handlePickStation} defaultValue="">
                        <option value="">— select beacon —</option>
                        {existingPoints.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.id} (E:{p.easting.toFixed(1)} N:{p.northing.toFixed(1)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-row-2" style={{ marginTop: '8px' }}>
                      <div className="form-group">
                        <label>Station ID</label>
                        <input type="text" value={station.stationId} onChange={e => handleUpdateStation('stationId', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>HI (m)</label>
                        <input type="number" step="0.001" value={station.instrumentHeight} onChange={e => handleUpdateStation('instrumentHeight', parseFloat(e.target.value) || 0)} />
                      </div>
                    </div>
                    <div className="form-row-2" style={{ marginTop: '8px' }}>
                      <div className="form-group">
                        <label>Station Easting (m)</label>
                        <input type="number" step="0.001" value={station.easting} onChange={e => handleUpdateStation('easting', parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="form-group">
                        <label>Station Northing (m)</label>
                        <input type="number" step="0.001" value={station.northing} onChange={e => handleUpdateStation('northing', parseFloat(e.target.value) || 0)} />
                      </div>
                    </div>
                    <div className="form-group" style={{ marginTop: '8px' }}>
                      <label>Station Elevation / RL (m)</label>
                      <input type="number" step="0.001" value={station.elevation} onChange={e => handleUpdateStation('elevation', parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>

                  <div className="control-card">
                    <div className="control-card-title">Design Points Input Mode</div>
                    <div className="form-group">
                      <label>Source</label>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                        <label className="radio-label">
                          <input type="radio" name="inputMode" checked={inputMode === 'manual'} onChange={() => setInputMode('manual')} />
                          <span>Manual Entry</span>
                        </label>
                        <label className="radio-label">
                          <input type="radio" name="inputMode" checked={inputMode === 'project'} onChange={() => setInputMode('project')} />
                          <span>From Project</span>
                        </label>
                      </div>
                    </div>
                    {inputMode === 'project' && (
                      <button className="btn-secondary-sm" style={{ marginTop: '8px', width: '100%' }} onClick={handleLoadFromProject}>
                        Load All Project Beacons as Targets
                      </button>
                    )}
                    <div style={{ marginTop: '14px', padding: '10px', background: 'rgba(15,23,42,0.5)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                      <strong style={{ color: 'var(--amber)' }}>Setout Formulae:</strong><br />
                      WCB = atan2(ΔE, ΔN) → [0°, 360°)<br />
                      D<sub>H</sub> = √(ΔE² + ΔN²)<br />
                      VA = atan(ΔZ / D<sub>H</sub>)<br />
                      <span style={{ color: 'var(--emerald)' }}>Amber dashed lines on canvas!</span>
                    </div>
                  </div>
                </div>

                {/* Design Points Grid */}
                <div className="fieldbook-table-container">
                  <div className="table-header-action-row">
                    <span className="section-subtitle">Design Points / Peg Coordinates</span>
                    <button className="btn-secondary-xs" onClick={handleAddRow}>
                      <Plus size={12} className="inline-icon" /> <span>Add Row</span>
                    </button>
                  </div>
                  <table className="fieldbook-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Point ID</th>
                        <th>Easting (m)</th>
                        <th>Northing (m)</th>
                        <th>Elevation (m)</th>
                        <th>TH (m)</th>
                        <th>Notes</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {designPoints.map((dp, idx) => (
                        <tr key={dp.id}>
                          <td className="mono-cell">{idx + 1}</td>
                          <td><input type="text" className="table-input" value={dp.pointId} onChange={e => handleUpdateRow(idx, 'pointId', e.target.value)} /></td>
                          <td><input type="number" step="0.001" className="table-input" value={dp.easting} onChange={e => handleUpdateRow(idx, 'easting', parseFloat(e.target.value) || 0)} /></td>
                          <td><input type="number" step="0.001" className="table-input" value={dp.northing} onChange={e => handleUpdateRow(idx, 'northing', parseFloat(e.target.value) || 0)} /></td>
                          <td><input type="number" step="0.001" className="table-input" value={dp.elevation ?? ''} onChange={e => handleUpdateRow(idx, 'elevation', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="opt." /></td>
                          <td><input type="number" step="0.001" className="table-input" value={dp.targetHeight ?? 1.5} onChange={e => handleUpdateRow(idx, 'targetHeight', parseFloat(e.target.value) || 1.5)} /></td>
                          <td><input type="text" className="table-input" value={dp.notes ?? ''} onChange={e => handleUpdateRow(idx, 'notes', e.target.value)} /></td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="delete-icon-btn" onClick={() => handleDeleteRow(idx)}><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* TAB 2: SETOUT SCHEDULE */
              <div className="traverse-reduction-view">
                {schedule ? (
                  <>
                    {/* Summary Card */}
                    <div className="arithmetic-check-card">
                      <div className="arithmetic-check-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Target size={16} className="text-amber" />
                          <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                            Setting Out from: {schedule.station.stationId}
                          </span>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                          E: {schedule.station.easting.toFixed(3)} | N: {schedule.station.northing.toFixed(3)} | Z: {schedule.station.elevation.toFixed(3)}m | HI: {schedule.station.instrumentHeight.toFixed(3)}m
                        </span>
                      </div>
                      <div className="arithmetic-grid">
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Total Pegs</div>
                          <div className="arithmetic-val mono-cell text-cyan" style={{ fontWeight: 700 }}>{schedule.results.length}</div>
                        </div>
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Min Distance</div>
                          <div className="arithmetic-val mono-cell">{Math.min(...schedule.results.map(r => r.horizontalDistance)).toFixed(3)}m</div>
                        </div>
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Max Distance</div>
                          <div className="arithmetic-val mono-cell">{Math.max(...schedule.results.map(r => r.horizontalDistance)).toFixed(3)}m</div>
                        </div>
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">3D Points</div>
                          <div className="arithmetic-val mono-cell text-emerald" style={{ fontWeight: 700 }}>
                            {schedule.results.filter(r => r.verticalAngle !== null).length}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Full Schedule Table */}
                    <div className="reduction-table-container">
                      <table className="reduction-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Point ID</th>
                            <th>ΔE (m)</th>
                            <th>ΔN (m)</th>
                            <th className="text-amber">D_H (m)</th>
                            <th className="text-amber">WCB (DMS)</th>
                            <th>VA</th>
                            <th>Slope Dist (m)</th>
                            <th>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedule.results.map((r, idx) => (
                            <tr key={idx}>
                              <td className="mono-cell">{idx + 1}</td>
                              <td className="mono-cell" style={{ fontWeight: 600, color: '#f8fafc' }}>{r.designPoint.pointId}</td>
                              <td className="mono-cell" style={{ color: r.deltaE >= 0 ? '#10b981' : '#f43f5e' }}>{r.deltaE >= 0 ? '+' : ''}{r.deltaE.toFixed(3)}</td>
                              <td className="mono-cell" style={{ color: r.deltaN >= 0 ? '#10b981' : '#f43f5e' }}>{r.deltaN >= 0 ? '+' : ''}{r.deltaN.toFixed(3)}</td>
                              <td className="mono-cell" style={{ fontWeight: 700, color: '#f59e0b' }}>{r.horizontalDistance.toFixed(3)}</td>
                              <td className="mono-cell" style={{ fontWeight: 700, color: '#f59e0b' }}>{r.wcbDMS}</td>
                              <td className="mono-cell" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{r.verticalAngleDMS ?? '—'}</td>
                              <td className="mono-cell">{r.slopeDistance?.toFixed(3) ?? '—'}</td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{r.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Add design points in the Design Points tab.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};
