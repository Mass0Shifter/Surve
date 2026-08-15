import React, { useState, useMemo, useCallback } from 'react';
import { ProjectMetadata, CoordinatePoint, Parcel } from '../../engine/types';
import {
  generateTitleDeedPlanPDF,
  generateCoordinateSchedulePDF,
  TdpRenderOptions,
  TdpStyleConfig,
  TdpAdjoiningConfig,
  TdpLayoutArrangement,
  TdpElementTransform,
  DEFAULT_TDP_STYLE,
  DEFAULT_TDP_LAYOUT,
  TDP_THEME_PRESETS,
  TDP_LAYOUT_PRESETS
} from '../../engine/pdf/tdpGenerator';
import { determineCadastralSheets } from '../../engine/cadastral/sheetIndex';
import { computeParcelSetback } from '../../engine/cadastral/subdivision';
import { computeParcel, computeExtents } from '../../engine/cogo';
import { computeCollisionFreeLayout } from '../../engine/cadastral/collisionEngine';
import { UserProfile } from '../../engine/auth/authTypes';
import { Organization } from '../../engine/organization/orgTypes';
import {
  FileText,
  Download,
  Printer,
  Table,
  Settings2,
  ShieldCheck,
  Grid,
  Layers,
  Compass,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Palette,
  Sliders,
  RotateCcw,
  Save,
  MapPin,
  Layout,
  Type,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  RotateCw,
  Sparkles,
  Search,
  ChevronLeft,
  X
} from 'lucide-react';

interface TitleDeedPlanModalProps {
  project: ProjectMetadata;
  points: CoordinatePoint[];
  parcels: Parcel[];
  currentUser?: UserProfile | null;
  activeOrg?: Organization | null;
  isOpen: boolean;
  isViewMode?: boolean;
  onClose: () => void;
}

