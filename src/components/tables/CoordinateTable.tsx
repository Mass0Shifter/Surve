import React, { useState } from 'react';
import { CoordinatePoint } from '../../engine/types';
import { Plus, Trash2, Edit2, Search, Upload, Download, ShieldCheck, MapPin, AlertCircle, AlertTriangle } from 'lucide-react';
import { exportCoordinatesToCSV, downloadFile } from '../../engine/exporters/csvExporter';
import { parseCoordinatesText } from '../../engine/importers/parser';

interface CoordinateTableProps {
  points: CoordinatePoint[];
  selectedPointId: string | null;
  onSelectPoint: (id: string | null) => void;
  onAddPoint: (point: CoordinatePoint) => boolean;
  onUpdatePoint: (oldId: string, updatedPoint: CoordinatePoint) => boolean;
  onDeletePoint: (id: string) => void;
  onBatchImport: (points: CoordinatePoint[]) => void;
}

export const CoordinateTable: React.FC<CoordinateTableProps> = ({
  points,
  selectedPointId,
  onSelectPoint,
  onAddPoint,
  onUpdatePoint,
  onDeletePoint,
  onBatchImport
}) => {
  const [search, setSearch] = useState('');
  const [newId, setNewId] = useState('');
  const [newEast, setNewEast] = useState('');
  const [newNorth, setNewNorth] = useState('');
  const [newElev, setNewElev] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newIsControl, setNewIsControl] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [proximityWarning, setProximityWarning] = useState<string | null>(null);

  // Edit State
  const [editingPoint, setEditingPoint] = useState<CoordinatePoint | null>(null);
  const [editId, setEditId] = useState('');
  const [editEast, setEditEast] = useState('');
  const [editNorth, setEditNorth] = useState('');
  const [editElev, setEditElev] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editIsControl, setEditIsControl] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const filteredPoints = points.filter(p =>
    p.id.toLowerCase().includes(search.toLowerCase()) ||
    (p.code && p.code.toLowerCase().includes(search.toLowerCase())) ||
    (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
  );

  // Real-time validation for Add Form
  const handleIdChange = (val: string) => {
    setNewId(val);
    if (!val.trim()) {
      setFormError(null);
      return;
    }
    const isDuplicate = points.some(p => p.id.toLowerCase() === val.trim().toLowerCase());
    if (isDuplicate) {
      setFormError(`Beacon ID "${val.trim()}" already exists! Duplicate IDs are not allowed.`);
    } else {
      setFormError(null);
    }
  };

  const checkProximity = (eastStr: string, northStr: string, excludeId?: string) => {
    const east = parseFloat(eastStr);
    const north = parseFloat(northStr);
    if (isNaN(east) || isNaN(north)) {
      setProximityWarning(null);
      return;
    }

    const closePoint = points.find(
      p => p.id !== excludeId && Math.hypot(p.easting - east, p.northing - north) < 0.005
    );
    if (closePoint) {
      setProximityWarning(`Note: Coordinates are nearly identical to existing beacon "${closePoint.id}".`);
    } else {
      setProximityWarning(null);
    }
  };

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    const idClean = newId.trim();
    if (!idClean) {
      setFormError('Please enter a Beacon ID.');
      return;
    }

    const isDuplicate = points.some(p => p.id.toLowerCase() === idClean.toLowerCase());
    if (isDuplicate) {
      setFormError(`Beacon ID "${idClean}" already exists!`);
      return;
    }

    const east = parseFloat(newEast);
    const north = parseFloat(newNorth);
    if (isNaN(east) || isNaN(north)) {
      setFormError('Please enter valid numeric Easting and Northing.');
      return;
    }

    if (east <= 0 || north <= 0) {
      setFormError('Easting and Northing must be positive coordinates.');
      return;
    }

    const elev = newElev.trim() ? parseFloat(newElev) : undefined;

    const success = onAddPoint({
      id: idClean,
      easting: east,
      northing: north,
      elevation: isNaN(elev as number) ? undefined : elev,
      code: newCode.trim() || undefined,
      isControl: newIsControl
    });

    if (success) {
      setNewId('');
      setNewEast('');
      setNewNorth('');
      setNewElev('');
      setNewCode('');
      setNewIsControl(false);
      setShowAddForm(false);
      setFormError(null);
      setProximityWarning(null);
    }
  };

  // Start Editing a Point
  const handleStartEdit = (pt: CoordinatePoint) => {
    setEditingPoint(pt);
    setEditId(pt.id);
    setEditEast(pt.easting.toString());
    setEditNorth(pt.northing.toString());
    setEditElev(pt.elevation !== undefined ? pt.elevation.toString() : '');
    setEditCode(pt.code || '');
    setEditIsControl(!!pt.isControl);
    setEditError(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPoint) return;

    const idClean = editId.trim();
    if (!idClean) {
      setEditError('Please enter a Beacon ID.');
      return;
    }

    // If ID changed, verify it doesn't conflict with another point
    if (idClean.toLowerCase() !== editingPoint.id.toLowerCase()) {
      const isDuplicate = points.some(p => p.id.toLowerCase() === idClean.toLowerCase());
      if (isDuplicate) {
        setEditError(`Beacon ID "${idClean}" already exists!`);
        return;
      }
    }

    const east = parseFloat(editEast);
    const north = parseFloat(editNorth);
    if (isNaN(east) || isNaN(north)) {
      setEditError('Please enter valid numeric Easting and Northing.');
      return;
    }

    const elev = editElev.trim() ? parseFloat(editElev) : undefined;

    const success = onUpdatePoint(editingPoint.id, {
      id: idClean,
      easting: east,
      northing: north,
      elevation: isNaN(elev as number) ? undefined : elev,
      code: editCode.trim() || undefined,
      isControl: editIsControl
    });

    if (success) {
      setEditingPoint(null);
      setEditError(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        const { points: parsed, errors, duplicateCount } = parseCoordinatesText(content);
        if (parsed.length > 0) {
          onBatchImport(parsed);
          let msg = `Successfully imported ${parsed.length} survey coordinates!`;
          if (duplicateCount > 0) {
            msg += `\n(${duplicateCount} duplicate IDs were automatically renamed with unique suffixes).`;
          }
          if (errors.length > 0) {
            msg += `\n\nWarnings:\n${errors.slice(0, 5).join('\n')}`;
          }
          alert(msg);
        } else {
          alert('Could not parse coordinates from file.\n' + errors.join('\n'));
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="coord-panel">
      <div className="panel-header">
        <div className="panel-title">
          <MapPin size={16} className="text-emerald" />
          <span>Coordinates ({points.length})</span>
        </div>
        <div className="panel-actions">
          <label className="icon-btn" title="Import Coordinates (.TXT / .CSV)">
            <Upload size={14} />
            <input type="file" accept=".txt,.csv,.dat" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
          <button
            className="icon-btn"
            title="Export CSV"
            onClick={() => {
              if (points.length === 0) {
                alert('No coordinates available to export.');
                return;
              }
              downloadFile(exportCoordinatesToCSV(points), 'coordinates.csv', 'text/csv');
            }}
          >
            <Download size={14} />
          </button>
          <button
            className={`btn-primary-sm ${showAddForm ? 'active' : ''}`}
            onClick={() => {
              setShowAddForm(!showAddForm);
              setFormError(null);
              setProximityWarning(null);
            }}
          >
            <Plus size={14} />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-bar">
        <Search size={14} className="search-icon" />
        <input
          type="text"
          placeholder="Filter by Beacon ID / Code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Add New Coordinate Form */}
      {showAddForm && (
        <form className="add-coord-form" onSubmit={handleAddNew}>
          {formError && (
            <div className="form-error-banner">
              <AlertCircle size={13} />
              <span>{formError}</span>
            </div>
          )}

          {proximityWarning && (
            <div className="form-warning-banner">
              <AlertTriangle size={13} />
              <span>{proximityWarning}</span>
            </div>
          )}

          <div className="form-row-2">
            <input
              type="text"
              placeholder="Beacon ID (e.g. PB101) *"
              value={newId}
              onChange={(e) => handleIdChange(e.target.value)}
              required
            />
            <input
              type="text"
              placeholder="Code (e.g. PB, CTRL)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
            />
          </div>
          <div className="form-row-2">
            <input
              type="number"
              step="0.001"
              placeholder="Easting (m) *"
              value={newEast}
              onChange={(e) => {
                setNewEast(e.target.value);
                checkProximity(e.target.value, newNorth);
              }}
              required
            />
            <input
              type="number"
              step="0.001"
              placeholder="Northing (m) *"
              value={newNorth}
              onChange={(e) => {
                setNewNorth(e.target.value);
                checkProximity(newEast, e.target.value);
              }}
              required
            />
          </div>
          <div className="form-row-2">
            <input
              type="number"
              step="0.001"
              placeholder="Elevation (m) [opt]"
              value={newElev}
              onChange={(e) => setNewElev(e.target.value)}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={newIsControl}
                onChange={(e) => setNewIsControl(e.target.checked)}
              />
              <span>Control Point</span>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary-sm" onClick={() => setShowAddForm(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary-sm" disabled={!!formError || !newId.trim()}>
              Save Coordinate
            </button>
          </div>
        </form>
      )}

      {/* Coordinate Table */}
      <div className="table-scroll-container">
        <table className="coord-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Easting (m)</th>
              <th>Northing (m)</th>
              <th>Elev (m)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredPoints.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-cell">
                  No survey points match criteria.
                </td>
              </tr>
            ) : (
              filteredPoints.map((pt) => {
                const isSelected = pt.id === selectedPointId;
                return (
                  <tr
                    key={pt.id}
                    className={`coord-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelectPoint(pt.id)}
                    onDoubleClick={() => handleStartEdit(pt)}
                  >
                    <td className="point-id-cell">
                      {pt.isControl && (
                        <span title="Control Point">
                          <ShieldCheck size={12} className="text-amber" />
                        </span>
                      )}
                      <span>{pt.id}</span>
                    </td>
                    <td className="mono-cell">{pt.easting.toFixed(3)}</td>
                    <td className="mono-cell">{pt.northing.toFixed(3)}</td>
                    <td className="mono-cell">{pt.elevation !== undefined ? pt.elevation.toFixed(2) : '-'}</td>
                    <td className="action-cell">
                      <button
                        className="edit-icon-btn"
                        title={`Edit beacon ${pt.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(pt);
                        }}
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        className="delete-icon-btn"
                        title={`Delete beacon ${pt.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePoint(pt.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Coordinate Modal */}
      {editingPoint && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-title">
                <Edit2 size={16} className="text-emerald" />
                <span>Edit Beacon Coordinate ({editingPoint.id})</span>
              </div>
              <button className="icon-btn" onClick={() => setEditingPoint(null)}>✕</button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="modal-body">
                {editError && (
                  <div className="form-error-banner">
                    <AlertCircle size={13} />
                    <span>{editError}</span>
                  </div>
                )}

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Beacon ID *</label>
                    <input
                      type="text"
                      value={editId}
                      onChange={(e) => setEditId(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Code</label>
                    <input
                      type="text"
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Easting (m) *</label>
                    <input
                      type="number"
                      step="0.001"
                      value={editEast}
                      onChange={(e) => setEditEast(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Northing (m) *</label>
                    <input
                      type="number"
                      step="0.001"
                      value={editNorth}
                      onChange={(e) => setEditNorth(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Elevation (m)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={editElev}
                      onChange={(e) => setEditElev(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ justifyContent: 'center' }}>
                    <label className="checkbox-label" style={{ marginTop: '14px' }}>
                      <input
                        type="checkbox"
                        checked={editIsControl}
                        onChange={(e) => setEditIsControl(e.target.checked)}
                      />
                      <span>Control Point (CTRL)</span>
                    </label>
                  </div>
                </div>

                <div className="hint-text text-muted">
                  Note: If you rename the Beacon ID, all parcels referencing this beacon will automatically be updated with the new ID.
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingPoint(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={!editId.trim()}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
