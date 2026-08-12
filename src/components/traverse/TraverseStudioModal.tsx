import React, { useState, useMemo } from 'react';
import { CoordinatePoint } from '../../engine/types';
import {
  TraverseStationEntry,
  TraverseAdjustmentMethod,
  SurveyOrder,
  computeTraverseAdjustment,
  BENCHMARK_TRAVERSE_STATIONS,
  BENCHMARK_START_CONTROL
} from '../../engine/traverse/traverseEngine';
import { dmsToDecimal } from '../../engine/formats';
import { Compass, Table, CheckCircle2, Download, Plus, Trash2, RefreshCw, Send, Layers } from 'lucide-react';

interface TraverseStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingPoints: CoordinatePoint[];
  onInjectTraverse: (points: CoordinatePoint[], traverseName: string) => void;
}

export const TraverseStudioModal: React.FC<TraverseStudioModalProps> = ({
  isOpen,
  onClose,
  existingPoints,
  onInjectTraverse
}) => {
  const [activeTab, setActiveTab] = useState<'fieldbook' | 'reduction'>('fieldbook');

  // Traverse Settings & Controls
  const [startPointId, setStartPointId] = useState<string>(existingPoints[0]?.id || 'CP_START');
  const [startEasting, setStartEasting] = useState<number>(existingPoints[0]?.easting || BENCHMARK_START_CONTROL.easting);
  const [startNorthing, setStartNorthing] = useState<number>(existingPoints[0]?.northing || BENCHMARK_START_CONTROL.northing);

  const [initBearingDeg, setInitBearingDeg] = useState<number>(45);
  const [initBearingMin, setInitBearingMin] = useState<number>(30);
  const [initBearingSec, setInitBearingSec] = useState<number>(0);

  const [isClosedLoop, setIsClosedLoop] = useState<boolean>(true);
  const [closeEasting, setCloseEasting] = useState<number>(existingPoints[0]?.easting || BENCHMARK_START_CONTROL.easting);
  const [closeNorthing, setCloseNorthing] = useState<number>(existingPoints[0]?.northing || BENCHMARK_START_CONTROL.northing);

  const [method, setMethod] = useState<TraverseAdjustmentMethod>('BOWDITCH');
  const [order, setOrder] = useState<SurveyOrder>('2ND_ORDER');
  const [traverseName, setTraverseName] = useState<string>('TRAVERSE_LOOP_01');

  // Stations List
  const [stations, setStations] = useState<TraverseStationEntry[]>(BENCHMARK_TRAVERSE_STATIONS);

  if (!isOpen) return null;

  const startControl: CoordinatePoint = {
    id: startPointId,
    easting: startEasting,
    northing: startNorthing,
    isControl: true
  };

  const closeControl: CoordinatePoint = isClosedLoop
    ? startControl
    : {
        id: 'CP_CLOSE',
        easting: closeEasting,
        northing: closeNorthing,
        isControl: true
      };

  const initialBearingDec = dmsToDecimal(initBearingDeg, initBearingMin, initBearingSec);

  // Compute Reduction & Adjustment Results
  const result = useMemo(() => {
    try {
      if (stations.length < 3) return null;
      return computeTraverseAdjustment(startControl, closeControl, initialBearingDec, stations, method, order);
    } catch {
      return null;
    }
  }, [startControl, closeControl, initialBearingDec, stations, method, order]);

  const handleAddStation = () => {
    const nextIdx = stations.length + 1;
    const newStn: TraverseStationEntry = {
      id: Date.now().toString(),
      stationId: `STN_${nextIdx}`,
      observedDeg: 120,
      observedMin: 0,
      observedSec: 0,
      distance: 150.0
    };
    setStations([...stations, newStn]);
  };

  const handleUpdateStation = (index: number, field: keyof TraverseStationEntry, value: any) => {
    const updated = [...stations];
    updated[index] = { ...updated[index], [field]: value };
    setStations(updated);
  };

  const handleDeleteStation = (index: number) => {
    if (stations.length <= 3) {
      alert('A traverse loop requires at least 3 stations.');
      return;
    }
    setStations(stations.filter((_, i) => i !== index));
  };

  const handleLoadBenchmark = () => {
    setStations(BENCHMARK_TRAVERSE_STATIONS);
    setStartEasting(BENCHMARK_START_CONTROL.easting);
    setStartNorthing(BENCHMARK_START_CONTROL.northing);
    setInitBearingDeg(45);
    setInitBearingMin(30);
    setInitBearingSec(0);
    setIsClosedLoop(true);
  };

  const handleExportCSV = () => {
    if (!result) return;
    let csv = `TRAVERSE COMPUTATION & REDUCTION SHEET (${result.adjustmentMethod})\n`;
    csv += `Traverse Loop: ${traverseName}\n`;
    csv += `Total Perimeter: ${result.totalPerimeter.toFixed(3)} m\n`;
    csv += `Angular Misclose: ${result.angularMiscloseSec} sec (Tolerance: ${result.angularToleranceSec} sec - ${result.isAngularPassed ? 'PASSED' : 'EXCEEDED'})\n`;
    csv += `Linear Misclose: dE=${result.linearMiscloseE.toFixed(3)}m, dN=${result.linearMiscloseN.toFixed(3)}m, Total=${result.totalLinearMisclose.toFixed(3)}m\n`;
    csv += `Relative Precision: ${result.precisionRatioStr} (${result.orderClassification})\n\n`;

    csv += `From,To,Obs_Angle,Adj_Angle,WCB,Distance_m,Raw_dE,Raw_dN,Corr_dE,Corr_dN,Balanced_dE,Balanced_dN,Balanced_Easting,Balanced_Northing\n`;
    for (const leg of result.legs) {
      csv += `"${leg.fromStation}","${leg.toStation}","${leg.rawAngleDms}","${leg.adjustedAngleDms}","${leg.forwardBearingDms}",${leg.distance.toFixed(3)},${leg.rawDeltaEasting.toFixed(3)},${leg.rawDeltaNorthing.toFixed(3)},${leg.correctionEasting.toFixed(3)},${leg.correctionNorthing.toFixed(3)},${leg.balancedDeltaEasting.toFixed(3)},${leg.balancedDeltaNorthing.toFixed(3)},${leg.balancedEasting.toFixed(3)},${leg.balancedNorthing.toFixed(3)}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${traverseName}_reduction_sheet.csv`;
    link.click();
  };

  const handleInjectIntoCAD = () => {
    if (!result) {
      alert('Unable to compute traverse. Please ensure at least 3 valid stations.');
      return;
    }

    onInjectTraverse(result.balancedStations, traverseName);
    alert(`Success: Injected ${result.balancedStations.length} balanced traverse control beacons and parcel "${traverseName}" into the CAD workspace!`);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content traverse-modal-studio">
        {/* Modal Top Header */}
        <div className="modal-header">
          <div className="modal-title">
            <Compass size={18} className="text-emerald" />
            <span>Traverse Reduction & Loop Balancing Studio</span>
          </div>
          <div className="header-actions-group">
            <button className="btn-secondary-sm" onClick={handleLoadBenchmark} title="Load 8-Station Benchmark Loop">
              <RefreshCw size={13} />
              <span>Load Benchmark Loop</span>
            </button>
            <button className="btn-secondary-sm" onClick={handleExportCSV} disabled={!result} title="Export CSV Reduction Sheet">
              <Download size={13} />
              <span>Export CSV</span>
            </button>
            <button className="btn-primary-sm" onClick={handleInjectIntoCAD} disabled={!result} title="Plot Balanced Traverse onto 2D CAD Canvas">
              <Send size={13} />
              <span>Plot to CAD Canvas</span>
            </button>
            <button className="icon-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="traverse-tabs-bar">
          <button
            className={`traverse-tab-btn ${activeTab === 'fieldbook' ? 'active' : ''}`}
            onClick={() => setActiveTab('fieldbook')}
          >
            <Table size={14} />
            <span>Electronic Field Book ({stations.length} Stations)</span>
          </button>
          <button
            className={`traverse-tab-btn ${activeTab === 'reduction' ? 'active' : ''}`}
            onClick={() => setActiveTab('reduction')}
          >
            <Layers size={14} />
            <span>Computation & Reduction Sheet {result ? `(${result.precisionRatioStr})` : ''}</span>
          </button>
        </div>

        <div className="traverse-studio-body">
          {activeTab === 'fieldbook' ? (
            /* TAB 1: ELECTRONIC FIELD BOOK */
            <div className="traverse-fieldbook-view">
              {/* Control Point & Initial Bearing Header Bar */}
              <div className="traverse-control-bar">
                <div className="control-card">
                  <div className="control-card-title">Initial Control Station & Azimuth</div>
                  <div className="form-row-3">
                    <div className="form-group">
                      <label>Control ID</label>
                      <input
                        type="text"
                        value={startPointId}
                        onChange={(e) => setStartPointId(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Easting (m)</label>
                      <input
                        type="number"
                        step="0.001"
                        value={startEasting}
                        onChange={(e) => setStartEasting(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Northing (m)</label>
                      <input
                        type="number"
                        step="0.001"
                        value={startNorthing}
                        onChange={(e) => setStartNorthing(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '8px' }}>
                    <label>Initial Backsight Bearing (DMS)</label>
                    <div className="dms-input-row">
                      <input
                        type="number"
                        placeholder="Deg"
                        value={initBearingDeg}
                        onChange={(e) => setInitBearingDeg(parseInt(e.target.value) || 0)}
                      />
                      <span>°</span>
                      <input
                        type="number"
                        placeholder="Min"
                        value={initBearingMin}
                        onChange={(e) => setInitBearingMin(parseInt(e.target.value) || 0)}
                      />
                      <span>'</span>
                      <input
                        type="number"
                        placeholder="Sec"
                        value={initBearingSec}
                        onChange={(e) => setInitBearingSec(parseInt(e.target.value) || 0)}
                      />
                      <span>"</span>
                    </div>
                  </div>
                </div>

                {/* Adjustment Methods & Survey Order */}
                <div className="control-card">
                  <div className="control-card-title">Adjustment Parameters & Type</div>
                  <div className="form-row-3">
                    <div className="form-group">
                      <label>Traverse Type</label>
                      <select value={isClosedLoop ? 'closed' : 'link'} onChange={(e) => setIsClosedLoop(e.target.value === 'closed')}>
                        <option value="closed">Closed Loop (Closes on Start)</option>
                        <option value="link">Link / Connecting Traverse</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Balancing Rule</label>
                      <select value={method} onChange={(e) => setMethod(e.target.value as any)}>
                        <option value="BOWDITCH">Bowditch (Compass Rule)</option>
                        <option value="TRANSIT">Transit Rule</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Survey Order</label>
                      <select value={order} onChange={(e) => setOrder(e.target.value as any)}>
                        <option value="1ST_ORDER">1st Order (10"√n)</option>
                        <option value="2ND_ORDER">2nd Order (20"√n)</option>
                        <option value="3RD_ORDER">3rd Order (30"√n)</option>
                      </select>
                    </div>
                  </div>

                  {!isClosedLoop ? (
                    <div className="form-row-2" style={{ marginTop: '8px' }}>
                      <div className="form-group">
                        <label>Close Easting (m)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={closeEasting}
                          onChange={(e) => setCloseEasting(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Close Northing (m)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={closeNorthing}
                          onChange={(e) => setCloseNorthing(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="form-group" style={{ marginTop: '8px' }}>
                    <label>Traverse Loop Name</label>
                    <input
                      type="text"
                      value={traverseName}
                      onChange={(e) => setTraverseName(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Station Observations Grid */}
              <div className="fieldbook-table-container">
                <div className="table-header-action-row">
                  <span className="section-subtitle">Traverse Station Observations</span>
                  <button className="btn-secondary-xs" onClick={handleAddStation}>
                    <Plus size={12} className="inline-icon" />
                    <span>Add Station</span>
                  </button>
                </div>

                <table className="fieldbook-table">
                  <thead>
                    <tr>
                      <th style={{ width: '8%' }}>#</th>
                      <th style={{ width: '22%' }}>Station ID</th>
                      <th style={{ width: '45%' }}>Observed Angle (Deg ° Min ' Sec ")</th>
                      <th style={{ width: '20%' }}>Leg Distance (m)</th>
                      <th style={{ width: '5%', textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stations.map((stn, idx) => (
                      <tr key={stn.id}>
                        <td className="mono-cell">{idx + 1}</td>
                        <td>
                          <input
                            type="text"
                            className="table-input"
                            value={stn.stationId}
                            onChange={(e) => handleUpdateStation(idx, 'stationId', e.target.value)}
                          />
                        </td>
                        <td>
                          <div className="dms-input-row-sm">
                            <input
                              type="number"
                              className="table-input-dms"
                              value={stn.observedDeg}
                              onChange={(e) => handleUpdateStation(idx, 'observedDeg', parseInt(e.target.value) || 0)}
                            />
                            <span>°</span>
                            <input
                              type="number"
                              className="table-input-dms"
                              value={stn.observedMin}
                              onChange={(e) => handleUpdateStation(idx, 'observedMin', parseInt(e.target.value) || 0)}
                            />
                            <span>'</span>
                            <input
                              type="number"
                              className="table-input-dms"
                              value={stn.observedSec}
                              onChange={(e) => handleUpdateStation(idx, 'observedSec', parseFloat(e.target.value) || 0)}
                            />
                            <span>"</span>
                          </div>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.001"
                            className="table-input"
                            value={stn.distance}
                            onChange={(e) => handleUpdateStation(idx, 'distance', parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            className="delete-icon-btn"
                            title="Remove Station"
                            onClick={() => handleDeleteStation(idx)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* TAB 2: REDUCTION SHEET & RESULTS */
            <div className="traverse-reduction-view">
              {result && (
                <>
                  {/* Precision & Misclosure Summary Cards */}
                  <div className="precision-card-grid">
                    <div className="precision-card">
                      <div className="precision-card-label">Angular Misclosure</div>
                      <div className={`precision-val ${result.isAngularPassed ? 'text-emerald' : 'text-rose'}`}>
                        {result.angularMiscloseSec > 0 ? `+${result.angularMiscloseSec}` : result.angularMiscloseSec}"
                      </div>
                      <div className="precision-sub">
                        Tolerance: ±{result.angularToleranceSec}" ({result.isAngularPassed ? 'Passed' : 'Exceeded'})
                      </div>
                    </div>

                    <div className="precision-card">
                      <div className="precision-card-label">Linear Misclosure (Vector)</div>
                      <div className="precision-val text-cyan">
                        {result.totalLinearMisclose.toFixed(3)} m
                      </div>
                      <div className="precision-sub">
                        ΔE = {result.linearMiscloseE.toFixed(3)}m | ΔN = {result.linearMiscloseN.toFixed(3)}m
                      </div>
                    </div>

                    <div className="precision-card">
                      <div className="precision-card-label">Relative Precision Ratio</div>
                      <div className="precision-val text-emerald">
                        {result.precisionRatioStr}
                      </div>
                      <div className="precision-sub text-emerald">
                        <CheckCircle2 size={11} className="inline-icon" />
                        <span>{result.orderClassification}</span>
                      </div>
                    </div>

                    <div className="precision-card">
                      <div className="precision-card-label">Total Perimeter & Stations</div>
                      <div className="precision-val">
                        {result.totalPerimeter.toFixed(2)} m
                      </div>
                      <div className="precision-sub">
                        {result.legs.length} Balanced Legs ({result.adjustmentMethod})
                      </div>
                    </div>
                  </div>

                  {/* Geomatics Reduction Table */}
                  <div className="reduction-table-container">
                    <table className="reduction-table">
                      <thead>
                        <tr>
                          <th>From</th>
                          <th>To</th>
                          <th>Obs Angle</th>
                          <th>Adj Angle</th>
                          <th>W.C.B (Bearing)</th>
                          <th>Dist (m)</th>
                          <th>Raw ΔE</th>
                          <th>Raw ΔN</th>
                          <th>Corr ΔE</th>
                          <th>Corr ΔN</th>
                          <th>Balanced E</th>
                          <th>Balanced N</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.legs.map((leg, idx) => (
                          <tr key={idx}>
                            <td className="mono-cell" style={{ fontWeight: 600, color: '#f8fafc' }}>{leg.fromStation}</td>
                            <td className="mono-cell" style={{ fontWeight: 600, color: '#38bdf8' }}>{leg.toStation}</td>
                            <td className="mono-cell">{leg.rawAngleDms}</td>
                            <td className="mono-cell">{leg.adjustedAngleDms}</td>
                            <td className="mono-cell text-emerald">{leg.forwardBearingDms}</td>
                            <td className="mono-cell">{leg.distance.toFixed(3)}</td>
                            <td className="mono-cell">{leg.rawDeltaEasting.toFixed(3)}</td>
                            <td className="mono-cell">{leg.rawDeltaNorthing.toFixed(3)}</td>
                            <td className="mono-cell" style={{ color: '#f59e0b' }}>{leg.correctionEasting.toFixed(3)}</td>
                            <td className="mono-cell" style={{ color: '#f59e0b' }}>{leg.correctionNorthing.toFixed(3)}</td>
                            <td className="mono-cell text-cyan" style={{ fontWeight: 600 }}>{leg.balancedEasting.toFixed(3)}</td>
                            <td className="mono-cell text-cyan" style={{ fontWeight: 600 }}>{leg.balancedNorthing.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
