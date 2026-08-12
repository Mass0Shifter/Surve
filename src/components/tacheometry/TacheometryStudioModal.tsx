import React, { useState, useMemo } from 'react';
import {
  TachObservation,
  TachStation,
  TachMethod,
  computeTachReduction,
  TACH_STATION_DEFAULT,
  TACH_OBSERVATIONS_DEMO
} from '../../engine/tacheometry/tachEngine';
import { CoordinatePoint } from '../../engine/types';
import { Target, Table, RefreshCw, Download, Plus, Trash2, Send } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface TacheometryStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInjectSpotHeights: (points: CoordinatePoint[]) => void;
}

export const TacheometryStudioModal: React.FC<TacheometryStudioModalProps> = ({
  isOpen,
  onClose,
  onInjectSpotHeights
}) => {
  const [activeTab, setActiveTab] = useState<'fieldbook' | 'reduction'>('fieldbook');
  const [method, setMethod] = useState<TachMethod>('STADIA');
  const [station, setStation] = useState<TachStation>(TACH_STATION_DEFAULT);
  const [observations, setObservations] = useState<TachObservation[]>(TACH_OBSERVATIONS_DEMO);

  const result = useMemo(() => {
    try {
      if (!observations || observations.length === 0) return null;
      return computeTachReduction(station, observations, method);
    } catch (e) {
      return null;
    }
  }, [station, observations, method]);

  if (!isOpen) return null;

  const handleAddObs = () => {
    const nextId = (observations.length + 1).toString();
    const newObs: TachObservation = {
      id: Date.now().toString(),
      pointId: `SP_${nextId.padStart(2, '0')}`,
      wcbDeg: 0, wcbMin: 0, wcbSec: 0,
      upper: null, middle: null, lower: null,
      slopeDistance: null,
      verticalAngleDeg: 0, verticalAngleMin: 0, verticalAngleSec: 0,
      targetHeight: 1.500,
      remarks: 'Spot Height'
    };
    setObservations([...observations, newObs]);
  };

  const handleDeleteObs = (idx: number) => {
    setObservations(observations.filter((_, i) => i !== idx));
  };

  const handleUpdateObs = (idx: number, field: keyof TachObservation, value: any) => {
    const updated = [...observations];
    updated[idx] = { ...updated[idx], [field]: value };
    setObservations(updated);
  };

  const handleLoadDemo = () => {
    setStation(TACH_STATION_DEFAULT);
    setObservations(TACH_OBSERVATIONS_DEMO);
    setMethod('STADIA');
  };

  const handleUpdateStation = (field: keyof TachStation, value: any) => {
    setStation(prev => ({ ...prev, [field]: value }));
  };

  const handleInjectToCAD = () => {
    if (!result || result.rows.length === 0) {
      alert('No valid reductions to inject. Check your field book entries.');
      return;
    }
    const cadPoints: CoordinatePoint[] = result.rows.map(r => ({
      id: r.pointId,
      easting: r.computedE,
      northing: r.computedN,
      elevation: r.computedZ,
      code: 'SP',
      description: r.remarks || 'Tacheometry Spot Height'
    }));
    onInjectSpotHeights(cadPoints);
    alert(`Success: Injected ${cadPoints.length} 3D spot height points into the CAD workspace!`);
    onClose();
  };

  const handleExportCSV = () => {
    if (!result) return;
    let csv = `STADIA TACHEOMETRY REDUCTION (${result.method})\n`;
    csv += `Occupied Station: ${result.station.stationId} | E: ${result.station.easting} | N: ${result.station.northing} | Z: ${result.station.elevation}m | HI: ${result.station.instrumentHeight}m\n\n`;
    csv += `Point,WCB_deg,VA_deg,Staff_s,D_H_m,V_m,dE_m,dN_m,dZ_m,E_m,N_m,Z_m,Remarks\n`;
    for (const r of result.rows) {
      csv += `"${r.pointId}",${r.wcb.toFixed(4)},${r.verticalAngle.toFixed(4)},${r.staffIntercept !== null ? r.staffIntercept.toFixed(3) : ''},${r.horizontalDistance.toFixed(3)},${r.verticalComponent.toFixed(3)},${r.deltaE.toFixed(3)},${r.deltaN.toFixed(3)},${r.deltaZ.toFixed(3)},${r.computedE.toFixed(3)},${r.computedN.toFixed(3)},${r.computedZ.toFixed(3)},"${r.remarks}"\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${station.stationId}_tacheometry.csv`;
    a.click();
  };

  return (
    <ErrorBoundary fallbackTitle="Tacheometry Studio Recovery">
      <div className="modal-overlay">
        <div className="modal-content leveling-modal-studio">
          {/* Header */}
          <div className="modal-header">
            <div className="modal-title">
              <Target size={18} className="text-amber" />
              <span>Stadia &amp; Total Station Tacheometry Studio</span>
            </div>
            <div className="header-actions-group">
              <button className="btn-secondary-sm" onClick={handleLoadDemo}>
                <RefreshCw size={13} /> <span>Load Demo (ABJ_TACH)</span>
              </button>
              <button className="btn-secondary-sm" onClick={handleExportCSV} disabled={!result}>
                <Download size={13} /> <span>Export CSV</span>
              </button>
              <button className="btn-primary-sm" onClick={handleInjectToCAD} disabled={!result}>
                <Send size={13} /> <span>Inject Spot Heights to CAD</span>
              </button>
              <button className="icon-btn" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="traverse-tabs-bar">
            <button
              className={`traverse-tab-btn ${activeTab === 'fieldbook' ? 'active' : ''}`}
              onClick={() => setActiveTab('fieldbook')}
            >
              <Table size={14} /> <span>Theodolite Field Book ({observations.length} Obs)</span>
            </button>
            <button
              className={`traverse-tab-btn ${activeTab === 'reduction' ? 'active' : ''}`}
              onClick={() => setActiveTab('reduction')}
            >
              <Target size={14} /> <span>Computed 3D Coordinates {result ? `(${result.rows.length} Points)` : ''}</span>
            </button>
          </div>

          <div className="traverse-studio-body">
            {activeTab === 'fieldbook' ? (
              <div className="traverse-fieldbook-view">
                {/* Station & Method Setup */}
                <div className="traverse-control-bar">
                  <div className="control-card">
                    <div className="control-card-title">Occupied Station (Instrument Position)</div>
                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Station ID</label>
                        <input type="text" value={station.stationId} onChange={e => handleUpdateStation('stationId', e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label>Instrument Height HI (m)</label>
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
                    <div className="control-card-title">Observation Method</div>
                    <div className="form-group">
                      <label>Instrument Type</label>
                      <select value={method} onChange={e => setMethod(e.target.value as TachMethod)}>
                        <option value="STADIA">Stadia Tacheometry (Upper / Mid / Lower Staff)</option>
                        <option value="TOTAL_STATION">Total Station (Slope Distance + Vertical Angle)</option>
                      </select>
                    </div>
                    <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(15,23,42,0.5)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                      {method === 'STADIA' ? (
                        <>
                          <strong style={{ color: 'var(--cyan)' }}>Stadia Formulae:</strong><br />
                          s = Upper − Lower<br />
                          D<sub>H</sub> = 100·s·cos²θ<br />
                          V = 50·s·sin(2θ)<br />
                          Z = Z<sub>stn</sub> + HI + V − MR
                        </>
                      ) : (
                        <>
                          <strong style={{ color: 'var(--cyan)' }}>Total Station Formulae:</strong><br />
                          D<sub>H</sub> = SD·sin(VA)<br />
                          V = SD·cos(VA)<br />
                          Z = Z<sub>stn</sub> + HI + V − TH
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Observations Grid */}
                <div className="fieldbook-table-container">
                  <div className="table-header-action-row">
                    <span className="section-subtitle">Theodolite Observations (WCB + Staff/Distance + VA)</span>
                    <button className="btn-secondary-xs" onClick={handleAddObs}>
                      <Plus size={12} className="inline-icon" /> <span>Add Observation</span>
                    </button>
                  </div>
                  <table className="fieldbook-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Point ID</th>
                        <th>WCB° '</th>
                        <th>VA° '</th>
                        {method === 'STADIA' ? (
                          <>
                            <th>Upper (m)</th>
                            <th>Middle (m)</th>
                            <th>Lower (m)</th>
                          </>
                        ) : (
                          <th>Slope Dist (m)</th>
                        )}
                        <th>TH (m)</th>
                        <th>Remarks</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {observations.map((obs, idx) => (
                        <tr key={obs.id}>
                          <td className="mono-cell">{idx + 1}</td>
                          <td><input type="text" className="table-input" value={obs.pointId} onChange={e => handleUpdateObs(idx, 'pointId', e.target.value)} /></td>
                          <td>
                            <div className="dms-input-row-sm">
                              <input type="number" className="table-input-dms" value={obs.wcbDeg} onChange={e => handleUpdateObs(idx, 'wcbDeg', parseFloat(e.target.value) || 0)} />
                              <span>°</span>
                              <input type="number" className="table-input-dms" value={obs.wcbMin} onChange={e => handleUpdateObs(idx, 'wcbMin', parseFloat(e.target.value) || 0)} />
                              <span>'</span>
                            </div>
                          </td>
                          <td>
                            <div className="dms-input-row-sm">
                              <input type="number" className="table-input-dms" value={obs.verticalAngleDeg} onChange={e => handleUpdateObs(idx, 'verticalAngleDeg', parseFloat(e.target.value) || 0)} />
                              <span>°</span>
                              <input type="number" className="table-input-dms" value={obs.verticalAngleMin} onChange={e => handleUpdateObs(idx, 'verticalAngleMin', parseFloat(e.target.value) || 0)} />
                              <span>'</span>
                            </div>
                          </td>
                          {method === 'STADIA' ? (
                            <>
                              <td><input type="number" step="0.001" className="table-input" value={obs.upper ?? ''} onChange={e => handleUpdateObs(idx, 'upper', e.target.value === '' ? null : parseFloat(e.target.value))} /></td>
                              <td><input type="number" step="0.001" className="table-input" value={obs.middle ?? ''} onChange={e => handleUpdateObs(idx, 'middle', e.target.value === '' ? null : parseFloat(e.target.value))} /></td>
                              <td><input type="number" step="0.001" className="table-input" value={obs.lower ?? ''} onChange={e => handleUpdateObs(idx, 'lower', e.target.value === '' ? null : parseFloat(e.target.value))} /></td>
                            </>
                          ) : (
                            <td><input type="number" step="0.001" className="table-input" value={obs.slopeDistance ?? ''} onChange={e => handleUpdateObs(idx, 'slopeDistance', e.target.value === '' ? null : parseFloat(e.target.value))} /></td>
                          )}
                          <td><input type="number" step="0.001" className="table-input" value={obs.targetHeight} onChange={e => handleUpdateObs(idx, 'targetHeight', parseFloat(e.target.value) || 1.5)} /></td>
                          <td><input type="text" className="table-input" value={obs.remarks ?? ''} onChange={e => handleUpdateObs(idx, 'remarks', e.target.value)} /></td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="delete-icon-btn" onClick={() => handleDeleteObs(idx)}><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* TAB 2: COMPUTED 3D COORDINATES */
              <div className="traverse-reduction-view">
                {result ? (
                  <>
                    {/* Station Summary Card */}
                    <div className="arithmetic-check-card">
                      <div className="arithmetic-check-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Target size={16} className="text-amber" />
                          <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                            Reduction from Station: {result.station.stationId} | Method: {result.method === 'STADIA' ? 'Stadia Tacheometry (K=100, C=0)' : 'Total Station (Slope Distance)'}
                          </span>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                          E: {result.station.easting.toFixed(3)} | N: {result.station.northing.toFixed(3)} | Z: {result.station.elevation.toFixed(3)}m | HI: {result.station.instrumentHeight.toFixed(3)}m
                        </span>
                      </div>
                      <div className="arithmetic-grid">
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Total Observations</div>
                          <div className="arithmetic-val mono-cell text-cyan" style={{ fontWeight: 700 }}>{result.rows.length}</div>
                        </div>
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Min Elevation</div>
                          <div className="arithmetic-val mono-cell">{Math.min(...result.rows.map(r => r.computedZ)).toFixed(3)}m</div>
                        </div>
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Max Elevation</div>
                          <div className="arithmetic-val mono-cell">{Math.max(...result.rows.map(r => r.computedZ)).toFixed(3)}m</div>
                        </div>
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Terrain Relief</div>
                          <div className="arithmetic-val mono-cell text-emerald" style={{ fontWeight: 700 }}>
                            {(Math.max(...result.rows.map(r => r.computedZ)) - Math.min(...result.rows.map(r => r.computedZ))).toFixed(3)}m
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Full Reduction Table */}
                    <div className="reduction-table-container">
                      <table className="reduction-table">
                        <thead>
                          <tr>
                            <th>Point</th>
                            <th>WCB (°)</th>
                            <th>VA (°)</th>
                            {result.method === 'STADIA' ? <th>s (m)</th> : null}
                            <th>D_H (m)</th>
                            <th>V (m)</th>
                            <th>ΔE (m)</th>
                            <th>ΔN (m)</th>
                            <th>ΔZ (m)</th>
                            <th>Easting</th>
                            <th>Northing</th>
                            <th className="text-emerald">Elevation Z</th>
                            <th>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="mono-cell" style={{ fontWeight: 600, color: '#f8fafc' }}>{row.pointId}</td>
                              <td className="mono-cell">{row.wcb.toFixed(2)}</td>
                              <td className="mono-cell" style={{ color: row.verticalAngle >= 0 ? '#10b981' : '#f43f5e' }}>{row.verticalAngle.toFixed(2)}</td>
                              {result.method === 'STADIA' ? <td className="mono-cell">{row.staffIntercept !== null ? row.staffIntercept.toFixed(3) : '-'}</td> : null}
                              <td className="mono-cell">{row.horizontalDistance.toFixed(3)}</td>
                              <td className="mono-cell" style={{ color: row.verticalComponent >= 0 ? '#10b981' : '#f43f5e' }}>{row.verticalComponent >= 0 ? '+' : ''}{row.verticalComponent.toFixed(3)}</td>
                              <td className="mono-cell">{row.deltaE >= 0 ? '+' : ''}{row.deltaE.toFixed(3)}</td>
                              <td className="mono-cell">{row.deltaN >= 0 ? '+' : ''}{row.deltaN.toFixed(3)}</td>
                              <td className="mono-cell" style={{ color: row.deltaZ >= 0 ? '#10b981' : '#f43f5e' }}>{row.deltaZ >= 0 ? '+' : ''}{row.deltaZ.toFixed(3)}</td>
                              <td className="mono-cell" style={{ fontWeight: 600 }}>{row.computedE.toFixed(3)}</td>
                              <td className="mono-cell" style={{ fontWeight: 600 }}>{row.computedN.toFixed(3)}</td>
                              <td className="mono-cell text-emerald" style={{ fontWeight: 700 }}>{row.computedZ.toFixed(3)}</td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{row.remarks}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="empty-state-card" style={{ padding: '30px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>Add observations in the Field Book tab.</p>
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
