import React, { useState } from 'react';
import { CoordinatePoint, Parcel } from '../../engine/types';
import { Tag, AlertCircle, ArrowRight, Check } from 'lucide-react';

interface BeaconRenumberModalProps {
  points: CoordinatePoint[];
  parcels: Parcel[];
  isOpen: boolean;
  onClose: () => void;
  onApplyRenumber: (renamedMap: Map<string, string>) => void;
}

export const BeaconRenumberModal: React.FC<BeaconRenumberModalProps> = ({
  points,
  parcels,
  isOpen,
  onClose,
  onApplyRenumber
}) => {
  const [mode, setMode] = useState<'prefix' | 'replace' | 'sequence'>('prefix');
  const [prefix, setPrefix] = useState('CKC/');
  const [suffix, setSuffix] = useState('');
  const [findText, setFindText] = useState('PB');
  const [replaceText, setReplaceText] = useState('SC_');
  const [seqPrefix, setSeqPrefix] = useState('PB_');
  const [seqStart, setSeqStart] = useState(1);
  const [seqPadding, setSeqPadding] = useState(3);

  if (!isOpen) return null;

  // Generate preview map of Old ID -> New ID
  const previewMap = new Map<string, string>();
  const newIdSet = new Set<string>();
  let hasCollision = false;

  points.forEach((p, idx) => {
    let newId = p.id;

    if (mode === 'prefix') {
      newId = `${prefix}${p.id}${suffix}`;
    } else if (mode === 'replace') {
      if (findText) {
        newId = p.id.split(findText).join(replaceText);
      }
    } else if (mode === 'sequence') {
      const num = seqStart + idx;
      const numStr = num.toString().padStart(seqPadding, '0');
      newId = `${seqPrefix}${numStr}`;
    }

    if (newIdSet.has(newId.toLowerCase()) && newId !== p.id) {
      hasCollision = true;
    }
    newIdSet.add(newId.toLowerCase());
    previewMap.set(p.id, newId);
  });

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasCollision) {
      alert('Error: Generated beacon IDs contain duplicates or collisions. Please adjust parameters.');
      return;
    }
    onApplyRenumber(previewMap);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content renumber-modal">
        <div className="modal-header">
          <div className="modal-title">
            <Tag size={16} className="text-emerald" />
            <span>Batch Beacon Prefix & Renumbering (frmRenum)</span>
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="cogo-tabs">
          <button
            type="button"
            className={`cogo-tab-btn ${mode === 'prefix' ? 'active' : ''}`}
            onClick={() => setMode('prefix')}
          >
            Add Prefix / Suffix
          </button>
          <button
            type="button"
            className={`cogo-tab-btn ${mode === 'replace' ? 'active' : ''}`}
            onClick={() => setMode('replace')}
          >
            Find & Replace
          </button>
          <button
            type="button"
            className={`cogo-tab-btn ${mode === 'sequence' ? 'active' : ''}`}
            onClick={() => setMode('sequence')}
          >
            Sequential Renumber
          </button>
        </div>

        <form onSubmit={handleApply}>
          <div className="modal-body">
            {hasCollision && (
              <div className="form-error-banner">
                <AlertCircle size={13} />
                <span>Warning: Proposed renumbering creates duplicate IDs.</span>
              </div>
            )}

            {mode === 'prefix' && (
              <div className="form-row-2">
                <div className="form-group">
                  <label>Prefix to Prepend</label>
                  <input
                    type="text"
                    placeholder="e.g. CKC/ or PB/"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Suffix to Append</label>
                  <input
                    type="text"
                    placeholder="e.g. _2021"
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                  />
                </div>
              </div>
            )}

            {mode === 'replace' && (
              <div className="form-row-2">
                <div className="form-group">
                  <label>Find Text in ID</label>
                  <input
                    type="text"
                    placeholder="e.g. PB"
                    value={findText}
                    onChange={(e) => setFindText(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Replace With</label>
                  <input
                    type="text"
                    placeholder="e.g. SC_"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                  />
                </div>
              </div>
            )}

            {mode === 'sequence' && (
              <div className="form-row-2">
                <div className="form-group">
                  <label>Prefix</label>
                  <input
                    type="text"
                    value={seqPrefix}
                    onChange={(e) => setSeqPrefix(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Start Number & Zero Padding</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="number"
                      value={seqStart}
                      onChange={(e) => setSeqStart(parseInt(e.target.value) || 1)}
                      style={{ flex: 1 }}
                    />
                    <select
                      value={seqPadding}
                      onChange={(e) => setSeqPadding(parseInt(e.target.value) || 1)}
                      style={{ width: '80px' }}
                    >
                      <option value={1}>1</option>
                      <option value={2}>01</option>
                      <option value={3}>001</option>
                      <option value={4}>0001</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Live Preview Table */}
            <div className="form-group">
              <label>Live Preview ({points.length} Beacons)</label>
              <div className="preview-scroll-table">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th>Original Beacon ID</th>
                      <th></th>
                      <th>New Renamed Beacon ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p) => {
                      const newId = previewMap.get(p.id) || p.id;
                      const isChanged = newId !== p.id;
                      return (
                        <tr key={p.id}>
                          <td className="point-id-cell">{p.id}</td>
                          <td style={{ width: '20px', textAlign: 'center' }}>
                            <ArrowRight size={11} className="text-muted" />
                          </td>
                          <td className={`point-id-cell ${isChanged ? 'text-emerald' : ''}`}>
                            {newId}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="hint-text text-muted">
              Note: Applying will automatically update all {parcels.length} defined parcels referencing these beacons and record an undo snapshot.
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={hasCollision}>
              <Check size={14} className="inline-icon" />
              <span>Apply Batch Renumbering</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
