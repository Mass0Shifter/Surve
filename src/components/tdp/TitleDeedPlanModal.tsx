import React, { useState } from 'react';
import { ProjectMetadata, CoordinatePoint, Parcel } from '../../engine/types';
import { generateTitleDeedPlanPDF, TdpRenderOptions } from '../../engine/pdf/tdpGenerator';
import { determineCadastralSheets } from '../../engine/cadastral/sheetIndex';
import { computeParcelSetback } from '../../engine/cadastral/subdivision';
import { computeParcel, computeExtents } from '../../engine/cogo';
import { UserProfile } from '../../engine/auth/authTypes';
import { Organization } from '../../engine/organization/orgTypes';
import { FileText, Download, Printer, Settings2, ShieldCheck, Grid, Layers, Compass, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

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
      surveyorTitle: currentUser?.title
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
      surveyorTitle: currentUser?.title
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
            <button className="btn-primary-sm" onClick={handleDownloadPDF} title="Download High-Resolution Vector PDF">
              <Download size={14} />
              <span>Download Vector PDF</span>
            </button>
            <button className="icon-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="tdp-studio-body">
          {/* Left Controls Customizer Sidebar */}
          <div className="tdp-customizer-sidebar">
            <div className="sidebar-section-title">
              <Settings2 size={14} className="text-emerald" />
              <span>Plan Layout & Type</span>
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
                <div className="multi-parcel-picker-box" style={{ maxHeight: '120px', overflowY: 'auto', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '6px', border: '1px solid rgba(148, 163, 184, 0.1)', padding: '6px' }}>
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
                    {/* Plan Header */}
                    <div className="tdp-plan-header">
                      <div className="tdp-plan-title">TITLE DEED PLAN</div>
                      <div className="tdp-plan-subtitle">
                        {isSinglePlot && selectedParcel
                          ? `PLAN SHOWING ${selectedParcel.plotNumber} ${selectedParcel.ownerName ? `(ALLOTTEE: ${selectedParcel.ownerName.toUpperCase()})` : ''}`
                          : `SURVEY PLAN OF ${project.title.toUpperCase()}`}
                      </div>
                      <div className="tdp-plan-location">
                        SITUATED AT: {project.location.toUpperCase()} | DATUM: MINNA GRID
                      </div>
                      <div className="tdp-header-right-meta">
                        <div><strong>SHEET:</strong> {activeSheet.sheetNumber}</div>
                        <div><strong>SCALE:</strong> 1:{effectiveScaleRatio}</div>
                        <div><strong>PLAN NO:</strong> {project.code}</div>
                      </div>
                    </div>

                    {/* Plan Cadastral Drawing Area with Dynamic SVG Vector Engine */}
                    <div className="tdp-map-frame">
                      <svg
                        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                        className="tdp-vector-svg"
                      >
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

                        {/* 2. Parcel Vector Polygons & Labels */}
                        {(() => {
                          const renderedEdges = new Set<string>();
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
                                  fill="rgba(16, 185, 129, 0.12)"
                                  stroke="#10b981"
                                  strokeWidth="2"
                                  strokeLinejoin="round"
                                />

                                {/* Centroid Badge */}
                                <text
                                  x={centSvgX}
                                  y={centSvgY - (isSinglePlot ? 5 : 2)}
                                  textAnchor="middle"
                                  fontWeight="bold"
                                  fontSize={isSinglePlot ? "12" : "9.5"}
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
                                    fontSize="8.5"
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
                                  fontSize={isSinglePlot ? "8.5" : "7"}
                                  fill="#059669"
                                  fontFamily="monospace"
                                  style={{ paintOrder: 'stroke fill', stroke: '#ffffff', strokeWidth: '3px', strokeLinecap: 'round', strokeLinejoin: 'round' }}
                                >
                                  {comp.areaSquareMeters.toFixed(2)} m² ({comp.areaHectares.toFixed(4)} Ha)
                                </text>

                                {/* Leg Bearings & Distances (Deduplicated Unique Edges) */}
                                {comp.legs.map((leg, lidx) => {
                                  const edgeKey = [leg.fromPoint.id, leg.toPoint.id].sort().join('__');
                                  if (renderedEdges.has(edgeKey)) return null;
                                  renderedEdges.add(edgeKey);

                                  const x1 = toSvgX(leg.fromPoint.easting);
                                  const y1 = toSvgY(leg.fromPoint.northing);
                                  const x2 = toSvgX(leg.toPoint.easting);
                                  const y2 = toSvgY(leg.toPoint.northing);

                                  const midX = (x1 + x2) / 2;
                                  const midY = (y1 + y2) / 2;

                                  const angleRad = Math.atan2(y2 - y1, x2 - x1);
                                  let textRot = angleRad * (180 / Math.PI);
                                  if (textRot > 90 || textRot < -90) {
                                    textRot += 180;
                                  }

                                  const perpAngle = angleRad + Math.PI / 2;
                                  let normX = Math.cos(perpAngle);
                                  let normY = Math.sin(perpAngle);
                                  const toCentX = midX - centSvgX;
                                  const toCentY = midY - centSvgY;
                                  if (normX * toCentX + normY * toCentY < 0) {
                                    normX = -normX;
                                    normY = -normY;
                                  }

                                  const offsetDist = 11;
                                  const textX = midX + normX * offsetDist;
                                  const textY = midY + normY * offsetDist;

                                  return (
                                    <g key={lidx} transform={`translate(${textX}, ${textY}) rotate(${textRot})`}>
                                      <text
                                        y={0}
                                        textAnchor="middle"
                                        dominantBaseline="central"
                                        fontSize="7"
                                        fill="#0f172a"
                                        fontWeight="600"
                                        fontFamily="monospace"
                                        style={{
                                          paintOrder: 'stroke fill',
                                          stroke: '#ffffff',
                                          strokeWidth: '3.5px',
                                          strokeLinecap: 'round',
                                          strokeLinejoin: 'round'
                                        }}
                                      >
                                        {leg.bearing.formatted} ({leg.distance.toFixed(2)}m)
                                      </text>
                                    </g>
                                  );
                                })}
                              </g>
                            );
                          });
                        })()}

                        {/* 3. Inward Setback Line Preview */}
                        {showSetbacks && setbackResult && (
                          <polygon
                            points={setbackResult.setbackVertices.map(v => `${toSvgX(v.easting)},${toSvgY(v.northing)}`).join(' ')}
                            fill="rgba(245, 158, 11, 0.08)"
                            stroke="#f59e0b"
                            strokeWidth="1.2"
                            strokeDasharray="4 3"
                          />
                        )}

                        {/* 4. Concrete Beacon Symbols */}
                        {targetPoints.map(pt => {
                          const bx = toSvgX(pt.easting);
                          const by = toSvgY(pt.northing);

                          let offX = 6;
                          let offY = -3;
                          let textAnchor: 'start' | 'middle' | 'end' = 'start';

                          for (const parcel of targetParcels) {
                            const idx = parcel.pointIds.indexOf(pt.id);
                            if (idx !== -1 && parcel.pointIds.length >= 3) {
                              const comp = computeParcel(parcel, points);
                              if (comp && comp.vertices.length >= 3) {
                                const vCentX = comp.vertices.reduce((s, v) => s + toSvgX(v.easting), 0) / comp.vertices.length;
                                const vCentY = comp.vertices.reduce((s, v) => s + toSvgY(v.northing), 0) / comp.vertices.length;

                                const n = parcel.pointIds.length;
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

                          return (
                            <g key={pt.id} className="svg-beacon-group">
                              {pt.isControl ? (
                                <polygon
                                  points={`${bx},${by - 5} ${bx + 4},${by + 3} ${bx - 4},${by + 3}`}
                                  fill="#f59e0b"
                                  stroke="#ffffff"
                                  strokeWidth="1"
                                />
                              ) : (
                                <>
                                  <circle cx={bx} cy={by} r="3.2" fill="#dc2626" stroke="#ffffff" strokeWidth="0.8" />
                                  <line x1={bx - 3.2} y1={by} x2={bx + 3.2} y2={by} stroke="#ffffff" strokeWidth="0.6" />
                                  <line x1={bx} y1={by - 3.2} x2={bx} y2={by + 3.2} stroke="#ffffff" strokeWidth="0.6" />
                                </>
                              )}
                              <text
                                x={bx + offX}
                                y={by + offY}
                                textAnchor={textAnchor}
                                fontSize="8"
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

                    {/* North Arrow */}
                    <div className="tdp-north-arrow">
                      <div className="arrow-head">N</div>
                      <div className="arrow-stem" />
                      <div className="arrow-label">GRID NORTH</div>
                    </div>

                    {/* Dynamic Metric Bar Scale */}
                    <div className="tdp-scale-bar-box">
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

                  {/* Plan Footer: Schedule & Seal */}
                  <div className="tdp-plan-footer">
                    {showCoordinateTable && (
                      <div className="tdp-coord-schedule-table">
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
                      <div className="tdp-seal-block">
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
