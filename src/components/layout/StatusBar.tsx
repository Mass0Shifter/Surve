import React from 'react';
import { ProjectMetadata } from '../../engine/types';
import { NIGERIAN_GRID_PARAMS } from '../../engine/datums';
import { Crosshair, MapPin, Layers, Globe } from 'lucide-react';

interface StatusBarProps {
  cursorEasting: number;
  cursorNorthing: number;
  beaconCount: number;
  parcelCount: number;
  project: ProjectMetadata;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  cursorEasting,
  cursorNorthing,
  beaconCount,
  parcelCount,
  project
}) => {
  const beltInfo = NIGERIAN_GRID_PARAMS.belts[project.gridBelt];

  return (
    <footer className="app-statusbar">
      <div className="status-left">
        <div className="status-item cursor-hud">
          <Crosshair size={13} className="text-emerald" />
          <span className="hud-label">EASTING:</span>
          <span className="hud-val">{cursorEasting.toFixed(3)} m</span>
          <span className="hud-label">NORTHING:</span>
          <span className="hud-val">{cursorNorthing.toFixed(3)} m</span>
        </div>
      </div>

      <div className="status-right">
        <div className="status-item">
          <MapPin size={12} className="text-muted" />
          <span>{beaconCount} Beacons</span>
        </div>
        <div className="status-item">
          <Layers size={12} className="text-muted" />
          <span>{parcelCount} Parcels</span>
        </div>
        <div className="status-item">
          <Globe size={12} className="text-cyan" />
          <span>{beltInfo.name}</span>
        </div>
        <div className="status-item scale-badge">
          <span>SCALE 1:{project.scale}</span>
        </div>
      </div>
    </footer>
  );
};
