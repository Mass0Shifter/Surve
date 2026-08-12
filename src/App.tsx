import React, { useState } from 'react';
import { CoordinatePoint, Parcel, ProjectMetadata, CadLayers, CadTool } from './engine/types';
import { SAMPLE_PROJECT_METADATA, SAMPLE_COORDINATES, SAMPLE_PARCELS } from './engine/sampleData';
import { Header } from './components/layout/Header';
import { Toolbar } from './components/layout/Toolbar';
import { StatusBar } from './components/layout/StatusBar';
import { CadCanvas } from './components/cad/CadCanvas';
import { CoordinateTable } from './components/tables/CoordinateTable';
import { ParcelInspector } from './components/panels/ParcelInspector';
import { LayerManager } from './components/panels/LayerManager';
import { CogoCalculator } from './components/panels/CogoCalculator';

export const App: React.FC = () => {
  // Master Project State
  const [project, setProject] = useState<ProjectMetadata>(SAMPLE_PROJECT_METADATA);
  const [points, setPoints] = useState<CoordinatePoint[]>(SAMPLE_COORDINATES);
  const [parcels, setParcels] = useState<Parcel[]>(SAMPLE_PARCELS);

  // Active Tool & Selection State
  const [activeTool, setActiveTool] = useState<CadTool>('select');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(parcels[0]?.id || null);

  // Real-time Cursor Coordinates
  const [cursorCoord, setCursorCoord] = useState<{ easting: number; northing: number }>({
    easting: points[0]?.easting || 294312.45,
    northing: points[0]?.northing || 992100.125
  });

  // Modal State
  const [isCogoOpen, setIsCogoOpen] = useState<boolean>(false);

  // Active Layer Toggles
  const [layers, setLayers] = useState<CadLayers>({
    beacons: true,
    beaconLabels: true,
    coordinates: true,
    boundaryLines: true,
    bearings: true,
    distances: true,
    parcelFill: true,
    gridCrosses: true,
    controls: true
  });

  const handleToggleLayer = (layerKey: keyof CadLayers) => {
    setLayers(prev => ({ ...prev, [layerKey]: !prev[layerKey] }));
  };

  // Coordinate Management Handlers
  const handleAddPoint = (newPt: CoordinatePoint) => {
    setPoints(prev => [...prev, newPt]);
    setSelectedPointId(newPt.id);
  };

  const handleAddPointAtCoord = (easting: number, northing: number) => {
    const newId = `PB_${points.length + 101}`;
    const newPt: CoordinatePoint = {
      id: newId,
      easting: Math.round(easting * 1000) / 1000,
      northing: Math.round(northing * 1000) / 1000,
      code: 'PB'
    };
    handleAddPoint(newPt);
  };

  const handleUpdatePoint = (updatedPt: CoordinatePoint) => {
    setPoints(prev => prev.map(p => (p.id === updatedPt.id ? updatedPt : p)));
  };

  const handleDeletePoint = (id: string) => {
    setPoints(prev => prev.filter(p => p.id !== id));
    // Also remove point from parcels
    setParcels(prev =>
      prev.map(p => ({
        ...p,
        pointIds: p.pointIds.filter(pid => pid !== id)
      })).filter(p => p.pointIds.length >= 3)
    );
    if (selectedPointId === id) setSelectedPointId(null);
  };

  const handleBatchImport = (importedPoints: CoordinatePoint[]) => {
    // Merge or replace points by ID
    const existingMap = new Map<string, CoordinatePoint>(points.map(p => [p.id, p]));
    for (const ip of importedPoints) {
      existingMap.set(ip.id, ip);
    }
    setPoints(Array.from(existingMap.values()));
  };

  // Parcel Management Handlers
  const handleAddParcel = (newParcel: Parcel) => {
    setParcels(prev => [...prev, newParcel]);
    setSelectedParcelId(newParcel.id);
  };

  const handleDeleteParcel = (id: string) => {
    setParcels(prev => prev.filter(p => p.id !== id));
    if (selectedParcelId === id) setSelectedParcelId(parcels[0]?.id || null);
  };

  // Reset to Sample Benchmark
  const handleLoadSample = () => {
    setProject(SAMPLE_PROJECT_METADATA);
    setPoints(SAMPLE_COORDINATES);
    setParcels(SAMPLE_PARCELS);
    setSelectedPointId(null);
    setSelectedParcelId(SAMPLE_PARCELS[0]?.id || null);
  };

  return (
    <div className="app-container">
      {/* 1. Header */}
      <Header
        project={project}
        points={points}
        parcels={parcels}
        onUpdateProject={setProject}
        onLoadSample={handleLoadSample}
        onOpenCogo={() => setIsCogoOpen(true)}
      />

      {/* 2. CAD Tool Palette Toolbar */}
      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onOpenCogo={() => setIsCogoOpen(true)}
      />

      {/* 3. Main CAD Workstation Area */}
      <main className="app-workspace">
        {/* Left Side: Coordinate Table */}
        <aside className="workspace-sidebar left-sidebar">
          <CoordinateTable
            points={points}
            selectedPointId={selectedPointId}
            onSelectPoint={setSelectedPointId}
            onUpdatePoint={handleUpdatePoint}
            onAddPoint={handleAddPoint}
            onDeletePoint={handleDeletePoint}
            onBatchImport={handleBatchImport}
          />
        </aside>

        {/* Center: Interactive 2D Vector CAD Canvas */}
        <section className="workspace-center">
          <CadCanvas
            points={points}
            parcels={parcels}
            layers={layers}
            activeTool={activeTool}
            selectedPointId={selectedPointId}
            selectedParcelId={selectedParcelId}
            onSelectPoint={setSelectedPointId}
            onSelectParcel={setSelectedParcelId}
            onAddPointAtCoord={handleAddPointAtCoord}
            onCursorMove={(e, n) => setCursorCoord({ easting: e, northing: n })}
          />
        </section>

        {/* Right Side: Parcel Inspector & Layer Manager */}
        <aside className="workspace-sidebar right-sidebar">
          <ParcelInspector
            parcels={parcels}
            points={points}
            selectedParcelId={selectedParcelId}
            onSelectParcel={setSelectedParcelId}
            onAddParcel={handleAddParcel}
            onDeleteParcel={handleDeleteParcel}
          />
          <LayerManager
            layers={layers}
            onToggleLayer={handleToggleLayer}
          />
        </aside>
      </main>

      {/* 4. Live Cursor Coordinate Status Bar */}
      <StatusBar
        cursorEasting={cursorCoord.easting}
        cursorNorthing={cursorCoord.northing}
        beaconCount={points.length}
        parcelCount={parcels.length}
        project={project}
      />

      {/* Quick COGO Modal */}
      <CogoCalculator
        points={points}
        isOpen={isCogoOpen}
        onClose={() => setIsCogoOpen(false)}
      />
    </div>
  );
};
