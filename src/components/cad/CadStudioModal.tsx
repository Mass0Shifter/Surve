import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CoordinatePoint, Parcel, ProjectMetadata, SetoutOverlay, AlignmentOverlay } from '../../engine/types';
import {
  CadEntity,
  CadLayerDef,
  workspaceToCadEntities,
  findSnapPoint,
  translateEntities,
  SnapResult
} from '../../engine/cad/cadCoreEngine';
import { AutoCADScriptInterpreter, ScrExecutionResult } from '../../engine/cad/scrInterpreter';
import { generateDXF, parseDWG, parseDXF } from '../../engine/dxf/dxfEngine';
import { generateAutoCADScript } from '../../engine/exporters/scrExporter';
import {
  Layers,
  Download,
  FileUp,
  Play,
  MousePointer,
  Minus,
  Spline,
  Crosshair,
  Circle,
  Move,
  Trash2,
  FileCode,
  Terminal,
  CheckCircle2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  FolderOpen,
  ChevronLeft,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Compass,
  Sparkles
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface CadStudioModalProps {
  isOpen: boolean;
  isViewMode?: boolean;
  onClose: () => void;
  project: ProjectMetadata;
  workspacePoints: CoordinatePoint[];
  workspaceParcels: Parcel[];
  alignmentOverlay?: AlignmentOverlay | null;
  setoutOverlay?: SetoutOverlay | null;
  onUpdateWorkspace?: (points: CoordinatePoint[], parcels: Parcel[]) => void;
  onSyncToWorkspace?: (points: CoordinatePoint[], parcels: Parcel[]) => void;
}

type CadStudioTab = 'CANVAS' | 'SCR_RUNNER' | 'LAYERS';
type CadActiveTool = 'SELECT' | 'PAN' | 'LINE' | 'POLYLINE' | 'POINT' | 'CIRCLE' | 'TEXT' | 'MOVE' | 'ROTATE';

export const CadStudioModal: React.FC<CadStudioModalProps> = ({
  isOpen,
  isViewMode = false,
  onClose,
  project,
  workspacePoints,
  workspaceParcels,
  alignmentOverlay = null,
  setoutOverlay = null,
  onUpdateWorkspace,
  onSyncToWorkspace
}) => {
  // Navigation & Tool State
  const [activeTab, setActiveTab] = useState<CadStudioTab>('CANVAS');
  const [activeTool, setActiveTool] = useState<CadActiveTool>('SELECT');

  // CAD Vector Database & Layers
  const [entities, setEntities] = useState<CadEntity[]>(() =>
    workspaceToCadEntities(workspacePoints, workspaceParcels)
  );
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set());

  const [layers, setLayers] = useState<CadLayerDef[]>([
    { name: 'BEACONS', color: '#ef4444', visible: true, locked: false, lineWeight: 1 },
    { name: 'BEACON_LABELS', color: '#f8fafc', visible: true, locked: false, lineWeight: 1 },
    { name: 'PARCEL_BOUNDARIES', color: '#10b981', visible: true, locked: false, lineWeight: 2 },
    { name: 'PARCEL_LABELS', color: '#ffffff', visible: true, locked: false, lineWeight: 1 },
    { name: 'DIMENSIONS', color: '#94a3b8', visible: true, locked: false, lineWeight: 1 },
    { name: '0', color: '#38bdf8', visible: true, locked: false, lineWeight: 1 }
  ]);
  const [activeLayer, setActiveLayer] = useState<string>('0');
  const [newLayerName, setNewLayerName] = useState<string>('');
  const [newLayerColor, setNewLayerColor] = useState<string>('#38bdf8');

  // Snapping & Canvas Viewport
  const [osnapEnabled, setOsnapEnabled] = useState<boolean>(true);
  const [hoveredSnap, setHoveredSnap] = useState<SnapResult | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [zoom, setZoom] = useState<number>(3.5);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Interactive Drawing State
  const [drawStartPoint, setDrawStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [polylinePoints, setPolylinePoints] = useState<Array<{ x: number; y: number }>>([]);
  const [mouseWorldCoord, setMouseWorldCoord] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Move Interaction
  const [transformBasePoint, setTransformBasePoint] = useState<{ x: number; y: number } | null>(null);

  // AutoCAD Command Line Interface (CLI) State
  const [cliInput, setCliInput] = useState<string>('');
  const [cliHistory, setCliHistory] = useState<string[]>([
    'AutoCAD Compatible Engine Initialized.',
    'Type commands (LINE, PLINE, POINT, CIRCLE, ERASE, ZOOM E, SCRIPT).'
  ]);

  // AutoCAD Script (.SCR) Runner State
  const [scrCode, setScrCode] = useState<string>('');
  const [scrResult, setScrResult] = useState<ScrExecutionResult | null>(null);
  const [isExecutingScr, setIsExecutingScr] = useState<boolean>(false);

  // Re-sync CAD when workspace changes
  useEffect(() => {
    if (workspacePoints.length > 0) {
      setEntities(workspaceToCadEntities(workspacePoints, workspaceParcels));
    }
  }, [workspacePoints, workspaceParcels]);

  // Coordinate transforms
  const worldToScreen = useCallback(
    (x: number, y: number) => ({
      x: pan.x + x * zoom,
      y: pan.y - y * zoom
    }),
    [pan, zoom]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number) => ({
      x: (sx - pan.x) / zoom,
      y: (pan.y - sy) / zoom
    }),
    [pan, zoom]
  );

  // Auto-fit extents
  const fitExtents = useCallback(() => {
    if (!canvasRef.current || entities.length === 0) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const ent of entities) {
      if (ent.type === 'POINT') {
        minX = Math.min(minX, ent.x); maxX = Math.max(maxX, ent.x);
        minY = Math.min(minY, ent.y); maxY = Math.max(maxY, ent.y);
      } else if (ent.type === 'LINE') {
        minX = Math.min(minX, ent.x1, ent.x2); maxX = Math.max(maxX, ent.x1, ent.x2);
        minY = Math.min(minY, ent.y1, ent.y2); maxY = Math.max(maxY, ent.y1, ent.y2);
      } else if (ent.type === 'POLYLINE') {
        for (const v of ent.vertices) {
          minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
        }
      } else if (ent.type === 'CIRCLE') {
        minX = Math.min(minX, ent.cx - ent.radius); maxX = Math.max(maxX, ent.cx + ent.radius);
        minY = Math.min(minY, ent.cy - ent.radius); maxY = Math.max(maxY, ent.cy + ent.radius);
      }
    }

    if (!isFinite(minX)) return;

    const width = Math.max(10, maxX - minX);
    const height = Math.max(10, maxY - minY);
    const margin = 70;
    const availW = Math.max(100, rect.width - margin * 2);
    const availH = Math.max(100, rect.height - margin * 2);

    const scale = Math.max(0.1, Math.min(30, Math.min(availW / width, availH / height)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(scale);
    setPan({
      x: rect.width / 2 - centerX * scale,
      y: rect.height / 2 + centerY * scale
    });
  }, [entities]);

  useEffect(() => {
    if (isOpen && activeTab === 'CANVAS') {
      setTimeout(fitExtents, 50);
    }
  }, [isOpen, activeTab, fitExtents]);

  // ─── CANVAS RENDERING LOOP ────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'CANVAS') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // 1. Dark CAD Drafting Grid Background
    ctx.fillStyle = '#060a14';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw Subtle Cross Grid
    const gridStep = Math.pow(10, Math.floor(Math.log10(100 / zoom))) * 5;
    if (gridStep > 0 && zoom > 0.05) {
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
      ctx.lineWidth = 0.5;

      const leftTop = screenToWorld(0, 0);
      const rightBottom = screenToWorld(rect.width, rect.height);

      const startE = Math.floor(leftTop.x / gridStep) * gridStep;
      const endE = Math.ceil(rightBottom.x / gridStep) * gridStep;
      const startN = Math.floor(rightBottom.y / gridStep) * gridStep;
      const endN = Math.ceil(leftTop.y / gridStep) * gridStep;

      ctx.beginPath();
      for (let e = startE; e <= endE; e += gridStep) {
        const s = worldToScreen(e, 0);
        ctx.moveTo(s.x, 0);
        ctx.lineTo(s.x, rect.height);
      }
      for (let n = startN; n <= endN; n += gridStep) {
        const s = worldToScreen(0, n);
        ctx.moveTo(0, s.y);
        ctx.lineTo(rect.width, s.y);
      }
      ctx.stroke();
    }

    // 2. Render CAD Entities
    const layerMap = new Map(layers.map(l => [l.name, l]));

    for (const ent of entities) {
      const lay = layerMap.get(ent.layer);
      if (lay && !lay.visible) continue;

      const isSelected = selectedEntityIds.has(ent.id);
      ctx.strokeStyle = isSelected ? '#38bdf8' : ent.color || lay?.color || '#cbd5e1';
      ctx.fillStyle = isSelected ? '#38bdf8' : ent.color || lay?.color || '#cbd5e1';
      ctx.lineWidth = isSelected ? 2.5 : (ent.lineWeight || lay?.lineWeight || 1) * 1.2;

      if (ent.type === 'POINT') {
        const s = worldToScreen(ent.x, ent.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, isSelected ? 5 : 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s.x - 6, s.y); ctx.lineTo(s.x + 6, s.y);
        ctx.moveTo(s.x, s.y - 6); ctx.lineTo(s.x, s.y + 6);
        ctx.stroke();
      } else if (ent.type === 'LINE') {
        const s1 = worldToScreen(ent.x1, ent.y1);
        const s2 = worldToScreen(ent.x2, ent.y2);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
      } else if (ent.type === 'POLYLINE') {
        if (ent.vertices.length < 2) continue;
        ctx.beginPath();
        const start = worldToScreen(ent.vertices[0].x, ent.vertices[0].y);
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i < ent.vertices.length; i++) {
          const pt = worldToScreen(ent.vertices[i].x, ent.vertices[i].y);
          ctx.lineTo(pt.x, pt.y);
        }
        if (ent.isClosed) ctx.closePath();
        ctx.stroke();

        // Shaded parcel fill
        if (ent.isClosed) {
          ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.15)' : 'rgba(16, 185, 129, 0.08)';
          ctx.fill();
        }
      } else if (ent.type === 'CIRCLE') {
        const center = worldToScreen(ent.cx, ent.cy);
        const radPx = ent.radius * zoom;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radPx, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ent.type === 'TEXT') {
        const s = worldToScreen(ent.x, ent.y);
        ctx.font = `${Math.max(9, ent.height * zoom)}px JetBrains Mono, monospace`;
        ctx.fillText(ent.text, s.x, s.y);
      }
    }

    // 3. Render In-Progress Polyline
    if (polylinePoints.length > 0) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      const p0 = worldToScreen(polylinePoints[0].x, polylinePoints[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < polylinePoints.length; i++) {
        const pt = worldToScreen(polylinePoints[i].x, polylinePoints[i].y);
        ctx.lineTo(pt.x, pt.y);
      }
      const cur = worldToScreen(mouseWorldCoord.x, mouseWorldCoord.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Render OSNAP Indicator
    if (hoveredSnap) {
      const snapScreen = worldToScreen(hoveredSnap.x, hoveredSnap.y);
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(snapScreen.x - 5, snapScreen.y - 5, 10, 10);
      ctx.stroke();
      ctx.fillStyle = '#22c55e';
      ctx.font = '10px monospace';
      ctx.fillText(hoveredSnap.type, snapScreen.x + 8, snapScreen.y - 4);
    }

  }, [entities, layers, pan, zoom, selectedEntityIds, polylinePoints, mouseWorldCoord, hoveredSnap, activeTab, screenToWorld, worldToScreen]);

  // ─── MOUSE EVENT HANDLERS ─────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Middle Click or Alt+Click: Pan
    if (e.button === 1 || e.altKey || activeTool === 'PAN') {
      setIsPanning(true);
      setPanStart({ x: sx - pan.x, y: sy - pan.y });
      return;
    }

    // Left Click Interaction
    if (e.button === 0) {
      let worldPt = screenToWorld(sx, sy);
      if (osnapEnabled && hoveredSnap) {
        worldPt = { x: hoveredSnap.x, y: hoveredSnap.y };
      }

      if (activeTool === 'SELECT') {
        const clickedSnap = findSnapPoint(entities, worldPt, 8 / zoom);
        if (clickedSnap) {
          setSelectedEntityIds(prev => {
            const next = new Set(prev);
            if (next.has(clickedSnap.entityId)) next.delete(clickedSnap.entityId);
            else next.add(clickedSnap.entityId);
            return next;
          });
        } else {
          setSelectedEntityIds(new Set());
        }
      } else if (activeTool === 'POINT') {
        const newPt: CadEntity = {
          id: `cad_pt_${Date.now()}`,
          type: 'POINT',
          layer: activeLayer,
          x: Math.round(worldPt.x * 1000) / 1000,
          y: Math.round(worldPt.y * 1000) / 1000,
          label: `P_${entities.length + 1}`
        };
        setEntities(prev => [...prev, newPt]);
        setCliHistory(prev => [...prev, `Point created at (${newPt.x.toFixed(3)}, ${newPt.y.toFixed(3)})`]);
      } else if (activeTool === 'LINE') {
        if (!drawStartPoint) {
          setDrawStartPoint(worldPt);
          setCliHistory(prev => [...prev, `Line start point: (${worldPt.x.toFixed(3)}, ${worldPt.y.toFixed(3)})`]);
        } else {
          const newLine: CadEntity = {
            id: `cad_line_${Date.now()}`,
            type: 'LINE',
            layer: activeLayer,
            x1: drawStartPoint.x,
            y1: drawStartPoint.y,
            x2: worldPt.x,
            y2: worldPt.y
          };
          setEntities(prev => [...prev, newLine]);
          setDrawStartPoint(null);
          setCliHistory(prev => [...prev, `Line created to (${worldPt.x.toFixed(3)}, ${worldPt.y.toFixed(3)})`]);
        }
      } else if (activeTool === 'POLYLINE') {
        setPolylinePoints(prev => [...prev, worldPt]);
        setCliHistory(prev => [...prev, `Polyline vertex ${polylinePoints.length + 1} at (${worldPt.x.toFixed(3)}, ${worldPt.y.toFixed(3)})`]);
      } else if (activeTool === 'CIRCLE') {
        if (!drawStartPoint) {
          setDrawStartPoint(worldPt);
        } else {
          const radius = Math.hypot(worldPt.x - drawStartPoint.x, worldPt.y - drawStartPoint.y);
          const newCircle: CadEntity = {
            id: `cad_circle_${Date.now()}`,
            type: 'CIRCLE',
            layer: activeLayer,
            cx: drawStartPoint.x,
            cy: drawStartPoint.y,
            radius
          };
          setEntities(prev => [...prev, newCircle]);
          setDrawStartPoint(null);
          setCliHistory(prev => [...prev, `Circle created with radius ${radius.toFixed(3)}m`]);
        }
      } else if (activeTool === 'MOVE') {
        if (!transformBasePoint) {
          setTransformBasePoint(worldPt);
          setCliHistory(prev => [...prev, 'Specify second point of displacement:']);
        } else {
          const dx = worldPt.x - transformBasePoint.x;
          const dy = worldPt.y - transformBasePoint.y;
          setEntities(prev => translateEntities(prev, selectedEntityIds, dx, dy));
          setTransformBasePoint(null);
          setCliHistory(prev => [...prev, `Moved ${selectedEntityIds.size} entity(ies) by dx: ${dx.toFixed(3)}, dy: ${dy.toFixed(3)}`]);
        }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (isPanning) {
      setPan({ x: sx - panStart.x, y: sy - panStart.y });
      return;
    }

    const world = screenToWorld(sx, sy);
    setMouseWorldCoord(world);

    if (osnapEnabled) {
      const snap = findSnapPoint(entities, world, 10 / zoom);
      setHoveredSnap(snap);
    } else {
      setHoveredSnap(null);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.1, Math.min(60, zoom * zoomFactor));

    setPan({
      x: sx - (sx - pan.x) * (newZoom / zoom),
      y: sy - (sy - pan.y) * (newZoom / zoom)
    });
    setZoom(newZoom);
  };

  const handleFinishPolyline = () => {
    if (polylinePoints.length >= 2) {
      const newPoly: CadEntity = {
        id: `cad_poly_${Date.now()}`,
        type: 'POLYLINE',
        layer: activeLayer,
        vertices: polylinePoints,
        isClosed: true
      };
      setEntities(prev => [...prev, newPoly]);
      setPolylinePoints([]);
      setCliHistory(prev => [...prev, `Polyline created with ${polylinePoints.length} vertices`]);
    }
  };

  // ─── DWG / DXF FILE INGESTION ─────────────────────────────────────────────
  const handleImportCadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileName = file.name;
      const isDwg = fileName.toLowerCase().endsWith('.dwg');
      const isDxf = fileName.toLowerCase().endsWith('.dxf');

      if (isDwg) {
        const buffer = await file.arrayBuffer();
        const parseResult = parseDWG(buffer);

        const importedCadEntities = workspaceToCadEntities(parseResult.importedPoints, parseResult.importedParcels);
        setEntities(prev => [...prev, ...importedCadEntities]);

        setLayers(prev => {
          const existing = new Set(prev.map(l => l.name));
          const newLayers: CadLayerDef[] = [];
          for (const lName of parseResult.layersFound) {
            if (!existing.has(lName)) {
              newLayers.push({ name: lName, color: '#38bdf8', visible: true, locked: false, lineWeight: 1 });
            }
          }
          return [...prev, ...newLayers];
        });

        setCliHistory(prev => [
          ...prev,
          `Imported AutoCAD DWG "${fileName}" (${parseResult.cadVersion || 'DWG'}): ${parseResult.importedPoints.length} points, ${parseResult.importedParcels.length} parcels.`
        ]);
      } else if (isDxf) {
        const text = await file.text();
        const parseResult = parseDXF(text);

        const importedCadEntities = workspaceToCadEntities(parseResult.importedPoints, parseResult.importedParcels);
        setEntities(prev => [...prev, ...importedCadEntities]);

        setLayers(prev => {
          const existing = new Set(prev.map(l => l.name));
          const newLayers: CadLayerDef[] = [];
          for (const lName of parseResult.layersFound) {
            if (!existing.has(lName)) {
              newLayers.push({ name: lName, color: '#38bdf8', visible: true, locked: false, lineWeight: 1 });
            }
          }
          return [...prev, ...newLayers];
        });

        setCliHistory(prev => [
          ...prev,
          `Imported AutoCAD DXF "${fileName}": ${parseResult.importedPoints.length} points, ${parseResult.importedParcels.length} parcels.`
        ]);
      }

      setTimeout(() => fitExtents(), 100);
    } catch (err: any) {
      console.error('Failed to parse CAD file', err);
      setCliHistory(prev => [...prev, `Error importing CAD file: ${err.message || 'Corrupt or unsupported format'}`]);
    }

    if (e.target) e.target.value = '';
  };

  // ─── COMMAND LINE (CLI) EXECUTION ─────────────────────────────────────────
  const handleExecuteCli = (e: React.FormEvent) => {
    e.preventDefault();
    const cmdStr = cliInput.trim();
    if (!cmdStr) return;

    setCliHistory(prev => [...prev, `Command: ${cmdStr}`]);
    setCliInput('');

    const parts = cmdStr.split(/\s+/);
    const cmd = parts[0].toUpperCase();

    switch (cmd) {
      case 'L': case 'LINE': setActiveTool('LINE'); break;
      case 'PL': case 'PLINE': setActiveTool('POLYLINE'); setPolylinePoints([]); break;
      case 'PO': case 'POINT': setActiveTool('POINT'); break;
      case 'C': case 'CIRCLE': setActiveTool('CIRCLE'); break;
      case 'M': case 'MOVE': setActiveTool('MOVE'); setTransformBasePoint(null); break;
      case 'E': case 'ERASE':
        setEntities(prev => prev.filter(ent => !selectedEntityIds.has(ent.id)));
        setSelectedEntityIds(new Set());
        break;
      case 'Z': case 'ZOOM': fitExtents(); break;
      case 'SCRIPT': setActiveTab('SCR_RUNNER'); break;
      default: setCliHistory(prev => [...prev, `Unknown command.`]);
    }
  };

  // ─── AUTOCAD SCRIPT (.SCR) EXECUTION ──────────────────────────────────────
  const handleRunScript = () => {
    if (!scrCode.trim()) return;
    setIsExecutingScr(true);
    try {
      const runner = new AutoCADScriptInterpreter();
      const result = runner.execute(scrCode);
      setScrResult(result);
      setEntities(prev => [...prev, ...result.entities]);
      setLayers(prev => {
        const existing = new Set(prev.map(l => l.name));
        const added = result.layersCreated.filter(l => !existing.has(l)).map(l => ({ name: l, color: '#38bdf8', visible: true, locked: false, lineWeight: 1 }));
        return [...prev, ...added];
      });
      setCliHistory(prev => [...prev, `Script executed: ${result.totalCommandsExecuted} commands.`]);
    } catch (err: any) { alert(`Script Failed: ${err.message}`); } finally { setIsExecutingScr(false); }
  };

  const handleLoadSampleScr = () => {
    setScrCode(generateAutoCADScript(project, workspacePoints, workspaceParcels));
  };

  const handleScrFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => setScrCode((event.target?.result as string) || '');
    reader.readAsText(file);
  };

  // ─── EXPORT & SYNC ────────────────────────────────────────────────────────
  const handleExportDXF = () => {
    const dxf = generateDXF({
      projectTitle: project.title,
      points: workspacePoints,
      parcels: workspaceParcels,
      alignmentOverlay,
      setoutOverlay
    });
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${project.code || 'SURVEY'}_DRAWING.dxf`; a.click(); URL.revokeObjectURL(url);
  };

  const handleExportSCR = () => {
    const scr = generateAutoCADScript(project, workspacePoints, workspaceParcels);
    const blob = new Blob([scr], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${project.code || 'SURVEY'}_SCRIPT.scr`; a.click(); URL.revokeObjectURL(url);
  };

  const handleSyncToWorkspace = () => {
    const newPoints: CoordinatePoint[] = [];
    for (const ent of entities) {
      if (ent.type === 'POINT') {
        newPoints.push({
          id: ent.label || `P_${newPoints.length + 1}`,
          easting: ent.x,
          northing: ent.y,
          elevation: 0,
          code: 'PB'
        });
      }
    }
    const callback = onSyncToWorkspace || onUpdateWorkspace;
    if (callback) {
      callback(newPoints.length > 0 ? newPoints : workspacePoints, workspaceParcels);
      setCliHistory(prev => [...prev, `Synchronized CAD data (${newPoints.length > 0 ? newPoints.length : workspacePoints.length} points) to Survey Workspace.`]);
    }
  };

  const handleAddLayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLayerName.trim()) return;
    const upperName = newLayerName.trim().toUpperCase();
    if (layers.some(l => l.name === upperName)) {
      alert('Layer name already exists');
      return;
    }
    setLayers(prev => [...prev, { name: upperName, color: newLayerColor, visible: true, locked: false, lineWeight: 1 }]);
    setActiveLayer(upperName);
    setNewLayerName('');
  };

  if (!isOpen) return null;

  // The Inner Workspace Content
  const studioContent = (
    <div className={`cad-studio-viewport ${isViewMode ? 'cad-studio-fullview' : 'cad-studio-modal-body'}`} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
      <input type="file" ref={fileInputRef} accept=".dwg,.dxf" style={{ display: 'none' }} onChange={handleImportCadFile} />

      {/* 1. TOP HEADER / RIBBON */}
      <div className="cad-studio-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        background: 'rgba(15, 23, 42, 0.95)',
        borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isViewMode && (
            <button className="btn-secondary-sm" onClick={onClose} title="Return to Survey Workspace" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <ChevronLeft size={14} /> <span>Back to Workspace</span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Compass size={18} className="text-cyan" />
            <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '14px' }}>AutoCAD DWG/DXF Studio &amp; Script VM</span>
            <span className="badge-pill-cyan" style={{ fontSize: '11px' }}>{entities.length} Entities</span>
          </div>
        </div>

        <div className="traverse-tabs-bar" style={{ margin: 0, border: 'none', background: 'transparent' }}>
          <button className={`traverse-tab-btn ${activeTab === 'CANVAS' ? 'active' : ''}`} onClick={() => setActiveTab('CANVAS')}>
            <MousePointer size={14} /> <span>CAD Canvas</span>
          </button>
          <button className={`traverse-tab-btn ${activeTab === 'SCR_RUNNER' ? 'active' : ''}`} onClick={() => setActiveTab('SCR_RUNNER')}>
            <Terminal size={14} /> <span>Script (.SCR) VM</span>
          </button>
          <button className={`traverse-tab-btn ${activeTab === 'LAYERS' ? 'active' : ''}`} onClick={() => setActiveTab('LAYERS')}>
            <Layers size={14} /> <span>Layers ({layers.length})</span>
          </button>
        </div>

        <div className="header-actions-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button className="btn-secondary-sm" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <FolderOpen size={14} className="text-cyan" /> <span>Open DWG/DXF</span>
          </button>
          <button className="btn-secondary-sm" onClick={handleExportDXF}>
            <Download size={13} /> <span>Export .DXF</span>
          </button>
          <button className="btn-secondary-sm" onClick={handleExportSCR}>
            <FileCode size={13} /> <span>Export .SCR</span>
          </button>
          <button className="btn-primary-sm" onClick={handleSyncToWorkspace}>
            <CheckCircle2 size={13} /> <span>Sync to Workspace</span>
          </button>
          {!isViewMode && <button className="icon-btn" onClick={onClose}>✕</button>}
        </div>
      </div>

      {/* 2. BODY VIEW */}
      {activeTab === 'CANVAS' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div className="cad-ribbon-bar" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 14px',
            background: 'rgba(15, 23, 42, 0.85)',
            borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
            fontSize: '12px',
            gap: '12px',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button className={`toolbar-btn ${activeTool === 'SELECT' ? 'active' : ''}`} onClick={() => setActiveTool('SELECT')}><MousePointer size={14} /></button>
              <button className={`toolbar-btn ${activeTool === 'LINE' ? 'active' : ''}`} onClick={() => { setActiveTool('LINE'); setDrawStartPoint(null); }}><Minus size={14} /></button>
              <button className={`toolbar-btn ${activeTool === 'POLYLINE' ? 'active' : ''}`} onClick={() => { setActiveTool('POLYLINE'); setPolylinePoints([]); }}><Spline size={14} /></button>
              <button className={`toolbar-btn ${activeTool === 'POINT' ? 'active' : ''}`} onClick={() => setActiveTool('POINT')}><Crosshair size={14} /></button>
              <button className={`toolbar-btn ${activeTool === 'CIRCLE' ? 'active' : ''}`} onClick={() => setActiveTool('CIRCLE')}><Circle size={14} /></button>
              <button className={`toolbar-btn ${activeTool === 'MOVE' ? 'active' : ''}`} onClick={() => { setActiveTool('MOVE'); setTransformBasePoint(null); }}><Move size={14} /></button>
              <button className="toolbar-btn text-rose" onClick={() => { setEntities(prev => prev.filter(ent => !selectedEntityIds.has(ent.id))); setSelectedEntityIds(new Set()); }}><Trash2 size={14} /></button>
              {activeTool === 'POLYLINE' && polylinePoints.length >= 2 && <button className="btn-primary-xs" onClick={handleFinishPolyline} style={{ marginLeft: '6px' }}>Close Polyline</button>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#94a3b8' }}>
                <input type="checkbox" checked={osnapEnabled} onChange={e => setOsnapEnabled(e.target.checked)} style={{ accentColor: '#22c55e' }} />
                <span style={{ color: osnapEnabled ? '#22c55e' : '#64748b', fontWeight: 'bold' }}>OSNAP</span>
              </label>
              <select className="form-select-sm" value={activeLayer} onChange={e => setActiveLayer(e.target.value)} style={{ padding: '2px 8px', fontSize: '11px' }}>
                {layers.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
              </select>
              <button className="icon-btn-sm" onClick={() => setZoom(z => Math.max(0.2, z * 0.8))}><ZoomOut size={13} /></button>
              <button className="icon-btn-sm" onClick={() => setZoom(z => Math.min(50, z * 1.25))}><ZoomIn size={13} /></button>
              <button className="icon-btn-sm" onClick={fitExtents}><Maximize2 size={13} /></button>
            </div>
          </div>

          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: isPanning ? 'grabbing' : activeTool === 'SELECT' ? 'default' : 'crosshair' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onWheel={handleWheel} />
            <div style={{ position: 'absolute', bottom: '10px', left: '12px', background: 'rgba(15, 23, 42, 0.85)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(56, 189, 248, 0.2)', fontFamily: 'monospace', fontSize: '11px', color: '#38bdf8' }}>
              E: {mouseWorldCoord.x.toFixed(3)} | N: {mouseWorldCoord.y.toFixed(3)} | Scale: 1:{(1000 / zoom).toFixed(0)}
            </div>
          </div>

          <div style={{ background: '#040711', borderTop: '1px solid rgba(56, 189, 248, 0.2)', padding: '6px 12px', display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
            <div style={{ maxHeight: '44px', overflowY: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#94a3b8' }}>{cliHistory.slice(-3).map((line, idx) => <div key={idx}>{line}</div>)}</div>
            <form onSubmit={handleExecuteCli} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: 'bold' }}>Command:</span>
              <input type="text" className="form-input-sm" value={cliInput} onChange={e => setCliInput(e.target.value)} placeholder="Type command..." style={{ flex: 1, fontFamily: 'monospace', fontSize: '11px', background: 'rgba(15, 23, 42, 0.6)' }} />
            </form>
          </div>
        </div>
      )}

      {/* 3. SCRIPT RUNNER TAB */}
      {activeTab === 'SCR_RUNNER' && (
        <div className="traverse-studio-body" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', padding: '16px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '13px' }}>AutoCAD Script (.SCR) Editor &amp; Batch Runner</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn-secondary-xs" onClick={handleLoadSampleScr}><Sparkles size={12} /> <span>Load Sample</span></button>
                <label className="btn-secondary-xs" style={{ cursor: 'pointer' }}><FileUp size={12} /> <span>Upload .SCR</span><input type="file" accept=".scr,.txt" onChange={handleScrFileUpload} style={{ display: 'none' }} /></label>
              </div>
            </div>
            <textarea value={scrCode} onChange={e => setScrCode(e.target.value)} rows={18} style={{ width: '100%', flex: 1, background: '#040711', color: '#38bdf8', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', padding: '12px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)', resize: 'none' }} />
            <button className="btn-primary-md" onClick={handleRunScript} disabled={isExecutingScr || !scrCode.trim()} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Play size={14} /> <span>Execute Script in CAD Engine</span>
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '13px' }}>Execution Terminal &amp; Entities Generated</span>
            <div style={{ flex: 1, background: '#040711', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '12px', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', overflowY: 'auto', maxHeight: '480px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {scrResult ? (
                <>
                  <div style={{ color: '#22c55e', fontWeight: 'bold', marginBottom: '8px' }}>✓ Execution complete: {scrResult.totalCommandsExecuted} commands, {scrResult.entities.length} entities.</div>
                  {scrResult.logs.map((log, idx) => (
                    <div key={idx} style={{ color: log.status === 'SUCCESS' ? '#e2e8f0' : log.status === 'WARNING' ? '#f59e0b' : '#64748b' }}>
                      <span style={{ color: '#64748b' }}>[L{log.lineNumber}]</span> <span style={{ color: '#38bdf8' }}>{log.command}</span>: {log.message}
                    </div>
                  ))}
                </>
              ) : <div style={{ color: '#64748b', textAlign: 'center', marginTop: '40px' }}>Ready to execute AutoCAD .SCR script.</div>}
            </div>
          </div>
        </div>
      )}

      {/* 4. LAYERS INSPECTOR TAB */}
      {activeTab === 'LAYERS' && (
        <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '15px' }}>AutoCAD Layer Manager</h3>
              <form onSubmit={handleAddLayer} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="text" placeholder="NEW_LAYER_NAME" value={newLayerName} onChange={e => setNewLayerName(e.target.value)} style={{ padding: '4px 8px', fontSize: '12px', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(148, 163, 184, 0.3)', borderRadius: '4px', color: '#f8fafc' }} />
                <input type="color" value={newLayerColor} onChange={e => setNewLayerColor(e.target.value)} style={{ width: '28px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }} />
                <button type="submit" className="btn-primary-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Plus size={12} /> <span>Add</span></button>
              </form>
            </div>
            <div style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: 'rgba(30, 41, 59, 0.8)', borderBottom: '1px solid rgba(56, 189, 248, 0.2)', color: '#94a3b8', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>Status</th>
                    <th style={{ padding: '8px 12px' }}>Layer Name</th>
                    <th style={{ padding: '8px 12px' }}>Color</th>
                    <th style={{ padding: '8px 12px' }}>Weight</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {layers.map(layer => {
                    const isActive = layer.name === activeLayer;
                    return (
                      <tr key={layer.name} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.1)', background: isActive ? 'rgba(56, 189, 248, 0.08)' : undefined }}>
                        <td style={{ padding: '8px 12px' }}><button className="btn-secondary-xs" onClick={() => setActiveLayer(layer.name)} style={{ fontSize: '10px', color: isActive ? '#38bdf8' : '#64748b' }}>{isActive ? 'CURRENT' : 'Set Current'}</button></td>
                        <td style={{ padding: '8px 12px', color: '#f8fafc' }}>{layer.name}</td>
                        <td style={{ padding: '8px 12px' }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '12px', background: layer.color }} />{layer.color}</div></td>
                        <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{layer.lineWeight}px</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <button className="icon-btn-sm" onClick={() => setLayers(prev => prev.map(l => l.name === layer.name ? { ...l, visible: !l.visible } : l))}>{layer.visible ? <Eye size={12} className="text-emerald" /> : <EyeOff size={12} className="text-muted" />}</button>
                          <button className="icon-btn-sm" onClick={() => setLayers(prev => prev.map(l => l.name === layer.name ? { ...l, locked: !l.locked } : l))}>{layer.locked ? <Lock size={12} className="text-amber" /> : <Unlock size={12} className="text-muted" />}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isViewMode) {
    return (
      <ErrorBoundary fallbackTitle="CAD Studio Recovery">
        <div className="cad-studio-page-container" style={{ width: '100%', height: '100%', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#060a14' }}>
          {studioContent}
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary fallbackTitle="CAD Studio Recovery">
      <div className="modal-overlay">
        <div className="modal-content leveling-modal-studio" style={{ maxWidth: '1280px', width: '96vw', height: '90vh' }}>
          {studioContent}
        </div>
      </div>
    </ErrorBoundary>
  );
};
