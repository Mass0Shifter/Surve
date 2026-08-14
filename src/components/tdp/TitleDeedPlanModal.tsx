import React, { useState } from 'react';
import { ProjectMetadata, CoordinatePoint, Parcel } from '../../engine/types';
import {
  generateTitleDeedPlanPDF,
  TdpRenderOptions,
  TdpStyleConfig,
  TdpAdjoiningConfig,
  TdpLayoutArrangement,
  DEFAULT_TDP_STYLE,
  DEFAULT_TDP_LAYOUT,
  TDP_THEME_PRESETS,
  TDP_LAYOUT_PRESETS
} from '../../engine/pdf/tdpGenerator';
import { determineCadastralSheets } from '../../engine/cadastral/sheetIndex';
import { computeParcelSetback } from '../../engine/cadastral/subdivision';
import { computeParcel, computeExtents } from '../../engine/cogo';
import { UserProfile } from '../../engine/auth/authTypes';
import { Organization } from '../../engine/organization/orgTypes';
import {
  FileText,
  Download,
  Printer,
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
  Type
} from 'lucide-react';

interface TitleDeedPlanModalProps {
  project: ProjectMetadata;
  points: CoordinatePoint[];
  parcels: Parcel[];
  currentUser?: UserProfile | null;
  activeOrg?: Organization | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TitleDeedPlanModal: React.FC<TitleDeedPlanModalProps> = ({
  project,
  points,
  parcels,
  currentUser,
  activeOrg,
  isOpen,
  onClose
}) => {
  // Navigation Tabs: 'specs' (Plan Specs & Layout) | 'design' (Design & Template Studio)
  const [activeTab, setActiveTab] = useState<'specs' | 'design'>('specs');

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

  // Preview Zoom Level (default 0.68 for perfect A4 portrait fit)
  const [previewZoom, setPreviewZoom] = useState<number>(0.68);

  if (!isOpen) return null;

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

  const toSvgX = (easting: number) => svgWidth / 2 + (easting - centE) * pixelsPerMeter;
  const toSvgY = (northing: number) => svgHeight / 2 - (northing - centN) * pixelsPerMeter;

  // Scale bar metrics
  const scaleBarMeters = effectiveScaleRatio <= 250 ? 10 : effectiveScaleRatio <= 500 ? 20 : effectiveScaleRatio <= 1000 ? 50 : effectiveScaleRatio <= 2000 ? 100 : 200;
  const scaleBarPx = scaleBarMeters * pixelsPerMeter;

  // Dynamic Grid step
  const gridStep = effectiveScaleRatio <= 250 ? 10 : effectiveScaleRatio <= 500 ? 25 : effectiveScaleRatio <= 1000 ? 50 : 100;
  const gStartE = Math.floor((centE - (svgWidth / (2 * pixelsPerMeter))) / gridStep) * gridStep;
  const gEndE = Math.ceil((centE + (svgWidth / (2 * pixelsPerMeter))) / gridStep) * gridStep;
  const gStartN = Math.floor((centN - (svgHeight / (2 * pixelsPerMeter))) / gridStep) * gridStep;
  const gEndN = Math.ceil((centN + (svgHeight / (2 * pixelsPerMeter))) / gridStep) * gridStep;

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
      layout: layoutArrangement
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
      layout: layoutArrangement
    };

    // Generate crisp vector PDF and trigger clean print window
    const doc = generateTitleDeedPlanPDF(project, points, parcels, opts);
    doc.autoPrint();
    const blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content tdp-modal-studio">
        {/* Modal Top Header */}
        <div className="modal-header">
          <div className="modal-title">
            <FileText size={18} className="text-emerald" />
            <span>Title Deed Plan (TDP) Print Studio & Cadastral Suite</span>
          </div>
          <div className="header-actions-group">
            <button className="btn-secondary-sm" onClick={handlePrint} title="Print Plan (Pure Vector Clean White)">
              <Printer size={14} />
              <span>Print</span>
            </button>
            <button className="btn-primary-sm" onClick={handleDownloadPDF} title="Download Vector PDF (SURCON / FCDA Print-Ready)">
              <Download size={14} />
              <span>Export PDF</span>
            </button>
            <button className="icon-btn" onClick={onClose}>✕</button>
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
          </div>

          {/* Right Live Print Preview Stage with Zoom Scale Controls */}
          <div className="tdp-preview-stage">
            {/* Preview Zoom Controls Floating Bar */}
            <div className="preview-zoom-bar">
              <button
                className="icon-btn"
                title="Zoom Out Preview"
                onClick={() => setPreviewZoom(z => Math.max(0.4, z - 0.1))}
              >
                <ZoomOut size={13} />
              </button>
              <span className="zoom-text">{(previewZoom * 100).toFixed(0)}%</span>
              <button
                className="icon-btn"
                title="Zoom In Preview"
                onClick={() => setPreviewZoom(z => Math.min(1.5, z + 0.1))}
              >
                <ZoomIn size={13} />
              </button>
              <button
                className="btn-secondary-xs"
                title="Fit Page to View"
                onClick={() => setPreviewZoom(0.68)}
              >
                <Maximize2 size={12} className="inline-icon" />
                <span>Fit</span>
              </button>
            </div>

