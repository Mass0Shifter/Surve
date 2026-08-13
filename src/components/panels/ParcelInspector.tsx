import React, { useState, useMemo } from 'react';
import { CoordinatePoint, Parcel, ProjectMetadata, NigerianGridBelt } from '../../engine/types';
import { computeParcel } from '../../engine/cogo';
import { Layers, Plus, Compass, CheckCircle2, Download, Trash2, Edit2, User, Hash, AlertCircle, Search, Eye, EyeOff, FileText, Code2, FileSpreadsheet } from 'lucide-react';
import { exportParcelScheduleToCSV, downloadFile } from '../../engine/exporters/csvExporter';
import { generateParcelsDXF } from '../../engine/exporters/dxfExporter';
import { generateParcelsSCR } from '../../engine/exporters/scrExporter';

interface ParcelInspectorProps {
  parcels: Parcel[];
  points: CoordinatePoint[];
  project?: ProjectMetadata;
  selectedParcelId: string | null;
  onSelectParcel: (id: string | null) => void;
  onAddParcel: (parcel: Parcel) => boolean;
  onUpdateParcel: (updatedParcel: Parcel) => boolean;
  onDeleteParcel: (id: string) => void;
}

export const ParcelInspector: React.FC<ParcelInspectorProps> = ({
  parcels,
  points,
  project,
  selectedParcelId,
  onSelectParcel,
  onAddParcel,
  onUpdateParcel,
  onDeleteParcel
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'plot_asc' | 'plot_desc' | 'area_desc' | 'area_asc' | 'beacons_desc'>('plot_asc');
  const [beaconFilter, setBeaconFilter] = useState('');

  // CAD Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'dxf' | 'scr' | 'csv'>('dxf');
  const [exportScope, setExportScope] = useState<'single' | 'selected' | 'all'>('single');
  const [exportParcelIds, setExportParcelIds] = useState<string[]>(() => parcels.map(p => p.id));

  const handleExecuteExport = () => {
    const defaultProject: ProjectMetadata = project || {
      title: 'CADASTRAL_SURVEY',
      code: 'JOB-2026',
      clientName: 'CLIENT',
      location: 'NIGERIA',
      surveyFirm: 'SURVEY_FIRM',
      surveyorName: 'SURVEYOR',
      surveyorNumber: 'SURCON/REG/2026',
      address: 'SURVEY_ADDRESS',
      phone: '+2348000000000',
      date: new Date().toISOString().split('T')[0],
      gridBelt: NigerianGridBelt.MID_BELT,
      scale: 1000
    };

    let targetParcelsToExport: Parcel[] = [];
    if (exportScope === 'single' && selectedParcel) {
      targetParcelsToExport = [selectedParcel];
    } else if (exportScope === 'selected' && exportParcelIds.length > 0) {
      const set = new Set(exportParcelIds);
      targetParcelsToExport = parcels.filter(p => set.has(p.id));
    } else {
      targetParcelsToExport = parcels;
    }

    if (targetParcelsToExport.length === 0) {
      alert('Please select at least one parcel to export.');
      return;
    }

    const baseName = targetParcelsToExport.length === 1
      ? targetParcelsToExport[0].plotNumber.replace(/\s+/g, '_')
      : `${targetParcelsToExport.length}_PARCELS`;

    if (exportFormat === 'dxf') {
      const dxf = generateParcelsDXF(defaultProject, points, targetParcelsToExport);
      downloadFile(dxf, `${baseName}.dxf`, 'application/dxf');
    } else if (exportFormat === 'scr') {
      const scr = generateParcelsSCR(defaultProject, points, targetParcelsToExport);
      downloadFile(scr, `${baseName}.scr`, 'text/plain');
    } else {
      const csv = exportParcelScheduleToCSV(targetParcelsToExport, points);
      downloadFile(csv, `${baseName}_schedule.csv`, 'text/csv');
    }

    setShowExportModal(false);
  };

  const handleSingleParcelQuickExport = (p: Parcel, fmt: 'dxf' | 'scr') => {
    const defaultProject: ProjectMetadata = project || {
      title: 'CADASTRAL_SURVEY',
      code: 'JOB-2026',
      clientName: 'CLIENT',
      location: 'NIGERIA',
      surveyFirm: 'SURVEY_FIRM',
      surveyorName: 'SURVEYOR',
      surveyorNumber: 'SURCON/REG/2026',
      address: 'SURVEY_ADDRESS',
      phone: '+2348000000000',
      date: new Date().toISOString().split('T')[0],
      gridBelt: NigerianGridBelt.MID_BELT,
      scale: 1000
    };

    const baseName = p.plotNumber.replace(/\s+/g, '_');
    if (fmt === 'dxf') {
      const dxf = generateParcelsDXF(defaultProject, points, [p]);
      downloadFile(dxf, `${baseName}.dxf`, 'application/dxf');
    } else {
      const scr = generateParcelsSCR(defaultProject, points, [p]);
      downloadFile(scr, `${baseName}.scr`, 'text/plain');
    }
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [newPlotNo, setNewPlotNo] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [newBlock, setNewBlock] = useState('');
  const [selectedBeaconIds, setSelectedBeaconIds] = useState<string[]>([]);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit Parcel State
  const [editingParcel, setEditingParcel] = useState<Parcel | null>(null);
  const [editPlotNo, setEditPlotNo] = useState('');
  const [editOwner, setEditOwner] = useState('');
  const [editBlock, setEditBlock] = useState('');
  const [editBeaconIds, setEditBeaconIds] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  const filteredAndSortedParcels = useMemo(() => {
    let list = parcels.filter(p => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        p.plotNumber.toLowerCase().includes(q) ||
        (p.ownerName && p.ownerName.toLowerCase().includes(q)) ||
        (p.blockNumber && p.blockNumber.toLowerCase().includes(q))
      );
    });

    list = [...list].sort((a, b) => {
      if (sortBy === 'plot_asc') return a.plotNumber.localeCompare(b.plotNumber, undefined, { numeric: true });
      if (sortBy === 'plot_desc') return b.plotNumber.localeCompare(a.plotNumber, undefined, { numeric: true });
      if (sortBy === 'area_desc' || sortBy === 'area_asc') {
        const aArea = computeParcel(a, points)?.areaSquareMeters || 0;
        const bArea = computeParcel(b, points)?.areaSquareMeters || 0;
        return sortBy === 'area_desc' ? bArea - aArea : aArea - bArea;
      }
      if (sortBy === 'beacons_desc') return b.pointIds.length - a.pointIds.length;
      return 0;
    });

    return list;
  }, [parcels, points, searchQuery, sortBy]);

  const selectedParcel = parcels.find(p => p.id === selectedParcelId) || filteredAndSortedParcels[0] || parcels[0] || null;
  const computation = selectedParcel ? computeParcel(selectedParcel, points) : null;

  const handlePlotNoChange = (val: string) => {
    setNewPlotNo(val);
    if (!val.trim()) {
      setModalError(null);
      return;
    }
    const isDup = parcels.some(p => p.plotNumber.toLowerCase() === val.trim().toLowerCase());
    if (isDup) {
      setModalError(`A parcel with Plot Number "${val.trim()}" already exists!`);
    } else {
      setModalError(null);
    }
  };

  const handleCreateParcel = (e: React.FormEvent) => {
    e.preventDefault();
    const plotClean = newPlotNo.trim();
    if (!plotClean) {
      setModalError('Please enter a Plot Number.');
      return;
    }

    const isDup = parcels.some(p => p.plotNumber.toLowerCase() === plotClean.toLowerCase());
    if (isDup) {
      setModalError(`A parcel with Plot Number "${plotClean}" already exists!`);
      return;
    }

    const uniqueBeacons = Array.from(new Set(selectedBeaconIds));
    if (uniqueBeacons.length < 3) {
      setModalError('A parcel must have at least 3 distinct corner beacons.');
      return;
    }

    const tempParcel: Parcel = {
      id: 'temp',
      plotNumber: plotClean,
      pointIds: [...selectedBeaconIds]
    };
    const testComp = computeParcel(tempParcel, points);
    if (!testComp || testComp.areaSquareMeters <= 0.01) {
      setModalError('Selected vertices produce an invalid or zero area. Please check clockwise beacon sequence.');
      return;
    }

    const colors = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6'];
    const newColor = colors[parcels.length % colors.length];

    const parcel: Parcel = {
      id: `parcel-${Date.now()}`,
      plotNumber: plotClean,
      ownerName: newOwner.trim() || undefined,
      blockNumber: newBlock.trim() || undefined,
      pointIds: [...selectedBeaconIds],
      color: newColor
    };

    const success = onAddParcel(parcel);
    if (success) {
      onSelectParcel(parcel.id);
      setNewPlotNo('');
      setNewOwner('');
      setNewBlock('');
      setSelectedBeaconIds([]);
      setModalError(null);
      setShowAddModal(false);
    }
  };

  // Start Editing Active Parcel
  const handleStartEdit = (parcel: Parcel) => {
    setEditingParcel(parcel);
    setEditPlotNo(parcel.plotNumber);
    setEditOwner(parcel.ownerName || '');
    setEditBlock(parcel.blockNumber || '');
    setEditBeaconIds([...parcel.pointIds]);
    setEditError(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParcel) return;

    const plotClean = editPlotNo.trim();
    if (!plotClean) {
      setEditError('Please enter a Plot Number.');
      return;
    }

    // If plot number changed, ensure no collision with another parcel
    if (plotClean.toLowerCase() !== editingParcel.plotNumber.toLowerCase()) {
      const isDup = parcels.some(
        p => p.id !== editingParcel.id && p.plotNumber.toLowerCase() === plotClean.toLowerCase()
      );
      if (isDup) {
        setEditError(`A parcel with Plot Number "${plotClean}" already exists!`);
        return;
      }
    }

    const uniqueBeacons = Array.from(new Set(editBeaconIds));
    if (uniqueBeacons.length < 3) {
      setEditError('A parcel must have at least 3 distinct corner beacons.');
      return;
    }

    const tempParcel: Parcel = {
      ...editingParcel,
      plotNumber: plotClean,
      pointIds: [...editBeaconIds]
    };
    const testComp = computeParcel(tempParcel, points);
    if (!testComp || testComp.areaSquareMeters <= 0.01) {
      setEditError('Selected vertices produce an invalid or zero area. Check beacon sequence.');
      return;
    }

    const updated: Parcel = {
      ...editingParcel,
      plotNumber: plotClean,
      ownerName: editOwner.trim() || undefined,
      blockNumber: editBlock.trim() || undefined,
      pointIds: [...editBeaconIds]
    };

    const success = onUpdateParcel(updated);
    if (success) {
      setEditingParcel(null);
      setEditError(null);
    }
  };

  const toggleBeaconSelection = (pid: string) => {
    if (selectedBeaconIds.includes(pid)) {
      setSelectedBeaconIds(selectedBeaconIds.filter(id => id !== pid));
    } else {
      setSelectedBeaconIds([...selectedBeaconIds, pid]);
    }
    setModalError(null);
  };

  const toggleEditBeaconSelection = (pid: string) => {
    if (editBeaconIds.includes(pid)) {
      setEditBeaconIds(editBeaconIds.filter(id => id !== pid));
    } else {
      setEditBeaconIds([...editBeaconIds, pid]);
    }
    setEditError(null);
  };

  return (
    <div className="parcel-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Layers size={16} className="text-cyan" />
          <span>Cadastral Parcels ({parcels.length})</span>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            className="icon-btn"
            title={parcels.some(p => p.hidden) ? "Show All Plots on CAD" : "Hide All Plots on CAD"}
            onClick={() => {
              const allHidden = parcels.every(p => p.hidden);
              parcels.forEach(p => onUpdateParcel({ ...p, hidden: !allHidden }));
            }}
          >
            {parcels.every(p => p.hidden) ? <EyeOff size={14} className="text-muted" /> : <Eye size={14} className="text-emerald" />}
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Export Parcels to CAD (DXF, SCR, CSV)"
            onClick={() => {
              if (parcels.length === 0) {
                alert('No parcels defined to export.');
                return;
              }
              setExportParcelIds(parcels.map(p => p.id));
              setShowExportModal(true);
            }}
          >
            <Download size={14} />
          </button>
          <button
            type="button"
            className="btn-primary-sm"
            onClick={() => {
              setShowAddModal(true);
              setBeaconFilter('');
              setModalError(null);
            }}
          >
            <Plus size={14} />
            <span>New Plot</span>
          </button>
        </div>
      </div>

      {/* Parcel Filter & Sort Controls */}
      <div className="parcel-filter-bar" style={{ padding: '8px 12px', display: 'flex', gap: '6px', background: 'rgba(15, 23, 42, 0.4)', borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
        <div className="input-with-icon" style={{ flex: 1, position: 'relative' }}>
          <Search size={12} className="text-muted" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search plots..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', fontSize: '11px', padding: '4px 8px 4px 24px', height: '26px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: '4px', color: '#f8fafc' }}
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          style={{ fontSize: '10px', height: '26px', padding: '0 6px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: '4px', color: '#94a3b8' }}
          title="Sort parcels list"
        >
          <option value="plot_asc">Plot # (A-Z)</option>
          <option value="plot_desc">Plot # (Z-A)</option>
          <option value="area_desc">Area (Largest)</option>
          <option value="area_asc">Area (Smallest)</option>
          <option value="beacons_desc">Beacons Count</option>
        </select>
      </div>

      {/* Parcel Selector Tabs */}
      <div className="parcel-tabs">
        {filteredAndSortedParcels.length === 0 ? (
          <div style={{ padding: '16px 12px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
            No plots match search.
          </div>
        ) : (
          filteredAndSortedParcels.map(p => {
            const isSelected = p.id === (selectedParcel?.id || null);
            return (
              <div
                key={p.id}
                className={`parcel-tab-btn ${isSelected ? 'active' : ''} ${p.hidden ? 'hidden-plot' : ''}`}
                style={{ borderLeftColor: p.color || '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '8px' }}
                onClick={() => onSelectParcel(p.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tab-plot-title" style={{ opacity: p.hidden ? 0.5 : 1 }}>{p.plotNumber}</div>
                  {p.ownerName && <div className="tab-owner-sub" style={{ opacity: p.hidden ? 0.5 : 1 }}>{p.ownerName}</div>}
                </div>
                <button
                  type="button"
                  className="parcel-eye-btn"
                  title={p.hidden ? `Show ${p.plotNumber} on CAD canvas` : `Hide ${p.plotNumber} on CAD canvas`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateParcel({ ...p, hidden: !p.hidden });
                  }}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', opacity: p.hidden ? 0.4 : 0.8 }}
                >
                  {p.hidden ? <EyeOff size={12} className="text-muted" /> : <Eye size={12} className="text-emerald" />}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Parcel Metrics Summary */}
      {computation ? (
        <div className="parcel-details-card">
          <div className="parcel-card-header">
            <div>
              <div className="card-plot-title">{selectedParcel.plotNumber}</div>
              {selectedParcel.ownerName && (
                <div className="card-owner-info">
                  <User size={12} className="inline-icon" />
                  <span>{selectedParcel.ownerName}</span>
                </div>
              )}
              {selectedParcel.blockNumber && (
                <div className="card-block-info">
                  <Hash size={12} className="inline-icon" />
                  <span>{selectedParcel.blockNumber}</span>
                </div>
              )}
            </div>
            <div className="card-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                className="btn-secondary-sm"
                style={{ fontSize: '10px', padding: '3px 6px', height: '24px' }}
                title={`Quick Export DXF for ${selectedParcel.plotNumber}`}
                onClick={() => handleSingleParcelQuickExport(selectedParcel, 'dxf')}
              >
                DXF
              </button>
              <button
                type="button"
                className="btn-secondary-sm"
                style={{ fontSize: '10px', padding: '3px 6px', height: '24px' }}
                title={`Quick Export AutoCAD Script (.SCR) for ${selectedParcel.plotNumber}`}
                onClick={() => handleSingleParcelQuickExport(selectedParcel, 'scr')}
              >
                SCR
              </button>
              <button
                className="edit-icon-btn"
                title={`Edit ${selectedParcel.plotNumber}`}
                onClick={() => handleStartEdit(selectedParcel)}
              >
                <Edit2 size={13} />
              </button>
              <button
                className="delete-icon-btn"
                title={`Delete ${selectedParcel.plotNumber}`}
                onClick={() => {
                  if (confirm(`Are you sure you want to delete parcel "${selectedParcel.plotNumber}"?`)) {
                    onDeleteParcel(selectedParcel.id);
                  }
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Area & Metric Stat Cards */}
          <div className="stat-grid-2">
            <div className="stat-card">
              <div className="stat-label">Calculated Area</div>
              <div className="stat-val-highlight">
                {computation.areaSquareMeters.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²
              </div>
              <div className="stat-sub">{computation.areaHectares.toFixed(4)} Hectares</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Perimeter & Closure</div>
              <div className="stat-val">{computation.perimeter.toFixed(2)} m</div>
              <div className="stat-sub text-emerald">
                <CheckCircle2 size={11} className="inline-icon" />
                <span>Closed Polygon</span>
              </div>
            </div>
          </div>

          {/* Boundary Bearing & Distance Schedule */}
          <div className="schedule-header">
            <Compass size={14} className="text-emerald" />
            <span>Boundary Bearing & Distance Schedule</span>
          </div>

          <div className="table-scroll-container">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th style={{ width: '26%' }}>From</th>
                  <th style={{ width: '26%' }}>To</th>
                  <th style={{ width: '30%' }}>Bearing (W.C.B)</th>
                  <th style={{ width: '18%', textAlign: 'right' }}>Dist (m)</th>
                </tr>
              </thead>
              <tbody>
                {computation.legs.map((leg, idx) => (
                  <tr key={idx}>
                    <td className="schedule-cell-id">{leg.fromPoint.id}</td>
                    <td className="schedule-cell-id">{leg.toPoint.id}</td>
                    <td className="schedule-cell-bearing">{leg.bearing.formatted}</td>
                    <td className="schedule-cell-dist">{leg.distance.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-panel-msg">
          No parcels defined. Click "+ New Plot" to define boundary corner beacons.
        </div>
      )}

      {/* New Parcel Creation Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Define New Cadastral Parcel</h3>
              <button className="icon-btn" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateParcel}>
              <div className="modal-body">
                {modalError && (
                  <div className="form-error-banner">
                    <AlertCircle size={13} />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label>Plot Number *</label>
                  <input
                    type="text"
                    placeholder="e.g. PLOT 205"
                    value={newPlotNo}
                    onChange={(e) => handlePlotNoChange(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Owner / Allottee Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Alhaji Sani Bello"
                    value={newOwner}
                    onChange={(e) => setNewOwner(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Block Number</label>
                  <input
                    type="text"
                    placeholder="e.g. BLOCK 4"
                    value={newBlock}
                    onChange={(e) => setNewBlock(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ margin: 0 }}>Select Boundary Corner Beacons (min 3) *</label>
                    <span className="hint-text">{selectedBeaconIds.length} Selected</span>
                  </div>

                  <div className="beacon-search-box" style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <div className="input-with-icon" style={{ flex: 1, position: 'relative' }}>
                      <Search size={12} className="text-muted" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="text"
                        placeholder="Search/Filter beacons (e.g. PB10, SC)..."
                        value={beaconFilter}
                        onChange={(e) => setBeaconFilter(e.target.value)}
                        style={{ width: '100%', fontSize: '11px', padding: '5px 8px 5px 24px', height: '28px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: '4px', color: '#f8fafc' }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary-sm"
                      style={{ fontSize: '10px', padding: '4px 8px' }}
                      onClick={() => {
                        const filtered = points.filter(p => !beaconFilter || p.id.toLowerCase().includes(beaconFilter.toLowerCase()) || (p.code && p.code.toLowerCase().includes(beaconFilter.toLowerCase())));
                        const idsToAdd = filtered.map(p => p.id).filter(id => !selectedBeaconIds.includes(id));
                        setSelectedBeaconIds([...selectedBeaconIds, ...idsToAdd]);
                      }}
                    >
                      Select Filtered
                    </button>
                    {selectedBeaconIds.length > 0 && (
                      <button
                        type="button"
                        className="btn-secondary-sm"
                        style={{ fontSize: '10px', padding: '4px 8px' }}
                        onClick={() => setSelectedBeaconIds([])}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {points.length === 0 ? (
                    <div className="hint-text text-amber">No beacons available. Add coordinates first.</div>
                  ) : (
                    <div className="beacon-pick-list">
                      {points
                        .filter(p => !beaconFilter || p.id.toLowerCase().includes(beaconFilter.toLowerCase()) || (p.code && p.code.toLowerCase().includes(beaconFilter.toLowerCase())))
                        .map(pt => {
                          const isPicked = selectedBeaconIds.includes(pt.id);
                          const orderIdx = selectedBeaconIds.indexOf(pt.id);
                          return (
                            <div
                              key={pt.id}
                              className={`beacon-pick-chip ${isPicked ? 'picked' : ''}`}
                              onClick={() => toggleBeaconSelection(pt.id)}
                            >
                              {isPicked && <span className="chip-badge">{orderIdx + 1}</span>}
                              <span>{pt.id}</span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                  <div className="hint-text" style={{ marginTop: '6px' }}>
                    Selected Order: {selectedBeaconIds.length > 0 ? selectedBeaconIds.join(' → ') : 'None'}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!!modalError || !newPlotNo.trim() || selectedBeaconIds.length < 3}
                >
                  Create Parcel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Parcel Modal */}
      {editingParcel && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-title">
                <Edit2 size={16} className="text-cyan" />
                <span>Edit Cadastral Parcel ({editingParcel.plotNumber})</span>
              </div>
              <button className="icon-btn" onClick={() => setEditingParcel(null)}>✕</button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="modal-body">
                {editError && (
                  <div className="form-error-banner">
                    <AlertCircle size={13} />
                    <span>{editError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label>Plot Number *</label>
                  <input
                    type="text"
                    value={editPlotNo}
                    onChange={(e) => setEditPlotNo(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Owner / Allottee Name</label>
                  <input
                    type="text"
                    value={editOwner}
                    onChange={(e) => setEditOwner(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Block Number</label>
                  <input
                    type="text"
                    value={editBlock}
                    onChange={(e) => setEditBlock(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ margin: 0 }}>Corner Beacons Selection &amp; Sequence (min 3) *</label>
                    <span className="hint-text">{editBeaconIds.length} Selected</span>
                  </div>

                  <div className="beacon-search-box" style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <div className="input-with-icon" style={{ flex: 1, position: 'relative' }}>
                      <Search size={12} className="text-muted" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="text"
                        placeholder="Search/Filter beacons..."
                        value={beaconFilter}
                        onChange={(e) => setBeaconFilter(e.target.value)}
                        style={{ width: '100%', fontSize: '11px', padding: '5px 8px 5px 24px', height: '28px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: '4px', color: '#f8fafc' }}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary-sm"
                      style={{ fontSize: '10px', padding: '4px 8px' }}
                      onClick={() => {
                        const filtered = points.filter(p => !beaconFilter || p.id.toLowerCase().includes(beaconFilter.toLowerCase()) || (p.code && p.code.toLowerCase().includes(beaconFilter.toLowerCase())));
                        const idsToAdd = filtered.map(p => p.id).filter(id => !editBeaconIds.includes(id));
                        setEditBeaconIds([...editBeaconIds, ...idsToAdd]);
                      }}
                    >
                      Select Filtered
                    </button>
                    {editBeaconIds.length > 0 && (
                      <button
                        type="button"
                        className="btn-secondary-sm"
                        style={{ fontSize: '10px', padding: '4px 8px' }}
                        onClick={() => setEditBeaconIds([])}
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="beacon-pick-list">
                    {points
                      .filter(p => !beaconFilter || p.id.toLowerCase().includes(beaconFilter.toLowerCase()) || (p.code && p.code.toLowerCase().includes(beaconFilter.toLowerCase())))
                      .map(pt => {
                        const isPicked = editBeaconIds.includes(pt.id);
                        const orderIdx = editBeaconIds.indexOf(pt.id);
                        return (
                          <div
                            key={pt.id}
                            className={`beacon-pick-chip ${isPicked ? 'picked' : ''}`}
                            onClick={() => toggleEditBeaconSelection(pt.id)}
                          >
                            {isPicked && <span className="chip-badge">{orderIdx + 1}</span>}
                            <span>{pt.id}</span>
                          </div>
                        );
                      })}
                  </div>
                  <div className="hint-text" style={{ marginTop: '6px' }}>
                    Current Sequence: {editBeaconIds.length > 0 ? editBeaconIds.join(' → ') : 'None'}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingParcel(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!editPlotNo.trim() || editBeaconIds.length < 3}
                >
                  Save Parcel Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Parcel CAD Export Dialog Modal */}
      {showExportModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div className="modal-title">
                <Download size={16} className="text-emerald" />
                <span>Export Cadastral Parcels</span>
              </div>
              <button className="icon-btn" onClick={() => setShowExportModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 1. Format Selection */}
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '6px', display: 'block' }}>
                  Export Format
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    className={`parcel-tab-btn ${exportFormat === 'dxf' ? 'active' : ''}`}
                    onClick={() => setExportFormat('dxf')}
                    style={{ textAlign: 'center', padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                  >
                    <Code2 size={16} className="text-cyan" />
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>AutoCAD (.DXF)</span>
                    <span style={{ fontSize: '9px', color: '#94a3b8' }}>Vector CAD</span>
                  </button>
                  <button
                    type="button"
                    className={`parcel-tab-btn ${exportFormat === 'scr' ? 'active' : ''}`}
                    onClick={() => setExportFormat('scr')}
                    style={{ textAlign: 'center', padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                  >
                    <FileText size={16} className="text-emerald" />
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>Script (.SCR)</span>
                    <span style={{ fontSize: '9px', color: '#94a3b8' }}>SurvPack Script</span>
                  </button>
                  <button
                    type="button"
                    className={`parcel-tab-btn ${exportFormat === 'csv' ? 'active' : ''}`}
                    onClick={() => setExportFormat('csv')}
                    style={{ textAlign: 'center', padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
                  >
                    <FileSpreadsheet size={16} className="text-amber" />
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>Schedule (.CSV)</span>
                    <span style={{ fontSize: '9px', color: '#94a3b8' }}>Excel / Sheet</span>
                  </button>
                </div>
              </div>

              {/* 2. Scope Selection */}
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '6px', display: 'block' }}>
                  Export Scope
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    className={`btn-secondary-sm ${exportScope === 'single' ? 'active text-emerald' : ''}`}
                    style={{ flex: 1, fontSize: '10px' }}
                    onClick={() => setExportScope('single')}
                  >
                    Focused Plot ({selectedParcel?.plotNumber || 'None'})
                  </button>
                  <button
                    type="button"
                    className={`btn-secondary-sm ${exportScope === 'selected' ? 'active text-emerald' : ''}`}
                    style={{ flex: 1, fontSize: '10px' }}
                    onClick={() => setExportScope('selected')}
                  >
                    Selected Plots ({exportParcelIds.length})
                  </button>
                  <button
                    type="button"
                    className={`btn-secondary-sm ${exportScope === 'all' ? 'active text-emerald' : ''}`}
                    style={{ flex: 1, fontSize: '10px' }}
                    onClick={() => setExportScope('all')}
                  >
                    All Plots ({parcels.length})
                  </button>
                </div>

                {/* Multi-Parcel Checklist */}
                {exportScope === 'selected' && (
                  <div className="multi-parcel-picker-box" style={{ maxHeight: '130px', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px 6px', borderBottom: '1px solid rgba(148, 163, 184, 0.1)', marginBottom: '4px' }}>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>Pick plots to include:</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="btn-secondary-sm"
                          style={{ fontSize: '9px', padding: '1px 5px' }}
                          onClick={() => setExportParcelIds(parcels.map(p => p.id))}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          className="btn-secondary-sm"
                          style={{ fontSize: '9px', padding: '1px 5px' }}
                          onClick={() => setExportParcelIds([])}
                        >
                          None
                        </button>
                      </div>
                    </div>
                    {parcels.map(p => {
                      const isChecked = exportParcelIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="checkbox-label"
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', fontSize: '11px', cursor: 'pointer', borderRadius: '4px', background: isChecked ? 'rgba(16, 185, 129, 0.08)' : 'transparent' }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setExportParcelIds([...exportParcelIds, p.id]);
                              } else {
                                setExportParcelIds(exportParcelIds.filter(id => id !== p.id));
                              }
                            }}
                          />
                          <span style={{ fontWeight: isChecked ? 600 : 400, color: isChecked ? '#f8fafc' : '#94a3b8' }}>
                            {p.plotNumber} {p.ownerName ? `(${p.ownerName})` : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowExportModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleExecuteExport}
                disabled={exportScope === 'selected' && exportParcelIds.length === 0}
              >
                <Download size={13} />
                <span>Download {exportFormat.toUpperCase()}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