export const TitleDeedPlanModal: React.FC<TitleDeedPlanModalProps> = ({
  project,
  points,
  parcels,
  currentUser,
  activeOrg,
  isOpen,
  isViewMode = false,
  onClose
}) => {
  // Navigation Tabs: 'specs' (Plan Specs & Layout) | 'design' (Design & Template Studio) | 'layers' (Element Layers Inspector)
  const [activeTab, setActiveTab] = useState<'specs' | 'design' | 'layers'>('specs');
  const [selectedPlotFilter, setSelectedPlotFilter] = useState<string>('ALL');

  const [planType, setPlanType] = useState<'single_plot' | 'selected_plots' | 'layout'>('single_plot');
  const [pageSize, setPageSize] = useState<'a4' | 'a3' | 'legal'>('a4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [selectedParcelId, setSelectedParcelId] = useState<string>(parcels[0]?.id || '');
  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>(() => parcels.slice(0, 2).map(p => p.id));
  const [scaleRatio, setScaleRatio] = useState<number>(project.scale || 1000);
  const [isCustomScale, setIsCustomScale] = useState<boolean>(false);
  const [customScaleInput, setCustomScaleInput] = useState<string>('750');
  const [showCoordinateTable, setShowCoordinateTable] = useState<boolean>(true);
  const [showSealBox, setShowSealBox] = useState<boolean>(true);
  const [showGridCrosses, setShowGridCrosses] = useState<boolean>(true);
  const [showSetbacks, setShowSetbacks] = useState<boolean>(false);
  const [setbackDist, setSetbackDist] = useState<number>(3.0);

  // Cartographic Style & Design Studio State
  const [styleConfig, setStyleConfig] = useState<TdpStyleConfig>(() => {
    try {
      const saved = localStorage.getItem('nsurvey_tdp_template_style');
      if (saved) return { ...DEFAULT_TDP_STYLE, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error loading saved TDP style', e);
    }
    return DEFAULT_TDP_STYLE;
  });

  // CAD Layout & Sheet Arrangement State
  const [layoutArrangement, setLayoutArrangement] = useState<TdpLayoutArrangement>(() => {
    try {
      const saved = localStorage.getItem('nsurvey_tdp_template_layout');
      if (saved) return { ...DEFAULT_TDP_LAYOUT, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error loading saved TDP layout', e);
    }
    return DEFAULT_TDP_LAYOUT;
  });

  // Adjoining Plots & Road Corridor Configuration
  const [adjoiningConfig, setAdjoiningConfig] = useState<TdpAdjoiningConfig>(() => ({
    showAdjoining: false,
    adjoiningParcelIds: parcels.slice(1, 4).map(p => p.id),
    renderMode: 'stub_extension',
    stubDepthMeters: 8,
    showRoadCorridor: false,
    roadCorridorLabel: '12.00m ACCESS ROAD',
    roadCorridorWidth: 12,
    roadFrontageLegIndices: [0]
  }));

  // Viewport Zoom & Pan State (linked to mouse wheel & drag)
  const [previewZoom, setPreviewZoom] = useState<number>(0.68);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanningStage, setIsPanningStage] = useState<boolean>(false);
  const [panStartMouse, setPanStartMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panStartOffset, setPanStartOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Element Transforms (Position, Rotation, Scale, Visibility, Lock)
  const [elementTransforms, setElementTransforms] = useState<Record<string, TdpElementTransform>>({});
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<'move' | 'scale' | 'rotate' | null>(null);
  const [enableCollisionDeconfliction, setEnableCollisionDeconfliction] = useState<boolean>(false); // Opt-in default
  const [layerSearchTerm, setLayerSearchTerm] = useState<string>('');

  const [dragStartMouse, setDragStartMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragInitialOffset, setDragInitialOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const getTransform = useCallback((key: string): TdpElementTransform => {
    return elementTransforms[key] || { dx: 0, dy: 0, scale: 1.0, rotation: 0, hidden: false, locked: false };
  }, [elementTransforms]);

  const updateTransform = useCallback((key: string, patch: Partial<TdpElementTransform>) => {
    setElementTransforms(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || { dx: 0, dy: 0, scale: 1.0, rotation: 0, hidden: false, locked: false }),
        ...patch
      }
    }));
  }, []);

  const toggleVisibility = useCallback((key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setElementTransforms(prev => {
      const curr = prev[key] || { dx: 0, dy: 0, scale: 1.0, rotation: 0, hidden: false, locked: false };
      return {
        ...prev,
        [key]: { ...curr, hidden: !curr.hidden }
      };
    });
  }, []);

  const toggleLock = useCallback((key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setElementTransforms(prev => {
      const curr = prev[key] || { dx: 0, dy: 0, scale: 1.0, rotation: 0, hidden: false, locked: false };
      return {
        ...prev,
        [key]: { ...curr, locked: !curr.locked }
      };
    });
  }, []);

  const resetTransform = useCallback((key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setElementTransforms(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const resetAllTransforms = useCallback(() => {
    setElementTransforms({});
    setSelectedElementId(null);
  }, []);

  const selectedParcel = parcels.find(p => p.id === selectedParcelId) || parcels[0] || null;
  const isSinglePlot = planType === 'single_plot' && selectedParcel !== null;

  // Filter relevant target points and parcels
  let targetParcels: Parcel[] = [];
  if (isSinglePlot && selectedParcel) {
    targetParcels = [selectedParcel];
  } else if (planType === 'selected_plots' && selectedParcelIds.length > 0) {
    const idSet = new Set(selectedParcelIds);
    targetParcels = parcels.filter(p => idSet.has(p.id));
    if (targetParcels.length === 0 && selectedParcel) targetParcels = [selectedParcel];
  } else {
    targetParcels = parcels;
  }

  let targetPoints: CoordinatePoint[] = [];
  if (planType !== 'layout' && targetParcels.length > 0) {
    const pointMap = new Map(points.map(p => [p.id, p]));
    const ptIdSet = new Set<string>();
    targetParcels.forEach(p => p.pointIds.forEach(id => ptIdSet.add(id)));
    targetPoints = Array.from(ptIdSet).map(pid => pointMap.get(pid)).filter(Boolean) as CoordinatePoint[];
  } else {
    targetPoints = points;
  }

  // Cadastral Sheet Numbers for this location
  const centPoint = targetPoints[0] || points[0] || { easting: 294312, northing: 992100 };
  const sheetIndices = determineCadastralSheets(centPoint.easting, centPoint.northing);
  const activeSheet = sheetIndices.find(s => s.scale === (scaleRatio === 0 ? 1000 : scaleRatio)) || sheetIndices[0];

  // Setback calculation
  const setbackResult = selectedParcel && showSetbacks
    ? computeParcelSetback(selectedParcel, points, setbackDist)
    : null;

  // Compute SVG Vector Viewport Mapping with True Cartographic Scale (1:N)
  const svgWidth = 520;
  const svgHeight = 440;

  const extents = computeExtents(targetPoints.length > 0 ? targetPoints : points);
  const centE = extents.centerX;
  const centN = extents.centerY;

  // Base mm conversion: A4 printable map width ~ 170mm mapped to 500 SVG units => ~2.94 units/mm
  const activeScale = isCustomScale ? (parseInt(customScaleInput) || 1000) : scaleRatio;
  const autoFitScale = Math.min((svgWidth - 90) / Math.max(10, extents.width), (svgHeight - 90) / Math.max(10, extents.height));
  const effectiveScaleRatio = activeScale === 0 ? Math.round(1000 / (autoFitScale / 2.94)) : activeScale;
  const pixelsPerMeter = activeScale === 0 ? autoFitScale : (1000 / activeScale) * 2.94;

  const toSvgX = useCallback((easting: number) => svgWidth / 2 + (easting - centE) * pixelsPerMeter, [centE, pixelsPerMeter]);
  const toSvgY = useCallback((northing: number) => svgHeight / 2 - (northing - centN) * pixelsPerMeter, [centN, pixelsPerMeter]);

  // Scale bar metrics
  const scaleBarMeters = effectiveScaleRatio <= 250 ? 10 : effectiveScaleRatio <= 500 ? 20 : effectiveScaleRatio <= 1000 ? 50 : effectiveScaleRatio <= 2000 ? 100 : 200;
  const scaleBarPx = scaleBarMeters * pixelsPerMeter;

  // Dynamic Grid step
  const gridStep = effectiveScaleRatio <= 250 ? 10 : effectiveScaleRatio <= 500 ? 25 : effectiveScaleRatio <= 1000 ? 50 : 100;
  const gStartE = Math.floor((centE - (svgWidth / (2 * pixelsPerMeter))) / gridStep) * gridStep;
  const gEndE = Math.ceil((centE + (svgWidth / (2 * pixelsPerMeter))) / gridStep) * gridStep;
  const gStartN = Math.floor((centN - (svgHeight / (2 * pixelsPerMeter))) / gridStep) * gridStep;
  const gEndN = Math.ceil((centN + (svgHeight / (2 * pixelsPerMeter))) / gridStep) * gridStep;

  // Extract manual offsets from elementTransforms
  const combinedOffsets = useMemo(() => {
    const offsets: Record<string, { dx: number; dy: number }> = {};
    Object.entries(elementTransforms).forEach(([k, tf]) => {
      if (tf.dx !== 0 || tf.dy !== 0) {
        offsets[k] = { dx: tf.dx, dy: tf.dy };
      }
    });
    return offsets;
  }, [elementTransforms]);

  // Compute Anti-Collision Spatial Layout for Preview
  const resolvedLayout = useMemo(() => {
    return computeCollisionFreeLayout({
      parcels: targetParcels,
      points: targetPoints,
      toScreenX: toSvgX,
      toScreenY: toSvgY,
      beaconSize: styleConfig.beaconSize,
      titleFontSize: isSinglePlot ? styleConfig.titleFontSize * 1.2 : styleConfig.titleFontSize * 0.9,
      areaFontSize: isSinglePlot ? styleConfig.areaFontSize * 1.1 : styleConfig.areaFontSize * 0.9,
      bearingFontSize: styleConfig.bearingFontSize * 1.15,
      beaconFontSize: styleConfig.beaconFontSize * 1.25,
      manualOffsets: combinedOffsets,
      enableAutoDeconfliction: enableCollisionDeconfliction
    });
  }, [
    targetParcels,
    targetPoints,
    toSvgX,
    toSvgY,
    styleConfig,
    combinedOffsets,
    enableCollisionDeconfliction,
    isSinglePlot
  ]);

  const handleElementMouseDown = useCallback((entityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = getTransform(entityId);
    if (current.locked) return;
    setSelectedElementId(entityId);
    setTransformMode('move');
    setDragStartMouse({ x: e.clientX, y: e.clientY });
    setDragInitialOffset({ dx: current.dx, dy: current.dy });
  }, [getTransform]);

  const handleScaleHandleMouseDown = useCallback((entityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = getTransform(entityId);
    if (current.locked) return;
    setSelectedElementId(entityId);
    setTransformMode('scale');
    setDragStartMouse({ x: e.clientX, y: e.clientY });
    setDragInitialOffset({ dx: current.scale || 1.0, dy: 0 });
  }, [getTransform]);

  const handleRotateHandleMouseDown = useCallback((entityId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const current = getTransform(entityId);
    if (current.locked) return;
    setSelectedElementId(entityId);
    setTransformMode('rotate');
    setDragStartMouse({ x: e.clientX, y: e.clientY });
    setDragInitialOffset({ dx: current.rotation || 0, dy: 0 });
  }, [getTransform]);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!selectedElementId || !transformMode) return;
    const current = getTransform(selectedElementId);
    if (current.locked) return;

    const deltaX = (e.clientX - dragStartMouse.x) / previewZoom;
    const deltaY = (e.clientY - dragStartMouse.y) / previewZoom;

    if (transformMode === 'move') {
      updateTransform(selectedElementId, {
        dx: Math.round(dragInitialOffset.dx + deltaX),
        dy: Math.round(dragInitialOffset.dy + deltaY)
      });
    } else if (transformMode === 'scale') {
      const scaleDelta = (deltaX + deltaY) * 0.015;
      const newScale = Math.max(0.5, Math.min(2.8, (dragInitialOffset.dx + scaleDelta)));
      updateTransform(selectedElementId, {
        scale: parseFloat(newScale.toFixed(2))
      });
    } else if (transformMode === 'rotate') {
      const rotDelta = Math.round(deltaX * 1.5);
      const newRot = (((dragInitialOffset.dx + rotDelta) % 360) + 360) % 360;
      updateTransform(selectedElementId, {
        rotation: newRot > 180 ? newRot - 360 : newRot
      });
    }
  }, [selectedElementId, transformMode, dragStartMouse, dragInitialOffset, previewZoom, getTransform, updateTransform]);

  const handleSvgMouseUp = useCallback(() => {
    setTransformMode(null);
  }, []);

  // Viewport Mouse Wheel Zooming
  const handleStageWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY > 0 ? -0.06 : 0.06;
    setPreviewZoom(z => Math.max(0.25, Math.min(3.0, parseFloat((z + zoomDelta).toFixed(2)))));
  }, []);

  // Stage Mouse Down for Viewport Panning (Middle Click or clicking stage background)
  const handleStageMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isBackground = target.classList?.contains('tdp-preview-stage') ||
                         target.classList?.contains('tdp-canvas-scaler');
    if (e.button === 1 || (e.button === 0 && isBackground)) {
      setIsPanningStage(true);
      setPanStartMouse({ x: e.clientX, y: e.clientY });
      setPanStartOffset({ ...panOffset });
    }
  }, [panOffset]);

  const handleStageMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanningStage) {
      const dx = e.clientX - panStartMouse.x;
      const dy = e.clientY - panStartMouse.y;
      setPanOffset({
        x: Math.round(panStartOffset.x + dx),
        y: Math.round(panStartOffset.y + dy)
      });
    }
  }, [isPanningStage, panStartMouse, panStartOffset]);

  const handleStageMouseUp = useCallback(() => {
    setIsPanningStage(false);
  }, []);

  const handleResetView = useCallback(() => {
    setPreviewZoom(0.68);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // Batch Plot Element Hiding / Showing Logic
  const handleTogglePlotElements = useCallback((parcelId: string, hide: boolean) => {
    const targetParcel = parcels.find(p => p.id === parcelId);
    if (!targetParcel) return;

    const parcelPtIds = new Set(targetParcel.pointIds.map(id => id.toUpperCase()));
    const otherVisibleParcels = parcels.filter(p => p.id !== parcelId && !getTransform(`parcel_${p.id}`).hidden);
    const otherPtIds = new Set<string>();
    otherVisibleParcels.forEach(p => p.pointIds.forEach(id => otherPtIds.add(id.toUpperCase())));

    setElementTransforms(prev => {
      const next = { ...prev };

      // 1. Toggle Parcel Badge
      const badgeKey = `parcel_${parcelId}`;
      next[badgeKey] = { ...(next[badgeKey] || { dx: 0, dy: 0, scale: 1.0, rotation: 0, locked: false }), hidden: hide };

      // 2. Toggle Boundary Leg Dimensions belonging to this parcel
      resolvedLayout.boundaryDimensions.forEach(dim => {
        const fromMatch = parcelPtIds.has(dim.fromPointId.toUpperCase());
        const toMatch = parcelPtIds.has(dim.toPointId.toUpperCase());
        if (fromMatch && toMatch) {
          const dimKey = `dim_${dim.key}`;
          next[dimKey] = { ...(next[dimKey] || { dx: 0, dy: 0, scale: 1.0, rotation: 0, locked: false }), hidden: hide };
        }
      });

      // 3. Toggle Beacons belonging exclusively to this parcel
      targetParcel.pointIds.forEach(ptId => {
        const isShared = otherPtIds.has(ptId.toUpperCase());
        if (!hide || !isShared) {
          const beaconKey = `beacon_${ptId}`;
          next[beaconKey] = { ...(next[beaconKey] || { dx: 0, dy: 0, scale: 1.0, rotation: 0, locked: false }), hidden: hide };
        }
      });

      return next;
    });
  }, [parcels, resolvedLayout.boundaryDimensions, getTransform]);

  const filteredParcels = useMemo(() => {
    let list = targetParcels;
    if (selectedPlotFilter !== 'ALL') {
      list = list.filter(p => p.id === selectedPlotFilter);
    }
    if (!layerSearchTerm.trim()) return list;
    const term = layerSearchTerm.toLowerCase();
    return list.filter(p => (p.plotNumber || '').toLowerCase().includes(term) || (p.ownerName || '').toLowerCase().includes(term));
  }, [targetParcels, selectedPlotFilter, layerSearchTerm]);

  const filteredPoints = useMemo(() => {
    let list = targetPoints;
    if (selectedPlotFilter !== 'ALL') {
      const selectedPcl = parcels.find(p => p.id === selectedPlotFilter);
      if (selectedPcl) {
        const idSet = new Set(selectedPcl.pointIds.map(id => id.toUpperCase()));
        list = list.filter(pt => idSet.has(pt.id.toUpperCase()));
      }
    }
    if (!layerSearchTerm.trim()) return list;
    const term = layerSearchTerm.toLowerCase();
    return list.filter(pt => (pt.id || '').toLowerCase().includes(term));
  }, [targetPoints, parcels, selectedPlotFilter, layerSearchTerm]);

  const filteredDimensions = useMemo(() => {
    let list = resolvedLayout.boundaryDimensions;
    if (selectedPlotFilter !== 'ALL') {
      const selectedPcl = parcels.find(p => p.id === selectedPlotFilter);
      if (selectedPcl) {
        const idSet = new Set(selectedPcl.pointIds.map(id => id.toUpperCase()));
        list = list.filter(d => idSet.has(d.fromPointId.toUpperCase()) && idSet.has(d.toPointId.toUpperCase()));
      }
    }
    if (!layerSearchTerm.trim()) return list;
    const term = layerSearchTerm.toLowerCase();
    return list.filter(d => (d.bearingStr || '').toLowerCase().includes(term) || (d.distStr || '').toLowerCase().includes(term));
  }, [resolvedLayout.boundaryDimensions, parcels, selectedPlotFilter, layerSearchTerm]);

  const handleApplyTheme = (presetKey: string) => {
    if (TDP_THEME_PRESETS[presetKey]) {
      setStyleConfig({ ...TDP_THEME_PRESETS[presetKey] });
    }
  };

  const handleApplyLayoutPreset = (presetKey: string) => {
    if (TDP_LAYOUT_PRESETS[presetKey]) {
      setLayoutArrangement({ ...TDP_LAYOUT_PRESETS[presetKey] });
    }
  };

  const handleSaveAsFirmPreset = () => {
    try {
      localStorage.setItem('nsurvey_tdp_template_style', JSON.stringify(styleConfig));
      localStorage.setItem('nsurvey_tdp_template_layout', JSON.stringify(layoutArrangement));
      alert('TDP Design & Layout Template saved as your default firm preset!');
    } catch (e) {
      console.error('Error saving TDP style/layout', e);
    }
  };

  const handleDownloadPDF = () => {
    const opts: TdpRenderOptions = {
      pageSize,
      orientation,
      planType,
      scaleRatio: effectiveScaleRatio,
      selectedParcelId,
      selectedParcelIds,
      showCoordinateTable,
      showSealBox,
      showGridCrosses,
      showAdjoiningLabels: true,
      surveyorSealUrl: currentUser?.digitalSealUrl,
      surveyorSignatureUrl: currentUser?.signatureUrl,
      firmSealUrl: activeOrg?.officialSealUrl,
      surconNumber: currentUser?.surconNumber || project.surveyorNumber,
      surveyorTitle: currentUser?.title,
      style: styleConfig,
      adjoining: adjoiningConfig,
      layout: layoutArrangement,
      elementTransforms,
      enableCollisionDeconfliction
    };

    const doc = generateTitleDeedPlanPDF(project, points, parcels, opts);
    const fileName = `${project.code || 'TDP'}_${planType === 'single_plot' ? (selectedParcel?.plotNumber || 'PLOT') : planType === 'selected_plots' ? 'SELECTED_PLOTS' : 'LAYOUT'}.pdf`;
    doc.save(fileName);
  };

  const handlePrint = () => {
    const opts: TdpRenderOptions = {
      pageSize,
      orientation,
      planType,
      scaleRatio: effectiveScaleRatio,
      selectedParcelId,
      selectedParcelIds,
      showCoordinateTable,
      showSealBox,
      showGridCrosses,
      showAdjoiningLabels: true,
      surveyorSealUrl: currentUser?.digitalSealUrl,
      surveyorSignatureUrl: currentUser?.signatureUrl,
      firmSealUrl: activeOrg?.officialSealUrl,
      surconNumber: currentUser?.surconNumber || project.surveyorNumber,
      surveyorTitle: currentUser?.title,
      style: styleConfig,
      adjoining: adjoiningConfig,
      layout: layoutArrangement,
      elementTransforms,
      enableCollisionDeconfliction
    };

    // Generate crisp vector PDF and trigger clean print window
    const doc = generateTitleDeedPlanPDF(project, points, parcels, opts);
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank');
  };

  // Standalone Beacon Coordinate Schedule PDF Handlers
  const handleExportCoordinateSchedule = () => {
    const opts: Partial<TdpRenderOptions> = {
      surveyorSealUrl: currentUser?.digitalSealUrl,
      surveyorSignatureUrl: currentUser?.signatureUrl,
      firmSealUrl: activeOrg?.officialSealUrl,
      surconNumber: currentUser?.surconNumber || project.surveyorNumber,
      surveyorTitle: currentUser?.title
    };
    const doc = generateCoordinateSchedulePDF(project, points, targetParcels, opts, currentUser, activeOrg);
    doc.save(`Coordinate_Schedule_${project.code || 'PLAN'}.pdf`);
  };

  const handlePrintCoordinateSchedule = () => {
    const opts: Partial<TdpRenderOptions> = {
      surveyorSealUrl: currentUser?.digitalSealUrl,
      surveyorSignatureUrl: currentUser?.signatureUrl,
      firmSealUrl: activeOrg?.officialSealUrl,
      surconNumber: currentUser?.surconNumber || project.surveyorNumber,
      surveyorTitle: currentUser?.title
    };
    const doc = generateCoordinateSchedulePDF(project, points, targetParcels, opts, currentUser, activeOrg);
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank');
  };

  if (!isOpen) return null;

  const studioContent = (
    <div className={`tdp-studio-viewport ${isViewMode ? 'tdp-studio-fullview' : ''}`} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
      {/* Top Header */}
      <div className="modal-header tdp-header-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid rgba(56, 189, 248, 0.2)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isViewMode && (
            <button
              className="btn-secondary-sm"
              onClick={onClose}
              title="Return to Survey Workspace"
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <ChevronLeft size={14} />
              <span>Back to Workspace</span>
            </button>
          )}
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} className="text-emerald" />
            <span style={{ fontWeight: 'bold', color: '#f8fafc', fontSize: '14px' }}>
              Title Deed Plan (TDP) Print Studio &amp; Cadastral Suite
            </span>
            <span className="badge-pill-cyan" style={{ fontSize: '11px' }}>
              {pageSize.toUpperCase()} {orientation === 'portrait' ? 'Portrait' : 'Landscape'}
            </span>
            <span className="badge-pill-emerald" style={{ fontSize: '11px' }}>
              1:{effectiveScaleRatio}
            </span>
          </div>
        </div>

        <div className="header-actions-group" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            className="btn-secondary-sm"
            onClick={handlePrintCoordinateSchedule}
            title="Print Standalone A4 Beacon Coordinate Schedule"
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Table size={14} className="text-cyan" />
            <span>Print Schedule</span>
          </button>
          <button
            className="btn-secondary-sm"
            onClick={handleExportCoordinateSchedule}
            title="Export Standalone A4 Beacon Coordinate Schedule PDF"
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Download size={14} />
            <span>Schedule PDF</span>
          </button>
          <button className="btn-secondary-sm" onClick={handlePrint} title="Print Plan (Pure Vector Clean White)">
            <Printer size={14} />
            <span>Print Plan</span>
          </button>
          <button className="btn-primary-sm" onClick={handleDownloadPDF} title="Download Vector PDF (SURCON / FCDA Print-Ready)">
            <Download size={14} />
            <span>Export PDF</span>
          </button>
          {!isViewMode && (
            <button className="icon-btn" onClick={onClose}>✕</button>
          )}
        </div>
      </div>

        <div className="tdp-studio-body">
          {/* Left Controls Customizer Sidebar */}
          <div className="tdp-customizer-sidebar">
            {/* Tab Navigation Switcher */}
            <div className="tdp-sidebar-tabs">
              <button
                className={`tdp-tab-btn ${activeTab === 'specs' ? 'active' : ''}`}
                onClick={() => setActiveTab('specs')}
              >
                <Settings2 size={13} />
                <span>Plan Specs</span>
              </button>
              <button
                className={`tdp-tab-btn ${activeTab === 'design' ? 'active' : ''}`}
                onClick={() => setActiveTab('design')}
              >
                <Palette size={13} />
                <span>Design Studio</span>
              </button>
              <button
                className={`tdp-tab-btn ${activeTab === 'layers' ? 'active' : ''}`}
                onClick={() => setActiveTab('layers')}
              >
                <Layers size={13} />
                <span>Layers {Object.keys(elementTransforms).length > 0 ? `(${Object.keys(elementTransforms).length})` : ''}</span>
              </button>
            </div>

            {/* TAB 1: PLAN SPECS & LAYOUT */}
            {activeTab === 'specs' && (
              <>
                <div className="sidebar-section-title">
                  <Settings2 size={14} className="text-emerald" />
                  <span>Plan Deliverable & Scale</span>
                </div>

                {/* Plan Type Selector */}
                <div className="form-group">
                  <label>Plan Deliverable Type</label>
                  <select value={planType} onChange={(e) => setPlanType(e.target.value as any)}>
                    <option value="single_plot">Single-Plot Title Deed Plan (C of O)</option>
                    <option value="selected_plots">Custom Multi-Plot Plan (Selected Parcels)</option>
                    <option value="layout">Estate Layout Master Plan (All Plots)</option>
                  </select>
                </div>

                {/* Target Parcel Selector */}
                {planType === 'single_plot' && (
                  <div className="form-group">
                    <label>Focus Cadastral Parcel</label>
                    <select value={selectedParcelId} onChange={(e) => setSelectedParcelId(e.target.value)}>
                      {parcels.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.plotNumber} {p.ownerName ? `(${p.ownerName})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Multi-Parcel Custom Checklist */}
                {planType === 'selected_plots' && (
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ margin: 0 }}>Select Included Parcels ({selectedParcelIds.length}/{parcels.length})</label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          type="button"
                          className="btn-secondary-sm"
                          style={{ fontSize: '9px', padding: '2px 6px' }}
                          onClick={() => setSelectedParcelIds(parcels.map(p => p.id))}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          className="btn-secondary-sm"
                          style={{ fontSize: '9px', padding: '2px 6px' }}
                          onClick={() => setSelectedParcelIds([])}
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <div className="multi-parcel-picker-box" style={{ maxHeight: '110px', overflowY: 'auto', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '6px', border: '1px solid rgba(148, 163, 184, 0.1)', padding: '6px' }}>
                      {parcels.map(p => {
                        const isChecked = selectedParcelIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className="checkbox-label"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', fontSize: '11px', cursor: 'pointer', borderRadius: '4px', background: isChecked ? 'rgba(16, 185, 129, 0.08)' : 'transparent' }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedParcelIds([...selectedParcelIds, p.id]);
                                } else {
                                  setSelectedParcelIds(selectedParcelIds.filter(id => id !== p.id));
                                }
                              }}
                            />
                            <span style={{ fontWeight: isChecked ? 600 : 400, color: isChecked ? '#f8fafc' : '#94a3b8' }}>
                              {p.plotNumber} {p.ownerName ? `(${p.ownerName})` : ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Paper Size & Orientation */}
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Paper Size</label>
                    <select value={pageSize} onChange={(e) => setPageSize(e.target.value as any)}>
                      <option value="a4">A4 (210 x 297 mm)</option>
                      <option value="a3">A3 (297 x 420 mm)</option>
                      <option value="legal">Legal (8.5 x 14 in)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Orientation</label>
                    <select value={orientation} onChange={(e) => setOrientation(e.target.value as any)}>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>

                {/* Scale Ratio Selector */}
                <div className="form-group">
                  <label>Drawing Scale Ratio (1:N)</label>
                  <select
                    value={isCustomScale ? 'custom' : scaleRatio}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomScale(true);
                        const val = parseInt(customScaleInput);
                        if (!isNaN(val) && val >= 10) setScaleRatio(val);
                      } else {
                        setIsCustomScale(false);
                        setScaleRatio(parseInt(e.target.value) || 0);
                      }
                    }}
                  >
                    <option value={0}>Auto-Fit (Optimal Scale)</option>
                    <option value={250}>1:250 (Detailed Site Plan - 4x Large)</option>
                    <option value={500}>1:500 (Abuja FCDA Standard - 2x Large)</option>
                    <option value={1000}>1:1,000 (Standard Cadastral)</option>
                    <option value={2000}>1:2,000 (Town Layout - 0.5x)</option>
                    <option value={5000}>1:5,000 (District Regional Sheet)</option>
                    <option value="custom">Custom Ratio (1:N)...</option>
                  </select>

                  {isCustomScale && (
                    <div className="custom-scale-input-box" style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>1 :</span>
                      <input
                        type="number"
                        min={10}
                        max={100000}
                        step={10}
                        value={customScaleInput}
                        onChange={(e) => {
                          setCustomScaleInput(e.target.value);
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 10) {
                            setScaleRatio(val);
                          }
                        }}
                        placeholder="e.g. 750"
                        style={{ flex: 1, fontSize: '11px', padding: '4px 8px', height: '28px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '4px', color: '#f8fafc' }}
                      />
                    </div>
                  )}
                </div>

                {/* Cadastral Sheet Index Card */}
                <div className="sheet-index-card">
                  <div className="sheet-card-title">
                    <Grid size={12} className="text-cyan" />
                    <span>Calculated Cadastral Sheet</span>
                  </div>
                  <div className="sheet-number-highlight">{activeSheet.sheetNumber}</div>
                  <div className="sheet-meta-sub">{activeSheet.scaleLabel} (Scale 1:{effectiveScaleRatio})</div>
                </div>

                {/* Adjoining (Abutting) Plots & Road Corridor Section */}
                {isSinglePlot && (
                  <>
                    <div className="sidebar-section-title" style={{ marginTop: '12px' }}>
                      <MapPin size={14} className="text-emerald" />
                      <span>Adjoining Plots & Road Corridors</span>
                    </div>

                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={adjoiningConfig.showAdjoining}
                        onChange={(e) => setAdjoiningConfig({ ...adjoiningConfig, showAdjoining: e.target.checked })}
                      />
                      <span>Show Abutting / Adjoining Parcels</span>
                    </label>

                    {adjoiningConfig.showAdjoining && (
                      <div style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(148, 163, 184, 0.15)', borderRadius: '6px', padding: '8px', marginTop: '6px' }}>
                        <div className="form-group" style={{ marginBottom: '8px' }}>
                          <label style={{ fontSize: '10px' }}>Adjoining Representation Mode</label>
                          <select
                            value={adjoiningConfig.renderMode}
                            onChange={(e) => setAdjoiningConfig({ ...adjoiningConfig, renderMode: e.target.value as any })}
                            style={{ fontSize: '11px', height: '28px' }}
                          >
                            <option value="stub_extension">Partial Stub Extent (5m - 15m Depth)</option>
                            <option value="dashed_full">Full Ghosted Outline (Dashed)</option>
                          </select>
                        </div>

                        {adjoiningConfig.renderMode === 'stub_extension' && (
                          <div className="form-group" style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
                              <span>Stub Projection Depth</span>
                              <span>{adjoiningConfig.stubDepthMeters}m</span>
                            </div>
                            <input
                              type="range"
                              min={3}
                              max={15}
                              step={1}
                              value={adjoiningConfig.stubDepthMeters}
                              onChange={(e) => setAdjoiningConfig({ ...adjoiningConfig, stubDepthMeters: parseInt(e.target.value) || 8 })}
                            />
                          </div>
                        )}

                        <div className="form-group" style={{ marginBottom: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <label style={{ fontSize: '10px', margin: 0 }}>Included Adjoining Plots</label>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button
                                type="button"
                                className="btn-secondary-sm"
                                style={{ fontSize: '8px', padding: '1px 5px' }}
                                onClick={() => setAdjoiningConfig({ ...adjoiningConfig, adjoiningParcelIds: parcels.filter(p => p.id !== selectedParcel?.id).map(p => p.id) })}
                              >
                                All
                              </button>
                              <button
                                type="button"
                                className="btn-secondary-sm"
                                style={{ fontSize: '8px', padding: '1px 5px' }}
                                onClick={() => setAdjoiningConfig({ ...adjoiningConfig, adjoiningParcelIds: [] })}
                              >
                                None
                              </button>
                            </div>
                          </div>
                          <div style={{ maxHeight: '80px', overflowY: 'auto', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '4px', padding: '4px' }}>
                            {parcels.filter(p => p.id !== selectedParcel?.id).map(p => {
                              const isChecked = adjoiningConfig.adjoiningParcelIds.includes(p.id);
                              return (
                                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', cursor: 'pointer', padding: '2px 4px', color: isChecked ? '#f8fafc' : '#94a3b8' }}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setAdjoiningConfig({ ...adjoiningConfig, adjoiningParcelIds: [...adjoiningConfig.adjoiningParcelIds, p.id] });
                                      } else {
                                        setAdjoiningConfig({ ...adjoiningConfig, adjoiningParcelIds: adjoiningConfig.adjoiningParcelIds.filter(id => id !== p.id) });
                                      }
                                    }}
                                  />
                                  <span>{p.plotNumber}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {/* Road Corridor Toggle */}
                        <label className="checkbox-label" style={{ marginTop: '4px' }}>
                          <input
                            type="checkbox"
                            checked={adjoiningConfig.showRoadCorridor}
                            onChange={(e) => setAdjoiningConfig({ ...adjoiningConfig, showRoadCorridor: e.target.checked })}
                          />
                          <span>Show Access Road Corridor(s)</span>
                        </label>

                        {adjoiningConfig.showRoadCorridor && (() => {
                          // Compute legs of the focused parcel for the multi-select checklist
                          const compFocus = selectedParcel ? computeParcel(selectedParcel, points) : null;
                          const focusLegs = compFocus?.legs || [];
                          const selectedIndices = adjoiningConfig.roadFrontageLegIndices || [];

                          return (
                            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {/* Road label input */}
                              <input
                                type="text"
                                value={adjoiningConfig.roadCorridorLabel}
                                onChange={(e) => setAdjoiningConfig({ ...adjoiningConfig, roadCorridorLabel: e.target.value })}
                                placeholder="e.g. 12.00m ACCESS ROAD"
                                style={{ fontSize: '10px', padding: '4px 6px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '4px', color: '#f8fafc' }}
                              />

                              {/* Multi-select road frontage legs */}
                              {focusLegs.length > 0 && (
                                <div style={{ background: 'rgba(30,41,59,0.4)', borderRadius: '4px', padding: '6px', border: '1px solid rgba(148,163,184,0.12)' }}>
                                  <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '4px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    Select Road Face(s) — tick all sides that abut a road
                                  </div>
                                  {focusLegs.map((leg, idx) => {
                                    const isChecked = selectedIndices.includes(idx);
                                    return (
                                      <label
                                        key={idx}
                                        style={{
                                          display: 'flex', alignItems: 'center', gap: '6px',
                                          fontSize: '10px', cursor: 'pointer', padding: '2px 4px',
                                          borderRadius: '3px',
                                          background: isChecked ? 'rgba(16,185,129,0.10)' : 'transparent',
                                          color: isChecked ? '#f8fafc' : '#94a3b8'
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={(e) => {
                                            const next = e.target.checked
                                              ? [...selectedIndices, idx]
                                              : selectedIndices.filter(i => i !== idx);
                                            setAdjoiningConfig({ ...adjoiningConfig, roadFrontageLegIndices: next });
                                          }}
                                        />
                                        <span style={{ fontFamily: 'monospace', fontSize: '9.5px' }}>
                                          Leg {idx + 1}: {leg.bearing.formatted} — {leg.distance.toFixed(2)}m
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}

                {/* Feature Toggles */}
                <div className="sidebar-section-title" style={{ marginTop: '12px' }}>
                  <Layers size={14} className="text-cyan" />
                  <span>Survey Plan Elements</span>
                </div>

                <div className="toggle-list">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={showCoordinateTable}
                      onChange={(e) => setShowCoordinateTable(e.target.checked)}
                    />
                    <span>Coordinate Schedule Table</span>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={showSealBox}
                      onChange={(e) => setShowSealBox(e.target.checked)}
                    />
                    <span>SURCON Surveyor's Seal & Cert</span>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={showGridCrosses}
                      onChange={(e) => setShowGridCrosses(e.target.checked)}
                    />
                    <span>Geodetic Grid Crosses ({gridStep}m)</span>
                  </label>
                </div>

                {/* Regulatory Building Setback Tool */}
                {isSinglePlot && (
                  <>
                    <div className="sidebar-section-title" style={{ marginTop: '12px' }}>
                      <Compass size={14} className="text-amber" />
                      <span>Building Setback Regulation</span>
                    </div>

                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={showSetbacks}
                        onChange={(e) => setShowSetbacks(e.target.checked)}
                      />
                      <span>Calculate Building Footprint Setback</span>
                    </label>

                    {showSetbacks && (
                      <div className="setback-config-box">
                        <div className="form-group">
                          <label>Setback Distance (m)</label>
                          <input
                            type="number"
                            step="0.5"
                            value={setbackDist}
                            onChange={(e) => setSetbackDist(parseFloat(e.target.value) || 3.0)}
                          />
                        </div>
                        {setbackResult && (
                          <div className="setback-stats">
                            <div>Gross Plot Area: <strong>{setbackResult.originalArea.toFixed(1)} m²</strong></div>
                            <div>Usable Build Footprint: <strong className="text-emerald">{setbackResult.usableBuildingArea.toFixed(1)} m²</strong></div>
                            <div>Coverage Ratio: <strong>{((setbackResult.usableBuildingArea / setbackResult.originalArea) * 100).toFixed(1)}%</strong></div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* TAB 2: DESIGN & TEMPLATE STUDIO */}
            {activeTab === 'design' && (
              <>
                <div className="sidebar-section-title">
                  <Palette size={14} className="text-emerald" />
                  <span>Template & Theme Presets</span>
                </div>

                <div className="tdp-preset-grid">
                  <div
                    className={`tdp-preset-card ${styleConfig.themePreset === 'federal_standard' ? 'active' : ''}`}
                    onClick={() => handleApplyTheme('federal_standard')}
                  >
                    <div className="tdp-preset-title" style={{ color: '#10b981' }}>Federal SURCON</div>
                    <div className="tdp-preset-sub">Cadastral Green • Solid</div>
                  </div>

                  <div
                    className={`tdp-preset-card ${styleConfig.themePreset === 'state_lands' ? 'active' : ''}`}
                    onClick={() => handleApplyTheme('state_lands')}
                  >
                    <div className="tdp-preset-title" style={{ color: '#3b82f6' }}>State Lands</div>
                    <div className="tdp-preset-sub">Navy Blue • Hatch Fill</div>
                  </div>

                  <div
                    className={`tdp-preset-card ${styleConfig.themePreset === 'executive_deed' ? 'active' : ''}`}
                    onClick={() => handleApplyTheme('executive_deed')}
                  >
                    <div className="tdp-preset-title" style={{ color: '#d97706' }}>Executive Deed</div>
                    <div className="tdp-preset-sub">Charcoal • Gold Accents</div>
                  </div>

                  <div
                    className={`tdp-preset-card ${styleConfig.themePreset === 'cad_blueprint' ? 'active' : ''}`}
                    onClick={() => handleApplyTheme('cad_blueprint')}
                  >
                    <div className="tdp-preset-title" style={{ color: '#0ea5e9' }}>CAD Blueprint</div>
                    <div className="tdp-preset-sub">Cyan • Crosshatch</div>
                  </div>
                </div>

                {/* Typography Engine */}
                <div className="sidebar-section-title" style={{ marginTop: '12px' }}>
                  <Sliders size={14} className="text-cyan" />
                  <span>Typography Scales</span>
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Plot Title Size</span>
                    <span>{styleConfig.titleFontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={16}
                    step={0.5}
                    value={styleConfig.titleFontSize}
                    onChange={(e) => setStyleConfig({ ...styleConfig, titleFontSize: parseFloat(e.target.value) || 10, themePreset: 'custom' })}
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Bearing & Distance Size</span>
                    <span>{styleConfig.bearingFontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min={4.5}
                    max={9}
                    step={0.25}
                    value={styleConfig.bearingFontSize}
                    onChange={(e) => setStyleConfig({ ...styleConfig, bearingFontSize: parseFloat(e.target.value) || 5.5, themePreset: 'custom' })}
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Beacon ID Size</span>
                    <span>{styleConfig.beaconFontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min={4.5}
                    max={9}
                    step={0.25}
                    value={styleConfig.beaconFontSize}
                    onChange={(e) => setStyleConfig({ ...styleConfig, beaconFontSize: parseFloat(e.target.value) || 6.0, themePreset: 'custom' })}
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Centroid Area Metric Size</span>
                    <span>{styleConfig.areaFontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min={5.5}
                    max={11}
                    step={0.5}
                    value={styleConfig.areaFontSize}
                    onChange={(e) => setStyleConfig({ ...styleConfig, areaFontSize: parseFloat(e.target.value) || 7.5, themePreset: 'custom' })}
                  />
                </div>

                {/* Boundary Linework */}
                <div className="sidebar-section-title" style={{ marginTop: '12px' }}>
                  <Layers size={14} className="text-emerald" />
                  <span>Boundary Linework & Stroke</span>
                </div>

                <div className="form-group">
                  <label>Boundary Line Color</label>
                  <div className="color-swatch-row">
                    {['#10b981', '#1e3a8a', '#dc2626', '#0f172a', '#d97706', '#0284c7'].map(col => (
                      <button
                        key={col}
                        type="button"
                        className={`color-swatch-btn ${styleConfig.boundaryColor === col ? 'active' : ''}`}
                        style={{ background: col }}
                        onClick={() => setStyleConfig({ ...styleConfig, boundaryColor: col, themePreset: 'custom' })}
                      />
                    ))}
                    <input
                      type="color"
                      value={styleConfig.boundaryColor}
                      onChange={(e) => setStyleConfig({ ...styleConfig, boundaryColor: e.target.value, themePreset: 'custom' })}
                      style={{ width: '24px', height: '24px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Line Width</label>
                    <select
                      value={styleConfig.boundaryLineWidth}
                      onChange={(e) => setStyleConfig({ ...styleConfig, boundaryLineWidth: parseFloat(e.target.value) || 0.6, themePreset: 'custom' })}
                    >
                      <option value={0.3}>0.3 mm (Fine)</option>
                      <option value={0.6}>0.6 mm (Standard)</option>
                      <option value={0.8}>0.8 mm (Bold)</option>
                      <option value={1.2}>1.2 mm (Heavy)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Line Style</label>
                    <select
                      value={styleConfig.boundaryLineStyle}
                      onChange={(e) => setStyleConfig({ ...styleConfig, boundaryLineStyle: e.target.value as any, themePreset: 'custom' })}
                    >
                      <option value="solid">Solid Line</option>
                      <option value="dashed">Dashed</option>
                      <option value="dashdot">Dash-Dot</option>
                    </select>
                  </div>
                </div>

                {/* Plot Shading & Hatching */}
                <div className="sidebar-section-title" style={{ marginTop: '12px' }}>
                  <Palette size={14} className="text-amber" />
                  <span>Plot Shading & Hatching</span>
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                    <span>Shading Fill Opacity</span>
                    <span>{(styleConfig.fillOpacity * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.35}
                    step={0.02}
                    value={styleConfig.fillOpacity}
                    onChange={(e) => setStyleConfig({ ...styleConfig, fillOpacity: parseFloat(e.target.value) || 0, themePreset: 'custom' })}
                  />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Hatch Pattern</label>
                    <select
                      value={styleConfig.hatchPattern}
                      onChange={(e) => setStyleConfig({ ...styleConfig, hatchPattern: e.target.value as any, themePreset: 'custom' })}
                    >
                      <option value="none">None / Wireframe</option>
                      <option value="tint">Solid Tint</option>
                      <option value="diagonal">45° Diagonal Hatch</option>
                      <option value="cross">Crosshatch Grid</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Fill Tint Color</label>
                    <input
                      type="color"
                      value={styleConfig.fillColor}
                      onChange={(e) => setStyleConfig({ ...styleConfig, fillColor: e.target.value, themePreset: 'custom' })}
                      style={{ width: '100%', height: '28px', padding: 0, border: '1px solid rgba(148,163,184,0.2)', background: 'transparent', cursor: 'pointer', borderRadius: '4px' }}
                    />
                  </div>
                </div>

                {/* Beacon Marker Styling */}
                <div className="sidebar-section-title" style={{ marginTop: '12px' }}>
                  <ShieldCheck size={14} className="text-rose-400" />
                  <span>Beacon & Pillar Markers</span>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Beacon Marker Color</label>
                    <input
                      type="color"
                      value={styleConfig.beaconColor}
                      onChange={(e) => setStyleConfig({ ...styleConfig, beaconColor: e.target.value, themePreset: 'custom' })}
                      style={{ width: '100%', height: '28px', padding: 0, border: '1px solid rgba(148,163,184,0.2)', background: 'transparent', cursor: 'pointer', borderRadius: '4px' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Marker Radius</label>
                    <select
                      value={styleConfig.beaconSize}
                      onChange={(e) => setStyleConfig({ ...styleConfig, beaconSize: parseFloat(e.target.value) || 1.4, themePreset: 'custom' })}
                    >
                      <option value={1.0}>1.0 mm (Small)</option>
                      <option value={1.4}>1.4 mm (Standard)</option>
                      <option value={1.8}>1.8 mm (Large)</option>
                    </select>
                  </div>
                </div>

                {/* CAD Layout & Sheet Block Arrangement */}
                <div className="sidebar-section-title" style={{ marginTop: '14px' }}>
                  <Layout size={14} className="text-amber" />
                  <span>CAD Layout & Block Arrangement</span>
                </div>

                <div className="tdp-preset-grid">
                  <div
                    className={`tdp-preset-card ${layoutArrangement.preset === 'surcon_standard' ? 'active' : ''}`}
                    onClick={() => handleApplyLayoutPreset('surcon_standard')}
                  >
                    <div className="tdp-preset-title" style={{ color: '#10b981' }}>SURCON Standard</div>
                    <div className="tdp-preset-sub">Center Title • Bottom Table & Seal</div>
                  </div>

                  <div
                    className={`tdp-preset-card ${layoutArrangement.preset === 'state_lands_boxed' ? 'active' : ''}`}
                    onClick={() => handleApplyLayoutPreset('state_lands_boxed')}
                  >
                    <div className="tdp-preset-title" style={{ color: '#3b82f6' }}>State Lands Boxed</div>
                    <div className="tdp-preset-sub">Left Banner • Boxed Schedule</div>
                  </div>

                  <div
                    className={`tdp-preset-card ${layoutArrangement.preset === 'right_sidebar' ? 'active' : ''}`}
                    onClick={() => handleApplyLayoutPreset('right_sidebar')}
                  >
                    <div className="tdp-preset-title" style={{ color: '#d97706' }}>Right Sidebar</div>
                    <div className="tdp-preset-sub">Vertical Meta Column • Wide Map</div>
                  </div>

                  <div
                    className={`tdp-preset-card ${layoutArrangement.preset === 'compact_split' ? 'active' : ''}`}
                    onClick={() => handleApplyLayoutPreset('compact_split')}
                  >
                    <div className="tdp-preset-title" style={{ color: '#0ea5e9' }}>Compact Split</div>
                    <div className="tdp-preset-sub">Floating Table • Bottom Seal</div>
                  </div>
                </div>

                {/* Detailed Block Positions */}
                <div className="form-row-2" style={{ marginTop: '8px' }}>
                  <div className="form-group">
                    <label>Header Title Align</label>
                    <select
                      value={layoutArrangement.headerAlign}
                      onChange={(e) => setLayoutArrangement({ ...layoutArrangement, headerAlign: e.target.value as any, preset: 'custom_free' })}
                    >
                      <option value="center">Centered (Default)</option>
                      <option value="left">Left-Aligned</option>
                      <option value="split">Split Banner</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Coordinate Table</label>
                    <select
                      value={layoutArrangement.coordTablePosition}
                      onChange={(e) => setLayoutArrangement({ ...layoutArrangement, coordTablePosition: e.target.value as any, preset: 'custom_free' })}
                    >
                      <option value="bottom_left">Bottom-Left (Default)</option>
                      <option value="bottom_right">Bottom-Right</option>
                      <option value="right_column">Right Sidebar Column</option>
                      <option value="top_right">Top-Right (Floating)</option>
                      <option value="hidden">Hidden</option>
                    </select>
                  </div>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Surveyor's Seal Position</label>
                    <select
                      value={layoutArrangement.sealBoxPosition}
                      onChange={(e) => setLayoutArrangement({ ...layoutArrangement, sealBoxPosition: e.target.value as any, preset: 'custom_free' })}
                    >
                      <option value="bottom_right">Bottom-Right (Default)</option>
                      <option value="bottom_left">Bottom-Left</option>
                      <option value="bottom_center">Bottom-Center</option>
                      <option value="right_column">Right Sidebar Column</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>North Arrow Position</label>
                    <select
                      value={layoutArrangement.northArrowPosition}
                      onChange={(e) => setLayoutArrangement({ ...layoutArrangement, northArrowPosition: e.target.value as any, preset: 'custom_free' })}
                    >
                      <option value="top_right">Top-Right (Default)</option>
                      <option value="top_left">Top-Left</option>
                      <option value="bottom_right">Bottom-Right</option>
                    </select>
                  </div>
                </div>

                {/* Custom Text Overrides */}
                <div className="sidebar-section-title" style={{ marginTop: '12px' }}>
                  <Type size={14} className="text-cyan" />
                  <span>Custom Header &amp; Plan Text Overrides</span>
                </div>

                <div className="form-group">
                  <label>Plan Title Text</label>
                  <input
                    type="text"
                    value={layoutArrangement.customTitleText || ''}
                    onChange={(e) => setLayoutArrangement({ ...layoutArrangement, customTitleText: e.target.value || undefined, preset: 'custom_free' })}
                    placeholder="TITLE DEED PLAN"
                    style={{ fontSize: '11px', padding: '4px 6px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '4px', color: '#f8fafc' }}
                  />
                </div>

                <div className="form-group">
                  <label>Subtitle / Description</label>
                  <input
                    type="text"
                    value={layoutArrangement.customSubtitleText || ''}
                    onChange={(e) => setLayoutArrangement({ ...layoutArrangement, customSubtitleText: e.target.value || undefined, preset: 'custom_free' })}
                    placeholder="e.g. PLAN SHOWING PLOT 12 (ALLOTTEE: JOHN DOE)"
                    style={{ fontSize: '11px', padding: '4px 6px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '4px', color: '#f8fafc' }}
                  />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Location & Datum</label>
                    <input
                      type="text"
                      value={layoutArrangement.customLocationText || ''}
                      onChange={(e) => setLayoutArrangement({ ...layoutArrangement, customLocationText: e.target.value || undefined, preset: 'custom_free' })}
                      placeholder={`SITUATED AT: ${project.location.toUpperCase()}`}
                      style={{ fontSize: '11px', padding: '4px 6px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '4px', color: '#f8fafc' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Plan / Job No</label>
                    <input
                      type="text"
                      value={layoutArrangement.customPlanNoText || ''}
                      onChange={(e) => setLayoutArrangement({ ...layoutArrangement, customPlanNoText: e.target.value || undefined, preset: 'custom_free' })}
                      placeholder={project.code || 'PLAN-001'}
                      style={{ fontSize: '11px', padding: '4px 6px', background: 'rgba(30, 41, 59, 0.5)', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '4px', color: '#f8fafc' }}
                    />
                  </div>
                </div>

                {/* Preset Management Actions */}
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={handleSaveAsFirmPreset}
                  >
                    <Save size={14} />
                    <span>Save As Default Firm Preset</span>
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={() => {
                      setStyleConfig({ ...DEFAULT_TDP_STYLE });
                      setLayoutArrangement({ ...DEFAULT_TDP_LAYOUT });
                    }}
                  >
                    <RotateCcw size={14} />
                    <span>Reset to Federal SURCON</span>
                  </button>
                </div>
              </>
            )}

            {/* TAB 3: ELEMENT LAYERS INSPECTOR */}
            {activeTab === 'layers' && (
              <div className="tdp-layer-inspector">
                <div className="sidebar-section-title">
                  <Layers size={14} className="text-emerald" />
                  <span>Cartographic Entity Layers</span>
                </div>

                {/* Plot Isolation / Filter Bar */}
                <div className="tdp-plot-filter-header" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: 'rgba(30, 41, 59, 0.6)',
                  border: '1px solid rgba(56, 189, 248, 0.15)',
                  borderRadius: '6px',
                  marginBottom: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={13} className="text-emerald" />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc' }}>Plot Filter:</span>
                  </div>
                  <select
                    className="form-select-xs"
                    value={selectedPlotFilter}
                    onChange={(e) => setSelectedPlotFilter(e.target.value)}
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      background: '#0f172a',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.2)',
                      borderRadius: '4px',
                      maxWidth: '140px'
                    }}
                  >
                    <option value="ALL">All Plots ({parcels.length})</option>
                    {parcels.map(p => (
                      <option key={p.id} value={p.id}>{p.plotNumber}</option>
                    ))}
                  </select>
                </div>

                {/* Per-Plot Batch Actions */}
                {selectedPlotFilter !== 'ALL' && (
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                    <button
                      className="btn-secondary-xs"
                      onClick={() => handleTogglePlotElements(selectedPlotFilter, false)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    >
                      <Eye size={12} className="text-emerald" /> <span>Show Plot Elements</span>
                    </button>
                    <button
                      className="btn-secondary-xs"
                      onClick={() => handleTogglePlotElements(selectedPlotFilter, true)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    >
                      <EyeOff size={12} className="text-rose" /> <span>Hide Plot Elements</span>
                    </button>
                  </div>
                )}

                {/* Search Bar */}
                <div className="tdp-layer-search-box">
                  <Search size={13} className="text-muted" />
                  <input
                    type="text"
                    value={layerSearchTerm}
                    onChange={(e) => setLayerSearchTerm(e.target.value)}
                    placeholder="Search beacon, plot, or dimension..."
                  />
                  {layerSearchTerm && (
                    <button className="tdp-layer-btn" onClick={() => setLayerSearchTerm('')}>
                      <X size={11} />
                    </button>
                  )}
                </div>

                {/* Layer Group: Parcel Badges */}
                <div className="tdp-layer-group">
                  <div className="tdp-layer-group-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={12} className="text-emerald" />
                      <span>Parcel Plot Badges</span>
                    </div>
                    <span className="tdp-layer-group-count">{filteredParcels.length}</span>
                  </div>
                  <div className="tdp-layer-list">
                    {filteredParcels.map(p => {
                      const entityKey = `parcel_${p.id}`;
                      const tf = getTransform(entityKey);
                      const isSelected = selectedElementId === entityKey;
                      return (
                        <div
                          key={p.id}
                          className={`tdp-layer-item ${isSelected ? 'selected' : ''} ${tf.hidden ? 'hidden-entity' : ''}`}
                          onClick={() => setSelectedElementId(entityKey)}
                        >
                          <div className="tdp-layer-item-main">
                            <span className="tdp-layer-item-title">{p.plotNumber}</span>
                            {tf.scale !== 1.0 && tf.scale ? (
                              <span style={{ fontSize: '9px', color: '#38bdf8', fontFamily: 'monospace' }}>{tf.scale}x</span>
                            ) : null}
                            {tf.rotation ? (
                              <span style={{ fontSize: '9px', color: '#f59e0b', fontFamily: 'monospace' }}>{tf.rotation}°</span>
                            ) : null}
                          </div>
                          <div className="tdp-layer-item-actions">
                            <button
                              className="tdp-layer-btn"
                              title="Toggle all labels & dimensions in this plot"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePlotElements(p.id, !tf.hidden);
                              }}
                            >
                              {tf.hidden ? <EyeOff size={12} className="text-rose" /> : <Eye size={12} className="text-emerald" />}
                            </button>
                            <button
                              className={`tdp-layer-btn ${tf.locked ? 'active' : ''}`}
                              title={tf.locked ? 'Unlock element' : 'Lock element position'}
                              onClick={(e) => toggleLock(entityKey, e)}
                            >
                              {tf.locked ? <Lock size={12} /> : <Unlock size={12} />}
                            </button>
                            <button
                              className={`tdp-layer-btn ${!tf.hidden ? 'active' : ''}`}
                              title={tf.hidden ? 'Show element' : 'Hide element'}
                              onClick={(e) => toggleVisibility(entityKey, e)}
                            >
                              {tf.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            {(tf.dx !== 0 || tf.dy !== 0 || tf.scale !== 1.0 || tf.rotation !== 0 || tf.hidden) && (
                              <button
                                className="tdp-layer-btn"
                                title="Reset transform"
                                onClick={(e) => resetTransform(entityKey, e)}
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Layer Group: Beacon Number Labels */}
                <div className="tdp-layer-group">
                  <div className="tdp-layer-group-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={12} className="text-cyan" />
                      <span>Beacon Numbers</span>
                    </div>
                    <span className="tdp-layer-group-count">{filteredPoints.length}</span>
                  </div>
                  <div className="tdp-layer-list">
                    {filteredPoints.map(pt => {
                      const entityKey = `beacon_${pt.id}`;
                      const tf = getTransform(entityKey);
                      const isSelected = selectedElementId === entityKey;
                      return (
                        <div
                          key={pt.id}
                          className={`tdp-layer-item ${isSelected ? 'selected' : ''} ${tf.hidden ? 'hidden-entity' : ''}`}
                          onClick={() => setSelectedElementId(entityKey)}
                        >
                          <div className="tdp-layer-item-main">
                            <span className="tdp-layer-item-title">{pt.id}</span>
                            {pt.isControl && <span style={{ fontSize: '8px', color: '#f59e0b', fontWeight: 600 }}>CTRL</span>}
                            {tf.scale !== 1.0 && tf.scale ? (
                              <span style={{ fontSize: '9px', color: '#38bdf8', fontFamily: 'monospace' }}>{tf.scale}x</span>
                            ) : null}
                          </div>
                          <div className="tdp-layer-item-actions">
                            <button
                              className={`tdp-layer-btn ${tf.locked ? 'active' : ''}`}
                              title={tf.locked ? 'Unlock element' : 'Lock element position'}
                              onClick={(e) => toggleLock(entityKey, e)}
                            >
                              {tf.locked ? <Lock size={12} /> : <Unlock size={12} />}
                            </button>
                            <button
                              className={`tdp-layer-btn ${!tf.hidden ? 'active' : ''}`}
                              title={tf.hidden ? 'Show element' : 'Hide element'}
                              onClick={(e) => toggleVisibility(entityKey, e)}
                            >
                              {tf.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            {(tf.dx !== 0 || tf.dy !== 0 || tf.scale !== 1.0 || tf.rotation !== 0 || tf.hidden) && (
                              <button
                                className="tdp-layer-btn"
                                title="Reset transform"
                                onClick={(e) => resetTransform(entityKey, e)}
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Layer Group: Boundary Leg Dimensions */}
                <div className="tdp-layer-group">
                  <div className="tdp-layer-group-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Compass size={12} className="text-amber" />
                      <span>Boundary Dimensions</span>
                    </div>
                    <span className="tdp-layer-group-count">{filteredDimensions.length}</span>
                  </div>
                  <div className="tdp-layer-list">
                    {filteredDimensions.map(dim => {
                      const entityKey = `dim_${dim.key}`;
                      const tf = getTransform(entityKey);
                      const isSelected = selectedElementId === entityKey;
                      return (
                        <div
                          key={dim.key}
                          className={`tdp-layer-item ${isSelected ? 'selected' : ''} ${tf.hidden ? 'hidden-entity' : ''}`}
                          onClick={() => setSelectedElementId(entityKey)}
                        >
                          <div className="tdp-layer-item-main">
                            <span className="tdp-layer-item-title">{dim.bearingStr} {dim.distStr}</span>
                            {tf.rotation ? (
                              <span style={{ fontSize: '9px', color: '#f59e0b', fontFamily: 'monospace' }}>{tf.rotation}°</span>
                            ) : null}
                          </div>
                          <div className="tdp-layer-item-actions">
                            <button
                              className={`tdp-layer-btn ${tf.locked ? 'active' : ''}`}
                              title={tf.locked ? 'Unlock element' : 'Lock element position'}
                              onClick={(e) => toggleLock(entityKey, e)}
                            >
                              {tf.locked ? <Lock size={12} /> : <Unlock size={12} />}
                            </button>
                            <button
                              className={`tdp-layer-btn ${!tf.hidden ? 'active' : ''}`}
                              title={tf.hidden ? 'Show element' : 'Hide element'}
                              onClick={(e) => toggleVisibility(entityKey, e)}
                            >
                              {tf.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            {(tf.dx !== 0 || tf.dy !== 0 || tf.scale !== 1.0 || tf.rotation !== 0 || tf.hidden) && (
                              <button
                                className="tdp-layer-btn"
                                title="Reset transform"
                                onClick={(e) => resetTransform(entityKey, e)}
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Layer Group: Sheet Layout Elements */}
                <div className="tdp-layer-group">
                  <div className="tdp-layer-group-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Layout size={12} className="text-indigo" />
                      <span>Sheet Cartographic Elements</span>
                    </div>
                    <span className="tdp-layer-group-count">4</span>
                  </div>
                  <div className="tdp-layer-list">
                    {[
                      { key: 'elem_north_arrow', label: 'True North Arrow' },
                      { key: 'elem_scale_bar', label: 'Bar Scale & Ratio' },
                      { key: 'elem_coord_table', label: 'Beacon Coordinate Schedule' },
                      { key: 'elem_seal_box', label: 'Surveyor Seal & Signature' }
                    ].map(elem => {
                      const tf = getTransform(elem.key);
                      const isSelected = selectedElementId === elem.key;
                      return (
                        <div
                          key={elem.key}
                          className={`tdp-layer-item ${isSelected ? 'selected' : ''} ${tf.hidden ? 'hidden-entity' : ''}`}
                          onClick={() => setSelectedElementId(elem.key)}
                        >
                          <div className="tdp-layer-item-main">
                            <span className="tdp-layer-item-title">{elem.label}</span>
                          </div>
                          <div className="tdp-layer-item-actions">
                            <button
                              className={`tdp-layer-btn ${tf.locked ? 'active' : ''}`}
                              title={tf.locked ? 'Unlock element' : 'Lock element'}
                              onClick={(e) => toggleLock(elem.key, e)}
                            >
                              {tf.locked ? <Lock size={12} /> : <Unlock size={12} />}
                            </button>
                            <button
                              className={`tdp-layer-btn ${!tf.hidden ? 'active' : ''}`}
                              title={tf.hidden ? 'Show element' : 'Hide element'}
                              onClick={(e) => toggleVisibility(elem.key, e)}
                            >
                              {tf.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                            {(tf.hidden || tf.locked) && (
                              <button
                                className="tdp-layer-btn"
                                title="Reset"
                                onClick={(e) => resetTransform(elem.key, e)}
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reset All Action */}
                {Object.keys(elementTransforms).length > 0 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginTop: '8px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={resetAllTransforms}
                  >
                    <RotateCcw size={13} />
                    <span>Reset All Entity Customizations ({Object.keys(elementTransforms).length})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right Live Print Preview Stage with Mouse-Linked Zoom & Pan Controls */}
          <div
            className="tdp-preview-stage"
            onWheel={handleStageWheel}
            onMouseDown={handleStageMouseDown}
            onMouseMove={handleStageMouseMove}
            onMouseUp={handleStageMouseUp}
            onMouseLeave={handleStageMouseUp}
            style={{ cursor: isPanningStage ? 'grabbing' : 'default', overflow: 'hidden', userSelect: isPanningStage ? 'none' : 'auto' }}
          >
            {/* Preview Zoom Controls Floating Bar */}
            <div className="preview-zoom-bar">
              <button
                className="icon-btn"
                title="Zoom Out Preview (or Scroll Down)"
                onClick={() => setPreviewZoom(z => Math.max(0.25, parseFloat((z - 0.1).toFixed(2))))}
              >
                <ZoomOut size={13} />
              </button>
              <span className="zoom-text">{(previewZoom * 100).toFixed(0)}%</span>
              <button
                className="icon-btn"
                title="Zoom In Preview (or Scroll Up)"
                onClick={() => setPreviewZoom(z => Math.min(3.0, parseFloat((z + 0.1).toFixed(2))))}
              >
                <ZoomIn size={13} />
              </button>
              <button
                className="btn-secondary-xs"
                title="Fit Page to View & Center"
                onClick={handleResetView}
              >
                <Maximize2 size={12} className="inline-icon" />
                <span>Fit</span>
              </button>

              {/* Opt-In De-Clutter Button */}
              <button
                className="btn-secondary-xs"
                title="Click to resolve overlapping text and beacon labels"
                onClick={() => setEnableCollisionDeconfliction(prev => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: enableCollisionDeconfliction ? '#38bdf8' : '#94a3b8',
                  background: enableCollisionDeconfliction ? 'rgba(56,189,248,0.12)' : undefined,
                  borderColor: enableCollisionDeconfliction ? 'rgba(56,189,248,0.4)' : undefined
                }}
              >
                <Sparkles size={12} />
                <span>{enableCollisionDeconfliction ? 'De-Cluttered (On)' : 'De-Clutter Plan'}</span>
              </button>

              {/* Reset Custom Transforms Button */}
              {Object.keys(elementTransforms).length > 0 && (
                <button
                  className="btn-secondary-xs"
                  title="Reset custom manual positions, rotations and scales"
                  onClick={resetAllTransforms}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }}
                >
                  <RotateCcw size={12} />
                  <span>Reset ({Object.keys(elementTransforms).length})</span>
                </button>
              )}
            </div>

            {/* Floating Quick Action Toolbar for Selected Element */}
            {selectedElementId && (
              <div className="tdp-selected-quick-toolbar">
                <span className="tdp-quick-title">
                  {selectedElementId.startsWith('parcel_') ? `Plot: ${targetParcels.find(p => p.id === selectedElementId.replace('parcel_', ''))?.plotNumber || selectedElementId}`
                    : selectedElementId.startsWith('beacon_') ? `Beacon: ${selectedElementId.replace('beacon_', '')}`
                    : selectedElementId.startsWith('dim_') ? 'Dimension'
                    : selectedElementId.replace('elem_', '').replace('_', ' ').toUpperCase()}
                </span>
                <button
                  className="tdp-quick-btn"
                  title="Scale Up (+10%)"
                  onClick={() => {
                    const curr = getTransform(selectedElementId);
                    updateTransform(selectedElementId, { scale: parseFloat(((curr.scale || 1.0) + 0.1).toFixed(2)) });
                  }}
                >
                  <span>A+</span>
                </button>
                <button
                  className="tdp-quick-btn"
                  title="Scale Down (-10%)"
                  onClick={() => {
                    const curr = getTransform(selectedElementId);
                    updateTransform(selectedElementId, { scale: Math.max(0.5, parseFloat(((curr.scale || 1.0) - 0.1).toFixed(2))) });
                  }}
                >
                  <span>A-</span>
                </button>
                <button
                  className="tdp-quick-btn"
                  title="Rotate +15°"
                  onClick={() => {
                    const curr = getTransform(selectedElementId);
                    updateTransform(selectedElementId, { rotation: ((curr.rotation || 0) + 15) % 360 });
                  }}
                >
                  <RotateCw size={11} />
                  <span>+15°</span>
                </button>
                <button
                  className="tdp-quick-btn"
                  title={getTransform(selectedElementId).locked ? 'Unlock element' : 'Lock element position'}
                  onClick={() => toggleLock(selectedElementId)}
                >
                  {getTransform(selectedElementId).locked ? <Lock size={11} /> : <Unlock size={11} />}
                </button>
                <button
                  className="tdp-quick-btn"
                  title="Hide Element"
                  onClick={() => toggleVisibility(selectedElementId)}
                >
                  <EyeOff size={11} />
                  <span>Hide</span>
                </button>
                {selectedElementId.startsWith('parcel_') && (
                  <button
                    className="tdp-quick-btn"
                    title="Hide all labels & dimensions in this plot"
                    onClick={() => {
                      const parcelId = selectedElementId.replace('parcel_', '');
                      handleTogglePlotElements(parcelId, true);
                    }}
                    style={{ color: '#fb7185' }}
                  >
                    <EyeOff size={11} />
                    <span>Hide Plot</span>
                  </button>
                )}
                <button
                  className="tdp-quick-btn"
                  title="Reset Element Transform"
                  onClick={() => resetTransform(selectedElementId)}
                >
                  <RotateCcw size={11} />
                </button>
                <button
                  className="tdp-quick-btn danger"
                  title="Deselect"
                  onClick={() => setSelectedElementId(null)}
                >
                  <X size={11} />
                </button>
              </div>
            )}

            <div
              className="tdp-canvas-scaler"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${previewZoom})`,
                transition: isPanningStage ? 'none' : 'transform 0.08s ease-out',
                transformOrigin: 'center center'
              }}
            >
              <div className={`tdp-sheet-canvas ${pageSize} ${orientation}`}>
                {/* Outer Double Neatline */}
                <div className="tdp-neatline-outer">
                  <div className="tdp-neatline-inner">
                    {/* Plan Header with Dynamic CAD Alignment */}
                    <div
                      className="tdp-plan-header"
                      style={{
                        textAlign: layoutArrangement.headerAlign === 'left' ? 'left' : layoutArrangement.headerAlign === 'split' ? 'left' : 'center',
                        alignItems: layoutArrangement.headerAlign === 'left' ? 'flex-start' : layoutArrangement.headerAlign === 'split' ? 'flex-start' : 'center'
                      }}
                    >
                      <div className="tdp-plan-title">
                        {layoutArrangement.customTitleText || 'TITLE DEED PLAN'}
                      </div>
                      <div className="tdp-plan-subtitle">
                        {layoutArrangement.customSubtitleText || (isSinglePlot && selectedParcel
                          ? `PLAN SHOWING ${selectedParcel.plotNumber} ${selectedParcel.ownerName ? `(ALLOTTEE: ${selectedParcel.ownerName.toUpperCase()})` : ''}`
                          : `SURVEY PLAN OF ${project.title.toUpperCase()}`)}
                      </div>
                      <div className="tdp-plan-location">
                        {layoutArrangement.customLocationText || `SITUATED AT: ${project.location.toUpperCase()} | DATUM: MINNA GRID`}
                      </div>
                      <div className="tdp-header-right-meta">
                        <div><strong>SHEET:</strong> {activeSheet.sheetNumber}</div>
                        <div><strong>SCALE:</strong> 1:{effectiveScaleRatio}</div>
                        <div><strong>PLAN NO:</strong> {layoutArrangement.customPlanNoText || project.code}</div>
                      </div>
                    </div>

                    {/* Main Layout Body (Support for Right Sidebar Column) */}
                    <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
                      {/* Plan Cadastral Drawing Area with Dynamic SVG Vector Engine */}
                      <div className="tdp-map-frame" style={{ flex: 1, position: 'relative' }}>
                        <svg
                          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                          className="tdp-vector-svg"
                          onMouseMove={handleSvgMouseMove}
                          onMouseUp={handleSvgMouseUp}
                          onMouseLeave={handleSvgMouseUp}
                        >
                          <defs>
                            <pattern id="svg-diag-hatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                              <line x1="0" y1="0" x2="0" y2="8" stroke={styleConfig.fillColor} strokeWidth="1.2" opacity={Math.max(0.2, styleConfig.fillOpacity * 2.5)} />
                            </pattern>
                            <pattern id="svg-cross-hatch" width="8" height="8" patternUnits="userSpaceOnUse">
                              <line x1="0" y1="0" x2="8" y2="0" stroke={styleConfig.fillColor} strokeWidth="1" opacity={Math.max(0.2, styleConfig.fillOpacity * 2.5)} />
                              <line x1="0" y1="0" x2="0" y2="8" stroke={styleConfig.fillColor} strokeWidth="1" opacity={Math.max(0.2, styleConfig.fillOpacity * 2.5)} />
                            </pattern>
                          </defs>

                          {/* 1. Grid Crosses */}
                          {showGridCrosses && (
                            <g className="svg-grid-crosses" stroke="#cbd5e1" strokeWidth="0.8">
                              {Array.from({ length: Math.ceil((gEndE - gStartE) / gridStep) + 1 }).map((_, ei) => {
                                const ge = gStartE + ei * gridStep;
                                return Array.from({ length: Math.ceil((gEndN - gStartN) / gridStep) + 1 }).map((_, ni) => {
                                  const gn = gStartN + ni * gridStep;
                                  const gx = toSvgX(ge);
                                  const gy = toSvgY(gn);
                                  if (gx < 10 || gx > svgWidth - 10 || gy < 10 || gy > svgHeight - 10) return null;
                                  return (
                                    <g key={`${ge}-${gn}`}>
                                      <line x1={gx - 4} y1={gy} x2={gx + 4} y2={gy} />
                                      <line x1={gx} y1={gy - 4} x2={gx} y2={gy + 4} />
                                    </g>
                                  );
                                });
                              })}
                            </g>
                          )}

                          {/* 1.5. Adjoining (Abutting) Parcels Layer */}
                          {adjoiningConfig.showAdjoining && isSinglePlot && (
                            <g className="svg-adjoining-layer">
                              {parcels
                                .filter(p => p.id !== selectedParcel.id && (adjoiningConfig.adjoiningParcelIds.length === 0 || adjoiningConfig.adjoiningParcelIds.includes(p.id)))
                                .map(adj => {
                                  const compAdj = computeParcel(adj, points);
                                  if (!compAdj || compAdj.vertices.length < 3) return null;

                                  if (adjoiningConfig.renderMode === 'dashed_full') {
                                    const adjPoly = compAdj.vertices.map(v => `${toSvgX(v.easting)},${toSvgY(v.northing)}`).join(' ');
                                    const aCentX = compAdj.vertices.reduce((s, v) => s + toSvgX(v.easting), 0) / compAdj.vertices.length;
                                    const aCentY = compAdj.vertices.reduce((s, v) => s + toSvgY(v.northing), 0) / compAdj.vertices.length;

                                    return (
                                      <g key={`adj-full-${adj.id}`}>
                                        <polygon
                                          points={adjPoly}
                                          fill="none"
                                          stroke="#94a3b8"
                                          strokeWidth="1.2"
                                          strokeDasharray="4 3"
                                        />
                                        <text
                                          x={aCentX}
                                          y={aCentY}
                                          textAnchor="middle"
                                          fontSize="8"
                                          fontStyle="italic"
                                          fill="#64748b"
                                          style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '2.5px' }}
                                        >
                                          {adj.plotNumber}
                                        </text>
                                      </g>
                                    );
                                  } else {
                                    // Stub Extension: find shared boundary segment between focus and adjoining parcel.
                                    // Project in the direction of the adjoining parcel's centroid (correct orientation).
                                    const focusPointIds = new Set(selectedParcel.pointIds);
                                    const sharedPointIds = adj.pointIds.filter(id => focusPointIds.has(id));

                                    if (sharedPointIds.length >= 2) {
                                      const sharedPts = sharedPointIds.map(id => points.find(p => p.id === id)).filter(Boolean) as CoordinatePoint[];
                                      if (sharedPts.length >= 2) {
                                        const p1 = { x: toSvgX(sharedPts[0].easting), y: toSvgY(sharedPts[0].northing) };
                                        const p2 = { x: toSvgX(sharedPts[1].easting), y: toSvgY(sharedPts[1].northing) };

                                        const dx = p2.x - p1.x;
                                        const dy = p2.y - p1.y;
                                        const len = Math.hypot(dx, dy);
                                        if (len > 1) {
                                          let nx = -dy / len;
                                          let ny = dx / len;
                                          const midX = (p1.x + p2.x) / 2;
                                          const midY = (p1.y + p2.y) / 2;

                                          // Orient toward the adjoining parcel centroid, not screen center
                                          const adjCentX = compAdj.vertices.reduce((s, v) => s + toSvgX(v.easting), 0) / compAdj.vertices.length;
                                          const adjCentY = compAdj.vertices.reduce((s, v) => s + toSvgY(v.northing), 0) / compAdj.vertices.length;
                                          if (nx * (adjCentX - midX) + ny * (adjCentY - midY) < 0) {
                                            nx = -nx;
                                            ny = -ny;
                                          }

                                          const stubDepthPx = adjoiningConfig.stubDepthMeters * pixelsPerMeter;
                                          const s1 = { x: p1.x + nx * stubDepthPx, y: p1.y + ny * stubDepthPx };
                                          const s2 = { x: p2.x + nx * stubDepthPx, y: p2.y + ny * stubDepthPx };

                                          // Label at midpoint of the open stub interior
                                          const stubCentX = (midX + (s1.x + s2.x) / 2) / 2;
                                          const stubCentY = (midY + (s1.y + s2.y) / 2) / 2;

                                          return (
                                            <g key={`adj-stub-${adj.id}`}>
                                              {/* Two side ticks only — open stub, no closing cap */}
                                              <line x1={p1.x} y1={p1.y} x2={s1.x} y2={s1.y} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 3" />
                                              <line x1={p2.x} y1={p2.y} x2={s2.x} y2={s2.y} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 3" />
                                              <text
                                                x={stubCentX}
                                                y={stubCentY}
                                                textAnchor="middle"
                                                dominantBaseline="central"
                                                fontSize="7.5"
                                                fontStyle="italic"
                                                fill="#64748b"
                                                style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '2.5px' }}
                                              >
                                                {adj.plotNumber}
                                              </text>
                                            </g>
                                          );
                                        }
                                      }
                                    }
                                    return null;
                                  }
                                })}

                              {/* Road Corridors — one per selected frontage leg (multi-select) */}
                              {adjoiningConfig.showRoadCorridor && adjoiningConfig.roadCorridorLabel && (() => {
                                const compFocus = computeParcel(selectedParcel, points);
                                if (!compFocus || compFocus.legs.length === 0) return null;

                                const selectedLegIndices = (adjoiningConfig.roadFrontageLegIndices || [0])
                                  .filter(i => i < compFocus.legs.length);

                                return (
                                  <g key="road-corridors">
                                    {selectedLegIndices.map(legIdx => {
                                      const leg = compFocus.legs[legIdx];
                                      const p1 = { x: toSvgX(leg.fromPoint.easting), y: toSvgY(leg.fromPoint.northing) };
                                      const p2 = { x: toSvgX(leg.toPoint.easting), y: toSvgY(leg.toPoint.northing) };

                                      const dx = p2.x - p1.x;
                                      const dy = p2.y - p1.y;
                                      const len = Math.hypot(dx, dy);
                                      if (len < 1) return null;

                                      // Orient outward from focus parcel centroid
                                      const focCentX = compFocus.vertices.reduce((s, v) => s + toSvgX(v.easting), 0) / compFocus.vertices.length;
                                      const focCentY = compFocus.vertices.reduce((s, v) => s + toSvgY(v.northing), 0) / compFocus.vertices.length;
                                      const midX = (p1.x + p2.x) / 2;
                                      const midY = (p1.y + p2.y) / 2;

                                      let nx = -dy / len;
                                      let ny = dx / len;
                                      if (nx * (midX - focCentX) + ny * (midY - focCentY) < 0) {
                                        nx = -nx;
                                        ny = -ny;
                                      }

                                      const roadWidthPx = (adjoiningConfig.roadCorridorWidth || 12) * pixelsPerMeter;
                                      const r1 = { x: p1.x + nx * roadWidthPx, y: p1.y + ny * roadWidthPx };
                                      const r2 = { x: p2.x + nx * roadWidthPx, y: p2.y + ny * roadWidthPx };

                                      const roadMidX = (midX + (r1.x + r2.x) / 2) / 2;
                                      const roadMidY = (midY + (r1.y + r2.y) / 2) / 2;

                                      let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
                                      if (angleDeg > 90 || angleDeg < -90) angleDeg += 180;

                                      return (
                                        <g key={`road-${legIdx}`}>
                                          <line x1={r1.x} y1={r1.y} x2={r2.x} y2={r2.y} stroke="#64748b" strokeWidth="1.2" strokeDasharray="5 3" />
                                          <g transform={`translate(${roadMidX}, ${roadMidY}) rotate(${angleDeg})`}>
                                            <text
                                              y={0}
                                              textAnchor="middle"
                                              dominantBaseline="central"
                                              fontSize="7.5"
                                              fontWeight="bold"
                                              fill="#475569"
                                              style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3px' }}
                                            >
                                              ═ {adjoiningConfig.roadCorridorLabel.toUpperCase()} ═
                                            </text>
                                          </g>
                                        </g>
                                      );
                                    })}
                                  </g>
                                );
                              })()}
                            </g>
                          )}

                          {/* 2. Parcel Vector Polygons & Shading */}
                          {(() => {
                            const strokeDash = styleConfig.boundaryLineStyle === 'dashed' ? '6 4' : styleConfig.boundaryLineStyle === 'dashdot' ? '6 3 2 3' : undefined;
                            const fillStyle = styleConfig.fillOpacity > 0
                              ? (styleConfig.hatchPattern === 'diagonal' ? 'url(#svg-diag-hatch)' : styleConfig.hatchPattern === 'cross' ? 'url(#svg-cross-hatch)' : styleConfig.fillColor)
                              : 'none';
                            const fillOpacityVal = styleConfig.hatchPattern === 'diagonal' || styleConfig.hatchPattern === 'cross' ? 1.0 : styleConfig.fillOpacity;

                            return targetParcels.map(parcel => {
                              const comp = computeParcel(parcel, points);
                              if (!comp || comp.vertices.length < 3) return null;

                              const polyPoints = comp.vertices
                                .map(v => `${toSvgX(v.easting)},${toSvgY(v.northing)}`)
                                .join(' ');

                              return (
                                <g key={parcel.id} className="svg-parcel-polygon-group">
                                  {/* Shaded Polygon Fill & Stroke */}
                                  <polygon
                                    points={polyPoints}
                                    fill={fillStyle}
                                    fillOpacity={fillOpacityVal}
                                    stroke={styleConfig.boundaryColor}
                                    strokeWidth={(styleConfig.boundaryLineWidth || 0.6) * 2.8}
                                    strokeDasharray={strokeDash}
                                    strokeLinejoin="round"
                                  />
                                </g>
                              );
                            });
                          })()}

                          {/* 3. De-Conflicted Parcel Centroid Badges (Interactive Drag & Transform) */}
                          {resolvedLayout.parcelBadges.map(badge => {
                            const entityKey = `parcel_${badge.parcelId}`;
                            const tf = getTransform(entityKey);
                            if (tf.hidden) return null;
                            const isSelected = selectedElementId === entityKey;
                            const scale = tf.scale || 1.0;
                            const rot = tf.rotation || 0;

                            return (
                              <g
                                key={badge.id}
                                className={`svg-parcel-badge-group ${isSelected ? 'selected' : ''}`}
                                style={{ cursor: tf.locked ? 'default' : 'move' }}
                                transform={`translate(${badge.x}, ${badge.y}) rotate(${rot}) scale(${scale}) translate(${-badge.x}, ${-badge.y})`}
                                onMouseDown={(e) => handleElementMouseDown(entityKey, e)}
                              >
                                {/* Dynamic Leader line when displaced */}
                                {badge.hasLeaderLine && (
                                  <line
                                    x1={badge.anchorX}
                                    y1={badge.anchorY}
                                    x2={badge.x}
                                    y2={badge.y}
                                    stroke="#64748b"
                                    strokeWidth="1.2"
                                    strokeDasharray="3 2"
                                  />
                                )}

                                {/* Selection Bounding Box & Handles */}
                                {isSelected && (
                                  <g className="element-selection-gizmo">
                                    <rect
                                      x={badge.x - 42}
                                      y={badge.y - 20}
                                      width={84}
                                      height={40}
                                      fill="rgba(56,189,248,0.08)"
                                      stroke="#38bdf8"
                                      strokeWidth="1.2"
                                      strokeDasharray="3 2"
                                      rx="4"
                                    />
                                    {/* Scale Handle */}
                                    <rect
                                      x={badge.x + 38}
                                      y={badge.y + 16}
                                      width="8"
                                      height="8"
                                      fill="#38bdf8"
                                      stroke="#ffffff"
                                      strokeWidth="1"
                                      cursor="nwse-resize"
                                      onMouseDown={(e) => handleScaleHandleMouseDown(entityKey, e)}
                                    />
                                    {/* Rotate Handle */}
                                    <line x1={badge.x} y1={badge.y - 20} x2={badge.x} y2={badge.y - 30} stroke="#38bdf8" strokeWidth="1" />
                                    <circle
                                      cx={badge.x}
                                      cy={badge.y - 30}
                                      r="4.5"
                                      fill="#38bdf8"
                                      stroke="#ffffff"
                                      strokeWidth="1"
                                      cursor="crosshair"
                                      onMouseDown={(e) => handleRotateHandleMouseDown(entityKey, e)}
                                    />
                                  </g>
                                )}

                                <text
                                  x={badge.x}
                                  y={badge.y - (isSinglePlot ? 5 : 2)}
                                  textAnchor="middle"
                                  fontWeight="bold"
                                  fontSize={isSinglePlot ? `${styleConfig.titleFontSize * 1.2}` : `${styleConfig.titleFontSize * 0.9}`}
                                  fill="#0f172a"
                                  style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3.5px', strokeLinecap: 'round', strokeLinejoin: 'round' }}
                                >
                                  {badge.plotNumber}
                                </text>
                                {badge.ownerName && isSinglePlot && (
                                  <text
                                    x={badge.x}
                                    y={badge.y + 7}
                                    textAnchor="middle"
                                    fontSize={`${styleConfig.titleFontSize * 0.8}`}
                                    fill="#475569"
                                    style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '2.5px', strokeLinecap: 'round', strokeLinejoin: 'round' }}
                                  >
                                    {badge.ownerName}
                                  </text>
                                )}
                                <text
                                  x={badge.x}
                                  y={badge.y + (isSinglePlot ? 19 : 9)}
                                  textAnchor="middle"
                                  fontWeight="bold"
                                  fontSize={isSinglePlot ? `${styleConfig.areaFontSize * 1.1}` : `${styleConfig.areaFontSize * 0.9}`}
                                  fill={styleConfig.boundaryColor}
                                  fontFamily="monospace"
                                  style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3px', strokeLinecap: 'round', strokeLinejoin: 'round' }}
                                >
                                  {badge.areaText}
                                </text>
                              </g>
                            );
                          })}

                          {/* 4. Boundary Leg Bearings & Distances (Interactive Drag & Transform) */}
                          {resolvedLayout.boundaryDimensions.map(dim => {
                            const entityKey = `dim_${dim.key}`;
                            const tf = getTransform(entityKey);
                            if (tf.hidden) return null;
                            const isSelected = selectedElementId === entityKey;
                            const scale = tf.scale || 1.0;
                            const totalRot = dim.angleDeg + (tf.rotation || 0);

                            return (
                              <g
                                key={dim.key}
                                transform={`translate(${dim.x}, ${dim.y}) rotate(${totalRot}) scale(${scale})`}
                                style={{ cursor: tf.locked ? 'default' : 'move' }}
                                onMouseDown={(e) => handleElementMouseDown(entityKey, e)}
                              >
                                {isSelected && (
                                  <g className="element-selection-gizmo">
                                    <rect
                                      x={-34}
                                      y={-12}
                                      width={68}
                                      height={28}
                                      fill="rgba(56,189,248,0.08)"
                                      stroke="#38bdf8"
                                      strokeWidth="1.2"
                                      strokeDasharray="3 2"
                                      rx="3"
                                    />
                                    <rect
                                      x={30}
                                      y={12}
                                      width="7"
                                      height="7"
                                      fill="#38bdf8"
                                      stroke="#ffffff"
                                      strokeWidth="1"
                                      cursor="nwse-resize"
                                      onMouseDown={(e) => handleScaleHandleMouseDown(entityKey, e)}
                                    />
                                    <line x1={0} y1={-12} x2={0} y2={-20} stroke="#38bdf8" strokeWidth="1" />
                                    <circle
                                      cx={0}
                                      cy={-20}
                                      r="4"
                                      fill="#38bdf8"
                                      stroke="#ffffff"
                                      strokeWidth="1"
                                      cursor="crosshair"
                                      onMouseDown={(e) => handleRotateHandleMouseDown(entityKey, e)}
                                    />
                                  </g>
                                )}

                                <text
                                  x={0}
                                  y={-1.5}
                                  textAnchor="middle"
                                  dominantBaseline="auto"
                                  fontSize={`${styleConfig.bearingFontSize * 1.15}`}
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                  fill="#0f172a"
                                  style={{
                                    paintOrder: 'stroke fill',
                                    stroke: '#ffffff',
                                    strokeWidth: '3.5px',
                                    strokeLinecap: 'round',
                                    strokeLinejoin: 'round'
                                  }}
                                >
                                  {dim.bearingStr}
                                </text>
                                <text
                                  x={0}
                                  y={7.5}
                                  textAnchor="middle"
                                  dominantBaseline="auto"
                                  fontSize={`${styleConfig.bearingFontSize * 1.15}`}
                                  fontWeight="bold"
                                  fontFamily="monospace"
                                  fill="#0f172a"
                                  style={{
                                    paintOrder: 'stroke fill',
                                    stroke: '#ffffff',
                                    strokeWidth: '3.5px',
                                    strokeLinecap: 'round',
                                    strokeLinejoin: 'round'
                                  }}
                                >
                                  {dim.distStr}
                                </text>
                              </g>
                            );
                          })}

                          {/* 5. Beacon Symbols & De-Conflicted Labels (Interactive Drag & Transform) */}
                          {targetPoints.map(pt => {
                            const bx = toSvgX(pt.easting);
                            const by = toSvgY(pt.northing);
                            const bRad = (styleConfig.beaconSize || 1.4) * 2.2;
                            const entityKey = `beacon_${pt.id}`;
                            const tf = getTransform(entityKey);
                            const lbl = resolvedLayout.beaconLabels.find(l => l.pointId === pt.id);
                            const isSelected = selectedElementId === entityKey;

                            if (tf.hidden) return null;

                            return (
                              <g key={pt.id} className="svg-beacon-group">
                                {pt.isControl ? (
                                  <polygon
                                    points={`${bx},${by - (bRad * 1.5)} ${bx + (bRad * 1.2)},${by + (bRad * 0.9)} ${bx - (bRad * 1.2)},${by + (bRad * 0.9)}`}
                                    fill={styleConfig.controlColor || '#f59e0b'}
                                    stroke="#ffffff"
                                    strokeWidth="1"
                                  />
                                ) : (
                                  <>
                                    <circle cx={bx} cy={by} r={bRad} fill={styleConfig.beaconColor || '#dc2626'} stroke="#ffffff" strokeWidth="0.8" />
                                    <line x1={bx - bRad} y1={by} x2={bx + bRad} y2={by} stroke="#ffffff" strokeWidth="0.6" />
                                    <line x1={bx} y1={by - bRad} x2={bx} y2={by + bRad} stroke="#ffffff" strokeWidth="0.6" />
                                  </>
                                )}

                                {lbl && (
                                  <g
                                    style={{ cursor: tf.locked ? 'default' : 'move' }}
                                    transform={`translate(${lbl.x}, ${lbl.y}) rotate(${tf.rotation || 0}) scale(${tf.scale || 1.0}) translate(${-lbl.x}, ${-lbl.y})`}
                                    onMouseDown={(e) => handleElementMouseDown(entityKey, e)}
                                  >
                                    {lbl.hasLeaderLine && (
                                      <line
                                        x1={lbl.anchorX}
                                        y1={lbl.anchorY}
                                        x2={lbl.x}
                                        y2={lbl.y}
                                        stroke="#64748b"
                                        strokeWidth="1"
                                        strokeDasharray="2 2"
                                      />
                                    )}

                                    {isSelected && (
                                      <g className="element-selection-gizmo">
                                        <rect
                                          x={lbl.x - 18}
                                          y={lbl.y - 14}
                                          width={36}
                                          height={22}
                                          fill="rgba(56,189,248,0.08)"
                                          stroke="#38bdf8"
                                          strokeWidth="1.2"
                                          strokeDasharray="3 2"
                                          rx="3"
                                        />
                                        <rect
                                          x={lbl.x + 14}
                                          y={lbl.y + 4}
                                          width="6"
                                          height="6"
                                          fill="#38bdf8"
                                          stroke="#ffffff"
                                          strokeWidth="0.8"
                                          cursor="nwse-resize"
                                          onMouseDown={(e) => handleScaleHandleMouseDown(entityKey, e)}
                                        />
                                        <line x1={lbl.x} y1={lbl.y - 14} x2={lbl.x} y2={lbl.y - 22} stroke="#38bdf8" strokeWidth="1" />
                                        <circle
                                          cx={lbl.x}
                                          cy={lbl.y - 22}
                                          r="3.5"
                                          fill="#38bdf8"
                                          stroke="#ffffff"
                                          strokeWidth="0.8"
                                          cursor="crosshair"
                                          onMouseDown={(e) => handleRotateHandleMouseDown(entityKey, e)}
                                        />
                                      </g>
                                    )}

                                    <text
                                      x={lbl.x}
                                      y={lbl.y}
                                      textAnchor={lbl.textAnchor}
                                      fontSize={`${styleConfig.beaconFontSize * 1.25}`}
                                      fontWeight="bold"
                                      fill="#0f172a"
                                      style={{
                                        paintOrder: 'stroke fill',
                                        stroke: '#ffffff',
                                        strokeWidth: '3.5px',
                                        strokeLinecap: 'round',
                                        strokeLinejoin: 'round'
                                      }}
                                    >
                                      {pt.id}
                                    </text>
                                  </g>
                                )}
                              </g>
                            );
                          })}
                        </svg>

                        {/* Top-Right Floating Coordinate Table (when layout is compact_split) */}
                        {showCoordinateTable && layoutArrangement.coordTablePosition === 'top_right' && (
                          <div style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            background: 'rgba(255, 255, 255, 0.92)',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            padding: '4px 6px',
                            fontSize: '7.5px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.06)'
                          }}>
                            <div style={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '2px' }}>COORDINATE SCHEDULE</div>
                            <table>
                              <tbody>
                                {targetPoints.slice(0, 6).map(pt => (
                                  <tr key={pt.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ fontWeight: 600, paddingRight: '4px' }}>{pt.id}</td>
                                    <td style={{ paddingRight: '4px', fontFamily: 'monospace' }}>{pt.easting.toFixed(2)}E</td>
                                    <td style={{ fontFamily: 'monospace' }}>{pt.northing.toFixed(2)}N</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* North Arrow with Dynamic Positioning */}
                        {!getTransform('elem_north_arrow').hidden && (
                          <div
                            className={`tdp-north-arrow ${selectedElementId === 'elem_north_arrow' ? 'selected' : ''}`}
                            onClick={() => setSelectedElementId('elem_north_arrow')}
                            style={{
                              top: layoutArrangement.northArrowPosition === 'bottom_right' ? 'auto' : '10px',
                              bottom: layoutArrangement.northArrowPosition === 'bottom_right' ? '14px' : 'auto',
                              right: layoutArrangement.northArrowPosition === 'top_left' ? 'auto' : '12px',
                              left: layoutArrangement.northArrowPosition === 'top_left' ? '12px' : 'auto',
                              cursor: 'pointer'
                            }}
                          >
                            <div className="arrow-head">N</div>
                            <div className="arrow-stem" />
                            <div className="arrow-label">GRID NORTH</div>
                          </div>
                        )}

                        {/* Dynamic Metric Bar Scale with Dynamic Positioning */}
                        {!getTransform('elem_scale_bar').hidden && (
                          <div
                            className={`tdp-scale-bar-box ${selectedElementId === 'elem_scale_bar' ? 'selected' : ''}`}
                            onClick={() => setSelectedElementId('elem_scale_bar')}
                            style={{
                              left: layoutArrangement.scaleBarPosition === 'bottom_right' ? 'auto' : '12px',
                              right: layoutArrangement.scaleBarPosition === 'bottom_right' ? '12px' : 'auto',
                              top: layoutArrangement.scaleBarPosition === 'top_left' ? '10px' : 'auto',
                              bottom: layoutArrangement.scaleBarPosition === 'top_left' ? 'auto' : '8px',
                              cursor: 'pointer'
                            }}
                          >
                            <div className="scale-bar-graphic" style={{ width: `${Math.min(160, Math.max(40, scaleBarPx))}px` }}>
                              <div className="scale-bar-fill" />
                            </div>
                            <div className="scale-bar-text">
                              <span>0</span>
                              <span>{scaleBarMeters / 2}m</span>
                              <span>{scaleBarMeters} METRES</span>
                            </div>
                            <div className="scale-ratio-text">SCALE 1:{effectiveScaleRatio}</div>
                          </div>
                        )}
                      </div>

                      {/* Right Sidebar Column Mode (when layout is right_sidebar) */}
                      {(layoutArrangement.coordTablePosition === 'right_column' || layoutArrangement.sealBoxPosition === 'right_column') && (
                        <div style={{
                          width: '180px',
                          borderLeft: '1.5px solid #0f172a',
                          padding: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          background: '#fafafa',
                          fontSize: '8px'
                        }}>
                          {showCoordinateTable && !getTransform('elem_coord_table').hidden && layoutArrangement.coordTablePosition === 'right_column' && (
                            <div
                              className="tdp-coord-schedule-table"
                              style={{ width: '100%', cursor: 'pointer' }}
                              onClick={() => setSelectedElementId('elem_coord_table')}
                            >
                              <div className="schedule-table-title">COORDINATE SCHEDULE</div>
                              <table>
                                <thead>
                                  <tr>
                                    <th>ID</th>
                                    <th>EAST (m)</th>
                                    <th>NORTH (m)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {targetPoints.map(pt => (
                                    <tr key={pt.id}>
                                      <td>{pt.id}</td>
                                      <td>{pt.easting.toFixed(2)}</td>
                                      <td>{pt.northing.toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {showSealBox && !getTransform('elem_seal_box').hidden && layoutArrangement.sealBoxPosition === 'right_column' && (
                            <div
                              className="tdp-seal-block"
                              style={{ width: '100%', position: 'relative', cursor: 'pointer' }}
                              onClick={() => setSelectedElementId('elem_seal_box')}
                            >
                              <div className="cert-title">SURVEYOR'S CERTIFICATION</div>
                              <div className="cert-body" style={{ fontSize: '7px', lineHeight: 1.2 }}>
                                Certified surveyed by me or under my direct supervision.
                              </div>
                              <div className="surveyor-name" style={{ marginTop: '4px' }}>
                                {(currentUser?.fullName || project.surveyorName).toUpperCase()}
                              </div>
                              <div style={{ fontSize: '8px', color: '#10b981', fontWeight: 600 }}>
                                {currentUser?.surconNumber || project.surveyorNumber || 'SURCON REG.'}
                              </div>
                              <div className="survey-firm">{(activeOrg?.name || project.surveyFirm).toUpperCase()}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Standard Bottom Footer (when not right sidebar) */}
                    {layoutArrangement.coordTablePosition !== 'right_column' && layoutArrangement.sealBoxPosition !== 'right_column' && (
                      <div className="tdp-plan-footer">
                        {showCoordinateTable && !getTransform('elem_coord_table').hidden && layoutArrangement.coordTablePosition !== 'hidden' && layoutArrangement.coordTablePosition !== 'top_right' && (
                          <div
                            className="tdp-coord-schedule-table"
                            style={{
                              order: layoutArrangement.coordTablePosition === 'bottom_right' ? 2 : 1,
                              cursor: 'pointer'
                            }}
                            onClick={() => setSelectedElementId('elem_coord_table')}
                          >
                            <div className="schedule-table-title">COORDINATE SCHEDULE (MINNA DATUM)</div>
                            <table>
                              <thead>
                                <tr>
                                  <th>BEACON ID</th>
                                  <th>EASTING (m)</th>
                                  <th>NORTHING (m)</th>
                                  <th>ORIGIN</th>
                                </tr>
                              </thead>
                              <tbody>
                                {targetPoints.map(pt => (
                                  <tr key={pt.id}>
                                    <td>{pt.id}</td>
                                    <td>{pt.easting.toFixed(3)}</td>
                                    <td>{pt.northing.toFixed(3)}</td>
                                    <td>{pt.isControl ? 'CONTROL' : 'CONCRETE'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {showSealBox && !getTransform('elem_seal_box').hidden && (
                          <div
                            className="tdp-seal-block"
                            style={{
                              order: layoutArrangement.sealBoxPosition === 'bottom_left' ? 1 : 2,
                              width: layoutArrangement.sealBoxPosition === 'bottom_center' ? '98%' : undefined,
                              cursor: 'pointer'
                            }}
                            onClick={() => setSelectedElementId('elem_seal_box')}
                          >
                            <div className="cert-title">SURVEYOR'S CERTIFICATION</div>
                            <div className="cert-body">
                              I hereby certify that this plan was surveyed by me or under my direct supervision on the ground in accordance with the Survey Regulations.
                            </div>

                            {currentUser?.signatureUrl && (
                              <div className="tdp-sig-container" style={{ margin: '4px 0 2px' }}>
                                <img src={currentUser.signatureUrl} alt="Signature" style={{ height: '24px', maxWidth: '120px', objectFit: 'contain' }} />
                              </div>
                            )}

                            <div className="surveyor-name">
                              {currentUser?.title ? `${currentUser.title} ` : 'SURV. '}
                              {(currentUser?.fullName || project.surveyorName).toUpperCase()}
                            </div>
                            <div style={{ fontSize: '9px', fontWeight: 600, color: '#10b981', margin: '1px 0' }}>
                              {currentUser?.surconNumber || project.surveyorNumber || 'SURCON REG.'}
                            </div>
                            <div className="survey-firm">{(activeOrg?.name || project.surveyFirm).toUpperCase()}</div>
                            <div className="survey-date">DATE: {project.date}</div>

                            {currentUser?.digitalSealUrl || activeOrg?.officialSealUrl ? (
                              <div
                                className="tdp-seal-stamp-container"
                                style={{
                                  position: 'absolute',
                                  right: '6px',
                                  bottom: '6px',
                                  width: '75px',
                                  height: '52px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  overflow: 'hidden'
                                }}
                              >
                                <img
                                  src={currentUser?.digitalSealUrl || activeOrg?.officialSealUrl}
                                  alt="Official Seal"
                                  style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))'
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="surcon-seal-box">
                                <ShieldCheck size={18} className="text-muted" />
                                <span>SURCON SEAL</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );

  if (isViewMode) {
    return (
      <div className="tdp-studio-page-container" style={{ width: '100%', height: '100%', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#060a14' }}>
        {studioContent}
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content tdp-modal-studio" style={{ maxWidth: '1280px', width: '96vw', height: '90vh' }}>
        {studioContent}
      </div>
    </div>
  );
};
