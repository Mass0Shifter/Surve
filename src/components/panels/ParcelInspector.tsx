import React, { useState } from 'react';
import { CoordinatePoint, Parcel } from '../../engine/types';
import { computeParcel } from '../../engine/cogo';
import { Layers, Plus, Compass, CheckCircle2, Download, Trash2, User, Hash } from 'lucide-react';
import { exportParcelScheduleToCSV, downloadFile } from '../../engine/exporters/csvExporter';

interface ParcelInspectorProps {
  parcels: Parcel[];
  points: CoordinatePoint[];
  selectedParcelId: string | null;
  onSelectParcel: (id: string | null) => void;
  onAddParcel: (parcel: Parcel) => void;
  onDeleteParcel: (id: string) => void;
}

export const ParcelInspector: React.FC<ParcelInspectorProps> = ({
  parcels,
  points,
  selectedParcelId,
  onSelectParcel,
  onAddParcel,
  onDeleteParcel
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPlotNo, setNewPlotNo] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [newBlock, setNewBlock] = useState('');
  const [selectedBeaconIds, setSelectedBeaconIds] = useState<string[]>([]);

  const selectedParcel = parcels.find(p => p.id === selectedParcelId) || parcels[0] || null;
  const computation = selectedParcel ? computeParcel(selectedParcel, points) : null;

  const handleCreateParcel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlotNo.trim() || selectedBeaconIds.length < 3) {
      alert('A parcel must have a Plot Number and at least 3 corner beacons.');
      return;
    }

    const colors = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6'];
    const newColor = colors[parcels.length % colors.length];

    const parcel: Parcel = {
      id: `parcel-${Date.now()}`,
      plotNumber: newPlotNo.trim(),
      ownerName: newOwner.trim() || undefined,
      blockNumber: newBlock.trim() || undefined,
      pointIds: [...selectedBeaconIds],
      color: newColor
    };

    onAddParcel(parcel);
    onSelectParcel(parcel.id);
    setNewPlotNo('');
    setNewOwner('');
    setNewBlock('');
    setSelectedBeaconIds([]);
    setShowAddModal(false);
  };

  const toggleBeaconSelection = (pid: string) => {
    if (selectedBeaconIds.includes(pid)) {
      setSelectedBeaconIds(selectedBeaconIds.filter(id => id !== pid));
    } else {
      setSelectedBeaconIds([...selectedBeaconIds, pid]);
    }
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
            onClick={() => downloadFile(exportParcelScheduleToCSV(parcels, points), 'parcel_schedule.csv', 'text/csv')}
          >
            <Download size={14} />
          </button>
          <button
            className="btn-primary-sm"
            onClick={() => setShowAddModal(true)}
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
            <button
              className="delete-icon-btn"
              title="Delete Plot"
              onClick={() => {
                if (confirm(`Delete parcel ${selectedParcel.plotNumber}?`)) {
                  onDeleteParcel(selectedParcel.id);
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Area & Metric Stat Cards */}
          <div className="stat-grid-2">
            <div className="stat-card">
              <div className="stat-label">Calculated Area</div>
              <div className="stat-val-highlight">{computation.areaSquareMeters.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²</div>
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
          No parcels defined. Click "New Plot" to define boundary beacons.
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
                <div className="form-group">
                  <label>Plot Number *</label>
                  <input
                    type="text"
                    placeholder="e.g. PLOT 205"
                    value={newPlotNo}
                    onChange={(e) => setNewPlotNo(e.target.value)}
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
                  <label>Select Boundary Corner Beacons (in clockwise order) *</label>
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
                  <div className="hint-text">Selected: {selectedBeaconIds.join(' → ')}</div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={selectedBeaconIds.length < 3}>
                  Create Parcel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
