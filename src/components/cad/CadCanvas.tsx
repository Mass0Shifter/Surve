import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CoordinatePoint, Parcel, CadLayers, CadTool } from '../../engine/types';
import { computeParcel, computeExtents } from '../../engine/cogo';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';

interface CadCanvasProps {
  points: CoordinatePoint[];
  parcels: Parcel[];
  layers: CadLayers;
  activeTool: CadTool;
  selectedPointId: string | null;
  selectedParcelId: string | null;
  onSelectPoint: (id: string | null) => void;
  onSelectParcel: (id: string | null) => void;
  onAddPointAtCoord: (easting: number, northing: number) => void;
  onCursorMove: (easting: number, northing: number) => void;
}

export const CadCanvas: React.FC<CadCanvasProps> = ({
  points,
  parcels,
  layers,
  activeTool,
  selectedPointId,
  selectedParcelId,
  onSelectPoint,
  onSelectParcel,
  onAddPointAtCoord,
  onCursorMove
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Viewport State
  const [zoom, setZoom] = useState<number>(3.0); // Pixels per survey meter
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Coordinate Extents Calculation & Auto-Fit
  const fitExtents = useCallback(() => {
    if (!canvasRef.current || points.length === 0) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const extents = computeExtents(points);

    const margin = 60; // Pixels padding
    const availWidth = Math.max(100, rect.width - margin * 2);
    const availHeight = Math.max(100, rect.height - margin * 2);

    const scaleX = availWidth / extents.width;
    const scaleY = availHeight / extents.height;
    const newZoom = Math.max(0.1, Math.min(20, Math.min(scaleX, scaleY)));

    // Center of canvas in pixels
    const canvasCenterX = rect.width / 2;
    const canvasCenterY = rect.height / 2;

    // Pan such that (extents.centerX, extents.centerY) maps to canvas center
    const newPanX = canvasCenterX - extents.centerX * newZoom;
    const newPanY = canvasCenterY + extents.centerY * newZoom; // Invert Northing

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [points]);

  // Initial fit on mount if points exist
  useEffect(() => {
    if (points.length > 0) {
      fitExtents();
    }
  }, [fitExtents]);

  // Coordinate Conversion Helpers:
  // Survey (Easting, Northing) -> Screen (X, Y)
  const worldToScreen = useCallback((easting: number, northing: number) => {
    return {
      x: pan.x + easting * zoom,
      y: pan.y - northing * zoom // Northing is inverted in screen space
    };
  }, [pan, zoom]);

  // Screen (X, Y) -> Survey (Easting, Northing)
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    return {
      easting: (screenX - pan.x) / zoom,
      northing: (pan.y - screenY) / zoom
    };
  }, [pan, zoom]);

  // Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear background (Dark CAD Slate #0f172a)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // 1. Draw Grid Crosses & Coordinate Neatlines
    if (layers.gridCrosses) {
      const topLeftWorld = screenToWorld(0, 0);
      const btmRightWorld = screenToWorld(rect.width, rect.height);

      const minE = Math.min(topLeftWorld.easting, btmRightWorld.easting);
      const maxE = Math.max(topLeftWorld.easting, btmRightWorld.easting);
      const minN = Math.min(topLeftWorld.northing, btmRightWorld.northing);
      const maxN = Math.max(topLeftWorld.northing, btmRightWorld.northing);

      // Adaptive grid step (10m, 20m, 50m, 100m, 200m based on zoom)
      let gridStep = 50;
      if (zoom > 8) gridStep = 10;
      else if (zoom > 4) gridStep = 25;
      else if (zoom > 1.5) gridStep = 50;
      else if (zoom > 0.5) gridStep = 100;
      else gridStep = 500;

      const startE = Math.floor(minE / gridStep) * gridStep;
      const endE = Math.ceil(maxE / gridStep) * gridStep;
      const startN = Math.floor(minN / gridStep) * gridStep;
      const endN = Math.ceil(maxN / gridStep) * gridStep;

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.lineWidth = 1;

      // Draw faint grid lines and crosses
      for (let e = startE; e <= endE; e += gridStep) {
        for (let n = startN; n <= endN; n += gridStep) {
          const pt = worldToScreen(e, n);
          const crossSize = 5;

          ctx.beginPath();
          ctx.moveTo(pt.x - crossSize, pt.y);
          ctx.lineTo(pt.x + crossSize, pt.y);
          ctx.moveTo(pt.x, pt.y - crossSize);
          ctx.lineTo(pt.x, pt.y + crossSize);
          ctx.stroke();

          // Coordinate label at every 2nd step
          if (zoom >= 2 && e % (gridStep * 2) === 0 && n % (gridStep * 2) === 0) {
            ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.fillText(`${e}E, ${n}N`, pt.x + 6, pt.y - 4);
          }
        }
      }
    }

    // 2. Draw Parcels (Hatching, Boundaries, Centroid Labels)
    for (const parcel of parcels) {
      const comp = computeParcel(parcel, points);
      if (!comp || comp.vertices.length < 3) continue;

      const isSelected = parcel.id === selectedParcelId;
      const screenVertices = comp.vertices.map(v => worldToScreen(v.easting, v.northing));

      // A. Parcel Fill / Hatching
      if (layers.parcelFill) {
        ctx.beginPath();
        ctx.moveTo(screenVertices[0].x, screenVertices[0].y);
        for (let i = 1; i < screenVertices.length; i++) {
          ctx.lineTo(screenVertices[i].x, screenVertices[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = isSelected
          ? 'rgba(16, 185, 129, 0.25)'
          : (parcel.color ? `${parcel.color}18` : 'rgba(6, 182, 212, 0.12)');
        ctx.fill();
      }

      // B. Boundary Lines
      if (layers.boundaryLines) {
        ctx.beginPath();
        ctx.moveTo(screenVertices[0].x, screenVertices[0].y);
        for (let i = 1; i < screenVertices.length; i++) {
          ctx.lineTo(screenVertices[i].x, screenVertices[i].y);
        }
        ctx.closePath();

        ctx.strokeStyle = isSelected ? '#10b981' : (parcel.color || '#38bdf8');
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.setLineDash(isSelected ? [6, 3] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // C. Parcel Centroid Badge
      const centX = screenVertices.reduce((s, v) => s + v.x, 0) / screenVertices.length;
      const centY = screenVertices.reduce((s, v) => s + v.y, 0) / screenVertices.length;

      ctx.fillStyle = isSelected ? '#10b981' : '#f8fafc';
      ctx.font = '600 12px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(parcel.plotNumber, centX, centY);

      if (parcel.ownerName) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 10px "Inter", sans-serif';
        ctx.fillText(parcel.ownerName, centX, centY + 14);
      }

      ctx.fillStyle = '#10b981';
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillText(`${comp.areaSquareMeters.toFixed(1)} sq.m`, centX, centY + 28);

      // D. Draw Leg Bearings & Distances
      if (layers.bearings || layers.distances) {
        for (const leg of comp.legs) {
          const p1 = worldToScreen(leg.fromPoint.easting, leg.fromPoint.northing);
          const p2 = worldToScreen(leg.toPoint.easting, leg.toPoint.northing);

          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;

          // Normal angle for text perpendicular offset
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const perpAngle = angle + Math.PI / 2;
          const offsetDist = 12;

          const textX = midX + Math.cos(perpAngle) * offsetDist;
          const textY = midY + Math.sin(perpAngle) * offsetDist;

          ctx.save();
          ctx.translate(textX, textY);

          // Rotate text along the line
          let textRot = angle;
          if (textRot > Math.PI / 2 || textRot < -Math.PI / 2) {
            textRot += Math.PI;
          }
          ctx.rotate(textRot);

          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';

          if (layers.bearings && layers.distances) {
            ctx.fillStyle = '#e2e8f0';
            ctx.fillText(`${leg.bearing.formatted}  (${leg.distance.toFixed(2)}m)`, 0, 0);
          } else if (layers.bearings) {
            ctx.fillStyle = '#e2e8f0';
            ctx.fillText(leg.bearing.formatted, 0, 0);
          } else if (layers.distances) {
            ctx.fillStyle = '#38bdf8';
            ctx.fillText(`${leg.distance.toFixed(2)}m`, 0, 0);
          }

          ctx.restore();
        }
      }
    }

    // 3. Draw Beacons / Survey Points
    if (layers.beacons) {
      for (const pt of points) {
        const scr = worldToScreen(pt.easting, pt.northing);
        const isSelected = pt.id === selectedPointId;
        const isControl = pt.isControl;

        // Outer Glow / Ring for selected point
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(scr.x, scr.y, 10, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
          ctx.fill();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Concrete Pillar Beacon Symbol
        if (isControl) {
          // Geodetic Control Triangle
          ctx.beginPath();
          const r = 6;
          ctx.moveTo(scr.x, scr.y - r);
          ctx.lineTo(scr.x + r * 0.866, scr.y + r * 0.5);
          ctx.lineTo(scr.x - r * 0.866, scr.y + r * 0.5);
          ctx.closePath();
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          // Property Beacon Concrete Pillar (Concentric circles with center cross)
          ctx.beginPath();
          ctx.arc(scr.x, scr.y, 4, 0, 2 * Math.PI);
          ctx.fillStyle = isSelected ? '#10b981' : '#ef4444';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Center crosshair
          ctx.beginPath();
          ctx.moveTo(scr.x - 2, scr.y);
          ctx.lineTo(scr.x + 2, scr.y);
          ctx.moveTo(scr.x, scr.y - 2);
          ctx.lineTo(scr.x, scr.y + 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        // Beacon ID Label
        if (layers.beaconLabels) {
          ctx.fillStyle = isSelected ? '#10b981' : '#f8fafc';
          ctx.font = '600 10px "Inter", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(pt.id, scr.x + 7, scr.y - 4);
        }

        // Coordinates Label
        if (layers.coordinates && zoom >= 2.0) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`E:${pt.easting.toFixed(2)} N:${pt.northing.toFixed(2)}`, scr.x + 7, scr.y + 7);
        }
      }
    }

    // 4. North Arrow Indicator (Top Right)
    ctx.save();
    const naX = rect.width - 40;
    const naY = 40;
    ctx.beginPath();
    ctx.moveTo(naX, naY - 18);
    ctx.lineTo(naX + 6, naY + 10);
    ctx.lineTo(naX, naY + 6);
    ctx.closePath();
    ctx.fillStyle = '#ef4444'; // Red North half
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(naX, naY - 18);
    ctx.lineTo(naX - 6, naY + 10);
    ctx.lineTo(naX, naY + 6);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc'; // White South half
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 11px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', naX, naY - 22);
    ctx.restore();

    // 5. Dynamic Scale Bar (Bottom Left)
    ctx.save();
    const scaleBarLengthMeters = 20; // 20m
    const scaleBarPixels = scaleBarLengthMeters * zoom;
    if (scaleBarPixels > 40 && scaleBarPixels < 300) {
      const sbX = 20;
      const sbY = rect.height - 20;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(sbX, sbY, scaleBarPixels, 3);
      ctx.fillRect(sbX, sbY - 4, 1, 7);
      ctx.fillRect(sbX + scaleBarPixels, sbY - 4, 1, 7);
      ctx.fillRect(sbX + scaleBarPixels / 2, sbY - 2, 1, 5);

      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('0', sbX, sbY - 6);
      ctx.textAlign = 'center';
      ctx.fillText(`${scaleBarLengthMeters / 2}m`, sbX + scaleBarPixels / 2, sbY - 6);
      ctx.textAlign = 'right';
      ctx.fillText(`${scaleBarLengthMeters}m`, sbX + scaleBarPixels, sbY - 6);
    }
    ctx.restore();
  }, [points, parcels, layers, zoom, pan, selectedPointId, selectedParcelId, worldToScreen, screenToWorld]);

  // Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || activeTool === 'pan' || e.shiftKey) {
      // Pan drag
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (e.button === 0) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const world = screenToWorld(clickX, clickY);

      if (activeTool === 'add_beacon') {
        onAddPointAtCoord(world.easting, world.northing);
        return;
      }

      // Check point selection (within 8px radius)
      let clickedPointId: string | null = null;
      for (const p of points) {
        const scr = worldToScreen(p.easting, p.northing);
        const dist = Math.hypot(scr.x - clickX, scr.y - clickY);
        if (dist <= 10) {
          clickedPointId = p.id;
          break;
        }
      }

      if (clickedPointId) {
        onSelectPoint(clickedPointId);
        return;
      }

      // Check parcel selection
      let clickedParcelId: string | null = null;
      for (const parcel of parcels) {
        const comp = computeParcel(parcel, points);
        if (!comp) continue;
        const centE = comp.vertices.reduce((s, v) => s + v.easting, 0) / comp.vertices.length;
        const centN = comp.vertices.reduce((s, v) => s + v.northing, 0) / comp.vertices.length;
        const scr = worldToScreen(centE, centN);
        const dist = Math.hypot(scr.x - clickX, scr.y - clickY);
        if (dist <= 30) {
          clickedParcelId = parcel.id;
          break;
        }
      }

      onSelectParcel(clickedParcelId);
      if (!clickedParcelId) {
        onSelectPoint(null);
      }

      // Start drag if clicking on background
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const world = screenToWorld(mouseX, mouseY);
    onCursorMove(world.easting, world.northing);

    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom via Scroll Wheel centered at mouse position
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.1, Math.min(30, zoom * zoomFactor));

    // Keep world coordinate under mouse fixed
    const world = screenToWorld(mouseX, mouseY);
    const newPanX = mouseX - world.easting * newZoom;
    const newPanY = mouseY + world.northing * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  return (
    <div ref={containerRef} className="cad-viewport-container">
      <canvas
        ref={canvasRef}
        className={`cad-canvas ${activeTool === 'pan' || isDragging ? 'cursor-grab' : 'cursor-crosshair'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Floating Canvas Controls */}
      <div className="cad-floating-controls">
        <button
          className="cad-ctrl-btn"
          title="Zoom Extents (Fit All)"
          onClick={fitExtents}
        >
          <Maximize2 size={16} />
        </button>
        <button
          className="cad-ctrl-btn"
          title="Zoom In"
          onClick={() => {
            if (!canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const world = screenToWorld(cx, cy);
            const newZoom = Math.min(30, zoom * 1.25);
            setZoom(newZoom);
            setPan({ x: cx - world.easting * newZoom, y: cy + world.northing * newZoom });
          }}
        >
          <ZoomIn size={16} />
        </button>
        <button
          className="cad-ctrl-btn"
          title="Zoom Out"
          onClick={() => {
            if (!canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            const world = screenToWorld(cx, cy);
            const newZoom = Math.max(0.1, zoom * 0.8);
            setZoom(newZoom);
            setPan({ x: cx - world.easting * newZoom, y: cy + world.northing * newZoom });
          }}
        >
          <ZoomOut size={16} />
        </button>
        <div className="cad-zoom-badge">
          {(zoom * 10).toFixed(0)}%
        </div>
      </div>
    </div>
  );
};
