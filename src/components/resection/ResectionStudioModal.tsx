import React, { useState, useMemo } from 'react';
import { CoordinatePoint } from '../../engine/types';
import {
  computeTienstraResection,
  computeDistanceResection,
  computeBearingBearingIntersection,
  computeDistanceDistanceIntersection,
  computeBearingDistanceIntersection,
  dmsToDecimal,
  ResectionResult,
  IntersectionResult,
  ABUJA_RESECTION_DEMO
} from '../../engine/resection/resectionEngine';
import { Target, Compass, Send, RefreshCw } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface ResectionStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePoints: CoordinatePoint[];
  onInjectPoint: (point: CoordinatePoint) => void;
}

export const ResectionStudioModal: React.FC<ResectionStudioModalProps> = ({
  isOpen,
  onClose,
  workspacePoints,
  onInjectPoint
}) => {
  const [activeTab, setActiveTab] = useState<'RESECTION' | 'INTERSECTIONS'>('RESECTION');

  // Resection State
  const [stationId, setStationId] = useState<string>('STN_FREE_01');
  const [resectionMethod, setResectionMethod] = useState<'ANGULAR' | 'DISTANCE'>('ANGULAR');

  const [ctrl1Id, setCtrl1Id] = useState<string>(workspacePoints[0]?.id || 'PB1736');
  const [ctrl2Id, setCtrl2Id] = useState<string>(workspacePoints[1]?.id || 'PB1737');
  const [ctrl3Id, setCtrl3Id] = useState<string>(workspacePoints[2]?.id || 'PB1738');

  // Angular observations (DMS)
  const [obs1D, setObs1D] = useState<number>(310);
  const [obs1M, setObs1M] = useState<number>(30);
  const [obs1S, setObs1S] = useState<number>(0);

  const [obs2D, setObs2D] = useState<number>(45);
  const [obs2M, setObs2M] = useState<number>(12);
  const [obs2S, setObs2S] = useState<number>(0);

  const [obs3D, setObs3D] = useState<number>(135);
  const [obs3M, setObs3M] = useState<number>(48);
  const [obs3S, setObs3S] = useState<number>(0);

  // Distance observations (metres)
  const [dist1, setDist1] = useState<number>(150.25);
  const [dist2, setDist2] = useState<number>(185.60);
  const [dist3, setDist3] = useState<number>(120.40);

  // Intersection State
  const [intMode, setIntMode] = useState<'BEARING_BEARING' | 'DISTANCE_DISTANCE' | 'BEARING_DISTANCE'>('BEARING_BEARING');
  const [intPointId, setIntPointId] = useState<string>('INT_POINT_01');

  const [intP1Id, setIntP1Id] = useState<string>(workspacePoints[0]?.id || 'PB1736');
  const [intP2Id, setIntP2Id] = useState<string>(workspacePoints[1]?.id || 'PB1737');

  const [intBearing1, setIntBearing1] = useState<number>(45.0);
  const [intBearing2, setIntBearing2] = useState<number>(135.0);
  const [intDist1, setIntDist1] = useState<number>(120.0);
  const [intDist2, setIntDist2] = useState<number>(95.0);

  const ptMap = useMemo(() => new Map(workspacePoints.map(p => [p.id, p])), [workspacePoints]);

  const p1 = ptMap.get(ctrl1Id) || workspacePoints[0] || ABUJA_RESECTION_DEMO.control1;
  const p2 = ptMap.get(ctrl2Id) || workspacePoints[1] || ABUJA_RESECTION_DEMO.control2;
  const p3 = ptMap.get(ctrl3Id) || workspacePoints[2] || ABUJA_RESECTION_DEMO.control3;

  // Compute Resection
  const resectionResult: ResectionResult | null = useMemo(() => {
    try {
      if (resectionMethod === 'ANGULAR') {
        const deg1 = dmsToDecimal(obs1D, obs1M, obs1S);
        const deg2 = dmsToDecimal(obs2D, obs2M, obs2S);
        const deg3 = dmsToDecimal(obs3D, obs3M, obs3S);
        return computeTienstraResection(stationId, p1, p2, p3, deg1, deg2, deg3);
      } else {
        return computeDistanceResection(stationId, p1, p2, dist1, dist2, p3, dist3);
      }
    } catch {
      return null;
    }
  }, [stationId, resectionMethod, p1, p2, p3, obs1D, obs1M, obs1S, obs2D, obs2M, obs2S, obs3D, obs3M, obs3S, dist1, dist2, dist3]);

  // Compute Intersection
  const intersectionResult: IntersectionResult | null = useMemo(() => {
    try {
      const pt1 = ptMap.get(intP1Id) || p1;
      const pt2 = ptMap.get(intP2Id) || p2;

      if (intMode === 'BEARING_BEARING') {
        return computeBearingBearingIntersection(intPointId, pt1, intBearing1, pt2, intBearing2);
      } else if (intMode === 'DISTANCE_DISTANCE') {
        return computeDistanceDistanceIntersection(intPointId, pt1, intDist1, pt2, intDist2);
      } else {
        return computeBearingDistanceIntersection(intPointId, pt1, intBearing1, pt2, intDist2);
      }
    } catch {
      return null;
    }
  }, [intMode, intPointId, intP1Id, intP2Id, intBearing1, intBearing2, intDist1, intDist2, ptMap, p1, p2]);

  if (!isOpen) return null;

  const handleLoadDemoResection = () => {
    setStationId(ABUJA_RESECTION_DEMO.stationId);
    setObs1D(310); setObs1M(30); setObs1S(0);
    setObs2D(45);  setObs2M(12); setObs2S(0);
    setObs3D(135); setObs3M(48); setObs3S(0);
  };

  const handleInjectResectionStation = () => {
    if (!resectionResult) return;
    const pt: CoordinatePoint = {
      id: resectionResult.stationId,
      easting: resectionResult.easting,
      northing: resectionResult.northing,
      elevation: resectionResult.elevation,
      isControl: true,
      code: 'FREE_STN',
      description: `Free Station Resection (Method: ${resectionResult.methodUsed})`
    };
    onInjectPoint(pt);
    alert(`Successfully injected Free Station "${pt.id}" (${pt.easting}, ${pt.northing}) into CAD workspace!`);
    onClose();
  };

  const handleInjectIntersectionPoint = (pt: CoordinatePoint) => {
    onInjectPoint(pt);
    alert(`Successfully injected Intersection Point "${pt.id}" (${pt.easting}, ${pt.northing}) into CAD workspace!`);
    onClose();
  };

  return (
    <ErrorBoundary fallbackTitle="Resection Studio Recovery">
      <div className="modal-overlay">
        <div className="modal-content leveling-modal-studio">
          
          {/* Header */}
          <div className="modal-header">
            <div className="modal-title">
              <Target size={18} className="text-cyan" />
              <span>Resection &amp; COGO Intersections Studio</span>
            </div>
            <div className="header-actions-group">
              {activeTab === 'RESECTION' && resectionResult && (
                <button className="btn-primary-sm" onClick={handleInjectResectionStation}>
                  <Send size={13} /> <span>Inject Free Station to CAD</span>
                </button>
              )}
              <button className="icon-btn" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="traverse-tabs-bar">
            <button
              className={`traverse-tab-btn ${activeTab === 'RESECTION' ? 'active' : ''}`}
              onClick={() => setActiveTab('RESECTION')}
            >
              <Target size={14} /> <span>Instrument Free Stationing Resection</span>
            </button>
            <button
              className={`traverse-tab-btn ${activeTab === 'INTERSECTIONS' ? 'active' : ''}`}
              onClick={() => setActiveTab('INTERSECTIONS')}
            >
              <Compass size={14} /> <span>COGO Intersections Solver</span>
            </button>
          </div>

          {/* Content Body */}
          <div className="traverse-studio-body">
            
            {/* TAB 1: INSTRUMENT RESECTION */}
            {activeTab === 'RESECTION' && (
              <div className="traverse-fieldbook-view">
                
                {/* Method & Benchmark Selector */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className={`btn-${resectionMethod === 'ANGULAR' ? 'primary' : 'secondary'}-sm`}
                      onClick={() => setResectionMethod('ANGULAR')}
                    >
                      Tienstra 3-Point Angular
                    </button>
                    <button
                      className={`btn-${resectionMethod === 'DISTANCE' ? 'primary' : 'secondary'}-sm`}
                      onClick={() => setResectionMethod('DISTANCE')}
                    >
                      Trilateration Distance Resection
                    </button>
                  </div>
                  <button className="btn-secondary-sm" onClick={handleLoadDemoResection}>
                    <RefreshCw size={13} /> <span>Load Benchmark Resection</span>
                  </button>
                </div>

                {/* Control Setup Cards */}
                <div className="traverse-control-bar">
                  
                  {/* Left: Station & Target Points */}
                  <div className="control-card">
                    <div className="control-card-title">Setup &amp; Observed Control Beacons</div>
                    <div className="form-group">
                      <label>Free Station ID</label>
                      <input
                        type="text"
                        value={stationId}
                        onChange={e => setStationId(e.target.value)}
                        className="table-input"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '10px' }}>
                      <div className="form-group">
                        <label>Control 1</label>
                        <select value={ctrl1Id} onChange={e => setCtrl1Id(e.target.value)}>
                          {workspacePoints.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Control 2</label>
                        <select value={ctrl2Id} onChange={e => setCtrl2Id(e.target.value)}>
                          {workspacePoints.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Control 3</label>
                        <select value={ctrl3Id} onChange={e => setCtrl3Id(e.target.value)}>
                          {workspacePoints.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Right: Solved Station Results Card */}
                  <div className="control-card" style={{ borderColor: resectionResult ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)' }}>
                    <div className="control-card-title" style={{ color: resectionResult ? '#34d399' : 'var(--text-muted)' }}>
                      Solved Free Station Coordinates
                    </div>

                    {resectionResult ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                          <div style={{ background: 'rgba(15,23,42,0.6)', padding: '8px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Easting (E)</div>
                            <div className="mono-cell" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--cyan)' }}>
                              {resectionResult.easting.toFixed(3)} m
                            </div>
                          </div>
                          <div style={{ background: 'rgba(15,23,42,0.6)', padding: '8px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Northing (N)</div>
                            <div className="mono-cell" style={{ fontSize: '14px', fontWeight: 700, color: '#34d399' }}>
                              {resectionResult.northing.toFixed(3)} m
                            </div>
                          </div>
                          <div style={{ background: 'rgba(15,23,42,0.6)', padding: '8px', borderRadius: '6px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Elevation (Z)</div>
                            <div className="mono-cell" style={{ fontSize: '14px', fontWeight: 700, color: '#fbbf24' }}>
                              {resectionResult.elevation !== undefined ? `${resectionResult.elevation.toFixed(3)} m` : '-'}
                            </div>
                          </div>
                        </div>

                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
                          <span>Std Error E: <strong style={{ color: '#f8fafc' }}>±{resectionResult.stdErrorEasting}m</strong></span>
                          <span>Std Error N: <strong style={{ color: '#f8fafc' }}>±{resectionResult.stdErrorNorthing}m</strong></span>
                          <span>Method: <strong style={{ color: 'var(--cyan)' }}>{resectionResult.methodUsed}</strong></span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#fda4af', padding: '8px' }}>
                        Enter valid control observations to solve free station position.
                      </div>
                    )}
                  </div>
                </div>

                {/* Observations Table */}
                <div className="table-wrapper">
                  <table className="traverse-table">
                    <thead>
                      <tr>
                        <th>Target Control</th>
                        <th>Known Easting (m)</th>
                        <th>Known Northing (m)</th>
                        {resectionMethod === 'ANGULAR' ? (
                          <th>Observed Horizontal Bearing (Deg ° Min ' Sec ")</th>
                        ) : (
                          <th>Observed Distance S (m)</th>
                        )}
                        <th>Calc Bearing / Dist</th>
                        <th>Residual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Control 1 */}
                      <tr>
                        <td style={{ fontWeight: 700, color: 'var(--cyan)' }}>{p1.id}</td>
                        <td className="mono-cell">{p1.easting.toFixed(3)}</td>
                        <td className="mono-cell">{p1.northing.toFixed(3)}</td>
                        <td>
                          {resectionMethod === 'ANGULAR' ? (
                            <div className="dms-input-row">
                              <input type="number" value={obs1D} onChange={e => setObs1D(parseInt(e.target.value) || 0)} style={{ width: '50px' }} />
                              <span>°</span>
                              <input type="number" value={obs1M} onChange={e => setObs1M(parseInt(e.target.value) || 0)} style={{ width: '45px' }} />
                              <span>'</span>
                              <input type="number" value={obs1S} onChange={e => setObs1S(parseFloat(e.target.value) || 0)} style={{ width: '45px' }} />
                              <span>"</span>
                            </div>
                          ) : (
                            <input type="number" step="0.01" value={dist1} onChange={e => setDist1(parseFloat(e.target.value) || 0)} className="table-input mono-cell" style={{ width: '100px' }} />
                          )}
                        </td>
                        <td className="mono-cell">{resectionResult?.targetResiduals[0]?.calcBearingDMS || '-'}</td>
                        <td className="mono-cell">{resectionResult?.targetResiduals[0]?.bearingResidualSec ? `${resectionResult.targetResiduals[0].bearingResidualSec}"` : '-'}</td>
                      </tr>

                      {/* Control 2 */}
                      <tr>
                        <td style={{ fontWeight: 700, color: 'var(--cyan)' }}>{p2.id}</td>
                        <td className="mono-cell">{p2.easting.toFixed(3)}</td>
                        <td className="mono-cell">{p2.northing.toFixed(3)}</td>
                        <td>
                          {resectionMethod === 'ANGULAR' ? (
                            <div className="dms-input-row">
                              <input type="number" value={obs2D} onChange={e => setObs2D(parseInt(e.target.value) || 0)} style={{ width: '50px' }} />
                              <span>°</span>
                              <input type="number" value={obs2M} onChange={e => setObs2M(parseInt(e.target.value) || 0)} style={{ width: '45px' }} />
                              <span>'</span>
                              <input type="number" value={obs2S} onChange={e => setObs2S(parseFloat(e.target.value) || 0)} style={{ width: '45px' }} />
                              <span>"</span>
                            </div>
                          ) : (
                            <input type="number" step="0.01" value={dist2} onChange={e => setDist2(parseFloat(e.target.value) || 0)} className="table-input mono-cell" style={{ width: '100px' }} />
                          )}
                        </td>
                        <td className="mono-cell">{resectionResult?.targetResiduals[1]?.calcBearingDMS || '-'}</td>
                        <td className="mono-cell">{resectionResult?.targetResiduals[1]?.bearingResidualSec ? `${resectionResult.targetResiduals[1].bearingResidualSec}"` : '-'}</td>
                      </tr>

                      {/* Control 3 */}
                      <tr>
                        <td style={{ fontWeight: 700, color: 'var(--cyan)' }}>{p3.id}</td>
                        <td className="mono-cell">{p3.easting.toFixed(3)}</td>
                        <td className="mono-cell">{p3.northing.toFixed(3)}</td>
                        <td>
                          {resectionMethod === 'ANGULAR' ? (
                            <div className="dms-input-row">
                              <input type="number" value={obs3D} onChange={e => setObs3D(parseInt(e.target.value) || 0)} style={{ width: '50px' }} />
                              <span>°</span>
                              <input type="number" value={obs3M} onChange={e => setObs3M(parseInt(e.target.value) || 0)} style={{ width: '45px' }} />
                              <span>'</span>
                              <input type="number" value={obs3S} onChange={e => setObs3S(parseFloat(e.target.value) || 0)} style={{ width: '45px' }} />
                              <span>"</span>
                            </div>
                          ) : (
                            <input type="number" step="0.01" value={dist3} onChange={e => setDist3(parseFloat(e.target.value) || 0)} className="table-input mono-cell" style={{ width: '100px' }} />
                          )}
                        </td>
                        <td className="mono-cell">{resectionResult?.targetResiduals[2]?.calcBearingDMS || '-'}</td>
                        <td className="mono-cell">{resectionResult?.targetResiduals[2]?.bearingResidualSec ? `${resectionResult.targetResiduals[2].bearingResidualSec}"` : '-'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

              </div>
            )}

            {/* TAB 2: COGO INTERSECTIONS */}
            {activeTab === 'INTERSECTIONS' && (
              <div className="traverse-fieldbook-view">
                
                {/* Intersection Mode Selector */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className={`btn-${intMode === 'BEARING_BEARING' ? 'primary' : 'secondary'}-sm`}
                    onClick={() => setIntMode('BEARING_BEARING')}
                  >
                    Bearing-Bearing (2 Rays)
                  </button>
                  <button
                    className={`btn-${intMode === 'DISTANCE_DISTANCE' ? 'primary' : 'secondary'}-sm`}
                    onClick={() => setIntMode('DISTANCE_DISTANCE')}
                  >
                    Distance-Distance (Trilateration)
                  </button>
                  <button
                    className={`btn-${intMode === 'BEARING_DISTANCE' ? 'primary' : 'secondary'}-sm`}
                    onClick={() => setIntMode('BEARING_DISTANCE')}
                  >
                    Bearing-Distance (Ray-Circle)
                  </button>
                </div>

                {/* Parameter Setup & Solution */}
                <div className="traverse-control-bar">
                  
                  {/* Left: Input Parameters */}
                  <div className="control-card">
                    <div className="control-card-title">Intersection Parameters</div>
                    
                    <div className="form-group">
                      <label>Intersection Point ID Prefix</label>
                      <input
                        type="text"
                        value={intPointId}
                        onChange={e => setIntPointId(e.target.value)}
                        className="table-input"
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                      <div className="form-group">
                        <label>Station P1</label>
                        <select value={intP1Id} onChange={e => setIntP1Id(e.target.value)}>
                          {workspacePoints.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                        </select>
                        <div style={{ marginTop: '6px' }}>
                          <label>{intMode === 'DISTANCE_DISTANCE' ? 'Distance d1 (m)' : 'Bearing 1 (° Decimal)'}</label>
                          {intMode === 'DISTANCE_DISTANCE' ? (
                            <input type="number" step="0.1" value={intDist1} onChange={e => setIntDist1(parseFloat(e.target.value) || 0)} className="table-input mono-cell" />
                          ) : (
                            <input type="number" step="0.01" value={intBearing1} onChange={e => setIntBearing1(parseFloat(e.target.value) || 0)} className="table-input mono-cell" />
                          )}
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Station P2</label>
                        <select value={intP2Id} onChange={e => setIntP2Id(e.target.value)}>
                          {workspacePoints.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                        </select>
                        <div style={{ marginTop: '6px' }}>
                          <label>{intMode === 'BEARING_BEARING' ? 'Bearing 2 (° Decimal)' : 'Distance d2 (m)'}</label>
                          {intMode === 'BEARING_BEARING' ? (
                            <input type="number" step="0.01" value={intBearing2} onChange={e => setIntBearing2(parseFloat(e.target.value) || 0)} className="table-input mono-cell" />
                          ) : (
                            <input type="number" step="0.1" value={intDist2} onChange={e => setIntDist2(parseFloat(e.target.value) || 0)} className="table-input mono-cell" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Solved Candidate Solutions */}
                  <div className="control-card" style={{ borderColor: intersectionResult ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.08)' }}>
                    <div className="control-card-title" style={{ color: 'var(--cyan)' }}>
                      Calculated Intersection Results
                    </div>

                    {intersectionResult ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {intersectionResult.description}
                        </div>

                        {/* Candidate Point 1 */}
                        <div style={{ background: 'rgba(15,23,42,0.6)', padding: '10px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--cyan)' }}>{intersectionResult.point1.id}</div>
                            <div className="mono-cell" style={{ fontSize: '11px' }}>
                              E: {intersectionResult.point1.easting.toFixed(3)} m | N: {intersectionResult.point1.northing.toFixed(3)} m
                            </div>
                          </div>
                          <button
                            className="btn-primary-sm"
                            onClick={() => handleInjectIntersectionPoint(intersectionResult.point1)}
                          >
                            <Send size={12} /> <span>Inject to CAD</span>
                          </button>
                        </div>

                        {/* Candidate Point 2 (if present) */}
                        {intersectionResult.point2 && (
                          <div style={{ background: 'rgba(15,23,42,0.6)', padding: '10px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#34d399' }}>{intersectionResult.point2.id}</div>
                              <div className="mono-cell" style={{ fontSize: '11px' }}>
                                E: {intersectionResult.point2.easting.toFixed(3)} m | N: {intersectionResult.point2.northing.toFixed(3)} m
                              </div>
                            </div>
                            <button
                              className="btn-secondary-sm"
                              onClick={() => handleInjectIntersectionPoint(intersectionResult.point2!)}
                            >
                              <Send size={12} /> <span>Inject to CAD</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#fda4af', padding: '8px' }}>
                        No intersection found. Check bearings or distance parameters.
                      </div>
                    )}
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
