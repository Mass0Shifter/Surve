import React, { useState } from 'react';
import { CoordinatePoint } from '../../engine/types';
import { Plus, Trash2, Search, Upload, Download, ShieldCheck, MapPin } from 'lucide-react';
import { exportCoordinatesToCSV, downloadFile } from '../../engine/exporters/csvExporter';
import { parseCoordinatesText } from '../../engine/importers/parser';

interface CoordinateTableProps {
  points: CoordinatePoint[];
  selectedPointId: string | null;
  onSelectPoint: (id: string | null) => void;
  onUpdatePoint: (point: CoordinatePoint) => void;
  onAddPoint: (point: CoordinatePoint) => void;
  onDeletePoint: (id: string) => void;
  onBatchImport: (points: CoordinatePoint[]) => void;
}

export const CoordinateTable: React.FC<CoordinateTableProps> = ({
  points,
  selectedPointId,
  onSelectPoint,
  onAddPoint,
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

  const filteredPoints = points.filter(p =>
    p.id.toLowerCase().includes(search.toLowerCase()) ||
    (p.code && p.code.toLowerCase().includes(search.toLowerCase())) ||
    (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
  );

  const handleAddNew = (e: React.FormEvent) => {
    e.preventDefault();
    const east = parseFloat(newEast);
    const north = parseFloat(newNorth);
    if (!newId.trim() || isNaN(east) || isNaN(north)) {
      alert('Please enter a valid Point ID, Easting, and Northing.');
      return;
    }

    const elev = newElev.trim() ? parseFloat(newElev) : undefined;

    onAddPoint({
      id: newId.trim(),
      easting: east,
      northing: north,
      elevation: isNaN(elev as number) ? undefined : elev,
      code: newCode.trim() || undefined,
      isControl: newIsControl
    });

    setNewId('');
    setNewEast('');
    setNewNorth('');
    setNewElev('');
    setNewCode('');
    setNewIsControl(false);
    setShowAddForm(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        const { points: parsed, errors } = parseCoordinatesText(content);
        if (parsed.length > 0) {
          onBatchImport(parsed);
          alert(`Successfully imported ${parsed.length} survey coordinates!`);
        } else {
          alert('Could not parse coordinates from file.\n' + errors.join('\n'));
        }
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
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
            onClick={() => downloadFile(exportCoordinatesToCSV(points), 'coordinates.csv', 'text/csv')}
          >
            <Download size={14} />
          </button>
          <button
            className={`btn-primary-sm ${showAddForm ? 'active' : ''}`}
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus size={14} />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
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
          <div className="form-row-2">
            <input
              type="text"
              placeholder="Beacon ID (e.g. PB101)"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
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
              placeholder="Easting (m)"
              value={newEast}
              onChange={(e) => setNewEast(e.target.value)}
              required
            />
            <input
              type="number"
              step="0.001"
              placeholder="Northing (m)"
              value={newNorth}
              onChange={(e) => setNewNorth(e.target.value)}
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
            <button type="submit" className="btn-primary-sm">
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
                    <td className="mono-cell">{pt.elevation ? pt.elevation.toFixed(2) : '-'}</td>
                    <td className="action-cell">
                      <button
                        className="delete-icon-btn"
                        title="Delete point"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete beacon point ${pt.id}?`)) {
                            onDeletePoint(pt.id);
                          }
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
    </div>
  );
};
