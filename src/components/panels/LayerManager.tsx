import React, { useState } from 'react';
import { CadLayers } from '../../engine/types';
import { Eye, EyeOff, Layers, ChevronDown, ChevronUp, Mountain } from 'lucide-react';

interface LayerManagerProps {
  layers: CadLayers;
  onToggleLayer: (layerKey: keyof CadLayers) => void;
  onUpdateLayerValue: (layerKey: keyof CadLayers, value: any) => void;
}

export const LayerManager: React.FC<LayerManagerProps> = ({ layers, onToggleLayer, onUpdateLayerValue }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDtmCollapsed, setIsDtmCollapsed] = useState(false);

  const layerItems: { key: keyof CadLayers; label: string; color: string }[] = [
    { key: 'beacons', label: 'Beacon Symbols', color: '#ef4444' },
    { key: 'beaconLabels', label: 'Beacon IDs', color: '#f8fafc' },
    { key: 'coordinates', label: 'Coordinate Tags', color: '#94a3b8' },
    { key: 'boundaryLines', label: 'Boundary Lines', color: '#10b981' },
    { key: 'bearings', label: 'Line Bearings (DMS)', color: '#e2e8f0' },
    { key: 'distances', label: 'Line Distances (m)', color: '#38bdf8' },
    { key: 'parcelFill', label: 'Parcel Shading', color: '#06b6d4' },
    { key: 'gridCrosses', label: 'Grid Crosses', color: '#94a3b8' },
    { key: 'controls', label: 'Control Triangles', color: '#f59e0b' }
  ];

  const booleanLayers = layerItems as { key: keyof CadLayers; label: string; color: string }[];
  const activeCount = booleanLayers.filter(i => (layers[i.key] as boolean)).length;

  return (
    <div className="layers-panel-container">
      {/* CAD Layers Header */}
      <div
        className="layers-header-row"
        onClick={() => setIsCollapsed(!isCollapsed)}
        title={isCollapsed ? 'Click to expand CAD Layers' : 'Click to collapse CAD Layers'}
      >
        <div className="layers-header-left">
          <Layers size={14} className="text-emerald" />
          <span className="layers-header-title">CAD Layers &amp; Visibility</span>
        </div>
        <div className="layers-header-right">
          <span className="layers-count-badge">{activeCount}/{layerItems.length} Active</span>
          <span className="layers-chevron-icon">
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </span>
        </div>
      </div>

      {!isCollapsed && (
        <div className="layers-list">
          {layerItems.map(item => {
            const isVisible = layers[item.key] as boolean;
            return (
              <div
                key={item.key}
                className={`layer-row ${isVisible ? 'active' : 'inactive'}`}
                onClick={() => onToggleLayer(item.key)}
              >
                <div className="layer-left">
                  <div className="layer-color-dot" style={{ backgroundColor: item.color }} />
                  <span className="layer-label">{item.label}</span>
                </div>
                <button
                  className="layer-eye-btn"
                  title={isVisible ? 'Hide Layer' : 'Show Layer'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleLayer(item.key);
                  }}
                >
                  {isVisible ? <Eye size={13} className="text-emerald" /> : <EyeOff size={13} className="text-muted" />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* DTM & Contour Layer Section */}
      <div
        className="layers-header-row dtm-section-header"
        onClick={() => setIsDtmCollapsed(!isDtmCollapsed)}
        style={{ marginTop: '4px', borderTop: '1px solid rgba(148,163,184,0.1)', paddingTop: '8px' }}
      >
        <div className="layers-header-left">
          <Mountain size={14} className="text-amber" />
          <span className="layers-header-title">DTM &amp; Contour Layer</span>
        </div>
        <div className="layers-header-right">
          <span className="layers-count-badge" style={{ color: layers.contours ? 'var(--emerald)' : 'var(--text-muted)' }}>
            {layers.contours ? 'ON' : 'OFF'}
          </span>
          <span className="layers-chevron-icon">
            {isDtmCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </span>
        </div>
      </div>

      {!isDtmCollapsed && (
        <div className="dtm-controls-panel">
          {/* Enable Contour Layer Toggle */}
          <div
            className={`layer-row ${layers.contours ? 'active' : 'inactive'}`}
            onClick={() => onToggleLayer('contours')}
          >
            <div className="layer-left">
              <div className="layer-color-dot" style={{ background: 'linear-gradient(135deg, #10b981, #22d3ee)' }} />
              <span className="layer-label">Show Contour Lines</span>
            </div>
            <button className="layer-eye-btn" onClick={(e) => { e.stopPropagation(); onToggleLayer('contours'); }}>
              {layers.contours ? <Eye size={13} className="text-emerald" /> : <EyeOff size={13} className="text-muted" />}
            </button>
          </div>

          {/* Contour Interval */}
          <div className="dtm-param-row">
            <label className="dtm-param-label">Contour Interval (m)</label>
            <input
              type="number"
              className="dtm-param-input"
              value={layers.contourInterval}
              min={0.1}
              step={0.5}
              onChange={(e) => onUpdateLayerValue('contourInterval', parseFloat(e.target.value) || 1)}
            />
          </div>

          {/* Major Contour Every N */}
          <div className="dtm-param-row">
            <label className="dtm-param-label">Major Every N Contours</label>
            <input
              type="number"
              className="dtm-param-input"
              value={layers.majorContourEvery}
              min={2}
              step={1}
              onChange={(e) => onUpdateLayerValue('majorContourEvery', parseInt(e.target.value) || 5)}
            />
          </div>

          {/* Show Labels Toggle */}
          <div
            className={`layer-row ${layers.showContourLabels ? 'active' : 'inactive'}`}
            onClick={() => onToggleLayer('showContourLabels')}
          >
            <div className="layer-left">
              <div className="layer-color-dot" style={{ backgroundColor: '#f59e0b' }} />
              <span className="layer-label">Contour Elevation Labels</span>
            </div>
            <button className="layer-eye-btn" onClick={(e) => { e.stopPropagation(); onToggleLayer('showContourLabels'); }}>
              {layers.showContourLabels ? <Eye size={13} className="text-emerald" /> : <EyeOff size={13} className="text-muted" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