            <div className="tdp-canvas-scaler" style={{ transform: `scale(${previewZoom})` }}>
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

                          {/* 2. Parcel Vector Polygons & Labels */}
                          {(() => {
                            const renderedEdges = new Set<string>();
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

                              const centSvgX = comp.vertices.reduce((s, v) => s + toSvgX(v.easting), 0) / comp.vertices.length;
                              const centSvgY = comp.vertices.reduce((s, v) => s + toSvgY(v.northing), 0) / comp.vertices.length;

                              return (
                                <g key={parcel.id} className="svg-parcel-group">
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

                                  {/* Centroid Badge */}
                                  <text
                                    x={centSvgX}
                                    y={centSvgY - (isSinglePlot ? 5 : 2)}
                                    textAnchor="middle"
                                    fontWeight="bold"
                                    fontSize={isSinglePlot ? `${styleConfig.titleFontSize * 1.2}` : `${styleConfig.titleFontSize * 0.9}`}
                                    fill="#0f172a"
                                    style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3.5px', strokeLinecap: 'round', strokeLinejoin: 'round' }}
                                  >
                                    {parcel.plotNumber}
                                  </text>
                                  {parcel.ownerName && isSinglePlot && (
                                    <text
                                      x={centSvgX}
                                      y={centSvgY + 7}
                                      textAnchor="middle"
                                      fontSize={`${styleConfig.titleFontSize * 0.8}`}
                                      fill="#475569"
                                      style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '2.5px', strokeLinecap: 'round', strokeLinejoin: 'round' }}
                                    >
                                      {parcel.ownerName}
                                    </text>
                                  )}
                                  <text
                                    x={centSvgX}
                                    y={centSvgY + (isSinglePlot ? 19 : 9)}
                                    textAnchor="middle"
                                    fontWeight="bold"
                                    fontSize={isSinglePlot ? `${styleConfig.areaFontSize * 1.1}` : `${styleConfig.areaFontSize * 0.9}`}
                                    fill={styleConfig.boundaryColor}
                                    fontFamily="monospace"
                                    style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3px', strokeLinecap: 'round', strokeLinejoin: 'round' }}
                                  >
                                    {comp.areaSquareMeters.toFixed(2)} m² ({comp.areaHectares.toFixed(4)} Ha)
                                  </text>

                                  {/* Leg Bearings & Distances */}
                                  {comp.legs.map((leg, lidx) => {
                                    const edgeKey = [leg.fromPoint.id, leg.toPoint.id].sort().join('--');
                                    if (renderedEdges.has(edgeKey)) return null;
                                    renderedEdges.add(edgeKey);

                                    const p1 = { x: toSvgX(leg.fromPoint.easting), y: toSvgY(leg.fromPoint.northing) };
                                    const p2 = { x: toSvgX(leg.toPoint.easting), y: toSvgY(leg.toPoint.northing) };

                                    const dx = p2.x - p1.x;
                                    const dy = p2.y - p1.y;
                                    const len = Math.hypot(dx, dy);
                                    if (len < 1) return null;

                                    let angleDeg = Math.atan2(dy, dx) * (180 / Math.PI);
                                    if (angleDeg > 90 || angleDeg < -90) {
                                      angleDeg += 180;
                                    }

                                    const midX = (p1.x + p2.x) / 2;
                                    const midY = (p1.y + p2.y) / 2;

                                    let normX = -dy / len;
                                    let normY = dx / len;
                                    const toCentX = centSvgX - midX;
                                    const toCentY = centSvgY - midY;
                                    if (normX * toCentX + normY * toCentY > 0) {
                                      normX = -normX;
                                      normY = -normY;
                                    }

                                    const offsetPx = 5.0;
                                    const textCenterX = midX + normX * offsetPx;
                                    const textCenterY = midY + normY * offsetPx;

                                    return (
                                      <g key={lidx} transform={`translate(${textCenterX}, ${textCenterY}) rotate(${angleDeg})`}>
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
                                          {leg.bearing.formatted}
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
                                          {leg.distance.toFixed(2)}m
                                        </text>
                                      </g>
                                    );
                                  })}
                                </g>
                              );
                            });
                          })()}

                          {/* 3. Beacon / Control Pillar Symbols & Labels */}
                          {targetPoints.map(pt => {
                            const bx = toSvgX(pt.easting);
                            const by = toSvgY(pt.northing);
                            const bRad = (styleConfig.beaconSize || 1.4) * 2.2;

                            let offX = 6;
                            let offY = -4;
                            let textAnchor: 'start' | 'middle' | 'end' = 'start';

                            if (targetParcels.length > 0) {
                              for (const parcel of targetParcels) {
                                const idx = parcel.pointIds.indexOf(pt.id);
                                if (idx !== -1) {
                                  const comp = computeParcel(parcel, points);
                                  if (comp && comp.vertices.length >= 3) {
                                    const n = parcel.pointIds.length;
                                    const vCentX = comp.vertices.reduce((s, v) => s + toSvgX(v.easting), 0) / comp.vertices.length;
                                    const vCentY = comp.vertices.reduce((s, v) => s + toSvgY(v.northing), 0) / comp.vertices.length;

                                    const prevId = parcel.pointIds[(idx - 1 + n) % n];
                                    const nextId = parcel.pointIds[(idx + 1) % n];
                                    const prevPt = points.find(p => p.id === prevId);
                                    const nextPt = points.find(p => p.id === nextId);

                                    if (prevPt && nextPt) {
                                      const px = toSvgX(prevPt.easting);
                                      const py = toSvgY(prevPt.northing);
                                      const nx = toSvgX(nextPt.easting);
                                      const ny = toSvgY(nextPt.northing);

                                      const v1x = bx - px;
                                      const v1y = by - py;
                                      const v2x = nx - bx;
                                      const v2y = ny - by;
                                      const l1 = Math.hypot(v1x, v1y) || 1;
                                      const l2 = Math.hypot(v2x, v2y) || 1;

                                      const u1x = v1x / l1;
                                      const u1y = v1y / l1;
                                      const u2x = v2x / l2;
                                      const u2y = v2y / l2;

                                      let normX = -(u1y + u2y);
                                      let normY = (u1x + u2x);
                                      let normL = Math.hypot(normX, normY);

                                      if (normL < 0.01) {
                                        normX = bx - vCentX;
                                        normY = by - vCentY;
                                        normL = Math.hypot(normX, normY) || 1;
                                      }

                                      normX /= normL;
                                      normY /= normL;

                                      if (normX * (bx - vCentX) + normY * (by - vCentY) < 0) {
                                        normX = -normX;
                                        normY = -normY;
                                      }

                                      const dist = 9;
                                      offX = normX * dist;
                                      offY = normY * dist + (normY < -0.2 ? -2 : normY > 0.2 ? 6 : 2);
                                      textAnchor = normX < -0.3 ? 'end' : normX > 0.3 ? 'start' : 'middle';
                                      break;
                                    }
                                  }
                                }
                              }
                            }

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
                                <text
                                  x={bx + offX}
                                  y={by + offY}
                                  textAnchor={textAnchor}
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
                        <div
                          className="tdp-north-arrow"
                          style={{
                            top: layoutArrangement.northArrowPosition === 'bottom_right' ? 'auto' : '10px',
                            bottom: layoutArrangement.northArrowPosition === 'bottom_right' ? '14px' : 'auto',
                            right: layoutArrangement.northArrowPosition === 'top_left' ? 'auto' : '12px',
                            left: layoutArrangement.northArrowPosition === 'top_left' ? '12px' : 'auto'
                          }}
                        >
                          <div className="arrow-head">N</div>
                          <div className="arrow-stem" />
                          <div className="arrow-label">GRID NORTH</div>
                        </div>

                        {/* Dynamic Metric Bar Scale with Dynamic Positioning */}
                        <div
                          className="tdp-scale-bar-box"
                          style={{
                            left: layoutArrangement.scaleBarPosition === 'bottom_right' ? 'auto' : '12px',
                            right: layoutArrangement.scaleBarPosition === 'bottom_right' ? '12px' : 'auto',
                            top: layoutArrangement.scaleBarPosition === 'top_left' ? '10px' : 'auto',
                            bottom: layoutArrangement.scaleBarPosition === 'top_left' ? 'auto' : '8px'
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
                          {showCoordinateTable && layoutArrangement.coordTablePosition === 'right_column' && (
                            <div className="tdp-coord-schedule-table" style={{ width: '100%' }}>
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

                          {showSealBox && layoutArrangement.sealBoxPosition === 'right_column' && (
                            <div className="tdp-seal-block" style={{ width: '100%', position: 'relative' }}>
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
                        {showCoordinateTable && layoutArrangement.coordTablePosition !== 'hidden' && layoutArrangement.coordTablePosition !== 'top_right' && (
                          <div
                            className="tdp-coord-schedule-table"
                            style={{
                              order: layoutArrangement.coordTablePosition === 'bottom_right' ? 2 : 1
                            }}
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

                        {showSealBox && (
                          <div
                            className="tdp-seal-block"
                            style={{
                              order: layoutArrangement.sealBoxPosition === 'bottom_left' ? 1 : 2,
                              width: layoutArrangement.sealBoxPosition === 'bottom_center' ? '98%' : undefined
                            }}
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
    </div>
  );
};
