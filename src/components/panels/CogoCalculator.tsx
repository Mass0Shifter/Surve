import React, { useState } from 'react';
import { CoordinatePoint } from '../../engine/types';
import { inversePoints, forwardPoint } from '../../engine/cogo';
import { parseDMSToDecimal } from '../../engine/formats';
import { Calculator, ArrowRight, Compass, AlertTriangle } from 'lucide-react';

interface CogoCalculatorProps {
  points: CoordinatePoint[];
  isOpen: boolean;
  onClose: () => void;
}

export const CogoCalculator: React.FC<CogoCalculatorProps> = ({ points, isOpen, onClose }) => {
  const [tab, setTab] = useState<'inverse' | 'forward'>('inverse');

  // Inversing state
  const [pt1Id, setPt1Id] = useState(points[0]?.id || '');
  const [pt2Id, setPt2Id] = useState(points[1]?.id || '');

  // Forward state
  const [originPtId, setOriginPtId] = useState(points[0]?.id || '');
  const [bearingInput, setBearingInput] = useState('45 30 00');
  const [distanceInput, setDistanceInput] = useState('100.0');

  if (!isOpen) return null;

  // Calculate Inversing
  let invResult = null;
  let isCoincident = false;
  const p1 = points.find(p => p.id === pt1Id) || null;
  const p2 = points.find(p => p.id === pt2Id) || null;

  if (p1 && p2) {
    if (p1.id === p2.id || (Math.abs(p1.easting - p2.easting) < 0.0001 && Math.abs(p1.northing - p2.northing) < 0.0001)) {
      isCoincident = true;
    } else {
      invResult = inversePoints(p1, p2);
    }
  }

  // Calculate Forward
  let fwdResult = null;
  const origin = points.find(p => p.id === originPtId);
  const fwdBearingDeg = parseDMSToDecimal(bearingInput);
  const fwdDist = parseFloat(distanceInput);

  if (origin && !isNaN(fwdBearingDeg) && !isNaN(fwdDist)) {
    fwdResult = forwardPoint(origin, fwdBearingDeg, fwdDist, 'COMPUTED_PT');
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content cogo-modal">
        <div className="modal-header">
          <div className="modal-title">
            <Calculator size={18} className="text-emerald" />
            <span>COGO Quick Geomatics Calculator</span>
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="cogo-tabs">
          <button
            className={`cogo-tab-btn ${tab === 'inverse' ? 'active' : ''}`}
            onClick={() => setTab('inverse')}
          >
            <Compass size={14} />
            <span>Coordinate Inversing (Bearing & Dist)</span>
          </button>
          <button
            className={`cogo-tab-btn ${tab === 'forward' ? 'active' : ''}`}
            onClick={() => setTab('forward')}
          >
            <ArrowRight size={14} />
            <span>Polar Forward Computation</span>
          </button>
        </div>

        <div className="modal-body">
          {tab === 'inverse' ? (
            <div className="cogo-content">
              <div className="form-row-2">
                <div className="form-group">
                  <label>Station 1 (From)</label>
                  <select value={pt1Id} onChange={(e) => setPt1Id(e.target.value)}>
                    <option value="">-- Select Beacon --</option>
                    {points.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.id} ({p.easting.toFixed(1)}, {p.northing.toFixed(1)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Station 2 (To)</label>
                  <select value={pt2Id} onChange={(e) => setPt2Id(e.target.value)}>
                    <option value="">-- Select Beacon --</option>
                    {points.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.id} ({p.easting.toFixed(1)}, {p.northing.toFixed(1)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isCoincident ? (
                <div className="form-warning-banner" style={{ margin: '8px 0' }}>
                  <AlertTriangle size={14} />
                  <span>Coincident Points Selected: Distance is 0.000 m (Bearing is undefined for identical stations).</span>
                </div>
              ) : invResult ? (
                <div className="cogo-result-card">
                  <div className="result-main-grid">
                    <div>
                      <div className="result-label">Whole Circle Bearing (W.C.B)</div>
                      <div className="result-val-large text-emerald">{invResult.bearing.formatted}</div>
                      <div className="result-sub">{invResult.bearing.decimalDegrees.toFixed(5)}° (Dec. Deg)</div>
                    </div>
                    <div>
                      <div className="result-label">Horizontal Distance</div>
                      <div className="result-val-large text-cyan">{invResult.distance.toFixed(3)} m</div>
                      <div className="result-sub">ΔE: {invResult.deltaEasting.toFixed(3)}m | ΔN: {invResult.deltaNorthing.toFixed(3)}m</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="hint-text">Select two distinct points to inverse bearing and distance.</div>
              )}
            </div>
          ) : (
            <div className="cogo-content">
              <div className="form-group">
                <label>Origin Station</label>
                <select value={originPtId} onChange={(e) => setOriginPtId(e.target.value)}>
                  {points.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.id} ({p.easting.toFixed(1)}, {p.northing.toFixed(1)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Bearing (DMS or Dec. Deg)</label>
                  <input
                    type="text"
                    placeholder="e.g. 142 35 20.4 or 142.589"
                    value={bearingInput}
                    onChange={(e) => setBearingInput(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Horizontal Distance (m)</label>
                  <input
                    type="number"
                    step="0.001"
                    placeholder="Distance in meters"
                    value={distanceInput}
                    onChange={(e) => setDistanceInput(e.target.value)}
                  />
                </div>
              </div>

              {fwdResult && (
                <div className="cogo-result-card">
                  <div className="result-main-grid">
                    <div>
                      <div className="result-label">Calculated Easting</div>
                      <div className="result-val-large text-emerald">{fwdResult.easting.toFixed(3)} m</div>
                    </div>
                    <div>
                      <div className="result-label">Calculated Northing</div>
                      <div className="result-val-large text-cyan">{fwdResult.northing.toFixed(3)} m</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};
