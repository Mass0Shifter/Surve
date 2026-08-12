import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CoordinatePoint, Parcel, ProjectMetadata, CadLayers, CadTool, HistorySnapshot } from './engine/types';
import { SAMPLE_PROJECT_METADATA, SAMPLE_COORDINATES, SAMPLE_PARCELS } from './engine/sampleData';
import { Header } from './components/layout/Header';
import { Toolbar } from './components/layout/Toolbar';
import { StatusBar } from './components/layout/StatusBar';
import { CadCanvas } from './components/cad/CadCanvas';
import { CoordinateTable } from './components/tables/CoordinateTable';
import { ParcelInspector } from './components/panels/ParcelInspector';
import { LayerManager } from './components/panels/LayerManager';
import { CogoCalculator } from './components/panels/CogoCalculator';
import { HistoryModal } from './components/panels/HistoryModal';
import { BeaconRenumberModal } from './components/panels/BeaconRenumberModal';
import { TitleDeedPlanModal } from './components/tdp/TitleDeedPlanModal';

const STORAGE_KEY = 'nsurvey_project_state_v1';
const AUTOSAVE_KEY = 'nsurvey_autosave_enabled';
const HISTORY_LIMIT_KEY = 'nsurvey_history_limit';

export const App: React.FC = () => {
  // Auto-Save & History Capacity Settings
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    return saved !== null ? saved === 'true' : true;
  });

  const [historyLimit, setHistoryLimit] = useState<number>(() => {
    const saved = localStorage.getItem(HISTORY_LIMIT_KEY);
    return saved ? Math.min(256, Math.max(10, parseInt(saved) || 50)) : 50;
  });

  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Master Project State (restore from LocalStorage if available)
  const [project, setProject] = useState<ProjectMetadata>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.project) return parsed.project;
      }
    } catch {
      // fallback
    }
    return SAMPLE_PROJECT_METADATA;
  });

  const [points, setPoints] = useState<CoordinatePoint[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.points && Array.isArray(parsed.points)) return parsed.points;
      }
    } catch {
      // fallback
    }
    return SAMPLE_COORDINATES;
  });

  const [parcels, setParcels] = useState<Parcel[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.parcels && Array.isArray(parsed.parcels)) return parsed.parcels;
      }
    } catch {
      // fallback
    }
    return SAMPLE_PARCELS;
  });

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

  // Modal States
  const [isCogoOpen, setIsCogoOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isRenumberOpen, setIsRenumberOpen] = useState<boolean>(false);
  const [isTdpOpen, setIsTdpOpen] = useState<boolean>(false);

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

  // LocalStorage Auto-Save Effect
  useEffect(() => {
    if (autoSaveEnabled) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, points, parcels }));
        localStorage.setItem(AUTOSAVE_KEY, 'true');
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSavedTime(now);
      } catch (err) {
        console.warn('Auto-save failed:', err);
      }
    } else {
      localStorage.setItem(AUTOSAVE_KEY, 'false');
      setLastSavedTime(null);
    }
  }, [project, points, parcels, autoSaveEnabled]);

  const handleToggleAutoSave = () => {
    setAutoSaveEnabled(prev => !prev);
  };

  const handleSetHistoryLimit = (limit: number) => {
    const clamped = Math.min(256, Math.max(10, limit));
    setHistoryLimit(clamped);
    localStorage.setItem(HISTORY_LIMIT_KEY, clamped.toString());
    setUndoStack(prev => prev.slice(-clamped));
  };

  // Push state snapshot onto undo stack before mutations
  const recordSnapshot = useCallback((description: string) => {
    const current = stateRef.current;
    const snapshot: HistorySnapshot = {
      points: JSON.parse(JSON.stringify(current.points)),
      parcels: JSON.parse(JSON.stringify(current.parcels)),
      project: JSON.parse(JSON.stringify(current.project)),
      description,
      timestamp: Date.now()
    };
    setUndoStack(prev => [...prev.slice(-(historyLimit - 1)), snapshot]);
    setRedoStack([]);
  }, [historyLimit]);

  // Undo Handler
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const current = stateRef.current;
    const previous = undoStack[undoStack.length - 1];

    const redoSnapshot: HistorySnapshot = {
      points: JSON.parse(JSON.stringify(current.points)),
      parcels: JSON.parse(JSON.stringify(current.parcels)),
      project: JSON.parse(JSON.stringify(current.project)),
      description: 'Current State',
      timestamp: Date.now()
    };
    setRedoStack(prev => [...prev, redoSnapshot]);

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

    const undoSnapshot: HistorySnapshot = {
      points: JSON.parse(JSON.stringify(current.points)),
      parcels: JSON.parse(JSON.stringify(current.parcels)),
      project: JSON.parse(JSON.stringify(current.project)),
      description: 'Before Redo',
      timestamp: Date.now()
    };
    setUndoStack(prev => [...prev, undoSnapshot]);

    setPoints(next.points);
    setParcels(next.parcels);
    setProject(next.project);
    setRedoStack(prev => prev.slice(0, -1));
  }, [redoStack]);

  // Jump to specific point in history timeline
  const handleJumpToSnapshot = (index: number, isUndo: boolean) => {
    const current = stateRef.current;
    if (isUndo) {
      const target = undoStack[index];
      if (!target) return;

      const toRedo: HistorySnapshot[] = [
        {
          points: JSON.parse(JSON.stringify(current.points)),
          parcels: JSON.parse(JSON.stringify(current.parcels)),
          project: JSON.parse(JSON.stringify(current.project)),
          description: 'State before jump',
          timestamp: Date.now()
        },
        ...undoStack.slice(index + 1)
      ];

      setRedoStack(prev => [...prev, ...toRedo]);
      setUndoStack(undoStack.slice(0, index));
      setPoints(target.points);
      setParcels(target.parcels);
      setProject(target.project);
    } else {
      const target = redoStack[index];
      if (!target) return;

      const toUndo: HistorySnapshot[] = [
        {
          points: JSON.parse(JSON.stringify(current.points)),
          parcels: JSON.parse(JSON.stringify(current.parcels)),
          project: JSON.parse(JSON.stringify(current.project)),
          description: 'State before jump',
          timestamp: Date.now()
        },
        ...redoStack.slice(index + 1)
      ];

      setUndoStack(prev => [...prev, ...toUndo]);
      setRedoStack(redoStack.slice(0, index));
      setPoints(target.points);
      setParcels(target.parcels);
      setProject(target.project);
    }
  };

  const handleClearHistory = () => {
    setUndoStack([]);
    setRedoStack([]);
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === 'z' || e.key === 'Z') {
          if (e.shiftKey) {
            e.preventDefault();
            handleRedo();
          } else {
            e.preventDefault();
            handleUndo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Coordinate Handlers
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

  // Batch Renumbering Handler (frmRenum)
  const handleApplyRenumber = (renamedMap: Map<string, string>) => {
    recordSnapshot(`Batch Renumber ${points.length} Beacons`);

    const updatedPoints = points.map(p => {
      const newId = renamedMap.get(p.id);
      return newId ? { ...p, id: newId } : p;
    });

    const updatedParcels = parcels.map(parcel => ({
      ...parcel,
      pointIds: parcel.pointIds.map(pid => renamedMap.get(pid) || pid)
    }));

    setPoints(updatedPoints);
    setParcels(updatedParcels);
    if (selectedPointId) {
      setSelectedPointId(renamedMap.get(selectedPointId) || selectedPointId);
    }
  };

  // Parcel Management Handlers
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
        autoSaveEnabled={autoSaveEnabled}
        lastSavedTime={lastSavedTime}
        onToggleAutoSave={handleToggleAutoSave}
        onUpdateProject={(newProj) => {
          recordSnapshot('Update Project Metadata');
          setProject(newProj);
        }}
        onLoadSample={handleLoadSample}
        onOpenCogo={() => setIsCogoOpen(true)}
        onOpenRenumber={() => setIsRenumberOpen(true)}
        onOpenTdp={() => setIsTdpOpen(true)}
      />

      {/* 2. CAD Tool Palette Toolbar with Undo/Redo & History */}
      <Toolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        onOpenCogo={() => setIsCogoOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        historyCount={undoStack.length + redoStack.length + 1}
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

      {/* History & Version Control Timeline Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        undoStack={undoStack}
        redoStack={redoStack}
        currentSnapshot={{ points, parcels, project, description: 'Live Workspace' }}
        historyLimit={historyLimit}
        onSetHistoryLimit={handleSetHistoryLimit}
        onJumpToSnapshot={handleJumpToSnapshot}
        onClearHistory={handleClearHistory}
      />

      {/* Batch Beacon Prefix & Renumbering Modal (frmRenum) */}
      <BeaconRenumberModal
        points={points}
        parcels={parcels}
        isOpen={isRenumberOpen}
        onClose={() => setIsRenumberOpen(false)}
        onApplyRenumber={handleApplyRenumber}
      />

      {/* Title Deed Plan (TDP) Print Studio Modal */}
      <TitleDeedPlanModal
        project={project}
        points={points}
        parcels={parcels}
        isOpen={isTdpOpen}
        onClose={() => setIsTdpOpen(false)}
      />
    </div>
  );
};
