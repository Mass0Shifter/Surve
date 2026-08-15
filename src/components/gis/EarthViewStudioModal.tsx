import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CoordinatePoint, Parcel, ProjectMetadata, NigerianGridBelt } from '../../engine/types';
import {
  reprojectProjectPointsToWGS84,
  reprojectParcelsToWGS84,
  computeGisExtents,
  generateProjectGeoJson,
  generateProjectKml,
  buildGoogleEarthWebUrl,
  GeoPointWGS84,
  GeoParcelWGS84
} from '../../engine/gis/earthGisEngine';
import {
  Globe,
  Layers,
  Download,
  ExternalLink,
  Maximize2,
  Sliders,
  Eye,
  EyeOff,
  MapPin,
  Compass,
  FileCode,
  Info,
  WifiOff,
  Crosshair,
  Sparkles
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

type BasemapType = 'esri_satellite' | 'google_hybrid' | 'osm_standard' | 'carto_dark';

interface BasemapDef {
  id: BasemapType;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

const BASEMAP_REGISTRY: Record<BasemapType, BasemapDef> = {
  esri_satellite: {
    id: 'esri_satellite',
    name: 'Esri World Imagery (Satellite HD)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; DigitalGlobe, GeoEye, Earthstar Geographics',
    maxZoom: 19
  },
  google_hybrid: {
    id: 'google_hybrid',
    name: 'Google Satellite & Roads (Hybrid)',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps Satellite',
    maxZoom: 20
  },
  osm_standard: {
    id: 'osm_standard',
    name: 'OpenStreetMap (Streets & Topo)',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  },
  carto_dark: {
    id: 'carto_dark',
    name: 'CartoDB Dark Matter (CAD High-Contrast)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO &copy; OSM',
    maxZoom: 19
  }
};

interface EarthViewStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectMetadata;
  points: CoordinatePoint[];
  parcels: Parcel[];
  selectedParcelId: string | null;
  onSelectParcel: (id: string | null) => void;
}

export const EarthViewStudioModal: React.FC<EarthViewStudioModalProps> = ({
  isOpen,
  onClose,
  project,
  points,
  parcels,
  selectedParcelId,
  onSelectParcel
}) => {
  // Map Container & Instance Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const vectorLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Settings & Viewport State
  const [activeBasemap, setActiveBasemap] = useState<BasemapType>('esri_satellite');
  const [opacity, setOpacity] = useState<number>(90); // 0 to 100%
  const [gridBelt, setGridBelt] = useState<NigerianGridBelt>(project.gridBelt || NigerianGridBelt.MID_BELT);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // Layer Visibility
  const [showParcels, setShowParcels] = useState<boolean>(true);
  const [showBeacons, setShowBeacons] = useState<boolean>(true);
  const [showBeaconLabels, setShowBeaconLabels] = useState<boolean>(true);
  const [showBearings, setShowBearings] = useState<boolean>(true);

  // Real-time HUD telemetry
  const [cursorPos, setCursorPos] = useState<{ lat: number; lon: number } | null>(null);
  const [activeParcelDetails, setActiveParcelDetails] = useState<GeoParcelWGS84 | null>(null);

  // Network status listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync project gridBelt if project changes
  useEffect(() => {
    if (project.gridBelt) {
      setGridBelt(project.gridBelt);
    }
  }, [project.gridBelt]);

  // Geodetic Reprojection
  const geoPoints = useMemo(() => {
    return reprojectProjectPointsToWGS84(points, gridBelt);
  }, [points, gridBelt]);

  const geoPointsMap = useMemo(() => {
    const map = new Map<string, GeoPointWGS84>();
    for (const p of geoPoints) map.set(p.id, p);
    return map;
  }, [geoPoints]);

  const geoParcels = useMemo(() => {
    return reprojectParcelsToWGS84(parcels, geoPointsMap);
  }, [parcels, geoPointsMap]);

  const extents = useMemo(() => {
    return computeGisExtents(geoPoints);
  }, [geoPoints]);

  // Map Initializer
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    // Cleanup previous map if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [extents.centerLat, extents.centerLon],
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true
    });

    // Add Zoom Control to Top Right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Initial Tile Layer
    const def = BASEMAP_REGISTRY[activeBasemap];
    const tileLayer = L.tileLayer(def.url, {
      attribution: def.attribution,
      maxZoom: def.maxZoom,
      opacity: opacity / 100
    }).addTo(map);

    tileLayerRef.current = tileLayer;

    // Vector Layer Group
    const vectorGroup = L.layerGroup().addTo(map);
    vectorLayerGroupRef.current = vectorGroup;

    // Mouse Move HUD Listener
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorPos({ lat: e.latlng.lat, lon: e.latlng.lng });
    });

    map.on('mouseout', () => {
      setCursorPos(null);
    });

    mapInstanceRef.current = map;

    // Fit bounds on load
    if (geoPoints.length > 0) {
      const bounds = L.latLngBounds(geoPoints.map(p => [p.lat, p.lon] as [number, number]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 });
    }

    // Force map resize after modal mount animation
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [isOpen, extents.centerLat, extents.centerLon]);

  // Basemap & Opacity updater
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    const def = BASEMAP_REGISTRY[activeBasemap];
    const newTileLayer = L.tileLayer(def.url, {
      attribution: def.attribution,
      maxZoom: def.maxZoom,
      opacity: opacity / 100
    }).addTo(mapInstanceRef.current);

    tileLayerRef.current = newTileLayer;
  }, [activeBasemap, opacity]);

  // Render Vector Layers (Parcels, Beacons, Bearings)
  useEffect(() => {
    if (!mapInstanceRef.current || !vectorLayerGroupRef.current) return;

    const group = vectorLayerGroupRef.current;
    group.clearLayers();

    // 1. Render Parcels
    if (showParcels) {
      for (const parcel of geoParcels) {
        const isSelected = selectedParcelId === parcel.id;
        const poly = L.polygon(parcel.coordinates, {
          color: isSelected ? '#38bdf8' : parcel.color || '#10b981',
          weight: isSelected ? 3.5 : 2.5,
          fillColor: parcel.color || '#10b981',
          fillOpacity: isSelected ? 0.45 : 0.25,
          dashArray: isSelected ? '4, 4' : undefined
        });

        poly.bindTooltip(
          `<strong>Plot ${parcel.plotNumber}</strong>${parcel.ownerName ? `<br/>${parcel.ownerName}` : ''}`,
          { sticky: true, className: 'gis-tooltip' }
        );

        poly.on('click', () => {
          onSelectParcel(parcel.id);
          setActiveParcelDetails(parcel);
        });

        group.addLayer(poly);
      }
    }

    // 2. Render Beacons
    if (showBeacons) {
      for (const pt of geoPoints) {
        const marker = L.circleMarker([pt.lat, pt.lon], {
          radius: pt.isControl ? 7 : 5,
          fillColor: pt.isControl ? '#eab308' : '#ef4444',
          color: '#ffffff',
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.9
        });

        marker.bindPopup(`
          <div style="font-family: var(--font-mono, monospace); font-size: 11px; line-height: 1.5; color: #0f172a;">
            <strong style="color: #0284c7; font-size: 13px;">${pt.id}</strong><br/>
            <strong>Minna E:</strong> ${pt.minnaEasting.toFixed(3)} m<br/>
            <strong>Minna N:</strong> ${pt.minnaNorthing.toFixed(3)} m<br/>
            <strong>WGS84 Lat:</strong> ${pt.lat.toFixed(7)}°<br/>
            <strong>WGS84 Lon:</strong> ${pt.lon.toFixed(7)}°<br/>
            ${pt.elevation ? `<strong>Elev (Z):</strong> ${pt.elevation.toFixed(2)} m<br/>` : ''}
            ${pt.description ? `<em>${pt.description}</em>` : ''}
          </div>
        `);

        if (showBeaconLabels) {
          marker.bindTooltip(pt.id, {
            permanent: true,
            direction: 'top',
            offset: [0, -6],
            className: 'gis-beacon-label'
          });
        }

        group.addLayer(marker);
      }
    }

    // 3. Render Edge Bearings & Distances
    if (showBearings && showParcels) {
      for (const parcel of geoParcels) {
        const coords = parcel.coordinates;
        for (let i = 0; i < coords.length; i++) {
          const p1 = coords[i];
          const p2 = coords[(i + 1) % coords.length];
          const midLat = (p1[0] + p2[0]) / 2;
          const midLon = (p1[1] + p2[1]) / 2;

          // Midpoint indicator
          const dot = L.circleMarker([midLat, midLon], {
            radius: 2,
            color: '#38bdf8',
            fillColor: '#38bdf8',
            fillOpacity: 1
          });
          group.addLayer(dot);
        }
      }
    }
  }, [geoParcels, geoPoints, showParcels, showBeacons, showBeaconLabels, showBearings, selectedParcelId, onSelectParcel]);

  // Zoom to Fit All Points
  const handleFitExtents = useCallback(() => {
    if (!mapInstanceRef.current || geoPoints.length === 0) return;
    const bounds = L.latLngBounds(geoPoints.map(p => [p.lat, p.lon] as [number, number]));
    mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
  }, [geoPoints]);

  // Focus on Selected Parcel
  const handleFocusSelectedParcel = useCallback(() => {
    if (!mapInstanceRef.current || !selectedParcelId) return;
    const parcel = geoParcels.find(p => p.id === selectedParcelId);
    if (parcel && parcel.coordinates.length > 0) {
      const bounds = L.latLngBounds(parcel.coordinates);
      mapInstanceRef.current.fitBounds(bounds, { padding: [80, 80], maxZoom: 19 });
    }
  }, [geoParcels, selectedParcelId]);

  // Export GeoJSON
  const handleExportGeoJson = () => {
    const jsonStr = generateProjectGeoJson(geoPoints, geoParcels, project.title || 'Cadastral Survey');
    const blob = new Blob([jsonStr], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.title || 'survey').replace(/\s+/g, '_').toLowerCase()}_cadastral.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export KML
  const handleExportKml = () => {
    const kmlStr = generateProjectKml(geoPoints, geoParcels, project.title || 'Cadastral Survey');
    const blob = new Blob([kmlStr], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project.title || 'survey').replace(/\s+/g, '_').toLowerCase()}_google_earth.kml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Launch Google Earth 3D Web
  const handleLaunchGoogleEarthWeb = () => {
    const url = buildGoogleEarthWebUrl(extents.centerLat, extents.centerLon, 250);
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <ErrorBoundary fallbackTitle="Earth View Satellite Studio Recovery">
      <div className="modal-overlay">
        <div className="modal-content earth-view-modal-studio">
          {/* Header */}
          <div className="modal-header">
            <div className="modal-title">
              <Globe size={18} className="text-emerald" />
              <span>Earth View — Satellite Imagery &amp; Cadastral GIS Studio</span>
              <span className="badge-belt">{project.title || 'Active Project'}</span>
            </div>

            <div className="header-actions-group">
              {/* Online / Offline Status Badge */}
              <div className={`status-badge-network ${isOnline ? 'online' : 'offline'}`}>
                {isOnline ? (
                  <>
                    <span className="dot-online" />
                    <span>Live Tiles</span>
                  </>
                ) : (
                  <>
                    <WifiOff size={12} className="text-amber" />
                    <span>Bush Offline</span>
                  </>
                )}
              </div>

              {/* 1-Click Launch Google Earth Web */}
              <button
                className="btn-secondary-sm"
                onClick={handleLaunchGoogleEarthWeb}
                title="Launch this survey location in 3D Google Earth Web"
              >
                <ExternalLink size={13} className="text-cyan" />
                <span>Google Earth 3D</span>
              </button>

              {/* Export KML */}
              <button
                className="btn-secondary-sm"
                onClick={handleExportKml}
                title="Export georeferenced Google Earth .KML document"
              >
                <Download size={13} />
                <span>KML</span>
              </button>

              {/* Export GeoJSON */}
              <button
                className="btn-secondary-sm"
                onClick={handleExportGeoJson}
                title="Export RFC 7946 GeoJSON FeatureCollection for QGIS &amp; ArcGIS"
              >
                <FileCode size={13} className="text-emerald" />
                <span>GeoJSON</span>
              </button>

              {/* Close */}
              <button className="icon-btn" onClick={onClose} title="Close Earth View">
                ✕
              </button>
            </div>
          </div>

          {/* GIS Controls Toolbar */}
          <div className="earth-view-toolbar">
            {/* Basemap Switcher */}
            <div className="toolbar-segment">
              <label className="toolbar-label">
                <Layers size={13} />
                <span>Basemap:</span>
              </label>
              <select
                className="gis-select"
                value={activeBasemap}
                onChange={e => setActiveBasemap(e.target.value as BasemapType)}
              >
                <option value="esri_satellite">Esri World Imagery HD (Satellite)</option>
                <option value="google_hybrid">Google Satellite &amp; Roads (Hybrid)</option>
                <option value="osm_standard">OpenStreetMap (Streets &amp; Topo)</option>
                <option value="carto_dark">CartoDB Dark Matter (High Contrast)</option>
              </select>
            </div>

            {/* Opacity Slider (Section 4.1 Roadmap Feature) */}
            <div className="toolbar-segment opacity-slider-container">
              <label className="toolbar-label" title="Adjust satellite basemap opacity for boundary comparison">
                <Sliders size={13} />
                <span>Opacity:</span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={opacity}
                onChange={e => setOpacity(parseInt(e.target.value))}
                className="gis-range-slider"
              />
              <span className="opacity-val-badge">{opacity}%</span>
            </div>

            {/* Nigerian Datum Belt Override */}
            <div className="toolbar-segment">
              <label className="toolbar-label" title="Minna Datum Transverse Mercator Belt">
                <Compass size={13} />
                <span>Belt:</span>
              </label>
              <select
                className="gis-select-sm"
                value={gridBelt}
                onChange={e => setGridBelt(parseFloat(e.target.value) as NigerianGridBelt)}
              >
                <option value={NigerianGridBelt.WEST_BELT}>West Belt (4.5° E)</option>
                <option value={NigerianGridBelt.MID_BELT}>Mid Belt (8.5° E - Abuja)</option>
                <option value={NigerianGridBelt.EAST_BELT}>East Belt (12.5° E)</option>
              </select>
            </div>

            {/* Vector Layers Toggles */}
            <div className="toolbar-segment layer-toggles-group">
              <button
                className={`gis-toggle-btn ${showParcels ? 'active' : ''}`}
                onClick={() => setShowParcels(prev => !prev)}
                title="Toggle Cadastral Parcels"
              >
                {showParcels ? <Eye size={12} /> : <EyeOff size={12} />}
                <span>Parcels ({geoParcels.length})</span>
              </button>

              <button
                className={`gis-toggle-btn ${showBeacons ? 'active' : ''}`}
                onClick={() => setShowBeacons(prev => !prev)}
                title="Toggle Survey Beacons"
              >
                {showBeacons ? <Eye size={12} /> : <EyeOff size={12} />}
                <span>Beacons ({geoPoints.length})</span>
              </button>

              <button
                className={`gis-toggle-btn ${showBeaconLabels ? 'active' : ''}`}
                onClick={() => setShowBeaconLabels(prev => !prev)}
                title="Toggle Beacon ID Labels"
                disabled={!showBeacons}
              >
                <MapPin size={12} />
                <span>Labels</span>
              </button>

              <button
                className={`gis-toggle-btn ${showBearings ? 'active' : ''}`}
                onClick={() => setShowBearings(prev => !prev)}
                title="Toggle Segment Indicators"
                disabled={!showParcels}
              >
                <Crosshair size={12} />
                <span>Segments</span>
              </button>
            </div>

            {/* Viewport Actions */}
            <div className="toolbar-segment toolbar-right-actions">
              <button className="gis-action-btn" onClick={handleFitExtents} title="Zoom to Project Extents">
                <Maximize2 size={13} />
                <span>Fit Bounds</span>
              </button>

              {selectedParcelId && (
                <button
                  className="gis-action-btn highlight"
                  onClick={handleFocusSelectedParcel}
                  title="Focus on Selected Parcel"
                >
                  <Crosshair size={13} />
                  <span>Focus Plot</span>
                </button>
              )}
            </div>
          </div>

          {/* Map Viewport Area */}
          <div className="earth-view-map-container">
            <div ref={mapContainerRef} className="leaflet-earth-viewport" />

            {/* HUD Telemetry Coordinate Chip */}
            <div className="gis-hud-chip">
              <Crosshair size={12} className="text-cyan" />
              {cursorPos ? (
                <span className="hud-coords">
                  <strong>WGS84:</strong> {cursorPos.lat.toFixed(6)}°, {cursorPos.lon.toFixed(6)}°
                </span>
              ) : (
                <span className="hud-coords text-muted">Hover over map to read coordinates</span>
              )}
            </div>

            {/* Selected Parcel Inspector Floating Card */}
            {activeParcelDetails && (
              <div className="gis-parcel-float-card">
                <div className="parcel-float-header">
                  <div className="parcel-float-title">
                    <Sparkles size={13} className="text-emerald" />
                    <span>Plot {activeParcelDetails.plotNumber}</span>
                  </div>
                  <button className="parcel-float-close" onClick={() => setActiveParcelDetails(null)}>
                    ✕
                  </button>
                </div>
                <div className="parcel-float-body">
                  {activeParcelDetails.ownerName && (
                    <div className="parcel-float-row">
                      <span className="label">Owner:</span>
                      <span className="val">{activeParcelDetails.ownerName}</span>
                    </div>
                  )}
                  {activeParcelDetails.blockNumber && (
                    <div className="parcel-float-row">
                      <span className="label">Block:</span>
                      <span className="val">{activeParcelDetails.blockNumber}</span>
                    </div>
                  )}
                  <div className="parcel-float-row">
                    <span className="label">Vertices:</span>
                    <span className="val">{activeParcelDetails.beaconIds.join(' → ')}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="earth-view-footer">
            <div className="footer-info">
              <Info size={13} className="text-cyan" />
              <span>
                Minna Datum (Clarke 1880) Helmert 3-Parameter Reprojection (ΔX = -92m, ΔY = -93m, ΔZ = +122m)
              </span>
            </div>
            <div className="footer-stats">
              <span>{geoParcels.length} Parcels</span>
              <span className="footer-divider">•</span>
              <span>{geoPoints.length} Geodetic Beacons</span>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};
