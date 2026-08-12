import React, { useState } from 'react';
import { CoordinatePoint, Parcel } from '../../engine/types';
import { computeParcel } from '../../engine/cogo';
import { Layers, Plus, Compass, CheckCircle2, Download, Trash2, Edit2, User, Hash, AlertCircle } from 'lucide-react';
import { exportParcelScheduleToCSV, downloadFile } from '../../engine/exporters/csvExporter';

interface ParcelInspectorProps {
  parcels: Parcel[];
  points: CoordinatePoint[];
  selectedParcelId: string | null;
  onSelectParcel: (id: string | null) => void;
  onAddParcel: (parcel: Parcel) => boolean;
  onUpdateParcel: (updatedParcel: Parcel) => boolean;
  onDeleteParcel: (id: string) => void;
}

export const ParcelInspector: React.FC<ParcelInspectorProps> = ({
  parcels,
  points,
  selectedParcelId,
  onSelectParcel,
  onAddParcel,
  onUpdateParcel,
  onDeleteParcel
}) => {
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

  const selectedParcel = parcels.find(p => p.id === selectedParcelId) || parcels[0] || null;
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
            className="icon-btn"
            title="Export Parcel Schedule (.CSV)"
            onClick={() => {
              if (parcels.length === 0) {
                alert('No parcels defined to export.');
                return;
              }
              downloadFile(exportParcelScheduleToCSV(parcels, points), 'parcel_schedule.csv', 'text/csv');
            }}
          >
            <Download size={14} />
          </button>
          <button
            className="btn-primary-sm"
            onClick={() => {
              setShowAddModal(true);
              setModalError(null);
            }}
          >
            <Plus size={14} />
            <span>New Plot</span>
          </button>
        </div>
      </div>

      {/* Parcel Selector Tabs */}
      <div className="parcel-tabs">
        {parcels.map(p => {
          const isSelected = p.id === (selectedParcel?.id || null);
          return (
            <button
              key={p.id}
              className={`parcel-tab-btn ${isSelected ? 'active' : ''}`}
              style={{ borderLeftColor: p.color || '#10b981' }}
              onClick={() => onSelectParcel(p.id)}
            >
              <div className="tab-plot-title">{p.plotNumber}</div>
              {p.ownerName && <div className="tab-owner-sub">{p.ownerName}</div>}
            </button>
          );
        })}
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
            <div className="card-header-actions">
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
                  <th>From</th>
                  <th>To</th>
                  <th>Bearing (W.C.B)</th>
                  <th>Dist (m)</th>
                </tr>
              </thead>
              <tbody>
                {computation.legs.map((leg, idx) => (
                  <tr key={idx}>
                    <td className="point-id-cell">{leg.fromPoint.id}</td>
                    <td className="point-id-cell">{leg.toPoint.id}</td>
                    <td className="mono-cell">{leg.bearing.formatted}</td>
                    <td className="mono-cell">{leg.distance.toFixed(3)}</td>
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
                  <label>Select Boundary Corner Beacons (in clockwise order, min 3) *</label>
                  {points.length === 0 ? (
                    <div className="hint-text text-amber">No beacons available. Add coordinates first.</div>
                  ) : (
                    <div className="beacon-pick-list">
                      {points.map(pt => {
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
                  <div className="hint-text">
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
                  <label>Corner Beacons Selection & Sequence (min 3) *</label>
                  <div className="beacon-pick-list">
                    {points.map(pt => {
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
                  <div className="hint-text">
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
    </div>
  );
};
