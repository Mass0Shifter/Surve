import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { CoordinatePoint, Parcel, CadLayers, CadTool, SetoutOverlay } from '../../engine/types';
import { computeParcel, computeExtents } from '../../engine/cogo';
import { decimalToDMS } from '../../engine/formats';
import { buildDTM, DTMPoint } from '../../engine/dtm/dtmEngine';
import { Maximize2, ZoomIn, ZoomOut, X } from 'lucide-react';

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
  setoutOverlay?: SetoutOverlay | null;
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
  onCursorMove,
  setoutOverlay = null
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Viewport State
  const [zoom, setZoom] = useState<number>(3.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Measurement Tool State
  const [measureStart, setMeasureStart] = useState<{ easting: number; northing: number; pointId?: string } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ easting: number; northing: number; pointId?: string } | null>(null);
  const [currentMouseWorld, setCurrentMouseWorld] = useState<{ easting: number; northing: number } | null>(null);

  // Clear measurement if tool changes away from 'measure'
  useEffect(() => {
    if (activeTool !== 'measure') {
      setMeasureStart(null);
      setMeasureEnd(null);
    }
  }, [activeTool]);

  // Coordinate Extents Calculation & Auto-Fit
  const fitExtents = useCallback(() => {
    if (!canvasRef.current || points.length === 0) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const extents = computeExtents(points);

    const margin = 60;
    const availWidth = Math.max(100, rect.width - margin * 2);
    const availHeight = Math.max(100, rect.height - margin * 2);

    const scaleX = availWidth / extents.width;
    const scaleY = availHeight / extents.height;
    const newZoom = Math.max(0.1, Math.min(20, Math.min(scaleX, scaleY)));

    const canvasCenterX = rect.width / 2;
    const canvasCenterY = rect.height / 2;

    const newPanX = canvasCenterX - extents.centerX * newZoom;
    const newPanY = canvasCenterY + extents.centerY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [points]);

  useEffect(() => {
    if (points.length > 0) {
      fitExtents();
    }
  }, [fitExtents]);

  // Dynamic ResizeObserver to auto-fit / re-center canvas when container size changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      if (points.length > 0) {
        fitExtents();
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [fitExtents, points.length]);

  const worldToScreen = useCallback((easting: number, northing: number) => {
    return {
      x: pan.x + easting * zoom,
      y: pan.y - northing * zoom
    };
  }, [pan, zoom]);

  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    return {
      easting: (screenX - pan.x) / zoom,
      northing: (pan.y - screenY) / zoom
    };
  }, [pan, zoom]);

  // Pre-compute DTM / Contours (memoized — only recalculates when points or layer settings change)
  const dtmResult = useMemo(() => {
    if (!layers.contours) return null;
    const dtmPoints: DTMPoint[] = points
      .filter(p => typeof p.elevation === 'number' && !isNaN(p.elevation!))
      .map(p => ({ id: p.id, x: p.easting, y: p.northing, z: p.elevation! }));
    if (dtmPoints.length < 3) return null;
    return buildDTM(dtmPoints, layers.contourInterval || 2, layers.majorContourEvery || 5);
  }, [points, layers.contours, layers.contourInterval, layers.majorContourEvery]);

  // Find nearest beacon for snapping (within 12px)
  const findSnapBeacon = useCallback((screenX: number, screenY: number) => {
    for (const p of points) {
      const scr = worldToScreen(p.easting, p.northing);
      if (Math.hypot(scr.x - screenX, scr.y - screenY) <= 12) {
        return p;
      }
    }
    return null;
  }, [points, worldToScreen]);

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

    // Clear background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // 1. Draw Grid Crosses
    if (layers.gridCrosses) {
      const topLeftWorld = screenToWorld(0, 0);
      const btmRightWorld = screenToWorld(rect.width, rect.height);

      const minE = Math.min(topLeftWorld.easting, btmRightWorld.easting);
      const maxE = Math.max(topLeftWorld.easting, btmRightWorld.easting);
      const minN = Math.min(topLeftWorld.northing, btmRightWorld.northing);
      const maxN = Math.max(topLeftWorld.northing, btmRightWorld.northing);

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

          if (zoom >= 2 && e % (gridStep * 2) === 0 && n % (gridStep * 2) === 0) {
            ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.fillText(`${e}E, ${n}N`, pt.x + 6, pt.y - 4);
          }
        }
      }
    }

    // 2. Draw Parcels
    for (const parcel of parcels) {
      const comp = computeParcel(parcel, points);
      if (!comp || comp.vertices.length < 3) continue;

      const isSelected = parcel.id === selectedParcelId;
      const screenVertices = comp.vertices.map(v => worldToScreen(v.easting, v.northing));

      // A. Parcel Fill
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

          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const perpAngle = angle + Math.PI / 2;
          const offsetDist = 12;

          const textX = midX + Math.cos(perpAngle) * offsetDist;
          const textY = midY + Math.sin(perpAngle) * offsetDist;

          ctx.save();
          ctx.translate(textX, textY);

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

    // 3. Draw Beacons
    if (layers.beacons) {
      for (const pt of points) {
        const scr = worldToScreen(pt.easting, pt.northing);
        const isSelected = pt.id === selectedPointId;
        const isControl = pt.isControl;

        if (isSelected) {
          ctx.beginPath();
          ctx.arc(scr.x, scr.y, 10, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
          ctx.fill();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        if (isControl) {
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
          ctx.beginPath();
          ctx.arc(scr.x, scr.y, 4, 0, 2 * Math.PI);
          ctx.fillStyle = isSelected ? '#10b981' : '#ef4444';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(scr.x - 2, scr.y);
          ctx.lineTo(scr.x + 2, scr.y);
          ctx.moveTo(scr.x, scr.y - 2);
          ctx.lineTo(scr.x + 2, scr.y);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }

        if (layers.beaconLabels) {
          ctx.fillStyle = isSelected ? '#10b981' : '#f8fafc';
          ctx.font = '600 10px "Inter", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(pt.id, scr.x + 7, scr.y - 4);
        }

        if (layers.coordinates && zoom >= 2.0) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`E:${pt.easting.toFixed(2)} N:${pt.northing.toFixed(2)}`, scr.x + 7, scr.y + 7);
        }
      }
    }

    // 4. Draw Interactive Measurement Line & Dynamic Badge
    if (activeTool === 'measure' && measureStart) {
      const targetWorld = measureEnd || currentMouseWorld;
      if (targetWorld) {
        const p1 = worldToScreen(measureStart.easting, measureStart.northing);
        const p2 = worldToScreen(targetWorld.easting, targetWorld.northing);

        const deltaE = targetWorld.easting - measureStart.easting;
        const deltaN = targetWorld.northing - measureStart.northing;
        const dist = Math.hypot(deltaE, deltaN);

        let rad = Math.atan2(deltaE, deltaN);
        let deg = (rad * 180) / Math.PI;
        if (deg < 0) deg += 360;
        const dms = decimalToDMS(deg);

        // Draw glowing measurement line
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = '#f59e0b'; // Amber dashed
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.setLineDash([]);

        // Endpoint markers
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 5, 0, 2 * Math.PI);
        ctx.arc(p2.x, p2.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();

        // Measurement Floating Badge
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        const badgeText = `${dist.toFixed(3)}m | WCB: ${dms.formatted}`;
        ctx.font = '600 11px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(badgeText).width;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(midX - textWidth / 2 - 8, midY - 14, textWidth + 16, 24, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, midX, midY + 2);
        ctx.restore();
      }
    }

    // 5. Draw DTM Contour Lines
    if (layers.contours && dtmResult && dtmResult.contours.length > 0) {
      for (const seg of dtmResult.contours) {
        const p1 = worldToScreen(seg.x1, seg.y1);
        const p2 = worldToScreen(seg.x2, seg.y2);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);

        if (seg.isMajor) {
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)'; // Vivid emerald for major
          ctx.lineWidth = 1.8;
        } else {
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)'; // Faint emerald for minor
          ctx.lineWidth = 0.9;
        }
        ctx.setLineDash([]);
        ctx.stroke();

        // Label major contours at midpoint if enabled
        if (seg.isMajor && layers.showContourLabels) {
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const labelText = `${seg.elevation.toFixed(1)}m`;

          ctx.save();
          ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
          ctx.font = '600 8px "JetBrains Mono", monospace';
          const tw = ctx.measureText(labelText).width;
          ctx.fillRect(midX - tw / 2 - 2, midY - 8, tw + 4, 10);
          ctx.fillStyle = '#10b981';
          ctx.textAlign = 'center';
          ctx.fillText(labelText, midX, midY);
          ctx.restore();
        }
      }
    }

    // 5.5 Draw Setout Spider-Web Overlay (amber dashed rays from station to pegs)
    if (setoutOverlay && setoutOverlay.targets.length > 0) {
      const stnScr = worldToScreen(setoutOverlay.stationEasting, setoutOverlay.stationNorthing);

      // Station marker
      ctx.save();
      ctx.beginPath();
      ctx.arc(stnScr.x, stnScr.y, 10, 0, 2 * Math.PI);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(stnScr.x, stnScr.y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.restore();

      for (const tgt of setoutOverlay.targets) {
        const tgtScr = worldToScreen(tgt.easting, tgt.northing);

        // Dashed amber ray
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([6, 5]);
        ctx.moveTo(stnScr.x, stnScr.y);
        ctx.lineTo(tgtScr.x, tgtScr.y);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);

        // Target peg marker (diamond)
        const d = 5;
        ctx.beginPath();
        ctx.moveTo(tgtScr.x, tgtScr.y - d);
        ctx.lineTo(tgtScr.x + d, tgtScr.y);
        ctx.lineTo(tgtScr.x, tgtScr.y + d);
        ctx.lineTo(tgtScr.x - d, tgtScr.y);
        ctx.closePath();
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Peg label
        ctx.fillStyle = '#fbbf24';
        ctx.font = '700 9px "Inter", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(tgt.label, tgtScr.x + 8, tgtScr.y - 2);
        ctx.restore();
      }
    }

    // 6. North Arrow Indicator
    ctx.save();
    const naX = rect.width - 40;
    const naY = 40;
    ctx.beginPath();
    ctx.moveTo(naX, naY - 18);
    ctx.lineTo(naX + 6, naY + 10);
    ctx.lineTo(naX, naY + 6);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(naX, naY - 18);
    ctx.lineTo(naX - 6, naY + 10);
    ctx.lineTo(naX, naY + 6);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 11px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', naX, naY - 22);
    ctx.restore();

    // 6. Dynamic Scale Bar
    ctx.save();
    const scaleBarLengthMeters = 20;
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
  }, [
    points,
    parcels,
    layers,
    zoom,
    pan,
    selectedPointId,
    selectedParcelId,
    activeTool,
    measureStart,
    measureEnd,
    currentMouseWorld,
    worldToScreen,
    screenToWorld,
    dtmResult,
    setoutOverlay
  ]);

  // Mouse Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || activeTool === 'pan' || e.shiftKey) {
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

      // A. Measurement Tool Click Handling
      if (activeTool === 'measure') {
        const snap = findSnapBeacon(clickX, clickY);
        const targetPt = snap ? { easting: snap.easting, northing: snap.northing, pointId: snap.id } : { easting: world.easting, northing: world.northing };

        if (!measureStart || measureEnd) {
          // Set first point
          setMeasureStart(targetPt);
          setMeasureEnd(null);
        } else {
          // Set second point & lock measurement
          setMeasureEnd(targetPt);
        }
        return;
      }

      if (activeTool === 'add_beacon') {
        onAddPointAtCoord(world.easting, world.northing);
        return;
      }

      // Check point selection
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

    if (activeTool === 'measure') {
      const snap = findSnapBeacon(mouseX, mouseY);
      setCurrentMouseWorld(snap ? { easting: snap.easting, northing: snap.northing } : world);
    }

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

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newZoom = Math.max(0.1, Math.min(30, zoom * zoomFactor));

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

      {/* Measurement Active Overlay Card */}
      {activeTool === 'measure' && measureStart && measureEnd && (
        <div className="measurement-result-pill">
          <span>
            Distance: <strong>{Math.hypot(measureEnd.easting - measureStart.easting, measureEnd.northing - measureStart.northing).toFixed(3)} m</strong>
          </span>
          <button
            className="icon-btn-xs"
            title="Clear measurement"
            onClick={() => {
              setMeasureStart(null);
              setMeasureEnd(null);
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

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
