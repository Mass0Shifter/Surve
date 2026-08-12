import React from 'react';
import { CadLayers } from '../../engine/types';
import { Eye, EyeOff, SlidersHorizontal } from 'lucide-react';

interface LayerManagerProps {
  layers: CadLayers;
  onToggleLayer: (layerKey: keyof CadLayers) => void;
}

export const LayerManager: React.FC<LayerManagerProps> = ({ layers, onToggleLayer }) => {
  const layerDefs: { key: keyof CadLayers; label: string; color: string }[] = [
    { key: 'beacons', label: 'Beacon Symbols', color: '#ef4444' },
    { key: 'beaconLabels', label: 'Beacon IDs', color: '#f8fafc' },
    { key: 'coordinates', label: 'Coordinate Tags', color: '#94a3b8' },
    { key: 'boundaryLines', label: 'Boundary Lines', color: '#10b981' },
    { key: 'bearings', label: 'Line Bearings (DMS)', color: '#e2e8f0' },
    { key: 'distances', label: 'Line Distances (m)', color: '#38bdf8' },
    { key: 'parcelFill', label: 'Parcel Shading', color: '#06b6d4' },
    { key: 'gridCrosses', label: 'Grid Crosses', color: '#64748b' }
  ];

  return (
    <div className="layer-panel">
      <div className="panel-header">
        <div className="panel-title">
          <SlidersHorizontal size={14} className="text-emerald" />
          <span>CAD Layers & Visibility</span>
        </div>
      </div>
      <div className="layer-list">
        {layerDefs.map(l => {
          const isVisible = layers[l.key];
          return (
            <div
              key={l.key}
              className={`layer-item ${isVisible ? 'active' : 'inactive'}`}
              onClick={() => onToggleLayer(l.key)}
            >
              <div className="layer-color-dot" style={{ backgroundColor: l.color }} />
              <span className="layer-label">{l.label}</span>
              <button className="layer-toggle-btn">
                {isVisible ? <Eye size={14} className="text-emerald" /> : <EyeOff size={14} className="text-muted" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
