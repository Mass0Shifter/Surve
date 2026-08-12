import React, { useState, useEffect, useCallback, useRef } from 'react';
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

interface HistorySnapshot {
  points: CoordinatePoint[];
  parcels: Parcel[];
  project: ProjectMetadata;
  description: string;
}

export const App: React.FC = () => {
  // Master Project State
  const [project, setProject] = useState<ProjectMetadata>(SAMPLE_PROJECT_METADATA);
  const [points, setPoints] = useState<CoordinatePoint[]>(SAMPLE_COORDINATES);
  const [parcels, setParcels] = useState<Parcel[]>(SAMPLE_PARCELS);

  // Undo / Redo History Stacks
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  // Ref to always access current state in event listeners without re-binding
  const stateRef = useRef({ points, parcels, project });
  stateRef.current = { points, parcels, project };

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

  // Push state snapshot onto undo stack before mutations
  const recordSnapshot = useCallback((description: string) => {
    const current = stateRef.current;
    const snapshot: HistorySnapshot = {
      points: JSON.parse(JSON.stringify(current.points)),
      parcels: JSON.parse(JSON.stringify(current.parcels)),
      project: JSON.parse(JSON.stringify(current.project)),
      description
    };
    setUndoStack(prev => [...prev.slice(-49), snapshot]); // Keep up to 50 items
    setRedoStack([]); // Clear redo stack on new action
  }, []);

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const current = stateRef.current;
    const previous = undoStack[undoStack.length - 1];

    // Push current to redo stack
    const redoSnapshot: HistorySnapshot = {
      points: JSON.parse(JSON.stringify(current.points)),
      parcels: JSON.parse(JSON.stringify(current.parcels)),
      project: JSON.parse(JSON.stringify(current.project)),
      description: 'Current State'
    };
    setRedoStack(prev => [...prev, redoSnapshot]);

    // Apply previous state
    setPoints(previous.points);
    setParcels(previous.parcels);
    setProject(previous.project);
    setUndoStack(prev => prev.slice(0, -1));
  }, [undoStack]);

  // Redo Handler
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const current = stateRef.current;
    const next = redoStack[redoStack.length - 1];

    // Push current to undo stack
    const undoSnapshot: HistorySnapshot = {
      points: JSON.parse(JSON.stringify(current.points)),
      parcels: JSON.parse(JSON.stringify(current.parcels)),
      project: JSON.parse(JSON.stringify(current.project)),
      description: 'Before Redo'
    };
    setUndoStack(prev => [...prev, undoSnapshot]);

    // Apply next state
    setPoints(next.points);
    setParcels(next.parcels);
    setProject(next.project);
    setRedoStack(prev => prev.slice(0, -1));
  }, [redoStack]);

  // Global Keyboard Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger undo/redo if user is actively typing inside an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === 'z' || e.key === 'Z') {
          if (e.shiftKey) {
            // Ctrl+Shift+Z = Redo
            e.preventDefault();
            handleRedo();
          } else {
            // Ctrl+Z = Undo
            e.preventDefault();
            handleUndo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          // Ctrl+Y = Redo
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Coordinate Management Handlers with History
  const handleAddPoint = (newPt: CoordinatePoint): boolean => {
    const isDup = points.some(p => p.id.toLowerCase() === newPt.id.trim().toLowerCase());
    if (isDup) {
      alert(`Error: Beacon ID "${newPt.id}" already exists. Duplicate IDs are not allowed.`);
      return false;
    }
    recordSnapshot(`Add Beacon ${newPt.id}`);
    setPoints(prev => [...prev, newPt]);
    setSelectedPointId(newPt.id);
    return true;
  };

  const handleUpdatePoint = (oldId: string, updatedPt: CoordinatePoint): boolean => {
    if (oldId.toLowerCase() !== updatedPt.id.trim().toLowerCase()) {
      const isDup = points.some(
        p => p.id.toLowerCase() !== oldId.toLowerCase() && p.id.toLowerCase() === updatedPt.id.trim().toLowerCase()
      );
      if (isDup) {
        alert(`Error: Beacon ID "${updatedPt.id}" already exists.`);
        return false;
      }
    }

    recordSnapshot(`Edit Beacon ${oldId}`);
    setPoints(prev => prev.map(p => (p.id.toLowerCase() === oldId.toLowerCase() ? updatedPt : p)));

    if (oldId !== updatedPt.id) {
      setParcels(prev =>
        prev.map(p => ({
          ...p,
          pointIds: p.pointIds.map(pid => (pid === oldId ? updatedPt.id : pid))
        }))
      );
    }

    if (selectedPointId === oldId) {
      setSelectedPointId(updatedPt.id);
    }

    return true;
  };

  const handleAddPointAtCoord = (easting: number, northing: number) => {
    const existingIds = new Set(points.map(p => p.id.toLowerCase()));
    let counter = points.length + 101;
    let autoId = `PB_${counter}`;
    while (existingIds.has(autoId.toLowerCase())) {
      counter++;
      autoId = `PB_${counter}`;
    }

    const newPt: CoordinatePoint = {
      id: autoId,
      easting: Math.round(easting * 1000) / 1000,
      northing: Math.round(northing * 1000) / 1000,
      code: 'PB'
    };
    handleAddPoint(newPt);
  };

  const handleDeletePoint = (id: string) => {
    const affectedParcels = parcels.filter(p => p.pointIds.includes(id));
    if (affectedParcels.length > 0) {
      const parcelNames = affectedParcels.map(p => `"${p.plotNumber}"`).join(', ');
      const confirmMsg = `Warning: Beacon "${id}" is used in ${affectedParcels.length} parcel(s): ${parcelNames}.\n\nDeleting this beacon will alter or invalidate these parcels. Are you sure you want to proceed?`;
      if (!confirm(confirmMsg)) {
        return;
      }
    } else {
      if (!confirm(`Are you sure you want to delete beacon "${id}"?`)) {
        return;
      }
    }

    recordSnapshot(`Delete Beacon ${id}`);
    setPoints(prev => prev.filter(p => p.id !== id));
    setParcels(prev =>
      prev
        .map(p => ({
          ...p,
          pointIds: p.pointIds.filter(pid => pid !== id)
        }))
        .filter(p => p.pointIds.length >= 3)
    );
    if (selectedPointId === id) setSelectedPointId(null);
  };

  const handleBatchImport = (importedPoints: CoordinatePoint[]) => {
    recordSnapshot(`Import ${importedPoints.length} Coordinates`);
    const existingMap = new Map<string, CoordinatePoint>(points.map(p => [p.id.toLowerCase(), p]));
    const newPointsList = [...points];

    for (const ip of importedPoints) {
      const lower = ip.id.toLowerCase();
      if (!existingMap.has(lower)) {
        existingMap.set(lower, ip);
        newPointsList.push(ip);
      }
    }
    setPoints(newPointsList);
  };

  // Parcel Management Handlers with History
  const handleAddParcel = (newParcel: Parcel): boolean => {
    const isDup = parcels.some(p => p.plotNumber.toLowerCase() === newParcel.plotNumber.trim().toLowerCase());
    if (isDup) {
      alert(`Error: A parcel with Plot Number "${newParcel.plotNumber}" already exists.`);
      return false;
    }
    recordSnapshot(`Create Parcel ${newParcel.plotNumber}`);
    setParcels(prev => [...prev, newParcel]);
    setSelectedParcelId(newParcel.id);
    return true;
  };

  const handleUpdateParcel = (updatedParcel: Parcel): boolean => {
    const isDup = parcels.some(
      p => p.id !== updatedParcel.id && p.plotNumber.toLowerCase() === updatedParcel.plotNumber.trim().toLowerCase()
    );
    if (isDup) {
      alert(`Error: A parcel with Plot Number "${updatedParcel.plotNumber}" already exists.`);
      return false;
    }

    recordSnapshot(`Edit Parcel ${updatedParcel.plotNumber}`);
    setParcels(prev => prev.map(p => (p.id === updatedParcel.id ? updatedParcel : p)));
    return true;
  };

  const handleDeleteParcel = (id: string) => {
    recordSnapshot(`Delete Parcel`);
    setParcels(prev => prev.filter(p => p.id !== id));
    if (selectedParcelId === id) setSelectedParcelId(parcels[0]?.id || null);
  };

  // Reset to Sample Benchmark
  const handleLoadSample = () => {
    recordSnapshot(`Reset to Demo Benchmark`);
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
        onUpdateProject={(newProj) => {
          recordSnapshot('Update Project Metadata');
          setProject(newProj);
        }}
        onLoadSample={handleLoadSample}
        onOpenCogo={() => setIsCogoOpen(true)}
      />

      {/* 2. CAD Tool Palette Toolbar with Undo/Redo */}
      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onOpenCogo={() => setIsCogoOpen(true)}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      {/* 3. Main CAD Workstation Area */}
      <main className="app-workspace">
        {/* Left Side: Coordinate Table */}
        <aside className="workspace-sidebar left-sidebar">
          <CoordinateTable
            points={points}
            selectedPointId={selectedPointId}
            onSelectPoint={setSelectedPointId}
            onAddPoint={handleAddPoint}
            onUpdatePoint={handleUpdatePoint}
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
            onUpdateParcel={handleUpdateParcel}
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
