import React, { useState, useMemo } from 'react';
import {
  SubdivisionMethod,
  SubdivisionResult,
  computeSubdivision
} from '../../engine/subdivision/subdivisionEngine';
import { Parcel, CoordinatePoint } from '../../engine/types';
import { computeParcel } from '../../engine/cogo';
import { Layers, Table, Send, ArrowRightLeft, CheckCircle2 } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface SubdivisionStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  parcels: Parcel[];
  existingPoints: CoordinatePoint[];
  onApplySubdivision: (
    parentParcelId: string,
    childA: Parcel,
    childB: Parcel,
    newBeacons: CoordinatePoint[]
  ) => void;
}

export const SubdivisionStudioModal: React.FC<SubdivisionStudioModalProps> = ({
  isOpen,
  onClose,
  parcels,
  existingPoints,
  onApplySubdivision
}) => {
  const [activeTab, setActiveTab] = useState<'config' | 'results'>('config');

  // Selected parent parcel
  const [selectedParcelId, setSelectedParcelId] = useState<string>(parcels[0]?.id || '');
  const [method, setMethod] = useState<SubdivisionMethod>('PARALLEL');
  const [targetAreaSqM, setTargetAreaSqM] = useState<number>(500);
  const [refEdgeIdx, setRefEdgeIdx] = useState<number>(0);
  const [pivotPointId, setPivotPointId] = useState<string>('');

  const [childAName, setChildAName] = useState<string>('');
  const [childBName, setChildBName] = useState<string>('');

  const parentParcel = useMemo(() => {
    return parcels.find(p => p.id === selectedParcelId) || parcels[0];
  }, [parcels, selectedParcelId]);

  const parentComp = useMemo(() => {
    if (!parentParcel) return null;
    return computeParcel(parentParcel, existingPoints);
  }, [parentParcel, existingPoints]);

  // Set default target area when parent parcel changes (e.g. 50% split)
  React.useEffect(() => {
    if (parentComp) {
      setTargetAreaSqM(Math.round(parentComp.areaSquareMeters / 2));
      setChildAName(`${parentParcel.plotNumber}A`);
      setChildBName(`${parentParcel.plotNumber}B`);
      if (parentParcel.pointIds.length > 0) {
        setPivotPointId(parentParcel.pointIds[0]);
      }
    }
  }, [parentParcel, parentComp]);

  // Compute Sub-Division
  const result: SubdivisionResult | null = useMemo(() => {
    try {
      if (!parentParcel || !parentComp) return null;
      return computeSubdivision({
        parentParcel,
        allPoints: existingPoints,
        method,
        targetAreaSqM,
        referenceEdgeIndex: refEdgeIdx,
        pivotPointId,
        childAName: childAName || `${parentParcel.plotNumber}A`,
        childBName: childBName || `${parentParcel.plotNumber}B`
      });
    } catch {
      return null;
    }
  }, [parentParcel, parentComp, existingPoints, method, targetAreaSqM, refEdgeIdx, pivotPointId, childAName, childBName]);

  if (!isOpen) return null;

  // Quick split buttons
  const handleQuickRatio = (ratio: number) => {
    if (parentComp) {
      setTargetAreaSqM(Math.round(parentComp.areaSquareMeters * ratio));
    }
  };

  const handleApply = () => {
    if (!result || !parentParcel) return;
    onApplySubdivision(
      parentParcel.id,
      result.childParcelA,
      result.childParcelB,
      result.newBeacons
    );
    alert(`Success: Sub-divided parcel "${parentParcel.plotNumber}" into ${result.childParcelA.plotNumber} (${result.actualAreaASqM} m²) and ${result.childParcelB.plotNumber} (${result.actualAreaBSqM} m²)!`);
    onClose();
  };

  // Reference side options
  const refSideOptions = parentParcel ? parentParcel.pointIds.map((pid, i) => {
    const nextPid = parentParcel.pointIds[(i + 1) % parentParcel.pointIds.length];
    return { idx: i, label: `Side ${i + 1}: ${pid} ➔ ${nextPid}` };
  }) : [];

  return (
    <ErrorBoundary fallbackTitle="Sub-Division Studio Recovery">
      <div className="modal-overlay">
        <div className="modal-content leveling-modal-studio">

          {/* Header */}
          <div className="modal-header">
            <div className="modal-title">
              <Layers size={18} className="text-cyan" />
              <span>Area Sub-Division &amp; Land Partitioning Studio</span>
            </div>
            <div className="header-actions-group">
              <button className="btn-primary-sm" onClick={handleApply} disabled={!result}>
                <Send size={13} /> <span>Apply Sub-Division to CAD</span>
              </button>
              <button className="icon-btn" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="traverse-tabs-bar">
            <button className={`traverse-tab-btn ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
              <ArrowRightLeft size={14} /> <span>Setup &amp; Partition Config</span>
            </button>
            <button className={`traverse-tab-btn ${activeTab === 'results' ? 'active' : ''}`} onClick={() => setActiveTab('results')}>
              <Table size={14} /> <span>Child Plots Schedule {result ? `(${result.actualAreaASqM} m² / ${result.actualAreaBSqM} m²)` : ''}</span>
            </button>
          </div>

          <div className="traverse-studio-body">

            {/* TAB 1: SETUP & PARTITION CONFIG */}
            {activeTab === 'config' ? (
              <div className="traverse-fieldbook-view">

                <div className="traverse-control-bar">

                  {/* Parent Parcel Selection */}
                  <div className="control-card">
                    <div className="control-card-title">Select Parent Parcel</div>
                    <div className="form-group">
                      <label>Parent Parcel</label>
                      <select value={selectedParcelId} onChange={e => setSelectedParcelId(e.target.value)}>
                        {parcels.map(p => {
                          const c = computeParcel(p, existingPoints);
                          return (
                            <option key={p.id} value={p.id}>
                              {p.plotNumber} ({c ? `${c.areaSquareMeters.toFixed(1)} sq.m` : 'invalid'})
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {parentComp && (
                      <div style={{ marginTop: '10px', padding: '8px', background: 'rgba(15,23,42,0.6)', borderRadius: '6px', fontSize: '11px', lineHeight: '1.7' }}>
                        Total Parent Area: <strong style={{ color: 'var(--cyan)' }}>{parentComp.areaSquareMeters.toFixed(2)} m²</strong> ({parentComp.areaHectares.toFixed(4)} Ha)<br />
                        Perimeter: <strong style={{ color: '#f8fafc' }}>{parentComp.perimeter.toFixed(2)} m</strong><br />
                        Vertices: <strong style={{ color: '#f8fafc' }}>{parentParcel?.pointIds.join(' ➔ ')}</strong>
                      </div>
                    )}
                  </div>

                  {/* Partition Method & Target Area */}
                  <div className="control-card">
                    <div className="control-card-title">Sub-Division Parameters</div>

                    <div className="form-group">
                      <label>Partition Method</label>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                        <button
                          className={`btn-${method === 'PARALLEL' ? 'primary' : 'secondary'}-sm`}
                          onClick={() => setMethod('PARALLEL')}
                          style={{ flex: 1 }}
                        >
                          Parallel to Boundary
                        </button>
                        <button
                          className={`btn-${method === 'PIVOT' ? 'primary' : 'secondary'}-sm`}
                          onClick={() => setMethod('PIVOT')}
                          style={{ flex: 1 }}
                        >
                          Pivot Through Beacon
                        </button>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '10px' }}>
                      <label>Target Area for Child Plot A (m²)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={targetAreaSqM}
                        onChange={e => setTargetAreaSqM(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    {/* Quick Ratios */}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                      <button className="btn-secondary-xs" onClick={() => handleQuickRatio(0.5)}>50 / 50 Split</button>
                      <button className="btn-secondary-xs" onClick={() => handleQuickRatio(0.6)}>60 / 40 Split</button>
                      <button className="btn-secondary-xs" onClick={() => handleQuickRatio(0.7)}>70 / 30 Split</button>
                    </div>

                    {method === 'PARALLEL' ? (
                      <div className="form-group" style={{ marginTop: '10px' }}>
                        <label>Reference Boundary Side (Parallel Direction)</label>
                        <select value={refEdgeIdx} onChange={e => setRefEdgeIdx(parseInt(e.target.value))}>
                          {refSideOptions.map(opt => (
                            <option key={opt.idx} value={opt.idx}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="form-group" style={{ marginTop: '10px' }}>
                        <label>Pivot Beacon (Fixed Corner)</label>
                        <select value={pivotPointId} onChange={e => setPivotPointId(e.target.value)}>
                          {parentParcel?.pointIds.map(pid => (
                            <option key={pid} value={pid}>Beacon {pid}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                </div>

                {/* Live Solution Preview Box */}
                <div className="fieldbook-table-container">
                  <div className="table-header-action-row">
                    <span className="section-subtitle">Partition Calculation Preview</span>
                  </div>

                  {result ? (
                    <div style={{ padding: '16px', background: 'rgba(15,23,42,0.8)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 700, fontSize: '13px' }}>
                        <CheckCircle2 size={16} />
                        <span>Exact Geometry Solved (Residual: {result.areaResidualSqM.toFixed(4)} m²)</span>
                      </div>

                      <div className="arithmetic-grid">
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Child A Plot Number</div>
                          <input
                            type="text"
                            style={{ background: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: '#10b981', fontWeight: 700, padding: '3px 6px', borderRadius: '4px', fontSize: '12px' }}
                            value={childAName}
                            onChange={e => setChildAName(e.target.value)}
                          />
                          <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px', fontWeight: 700 }}>
                            {result.actualAreaASqM.toFixed(2)} m² ({(result.actualAreaASqM / 10000).toFixed(4)} Ha)
                          </div>
                        </div>

                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Child B Plot Number</div>
                          <input
                            type="text"
                            style={{ background: 'var(--bg-dark)', border: '1px solid var(--border-color)', color: '#06b6d4', fontWeight: 700, padding: '3px 6px', borderRadius: '4px', fontSize: '12px' }}
                            value={childBName}
                            onChange={e => setChildBName(e.target.value)}
                          />
                          <div style={{ fontSize: '11px', color: '#06b6d4', marginTop: '4px', fontWeight: 700 }}>
                            {result.actualAreaBSqM.toFixed(2)} m² ({(result.actualAreaBSqM / 10000).toFixed(4)} Ha)
                          </div>
                        </div>

                        <div className="arithmetic-item">
                          <div className="arithmetic-label">New Partition Beacons</div>
                          <div className="arithmetic-val mono-cell text-amber" style={{ fontWeight: 700 }}>
                            {result.newBeacons.map(b => b.id).join(', ')}
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Partition Line Beacons: {result.newBeacons.map(b => `${b.id}: E=${b.easting.toFixed(3)}, N=${b.northing.toFixed(3)}`).join(' | ')}
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '30px', textAlign: 'center', color: '#f43f5e' }}>
                      Target area invalid or out of range for this parcel. Adjust parameters above.
                    </div>
                  )}
                </div>

              </div>
            ) : (
              /* TAB 2: CHILD PLOTS SCHEDULE */
              <div className="traverse-reduction-view">
                {result ? (
                  <>
                    <div className="arithmetic-check-card">
                      <div className="arithmetic-check-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Table size={16} className="text-cyan" />
                          <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                            Sub-Division Legal Boundary Schedule
                          </span>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                          Parent: {parentParcel?.plotNumber} | Method: {result.methodUsed}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>

                      {/* Child A Schedule */}
                      <div className="reduction-table-container">
                        <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.15)', borderBottom: '1px solid rgba(16,185,129,0.3)', fontSize: '11px', fontWeight: 700, color: '#10b981' }}>
                          {result.childParcelA.plotNumber} Schedule ({result.actualAreaASqM.toFixed(2)} m²)
                        </div>
                        <table className="reduction-table">
                          <thead>
                            <tr>
                              <th>From</th>
                              <th>To</th>
                              <th>Bearing (DMS)</th>
                              <th>Distance (m)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.childCompA.legs.map((leg, idx) => (
                              <tr key={idx}>
                                <td className="mono-cell" style={{ fontWeight: 600, color: '#f8fafc' }}>{leg.fromPoint.id}</td>
                                <td className="mono-cell" style={{ fontWeight: 600, color: '#f8fafc' }}>{leg.toPoint.id}</td>
                                <td className="mono-cell text-emerald">{leg.bearing.formatted}</td>
                                <td className="mono-cell">{leg.distance.toFixed(3)}m</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Child B Schedule */}
                      <div className="reduction-table-container">
                        <div style={{ padding: '8px 12px', background: 'rgba(6,182,212,0.15)', borderBottom: '1px solid rgba(6,182,212,0.3)', fontSize: '11px', fontWeight: 700, color: '#06b6d4' }}>
                          {result.childParcelB.plotNumber} Schedule ({result.actualAreaBSqM.toFixed(2)} m²)
                        </div>
                        <table className="reduction-table">
                          <thead>
                            <tr>
                              <th>From</th>
                              <th>To</th>
                              <th>Bearing (DMS)</th>
                              <th>Distance (m)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.childCompB.legs.map((leg, idx) => (
                              <tr key={idx}>
                                <td className="mono-cell" style={{ fontWeight: 600, color: '#f8fafc' }}>{leg.fromPoint.id}</td>
                                <td className="mono-cell" style={{ fontWeight: 600, color: '#f8fafc' }}>{leg.toPoint.id}</td>
                                <td className="mono-cell text-cyan">{leg.bearing.formatted}</td>
                                <td className="mono-cell">{leg.distance.toFixed(3)}m</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                    </div>
                  </>
                ) : (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Configure parameters in the Setup tab.
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
