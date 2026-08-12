import React, { useState, useMemo, useEffect } from 'react';
import {
  IntersectionPoint,
  computeAlignment,
  formatChainage,
  DEMO_ALIGNMENT_IPS
} from '../../engine/alignment/alignmentEngine';
import {
  computeEarthworks,
  FormationParams
} from '../../engine/alignment/earthworksEngine';
import { CoordinatePoint, AlignmentOverlay } from '../../engine/types';
import { Compass, Table, RefreshCw, Download, Plus, Trash2, Layers, Send } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface AlignmentStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingPoints: CoordinatePoint[];
  onOverlayChange: (overlay: AlignmentOverlay | null) => void;
  onInjectAlignmentPoints: (points: CoordinatePoint[]) => void;
}

export const AlignmentStudioModal: React.FC<AlignmentStudioModalProps> = ({
  isOpen,
  onClose,
  existingPoints,
  onOverlayChange,
  onInjectAlignmentPoints
}) => {
  const [activeTab, setActiveTab] = useState<'ips' | 'curves' | 'earthworks'>('ips');
  const [ips, setIps] = useState<IntersectionPoint[]>(DEMO_ALIGNMENT_IPS);
  const [interval, setInterval] = useState<number>(20);

  // Formation params for earthworks
  const [formationParams, setFormationParams] = useState<FormationParams>({
    formationWidth: 10.0,
    sideSlopeRatio: 1.5,
    defaultFormationZ: 348.0
  });

  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number>(0);

  // Compute horizontal alignment
  const alignmentResult = useMemo(() => {
    try {
      if (ips.length < 2) return null;
      return computeAlignment(ips, interval);
    } catch {
      return null;
    }
  }, [ips, interval]);

  // Compute earthworks volumes
  const earthworksResult = useMemo(() => {
    try {
      if (!alignmentResult || alignmentResult.chainagePoints.length === 0) return null;
      return computeEarthworks(alignmentResult.chainagePoints, existingPoints, formationParams);
    } catch {
      return null;
    }
  }, [alignmentResult, existingPoints, formationParams]);

  // Update CAD canvas overlay while modal is open
  useEffect(() => {
    if (!isOpen || !alignmentResult) {
      onOverlayChange(null);
      return;
    }
    onOverlayChange({
      tangentSegments: alignmentResult.tangentSegments,
      curveArcs: alignmentResult.curveArcs,
      chainagePoints: alignmentResult.chainagePoints.map(cp => ({
        chainageStr: cp.chainageStr,
        easting: cp.easting,
        northing: cp.northing,
        isTangentPoint: cp.isTangentPoint,
        label: cp.label
      }))
    });
  }, [isOpen, alignmentResult, onOverlayChange]);

  const handleClose = () => {
    onOverlayChange(null);
    onClose();
  };

  const handleInjectToCAD = () => {
    if (!alignmentResult || alignmentResult.chainagePoints.length === 0) {
      alert('No alignment points to inject.');
      return;
    }
    const cadPoints: CoordinatePoint[] = alignmentResult.chainagePoints
      .filter(cp => cp.isTangentPoint || cp.label)
      .map(cp => ({
        id: cp.label || `CH_${cp.chainageStr}`,
        easting: cp.easting,
        northing: cp.northing,
        elevation: cp.elevation,
        code: 'ALIGN',
        description: `Road Alignment ${cp.chainageStr}`
      }));
    onInjectAlignmentPoints(cadPoints);
    alert(`Success: Injected ${cadPoints.length} alignment beacons into the CAD workspace!`);
  };

  if (!isOpen) return null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLoadDemo = () => {
    setIps(DEMO_ALIGNMENT_IPS);
    setInterval(20);
  };

  const handleAddIP = () => {
    const idx = ips.length;
    const last = ips[ips.length - 1];
    setIps(prev => [...prev, {
      id: Date.now().toString(),
      name: `IP ${idx}`,
      easting: (last ? last.easting : 294000) + 200,
      northing: (last ? last.northing : 992000) + 100,
      elevation: last ? last.elevation : 348,
      radius: 100
    }]);
  };

  const handleDeleteIP = (idx: number) => {
    setIps(prev => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateIP = (idx: number, field: keyof IntersectionPoint, val: any) => {
    setIps(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleExportCSV = () => {
    if (!alignmentResult) return;
    let csv = `HORIZONTAL ALIGNMENT & EARTHWORKS REPORT\n`;
    csv += `Total Alignment Length: ${alignmentResult.totalLength.toFixed(3)}m | Chainage Interval: ${interval}m\n\n`;

    csv += `CURVE ELEMENTS TABLE\n`;
    csv += `IP Name,Radius (m),Deflection Angle,Tangent T (m),Curve L (m),Long Chord C (m),External E (m),BC Chainage,EC Chainage\n`;
    for (const c of alignmentResult.curveElements) {
      csv += `"${c.ipName}",${c.radius},"${c.deflectionAngleDMS}",${c.tangentLength.toFixed(3)},${c.curveLength.toFixed(3)},${c.longChord.toFixed(3)},${c.externalDistance.toFixed(3)},"${c.bcChainage.toFixed(3)}","${c.ecChainage.toFixed(3)}"\n`;
    }

    if (earthworksResult) {
      csv += `\nEARTHWORKS VOLUME REPORT (Formation Width: ${formationParams.formationWidth}m, Side Slope: 1:${formationParams.sideSlopeRatio})\n`;
      csv += `From Station,To Station,Distance (m),End Area Cut (m³),End Area Fill (m³),Prismoidal Cut (m³),Prismoidal Fill (m³)\n`;
      for (const v of earthworksResult.volumeSegments) {
        csv += `"${v.fromChainageStr}","${v.toChainageStr}",${v.distance.toFixed(3)},${v.endAreaCutVol.toFixed(3)},${v.endAreaFillVol.toFixed(3)},${v.prismoidalCutVol.toFixed(3)},${v.prismoidalFillVol.toFixed(3)}\n`;
      }
      csv += `\nTOTALS\n`;
      csv += `End Area Total Cut: ${earthworksResult.totalEndAreaCutVol.toFixed(3)} m³ | End Area Total Fill: ${earthworksResult.totalEndAreaFillVol.toFixed(3)} m³\n`;
      csv += `Prismoidal Total Cut: ${earthworksResult.totalPrismoidalCutVol.toFixed(3)} m³ | Prismoidal Total Fill: ${earthworksResult.totalPrismoidalFillVol.toFixed(3)} m³\n`;
      csv += `Net Balance: ${earthworksResult.netVolume >= 0 ? '+' : ''}${earthworksResult.netVolume.toFixed(3)} m³\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'road_alignment_earthworks.csv';
    a.click();
  };

  const currentSection = earthworksResult && earthworksResult.sections[selectedSectionIdx];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary fallbackTitle="Alignment Studio Recovery">
      <div className="modal-overlay">
        <div className="modal-content leveling-modal-studio">

          {/* Header */}
          <div className="modal-header">
            <div className="modal-title">
              <Compass size={18} className="text-magenta" style={{ color: '#ec4899' }} />
              <span>Horizontal Alignment &amp; Earthworks Studio</span>
            </div>
            <div className="header-actions-group">
              <button className="btn-secondary-sm" onClick={handleLoadDemo}>
                <RefreshCw size={13} /> <span>Load Demo Alignment</span>
              </button>
              <button className="btn-secondary-sm" onClick={handleExportCSV} disabled={!alignmentResult}>
                <Download size={13} /> <span>Export CSV Report</span>
              </button>
              <button className="btn-primary-sm" onClick={handleInjectToCAD} disabled={!alignmentResult}>
                <Send size={13} /> <span>Inject Beacons to CAD</span>
              </button>
              <button className="icon-btn" onClick={handleClose}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="traverse-tabs-bar">
            <button className={`traverse-tab-btn ${activeTab === 'ips' ? 'active' : ''}`} onClick={() => setActiveTab('ips')}>
              <Plus size={14} /> <span>Intersection Points ({ips.length} IPs)</span>
            </button>
            <button className={`traverse-tab-btn ${activeTab === 'curves' ? 'active' : ''}`} onClick={() => setActiveTab('curves')}>
              <Table size={14} /> <span>Curve Elements &amp; Chainages {alignmentResult ? `(${alignmentResult.totalLength.toFixed(1)}m)` : ''}</span>
            </button>
            <button className={`traverse-tab-btn ${activeTab === 'earthworks' ? 'active' : ''}`} onClick={() => setActiveTab('earthworks')}>
              <Layers size={14} /> <span>Cross-Sections &amp; Earthworks Volumes</span>
            </button>
          </div>

          <div className="traverse-studio-body">

            {/* TAB 1: INTERSECTION POINTS */}
            {activeTab === 'ips' ? (
              <div className="traverse-fieldbook-view">

                <div className="traverse-control-bar">
                  <div className="control-card">
                    <div className="control-card-title">Alignment Parameters</div>
                    <div className="form-group">
                      <label>Chainage Interval (m)</label>
                      <input
                        type="number"
                        value={interval}
                        min={5}
                        max={100}
                        onChange={e => setInterval(parseInt(e.target.value) || 20)}
                      />
                    </div>
                  </div>
                  <div className="control-card">
                    <div className="control-card-title">Horizontal Alignment Summary</div>
                    <div style={{ padding: '8px', background: 'rgba(15,23,42,0.5)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.7' }}>
                      <strong style={{ color: '#ec4899' }}>Curves &amp; Tangents:</strong><br />
                      Total Length: <strong style={{ color: '#f8fafc' }}>{alignmentResult ? `${alignmentResult.totalLength.toFixed(2)} m` : '0 m'}</strong><br />
                      Circular Curves: <strong style={{ color: '#f8fafc' }}>{alignmentResult ? alignmentResult.curveElements.length : 0}</strong><br />
                      <span style={{ color: 'var(--emerald)' }}>Cyan tangents + Vivid magenta circular arcs on CAD canvas!</span>
                    </div>
                  </div>
                </div>

                <div className="fieldbook-table-container">
                  <div className="table-header-action-row">
                    <span className="section-subtitle">Intersection Points (IPs) &amp; Design Radii</span>
                    <button className="btn-secondary-xs" onClick={handleAddIP}>
                      <Plus size={12} className="inline-icon" /> <span>Add IP</span>
                    </button>
                  </div>
                  <table className="fieldbook-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>IP Name</th>
                        <th>Easting (m)</th>
                        <th>Northing (m)</th>
                        <th>Elevation (m)</th>
                        <th style={{ color: '#ec4899' }}>Radius R (m)</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ips.map((ip, idx) => (
                        <tr key={ip.id}>
                          <td className="mono-cell">{idx + 1}</td>
                          <td><input type="text" className="table-input" value={ip.name} onChange={e => handleUpdateIP(idx, 'name', e.target.value)} /></td>
                          <td><input type="number" step="0.001" className="table-input" value={ip.easting} onChange={e => handleUpdateIP(idx, 'easting', parseFloat(e.target.value) || 0)} /></td>
                          <td><input type="number" step="0.001" className="table-input" value={ip.northing} onChange={e => handleUpdateIP(idx, 'northing', parseFloat(e.target.value) || 0)} /></td>
                          <td><input type="number" step="0.001" className="table-input" value={ip.elevation ?? ''} onChange={e => handleUpdateIP(idx, 'elevation', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="opt." /></td>
                          <td><input type="number" step="1" className="table-input" value={ip.radius} onChange={e => handleUpdateIP(idx, 'radius', parseFloat(e.target.value) || 0)} placeholder="0 = sharp" /></td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="delete-icon-btn" onClick={() => handleDeleteIP(idx)}><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : activeTab === 'curves' ? (
              /* TAB 2: CURVE ELEMENTS & CHAINAGE SCHEDULE */
              <div className="traverse-reduction-view">
                {alignmentResult ? (
                  <>
                    <div className="arithmetic-check-card">
                      <div className="arithmetic-check-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Compass size={16} className="text-magenta" style={{ color: '#ec4899' }} />
                          <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                            Horizontal Curve Elements Summary ({alignmentResult.curveElements.length} Curves)
                          </span>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                          Total Stationing: {alignmentResult.totalLength.toFixed(3)}m
                        </span>
                      </div>

                      <div className="reduction-table-container" style={{ maxHeight: '180px', marginBottom: '14px' }}>
                        <table className="reduction-table">
                          <thead>
                            <tr>
                              <th>Curve</th>
                              <th>Radius R</th>
                              <th style={{ color: '#ec4899' }}>Deflection Δ</th>
                              <th>Tangent T</th>
                              <th>Length L</th>
                              <th>Long Chord C</th>
                              <th>Ext. Dist E</th>
                              <th>BC Station</th>
                              <th>EC Station</th>
                            </tr>
                          </thead>
                          <tbody>
                            {alignmentResult.curveElements.map((c, idx) => (
                              <tr key={idx}>
                                <td className="mono-cell" style={{ fontWeight: 600, color: '#f8fafc' }}>{c.ipName}</td>
                                <td className="mono-cell">{c.radius}m</td>
                                <td className="mono-cell" style={{ fontWeight: 700, color: '#ec4899' }}>{c.deflectionAngleDMS}</td>
                                <td className="mono-cell">{c.tangentLength.toFixed(3)}m</td>
                                <td className="mono-cell">{c.curveLength.toFixed(3)}m</td>
                                <td className="mono-cell">{c.longChord.toFixed(3)}m</td>
                                <td className="mono-cell">{c.externalDistance.toFixed(3)}m</td>
                                <td className="mono-cell text-emerald">{formatChainage(c.bcChainage)}</td>
                                <td className="mono-cell text-cyan">{formatChainage(c.ecChainage)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Discretized Chainage Schedule */}
                    <div className="reduction-table-container">
                      <div style={{ padding: '8px 12px', background: 'rgba(15,23,42,0.7)', borderBottom: '1px solid rgba(148,163,184,0.1)', fontSize: '11px', fontWeight: 600, color: '#f8fafc' }}>
                        Stationing &amp; Tangent Point Schedule (Interval: {interval}m)
                      </div>
                      <table className="reduction-table">
                        <thead>
                          <tr>
                            <th>Chainage</th>
                            <th>Stationing</th>
                            <th>Easting (m)</th>
                            <th>Northing (m)</th>
                            <th>Tangent Bearing</th>
                            <th>Point Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alignmentResult.chainagePoints.map((cp, idx) => (
                            <tr key={idx} style={{ backgroundColor: cp.isTangentPoint ? 'rgba(236,72,153,0.12)' : undefined }}>
                              <td className="mono-cell">{cp.chainage.toFixed(2)}m</td>
                              <td className="mono-cell" style={{ fontWeight: 700, color: cp.isTangentPoint ? '#ec4899' : '#38bdf8' }}>{cp.chainageStr}</td>
                              <td className="mono-cell">{cp.easting.toFixed(3)}</td>
                              <td className="mono-cell">{cp.northing.toFixed(3)}</td>
                              <td className="mono-cell">{cp.bearingDeg.toFixed(2)}°</td>
                              <td style={{ fontWeight: cp.isTangentPoint ? 700 : 400, color: cp.isTangentPoint ? '#ec4899' : 'var(--text-muted)' }}>
                                {cp.label || 'Regular Station'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Add at least 2 Intersection Points (IPs) in the IPs tab.
                  </div>
                )}
              </div>
            ) : (
              /* TAB 3: CROSS-SECTIONS & EARTHWORKS VOLUMES */
              <div className="traverse-reduction-view">
                {earthworksResult ? (
                  <>
                    {/* Formation Controls & Total Volume Summary */}
                    <div className="arithmetic-check-card">
                      <div className="arithmetic-check-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Layers size={16} className="text-emerald" />
                          <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                            Earthworks Volume Totals ({earthworksResult.sections.length} Cross-Sections)
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>W (m):</label>
                          <input
                            type="number"
                            style={{ width: '60px', padding: '2px 4px', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '11px', borderRadius: '4px' }}
                            value={formationParams.formationWidth}
                            onChange={e => setFormationParams({ ...formationParams, formationWidth: parseFloat(e.target.value) || 10 })}
                          />
                          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Side Slope (s:1):</label>
                          <input
                            type="number"
                            step="0.1"
                            style={{ width: '60px', padding: '2px 4px', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: '#fff', fontSize: '11px', borderRadius: '4px' }}
                            value={formationParams.sideSlopeRatio}
                            onChange={e => setFormationParams({ ...formationParams, sideSlopeRatio: parseFloat(e.target.value) || 1.5 })}
                          />
                        </div>
                      </div>

                      <div className="arithmetic-grid">
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">End Area Cut</div>
                          <div className="arithmetic-val mono-cell" style={{ fontWeight: 700, color: '#f43f5e' }}>
                            {earthworksResult.totalEndAreaCutVol.toLocaleString()} m³
                          </div>
                        </div>
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">End Area Fill</div>
                          <div className="arithmetic-val mono-cell" style={{ fontWeight: 700, color: '#38bdf8' }}>
                            {earthworksResult.totalEndAreaFillVol.toLocaleString()} m³
                          </div>
                        </div>
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Prismoidal Cut</div>
                          <div className="arithmetic-val mono-cell" style={{ fontWeight: 700, color: '#f43f5e' }}>
                            {earthworksResult.totalPrismoidalCutVol.toLocaleString()} m³
                          </div>
                        </div>
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Prismoidal Fill</div>
                          <div className="arithmetic-val mono-cell" style={{ fontWeight: 700, color: '#38bdf8' }}>
                            {earthworksResult.totalPrismoidalFillVol.toLocaleString()} m³
                          </div>
                        </div>
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Net Balance</div>
                          <div className="arithmetic-val mono-cell" style={{ fontWeight: 700, color: earthworksResult.netVolume >= 0 ? '#10b981' : '#f59e0b' }}>
                            {earthworksResult.netVolume >= 0 ? '+' : ''}{earthworksResult.netVolume.toLocaleString()} m³
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section Selector & SVG Cross-Section Graph */}
                    {currentSection && (
                      <div className="arithmetic-check-card" style={{ marginTop: '10px', background: 'rgba(15,23,42,0.85)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                            Cross-Section Profile @ Station <strong style={{ color: '#38bdf8' }}>{currentSection.chainageStr}</strong>
                          </span>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              className="btn-secondary-xs"
                              disabled={selectedSectionIdx === 0}
                              onClick={() => setSelectedSectionIdx(prev => prev - 1)}
                            >
                              ◀ Prev
                            </button>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                              {selectedSectionIdx + 1} / {earthworksResult.sections.length}
                            </span>
                            <button
                              className="btn-secondary-xs"
                              disabled={selectedSectionIdx === earthworksResult.sections.length - 1}
                              onClick={() => setSelectedSectionIdx(prev => prev + 1)}
                            >
                              Next ▶
                            </button>
                          </div>
                        </div>

                        {/* Interactive SVG Cross-Section Plot */}
                        <div style={{ width: '100%', height: '140px', background: '#020617', borderRadius: '6px', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="100%" height="100%" viewBox="-20 -20 200 120" preserveAspectRatio="xMidYMid meet">
                            {/* Ground Profile Line (Brown/Orange) */}
                            <path
                              d={`M 0,${60 - (currentSection.profilePoints[0]?.depth || 0) * 10} L 30,${60 - (currentSection.profilePoints[1]?.depth || 0) * 10} L 60,${60 - (currentSection.profilePoints[2]?.depth || 0) * 10} L 100,${60 - (currentSection.profilePoints[3]?.depth || 0) * 10} L 140,${60 - (currentSection.profilePoints[4]?.depth || 0) * 10} L 170,${60 - (currentSection.profilePoints[5]?.depth || 0) * 10} L 200,${60 - (currentSection.profilePoints[6]?.depth || 0) * 10}`}
                              fill="none"
                              stroke="#f59e0b"
                              strokeWidth="2.5"
                            />
                            {/* Formation Design Bed (Cyan) */}
                            <line x1="60" y1="60" x2="140" y2="60" stroke="#38bdf8" strokeWidth="3" />
                            {/* Side Slopes */}
                            <line x1="60" y1="60" x2="30" y2="80" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 3" />
                            <line x1="140" y1="60" x2="170" y2="80" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 3" />

                            {/* Labels */}
                            <text x="100" y="52" fill="#38bdf8" fontSize="8" textAnchor="middle" fontWeight="bold">Formation Bed (W={formationParams.formationWidth}m)</text>
                            <text x="100" y="75" fill="#f59e0b" fontSize="8" textAnchor="middle">Ground Profile Z={currentSection.groundZ.toFixed(2)}m</text>
                          </svg>
                        </div>
                      </div>
                    )}

                    {/* Earthworks Table */}
                    <div className="reduction-table-container" style={{ marginTop: '10px' }}>
                      <table className="reduction-table">
                        <thead>
                          <tr>
                            <th>Station</th>
                            <th>Ground Z</th>
                            <th>Design Z</th>
                            <th>Cut Area (m²)</th>
                            <th>Fill Area (m²)</th>
                            <th>Section Type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {earthworksResult.sections.map((sec, idx) => (
                            <tr key={idx} style={{ backgroundColor: selectedSectionIdx === idx ? 'rgba(56,189,248,0.12)' : undefined }} onClick={() => setSelectedSectionIdx(idx)}>
                              <td className="mono-cell" style={{ fontWeight: 700, color: '#38bdf8', cursor: 'pointer' }}>{sec.chainageStr}</td>
                              <td className="mono-cell">{sec.groundZ.toFixed(3)}m</td>
                              <td className="mono-cell">{sec.designZ.toFixed(3)}m</td>
                              <td className="mono-cell" style={{ color: sec.cutArea > 0 ? '#f43f5e' : undefined, fontWeight: sec.cutArea > 0 ? 700 : 400 }}>
                                {sec.cutArea.toFixed(2)}
                              </td>
                              <td className="mono-cell" style={{ color: sec.fillArea > 0 ? '#38bdf8' : undefined, fontWeight: sec.fillArea > 0 ? 700 : 400 }}>
                                {sec.fillArea.toFixed(2)}
                              </td>
                              <td className="mono-cell" style={{ fontWeight: 600, color: sec.type === 'CUT' ? '#f43f5e' : sec.type === 'FILL' ? '#38bdf8' : 'var(--text-muted)' }}>
                                {sec.type}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Add IPs in the IPs tab to compute cross-sections and volumes.
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
