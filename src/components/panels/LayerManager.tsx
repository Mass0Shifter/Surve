import React, { useState } from 'react';
import { CadLayers } from '../../engine/types';
import { Eye, EyeOff, Layers, ChevronDown, ChevronUp } from 'lucide-react';

interface LayerManagerProps {
  layers: CadLayers;
  onToggleLayer: (layerKey: keyof CadLayers) => void;
}

export const LayerManager: React.FC<LayerManagerProps> = ({ layers, onToggleLayer }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

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

  return (
    <div className="layers-panel">
      <div
        className="panel-header"
        style={{ cursor: 'pointer', padding: '0 0 6px 0', borderBottom: isCollapsed ? 'none' : '1px solid var(--border-subtle)' }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="panel-title">
          <Layers size={15} className="text-emerald" />
          <span>CAD Layers & Visibility</span>
        </div>
        <button className="icon-btn" title={isCollapsed ? 'Expand Layers' : 'Collapse Layers'}>
          {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="layers-list">
          {layerItems.map(item => {
            const isVisible = layers[item.key];
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
                <button className="layer-eye-btn" title={isVisible ? 'Hide Layer' : 'Show Layer'}>
                  {isVisible ? <Eye size={14} className="text-emerald" /> : <EyeOff size={14} className="text-muted" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
