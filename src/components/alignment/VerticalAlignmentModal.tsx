import React, { useState, useMemo } from 'react';
import {
  PVIStation,
  computeVerticalAlignment,
  formatChainage,
  DEMO_VERTICAL_PVIS
} from '../../engine/alignment/verticalAlignmentEngine';
import { CoordinatePoint } from '../../engine/types';
import { TrendingUp, Plus, Trash2, RefreshCw, Table, FileSpreadsheet, Activity, Send } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface VerticalAlignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInjectVerticalBeacons?: (beacons: CoordinatePoint[]) => void;
}

export const VerticalAlignmentModal: React.FC<VerticalAlignmentModalProps> = ({
  isOpen,
  onClose,
  onInjectVerticalBeacons
}) => {
  const [pvis, setPvis] = useState<PVIStation[]>(DEMO_VERTICAL_PVIS);
  const [interval] = useState<number>(20);
  const [activeTab, setActiveTab] = useState<'PROFILE_PLOT' | 'SCHEDULE' | 'PVI_SETUP'>('PROFILE_PLOT');

  const result = useMemo(() => {
    try {
      return computeVerticalAlignment(pvis, interval);
    } catch {
      return null;
    }
  }, [pvis, interval]);

  if (!isOpen) return null;

  const handleAddPVI = () => {
    const lastPVI = pvis[pvis.length - 1];
    const newCh = lastPVI ? lastPVI.chainage + 200 : 0;
    const newZ = lastPVI ? lastPVI.elevation + 2 : 350;
    setPvis(prev => [
      ...prev,
      {
        id: `pvi_${Date.now()}`,
        name: `PVI ${prev.length}`,
        chainage: newCh,
        elevation: newZ,
        curveLength: 100
      }
    ]);
  };

  const handleUpdatePVI = (id: string, field: keyof PVIStation, val: any) => {
    setPvis(prev => prev.map(p => (p.id === id ? { ...p, [field]: val } : p)));
  };

  const handleDeletePVI = (id: string) => {
    if (pvis.length <= 2) {
      alert('A vertical profile must have at least 2 PVI stations.');
      return;
    }
    setPvis(prev => prev.filter(p => p.id !== id));
  };

  const handleResetDemo = () => {
    setPvis(DEMO_VERTICAL_PVIS);
  };

  const handleExportCSV = () => {
    if (!result || result.profilePoints.length === 0) return;
    let csv = 'Chainage_m,Station,Tangent_Elev_m,Curve_Elev_m,Grade_Pct,Label\n';
    for (const p of result.profilePoints) {
      csv += `${p.chainage.toFixed(3)},${p.chainageStr},${p.pviElevation.toFixed(3)},${p.curveElevation.toFixed(3)},${p.gradePercent.toFixed(2)},"${p.label || ''}"\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Vertical_Road_Profile_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleApplyToCAD = () => {
    if (!result || !onInjectVerticalBeacons) return;

    const newBeacons: CoordinatePoint[] = [];
    result.profilePoints.forEach((pt) => {
      if (pt.isSpecialPoint || Math.round(pt.chainage) % 100 === 0) {
        const idStr = pt.label ? pt.label.split(' ')[0].replace(/[^A-Za-z0-9_]/g, '') : `V_CH_${Math.round(pt.chainage)}`;
        newBeacons.push({
          id: `${idStr}_${Math.round(pt.chainage)}`,
          easting: 294312.45 + pt.chainage * 0.8,
          northing: 992100.125 + pt.chainage * 0.6,
          elevation: Math.round(pt.curveElevation * 1000) / 1000,
          code: 'V_ALIGN',
          description: `Vertical Station ${pt.chainageStr} (Elev: ${pt.curveElevation.toFixed(3)}m)`
        });
      }
    });

    onInjectVerticalBeacons(newBeacons);
    alert(`Successfully applied 3D Vertical Profile Elevations for ${newBeacons.length} stations directly into your CAD coordinate database!`);
    onClose();
  };

  // SVG Plot Dimensioning
  const plotWidth = 840;
  const plotHeight = 350;
  const margin = { top: 40, right: 40, bottom: 50, left: 65 };

  const innerW = plotWidth - margin.left - margin.right;
  const innerH = plotHeight - margin.top - margin.bottom;

  const minCh = pvis[0]?.chainage || 0;
  const maxCh = pvis[pvis.length - 1]?.chainage || 1000;
  const minZ = result ? result.minElevation - 2 : 340;
  const maxZ = result ? result.maxElevation + 2 : 360;

  const scaleX = (ch: number) => margin.left + ((ch - minCh) / (maxCh - minCh || 1)) * innerW;
  const scaleY = (z: number) => margin.top + innerH - ((z - minZ) / (maxZ - minZ || 1)) * innerH;

  return (
    <ErrorBoundary fallbackTitle="Vertical Alignment Recovery">
      <div className="modal-overlay">
        <div className="modal-content leveling-modal-studio">
          
          {/* Header */}
          <div className="modal-header">
            <div className="modal-title">
              <TrendingUp size={18} className="text-emerald" />
              <span>Road Vertical Alignment &amp; Profile Studio</span>
            </div>
            <div className="header-actions-group">
              <button className="btn-secondary-sm" onClick={handleExportCSV} disabled={!result}>
                <FileSpreadsheet size={13} /> <span>Export Profile CSV</span>
              </button>
              {onInjectVerticalBeacons && (
                <button className="btn-primary-sm" onClick={handleApplyToCAD} disabled={!result}>
                  <Send size={13} /> <span>Apply Vertical Profile to CAD</span>
                </button>
              )}
              <button className="icon-btn" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="traverse-tabs-bar">
            <button
              className={`traverse-tab-btn ${activeTab === 'PROFILE_PLOT' ? 'active' : ''}`}
              onClick={() => setActiveTab('PROFILE_PLOT')}
            >
              <Activity size={14} /> <span>Longitudinal Profile SVG Plot</span>
            </button>
            <button
              className={`traverse-tab-btn ${activeTab === 'SCHEDULE' ? 'active' : ''}`}
              onClick={() => setActiveTab('SCHEDULE')}
            >
              <Table size={14} /> <span>Vertical Curve Schedule</span>
            </button>
            <button
              className={`traverse-tab-btn ${activeTab === 'PVI_SETUP' ? 'active' : ''}`}
              onClick={() => setActiveTab('PVI_SETUP')}
            >
              <TrendingUp size={14} /> <span>PVI Geometry Setup</span>
            </button>
          </div>

          {/* Content Body */}
          <div className="traverse-studio-body">
            
            {/* TAB 1: LONGITUDINAL PROFILE SVG PLOT */}
            {activeTab === 'PROFILE_PLOT' && result && (
              <div className="traverse-fieldbook-view">
                <div style={{ background: '#020617', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'center' }}>
                  <svg width={plotWidth} height={plotHeight} style={{ overflow: 'visible' }}>
                    {/* Background Grid */}
                    <rect x={margin.left} y={margin.top} width={innerW} height={innerH} fill="#020617" stroke="#1e293b" />

                    {/* Y Axis Grid Lines & Labels */}
                    {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                      const elev = minZ + pct * (maxZ - minZ);
                      const y = scaleY(elev);
                      return (
                        <g key={idx}>
                          <line x1={margin.left} y1={y} x2={margin.left + innerW} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
                          <text x={margin.left - 8} y={y + 4} fill="#64748b" fontSize="10" textAnchor="end">
                            {elev.toFixed(1)}m
                          </text>
                        </g>
                      );
                    })}

                    {/* X Axis Grid Lines & Labels */}
                    {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                      const ch = minCh + pct * (maxCh - minCh);
                      const x = scaleX(ch);
                      return (
                        <g key={idx}>
                          <line x1={x} y1={margin.top} x2={x} y2={margin.top + innerH} stroke="#1e293b" strokeDasharray="3 3" />
                          <text x={x} y={margin.top + innerH + 20} fill="#64748b" fontSize="10" textAnchor="middle">
                            {formatChainage(ch)}
                          </text>
                        </g>
                      );
                    })}

                    {/* PVI Straight Tangent Lines (Red Dashed) */}
                    <polyline
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      points={pvis.map(p => `${scaleX(p.chainage)},${scaleY(p.elevation)}`).join(' ')}
                    />

                    {/* Parabolic Vertical Curve Line (Solid Cyan) */}
                    <polyline
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2.5"
                      points={result.profilePoints.map(p => `${scaleX(p.chainage)},${scaleY(p.curveElevation)}`).join(' ')}
                    />

                    {/* PVI Station Dots */}
                    {pvis.map(p => (
                      <g key={p.id}>
                        <circle cx={scaleX(p.chainage)} cy={scaleY(p.elevation)} r="4" fill="#f43f5e" />
                        <text x={scaleX(p.chainage)} y={scaleY(p.elevation) - 10} fill="#f43f5e" fontSize="10" fontWeight="bold" textAnchor="middle">
                          {p.name}
                        </text>
                      </g>
                    ))}

                    {/* Turning Point Dots (High / Low / PVC / PVT) */}
                    {result.profilePoints.filter(p => p.isSpecialPoint).map((sp, idx) => (
                      <g key={idx}>
                        <circle cx={scaleX(sp.chainage)} cy={scaleY(sp.curveElevation)} r="4" fill="#f59e0b" />
                        <text x={scaleX(sp.chainage)} y={scaleY(sp.curveElevation) + 16} fill="#f59e0b" fontSize="9" textAnchor="middle">
                          {sp.label}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>

                {/* Summary Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  <div className="control-card" style={{ padding: '12px' }}>
                    <div className="control-card-title">Total Profile Length</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>{result.totalLength.toFixed(2)} m</div>
                  </div>
                  <div className="control-card" style={{ padding: '12px', borderColor: 'rgba(16,185,129,0.3)' }}>
                    <div className="control-card-title" style={{ color: '#34d399' }}>Vertical Curves</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#34d399' }}>{result.curveElements.length} Curves</div>
                  </div>
                  <div className="control-card" style={{ padding: '12px', borderColor: 'rgba(6,182,212,0.3)' }}>
                    <div className="control-card-title" style={{ color: 'var(--cyan)' }}>Min Elevation (Sag Dip)</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--cyan)' }}>{result.minElevation.toFixed(2)} m</div>
                  </div>
                  <div className="control-card" style={{ padding: '12px', borderColor: 'rgba(244,63,94,0.3)' }}>
                    <div className="control-card-title" style={{ color: '#fda4af' }}>Max Elevation (Crest Peak)</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#fda4af' }}>{result.maxElevation.toFixed(2)} m</div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: VERTICAL CURVE SCHEDULE */}
            {activeTab === 'SCHEDULE' && result && (
              <div className="traverse-fieldbook-view">
                <div className="table-wrapper">
                  <table className="traverse-table">
                    <thead>
                      <tr>
                        <th>PVI Name</th>
                        <th>PVI Station</th>
                        <th>PVI Elev</th>
                        <th>g1 (%)</th>
                        <th>g2 (%)</th>
                        <th>A (%)</th>
                        <th>Curve L</th>
                        <th>K</th>
                        <th>Type</th>
                        <th>PVC (Station / Elev)</th>
                        <th>PVT (Station / Elev)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.curveElements.map((c, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 700, color: '#f8fafc' }}>{c.pviName}</td>
                          <td className="mono-cell">{formatChainage(c.pviChainage)}</td>
                          <td className="mono-cell">{c.pviElevation.toFixed(2)}m</td>
                          <td className="mono-cell">{c.gradeInPercent > 0 ? `+${c.gradeInPercent}%` : `${c.gradeInPercent}%`}</td>
                          <td className="mono-cell">{c.gradeOutPercent > 0 ? `+${c.gradeOutPercent}%` : `${c.gradeOutPercent}%`}</td>
                          <td className="mono-cell" style={{ fontWeight: 700, color: '#fbbf24' }}>{c.algebraicDiffA.toFixed(2)}%</td>
                          <td className="mono-cell">{c.curveLength}m</td>
                          <td className="mono-cell">{c.kFactor}</td>
                          <td>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              background: c.type === 'CREST' ? 'rgba(16,185,129,0.15)' : 'rgba(6,182,212,0.15)',
                              color: c.type === 'CREST' ? '#34d399' : '#38bdf8',
                              border: c.type === 'CREST' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(6,182,212,0.3)'
                            }}>
                              {c.type}
                            </span>
                          </td>
                          <td className="mono-cell">{formatChainage(c.pvcChainage)} ({c.pvcElevation.toFixed(2)}m)</td>
                          <td className="mono-cell">{formatChainage(c.pvtChainage)} ({c.pvtElevation.toFixed(2)}m)</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: PVI GEOMETRY SETUP */}
            {activeTab === 'PVI_SETUP' && (
              <div className="traverse-fieldbook-view">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Define Vertical Points of Intersection (PVI) and parabolic curve lengths:
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn-secondary-sm" onClick={handleResetDemo}>
                      <RefreshCw size={13} /> <span>Load SurvPack Demo Profile</span>
                    </button>
                    <button className="btn-primary-sm" onClick={handleAddPVI}>
                      <Plus size={13} /> <span>Add PVI Station</span>
                    </button>
                  </div>
                </div>

                <div className="table-wrapper">
                  <table className="traverse-table">
                    <thead>
                      <tr>
                        <th>PVI Name</th>
                        <th>Chainage (m)</th>
                        <th>Elevation Z (m)</th>
                        <th>Parabolic Curve Length L (m)</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pvis.map((pvi) => (
                        <tr key={pvi.id}>
                          <td>
                            <input
                              type="text"
                              value={pvi.name}
                              onChange={e => handleUpdatePVI(pvi.id, 'name', e.target.value)}
                              className="table-input"
                              style={{ width: '130px' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              value={pvi.chainage}
                              onChange={e => handleUpdatePVI(pvi.id, 'chainage', parseFloat(e.target.value) || 0)}
                              className="table-input mono-cell"
                              style={{ width: '110px' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.1"
                              value={pvi.elevation}
                              onChange={e => handleUpdatePVI(pvi.id, 'elevation', parseFloat(e.target.value) || 0)}
                              className="table-input mono-cell"
                              style={{ width: '110px' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="10"
                              value={pvi.curveLength}
                              onChange={e => handleUpdatePVI(pvi.id, 'curveLength', Math.max(0, parseFloat(e.target.value) || 0))}
                              className="table-input mono-cell"
                              style={{ width: '110px' }}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => handleDeletePVI(pvi.id)}
                              className="icon-btn"
                              style={{ color: '#f43f5e' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>
    </ErrorBoundary>
  );
};
