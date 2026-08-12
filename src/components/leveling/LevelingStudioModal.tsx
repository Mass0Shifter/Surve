import React, { useState, useMemo } from 'react';
import {
  LevelingRowEntry,
  LevelingMethod,
  LevelingOrder,
  computeLevelingReduction,
  BENCHMARK_LEVELING_ROWS,
  BENCHMARK_START_RL,
  BENCHMARK_KNOWN_CLOSE_RL
} from '../../engine/leveling/levelingEngine';
import { Ruler, Table, CheckCircle2, Download, Plus, Trash2, RefreshCw, Send, Layers, GitCommit } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface LevelingStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyElevations: (stationElevations: { stationId: string; elevation: number }[]) => void;
}

export const LevelingStudioModal: React.FC<LevelingStudioModalProps> = ({
  isOpen,
  onClose,
  onApplyElevations
}) => {
  const [activeTab, setActiveTab] = useState<'fieldbook' | 'reduction'>('fieldbook');

  const [startBM, setStartBM] = useState<string>('TBM_01');
  const [startRL, setStartRL] = useState<number>(BENCHMARK_START_RL);

  const [isClosedLoop, setIsClosedLoop] = useState<boolean>(true);
  const [knownCloseRL, setKnownCloseRL] = useState<number>(BENCHMARK_KNOWN_CLOSE_RL);

  const [method, setMethod] = useState<LevelingMethod>('HPC');
  const [order, setOrder] = useState<LevelingOrder>('2ND_ORDER_ENGINEERING');
  const [lineName, setLineName] = useState<string>('LEVEL_RUN_LINE_01');

  const [rows, setRows] = useState<LevelingRowEntry[]>(BENCHMARK_LEVELING_ROWS);

  // Compute Reduction & Adjustment Results
  const result = useMemo(() => {
    try {
      if (!rows || rows.length < 2) return null;
      return computeLevelingReduction(
        startRL || 0,
        isClosedLoop ? knownCloseRL : null,
        rows,
        method,
        order
      );
    } catch (err) {
      console.error('Leveling calculation error:', err);
      return null;
    }
  }, [startRL, isClosedLoop, knownCloseRL, rows, method, order]);

  if (!isOpen) return null;

  const handleAddRow = () => {
    const nextIdx = rows.length + 1;
    const newRow: LevelingRowEntry = {
      id: Date.now().toString(),
      stationId: `STN_${nextIdx}`,
      backsight: null,
      intermediateSight: 1.500,
      foresight: null,
      distanceFromStart: (rows[rows.length - 1]?.distanceFromStart || 0) + 30,
      remarks: 'Ground Spot Height'
    };
    setRows([...rows, newRow]);
  };

  const handleInsertChangePoint = () => {
    const nextIdx = rows.length + 1;
    const newCP: LevelingRowEntry = {
      id: Date.now().toString(),
      stationId: `CP_${nextIdx}`,
      backsight: 1.500,
      intermediateSight: null,
      foresight: 1.500,
      distanceFromStart: (rows[rows.length - 1]?.distanceFromStart || 0) + 30,
      remarks: 'Change Point (CP)'
    };
    setRows([...rows, newCP]);
  };

  const handleUpdateRow = (index: number, field: keyof LevelingRowEntry, value: any) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
  };

  const handleDeleteRow = (index: number) => {
    if (rows.length <= 2) {
      alert('Leveling run requires at least 2 stations.');
      return;
    }
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleLoadBenchmark = () => {
    setRows(BENCHMARK_LEVELING_ROWS);
    setStartBM('TBM_01');
    setStartRL(BENCHMARK_START_RL);
    setKnownCloseRL(BENCHMARK_KNOWN_CLOSE_RL);
    setIsClosedLoop(true);
    setMethod('HPC');
  };

  const handleExportCSV = () => {
    if (!result) return;
    let csv = `SPIRIT LEVELING REDUCTION SHEET (${result.method === 'HPC' ? 'Height of Collimation' : 'Rise and Fall'})\n`;
    csv += `Leveling Line: ${lineName}\n`;
    csv += `Initial RL: ${startRL.toFixed(3)} m | Total Distance: ${result.totalDistanceKm.toFixed(3)} km\n`;
    csv += `Arithmetic Check: BS-FS=${result.arithmeticCheck.diffBS_FS.toFixed(3)}m, Rise-Fall=${result.arithmeticCheck.diffRise_Fall.toFixed(3)}m, Last-First RL=${result.arithmeticCheck.diffLast_FirstRL.toFixed(3)}m (${result.arithmeticCheck.isPassed ? 'PASSED' : 'CHECK ERROR'})\n`;
    csv += `Loop Misclosure: ${result.loopMisclosureMm} mm (Tolerance: ±${result.permissibleToleranceMm} mm - ${result.orderClassification})\n\n`;

    csv += `Station,BS_m,IS_m,FS_m,Rise_m,Fall_m,HPC_m,Computed_RL_m,Correction_m,Adjusted_RL_m,Distance_m,Remarks\n`;
    for (const r of result.rows) {
      csv += `"${r.stationId}",${r.backsight !== null ? r.backsight.toFixed(3) : ''},${r.intermediateSight !== null ? r.intermediateSight.toFixed(3) : ''},${r.foresight !== null ? r.foresight.toFixed(3) : ''},${r.rise !== null ? r.rise.toFixed(3) : ''},${r.fall !== null ? r.fall.toFixed(3) : ''},${r.hpc !== null ? r.hpc.toFixed(3) : ''},${r.computedRL.toFixed(3)},${r.correction.toFixed(3)},${r.adjustedRL.toFixed(3)},${r.distanceFromStart !== null ? r.distanceFromStart : ''},"${r.remarks}"\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${lineName}_leveling_reduction.csv`;
    link.click();
  };

  const handleApplyToCAD = () => {
    if (!result || result.rows.length === 0) {
      alert('No valid leveling rows to apply.');
      return;
    }

    const elevations = result.rows.map(r => ({
      stationId: r.stationId,
      elevation: r.adjustedRL
    }));

    onApplyElevations(elevations);
    alert(`Success: Synchronized elevations for ${elevations.length} stations with CAD beacon database!`);
    onClose();
  };

  return (
    <ErrorBoundary fallbackTitle="Spirit Leveling Studio Recovery">
      <div className="modal-overlay">
        <div className="modal-content leveling-modal-studio">
          {/* Modal Header */}
          <div className="modal-header">
            <div className="modal-title">
              <Ruler size={18} className="text-emerald" />
              <span>Spirit Leveling Field Book & Reduction Studio</span>
            </div>
            <div className="header-actions-group">
              <button className="btn-secondary-sm" onClick={handleLoadBenchmark} title="Load 10-Station Benchmark Run">
                <RefreshCw size={13} />
                <span>Load Benchmark Run</span>
              </button>
              <button className="btn-secondary-sm" onClick={handleExportCSV} disabled={!result} title="Export CSV Reduction Sheet">
                <Download size={13} />
                <span>Export CSV</span>
              </button>
              <button className="btn-primary-sm" onClick={handleApplyToCAD} disabled={!result} title="Update CAD Beacon Elevations (Z-Coords)">
                <Send size={13} />
                <span>Apply Elevations to CAD</span>
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
              <span>Electronic Field Book ({rows.length} Readings)</span>
            </button>
            <button
              className={`traverse-tab-btn ${activeTab === 'reduction' ? 'active' : ''}`}
              onClick={() => setActiveTab('reduction')}
            >
              <Layers size={14} />
              <span>Reduction & Arithmetic Verification {result ? `(${result.orderClassification.split(' ')[0]})` : ''}</span>
            </button>
          </div>

          <div className="traverse-studio-body">
            {activeTab === 'fieldbook' ? (
              /* TAB 1: ELECTRONIC LEVELING FIELD BOOK */
              <div className="traverse-fieldbook-view">
                {/* Benchmark & Leveling Parameters */}
                <div className="traverse-control-bar">
                  <div className="control-card">
                    <div className="control-card-title">Starting & Closing Benchmarks</div>
                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Start Benchmark ID</label>
                        <input
                          type="text"
                          value={startBM}
                          onChange={(e) => setStartBM(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Start Reduced Level (m)</label>
                        <input
                          type="number"
                          step="0.001"
                          value={startRL}
                          onChange={(e) => setStartRL(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="form-row-2" style={{ marginTop: '8px' }}>
                      <div className="form-group">
                        <label>Loop Closure Mode</label>
                        <select value={isClosedLoop ? 'closed' : 'open'} onChange={(e) => setIsClosedLoop(e.target.value === 'closed')}>
                          <option value="closed">Closed Run (Known End RL)</option>
                          <option value="open">Open / Fly-Leveling Run</option>
                        </select>
                      </div>
                      {isClosedLoop ? (
                        <div className="form-group">
                          <label>Known Close RL (m)</label>
                          <input
                            type="number"
                            step="0.001"
                            value={knownCloseRL}
                            onChange={(e) => setKnownCloseRL(parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="control-card">
                    <div className="control-card-title">Reduction Method & Survey Order</div>
                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Reduction Method</label>
                        <select value={method} onChange={(e) => setMethod(e.target.value as any)}>
                          <option value="HPC">Height of Collimation (HPC)</option>
                          <option value="RISE_FALL">Rise and Fall Method</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Leveling Standard</label>
                        <select value={order} onChange={(e) => setOrder(e.target.value as any)}>
                          <option value="1ST_ORDER_PRECISE">1st Order Precise (6√K mm)</option>
                          <option value="2ND_ORDER_ENGINEERING">2nd Order Engineering (12√K mm)</option>
                          <option value="3RD_ORDER_TOPO">3rd Order Topo (24√K mm)</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '8px' }}>
                      <label>Leveling Line Description</label>
                      <input
                        type="text"
                        value={lineName}
                        onChange={(e) => setLineName(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Leveling Observations Grid */}
                <div className="fieldbook-table-container">
                  <div className="table-header-action-row">
                    <span className="section-subtitle">Staff Sight Observations (BS / IS / FS)</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-secondary-xs" onClick={handleAddRow}>
                        <Plus size={12} className="inline-icon" />
                        <span>Add Sight (IS)</span>
                      </button>
                      <button className="btn-secondary-xs" onClick={handleInsertChangePoint} style={{ color: 'var(--cyan)' }}>
                        <GitCommit size={12} className="inline-icon" />
                        <span>Insert Change Point (CP)</span>
                      </button>
                    </div>
                  </div>

                  <table className="fieldbook-table">
                    <thead>
                      <tr>
                        <th style={{ width: '6%' }}>#</th>
                        <th style={{ width: '18%' }}>Station / Point ID</th>
                        <th style={{ width: '15%' }}>Backsight (BS)</th>
                        <th style={{ width: '15%' }}>Intermediate (IS)</th>
                        <th style={{ width: '15%' }}>Foresight (FS)</th>
                        <th style={{ width: '11%' }}>Chainage (m)</th>
                        <th style={{ width: '15%' }}>Remarks</th>
                        <th style={{ width: '5%', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={row.id || idx}>
                          <td className="mono-cell">{idx + 1}</td>
                          <td>
                            <input
                              type="text"
                              className="table-input"
                              value={row.stationId || ''}
                              onChange={(e) => handleUpdateRow(idx, 'stationId', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.001"
                              placeholder="BS (m)"
                              className="table-input"
                              value={row.backsight !== null && row.backsight !== undefined ? row.backsight : ''}
                              onChange={(e) => handleUpdateRow(idx, 'backsight', e.target.value === '' ? null : parseFloat(e.target.value))}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.001"
                              placeholder="IS (m)"
                              className="table-input"
                              value={row.intermediateSight !== null && row.intermediateSight !== undefined ? row.intermediateSight : ''}
                              onChange={(e) => handleUpdateRow(idx, 'intermediateSight', e.target.value === '' ? null : parseFloat(e.target.value))}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.001"
                              placeholder="FS (m)"
                              className="table-input"
                              value={row.foresight !== null && row.foresight !== undefined ? row.foresight : ''}
                              onChange={(e) => handleUpdateRow(idx, 'foresight', e.target.value === '' ? null : parseFloat(e.target.value))}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="1"
                              placeholder="m"
                              className="table-input"
                              value={row.distanceFromStart !== null && row.distanceFromStart !== undefined ? row.distanceFromStart : ''}
                              onChange={(e) => handleUpdateRow(idx, 'distanceFromStart', e.target.value === '' ? null : parseFloat(e.target.value))}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              className="table-input"
                              value={row.remarks || ''}
                              onChange={(e) => handleUpdateRow(idx, 'remarks', e.target.value)}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="delete-icon-btn"
                              title="Remove Row"
                              onClick={() => handleDeleteRow(idx)}
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
              /* TAB 2: REDUCTION & ARITHMETIC SHEET */
              <div className="traverse-reduction-view">
                {result ? (
                  <>
                    {/* Live Arithmetic Verification Banner */}
                    <div className="arithmetic-check-card">
                      <div className="arithmetic-check-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CheckCircle2 size={16} className={result.arithmeticCheck.isPassed ? 'text-emerald' : 'text-rose'} />
                          <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                            3-Point Arithmetic Verification Check: {result.arithmeticCheck.isPassed ? 'PASSED (100% Agreement)' : 'FAILED'}
                          </span>
                        </div>
                        <div className="precision-sub" style={{ color: 'var(--text-muted)' }}>
                          Method: {result.method === 'HPC' ? 'Height of Collimation (HPC)' : 'Rise and Fall'}
                        </div>
                      </div>

                      <div className="arithmetic-grid">
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">1. Sights Check (Σ BS - Σ FS)</div>
                          <div className="arithmetic-val mono-cell">
                            {result.arithmeticCheck.sumBacksight.toFixed(3)} - {result.arithmeticCheck.sumForesight.toFixed(3)} ={' '}
                            <span className="text-emerald" style={{ fontWeight: 700 }}>
                              {result.arithmeticCheck.diffBS_FS > 0 ? `+${result.arithmeticCheck.diffBS_FS.toFixed(3)}` : result.arithmeticCheck.diffBS_FS.toFixed(3)}m
                            </span>
                          </div>
                        </div>

                        <div className="arithmetic-item">
                          <div className="arithmetic-label">2. Slope Check (Σ Rise - Σ Fall)</div>
                          <div className="arithmetic-val mono-cell">
                            {result.arithmeticCheck.sumRise.toFixed(3)} - {result.arithmeticCheck.sumFall.toFixed(3)} ={' '}
                            <span className="text-emerald" style={{ fontWeight: 700 }}>
                              {result.arithmeticCheck.diffRise_Fall > 0 ? `+${result.arithmeticCheck.diffRise_Fall.toFixed(3)}` : result.arithmeticCheck.diffRise_Fall.toFixed(3)}m
                            </span>
                          </div>
                        </div>

                        <div className="arithmetic-item">
                          <div className="arithmetic-label">3. RL Check (Last RL - First RL)</div>
                          <div className="arithmetic-val mono-cell">
                            {result.arithmeticCheck.lastRL.toFixed(3)} - {result.arithmeticCheck.firstRL.toFixed(3)} ={' '}
                            <span className="text-emerald" style={{ fontWeight: 700 }}>
                              {result.arithmeticCheck.diffLast_FirstRL > 0 ? `+${result.arithmeticCheck.diffLast_FirstRL.toFixed(3)}` : result.arithmeticCheck.diffLast_FirstRL.toFixed(3)}m
                            </span>
                          </div>
                        </div>

                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Loop Misclosure vs Tolerance</div>
                          <div className="arithmetic-val mono-cell">
                            <span className={result.isTolerancePassed ? 'text-cyan' : 'text-rose'} style={{ fontWeight: 700 }}>
                              {result.loopMisclosureMm > 0 ? `+${result.loopMisclosureMm}` : result.loopMisclosureMm} mm
                            </span>{' '}
                            <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}>
                              (Tol: ±{result.permissibleToleranceMm}mm)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Full Reduction Sheet Table */}
                    <div className="reduction-table-container">
                      <table className="reduction-table">
                        <thead>
                          <tr>
                            <th>Station</th>
                            <th>BS (m)</th>
                            <th>IS (m)</th>
                            <th>FS (m)</th>
                            <th>Rise (m)</th>
                            <th>Fall (m)</th>
                            {result.method === 'HPC' && <th>HPC (m)</th>}
                            <th>Computed RL</th>
                            <th>Corr (m)</th>
                            <th>Adjusted RL</th>
                            <th>Dist (m)</th>
                            <th>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.map((row, idx) => (
                            <tr key={idx} style={{ background: row.isChangePoint ? 'rgba(6, 182, 212, 0.05)' : undefined }}>
                              <td className="mono-cell" style={{ fontWeight: 600, color: row.isChangePoint ? '#38bdf8' : '#f8fafc' }}>
                                {row.stationId}
                              </td>
                              <td className="mono-cell">{row.backsight !== null ? row.backsight.toFixed(3) : '-'}</td>
                              <td className="mono-cell">{row.intermediateSight !== null ? row.intermediateSight.toFixed(3) : '-'}</td>
                              <td className="mono-cell">{row.foresight !== null ? row.foresight.toFixed(3) : '-'}</td>
                              <td className="mono-cell" style={{ color: row.rise ? '#10b981' : undefined }}>
                                {row.rise !== null ? `+${row.rise.toFixed(3)}` : '-'}
                              </td>
                              <td className="mono-cell" style={{ color: row.fall ? '#f43f5e' : undefined }}>
                                {row.fall !== null ? `-${row.fall.toFixed(3)}` : '-'}
                              </td>
                              {result.method === 'HPC' && (
                                <td className="mono-cell" style={{ color: '#f59e0b', fontWeight: 500 }}>
                                  {row.hpc !== null ? row.hpc.toFixed(3) : '-'}
                                </td>
                              )}
                              <td className="mono-cell" style={{ fontWeight: 600 }}>{row.computedRL.toFixed(3)}</td>
                              <td className="mono-cell" style={{ color: 'var(--text-dim)' }}>
                                {row.correction !== 0 ? (row.correction > 0 ? `+${row.correction.toFixed(3)}` : row.correction.toFixed(3)) : '0.000'}
                              </td>
                              <td className="mono-cell text-emerald" style={{ fontWeight: 700 }}>
                                {row.adjustedRL.toFixed(3)}
                              </td>
                              <td className="mono-cell">{row.distanceFromStart !== null ? row.distanceFromStart : '-'}</td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{row.remarks}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="empty-state-card" style={{ padding: '30px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>Enter at least 2 valid station observations in the Field Book tab.</p>
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
