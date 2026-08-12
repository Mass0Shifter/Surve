import React, { useState, useMemo } from 'react';
import {
  minnaGridToWGS84,
  wgs84ToMinnaGrid,
  MinnaGridPoint,
  WGS84Point,
  TransformResult,
  DEMO_WGS84_POINTS,
  DEMO_MINNA_POINTS
} from '../../engine/transform/datumEngine';
import { CoordinatePoint } from '../../engine/types';
import { Globe, Download, Upload, Plus, Trash2, ArrowLeftRight } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

type Direction = 'MINNA_TO_WGS84' | 'WGS84_TO_MINNA';

interface DatumTransformModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectPoints: CoordinatePoint[];
  onImportPoints: (points: CoordinatePoint[]) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDDorDMS(input: string): number | null {
  const cleaned = input.trim();
  if (!cleaned) return null;

  // Try DMS pattern first (e.g. 8° 57' 55.2", 8 57 55.2, 8-57-55.2)
  const dmsMatch = cleaned.match(/^([+-]?\d+)[°\s\-]\s*(\d+)['\s\-]\s*([\d.]+)/);
  if (dmsMatch) {
    const d = parseInt(dmsMatch[1], 10);
    const mn = parseInt(dmsMatch[2], 10);
    const s = parseFloat(dmsMatch[3]);
    const sign = dmsMatch[1].startsWith('-') ? -1 : 1;
    return sign * (Math.abs(d) + mn / 60 + s / 3600);
  }

  const dd = parseFloat(cleaned);
  return isNaN(dd) ? null : dd;
}

function exportKML(results: TransformResult[], filename: string) {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n<name>${filename}</name>\n`;
  for (const r of results) {
    kml += `<Placemark>\n<name>${r.inputId}</name>\n<Point>\n<coordinates>${r.wgs84Lon.toFixed(8)},${r.wgs84Lat.toFixed(8)},${r.wgs84Height.toFixed(3)}</coordinates>\n</Point>\n</Placemark>\n`;
  }
  kml += `</Document>\n</kml>`;
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
}

// ── Component ─────────────────────────────────────────────────────────────────

export const DatumTransformModal: React.FC<DatumTransformModalProps> = ({
  isOpen,
  onClose,
  projectPoints,
  onImportPoints
}) => {
  const [activeTab, setActiveTab] = useState<'transform' | 'export'>('transform');
  const [direction, setDirection] = useState<Direction>('WGS84_TO_MINNA');
  const [minnaZone, setMinnaZone] = useState<number>(32);

  // WGS84 → Minna inputs
  const [wgsRows, setWgsRows] = useState<WGS84Point[]>(DEMO_WGS84_POINTS);

  // Minna → WGS84 inputs
  const [minnaRows, setMinnaRows] = useState<MinnaGridPoint[]>(DEMO_MINNA_POINTS);

  // Compute results
  const results: TransformResult[] = useMemo(() => {
    try {
      if (direction === 'WGS84_TO_MINNA') {
        return wgsRows
          .filter(r => typeof r.latDeg === 'number' && typeof r.lonDeg === 'number')
          .map(r => wgs84ToMinnaGrid(r, minnaZone, 'N'));
      } else {
        return minnaRows
          .filter(r => typeof r.easting === 'number' && typeof r.northing === 'number')
          .map(r => minnaGridToWGS84(r, minnaZone, 'N'));
      }
    } catch {
      return [];
    }
  }, [direction, wgsRows, minnaRows, minnaZone]);

  if (!isOpen) return null;

  // ── WGS84 row handlers ────────────────────────────────────────────────────

  const handleAddWgsRow = () => {
    setWgsRows(prev => [...prev, { id: `GPS_${prev.length + 1}`, latDeg: 9.0, lonDeg: 7.4, height: 0 }]);
  };

  const handleUpdateWgsRow = (idx: number, field: keyof WGS84Point, rawVal: string | number) => {
    setWgsRows(prev => {
      const copy = [...prev];
      if (field === 'id') {
        copy[idx] = { ...copy[idx], id: rawVal as string };
      } else {
        const parsed = typeof rawVal === 'string' ? parseDDorDMS(rawVal) : rawVal;
        if (parsed !== null) copy[idx] = { ...copy[idx], [field]: parsed };
      }
      return copy;
    });
  };

  const handleDeleteWgsRow = (idx: number) => setWgsRows(prev => prev.filter((_, i) => i !== idx));

  // ── Minna row handlers ────────────────────────────────────────────────────

  const handleAddMinnaRow = () => {
    setMinnaRows(prev => [...prev, { id: `MN_${prev.length + 1}`, easting: 294000, northing: 992000, elevation: 0 }]);
  };

  const handleUpdateMinnaRow = (idx: number, field: keyof MinnaGridPoint, val: any) => {
    setMinnaRows(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: field === 'id' ? val : (parseFloat(val) || 0) };
      return copy;
    });
  };

  const handleDeleteMinnaRow = (idx: number) => setMinnaRows(prev => prev.filter((_, i) => i !== idx));

  // ── Load from project ─────────────────────────────────────────────────────

  const handleLoadFromProject = () => {
    const pts: MinnaGridPoint[] = projectPoints.map(p => ({
      id: p.id,
      easting: p.easting,
      northing: p.northing,
      elevation: p.elevation
    }));
    setMinnaRows(pts);
    setDirection('MINNA_TO_WGS84');
  };

  // ── Import transformed Minna coords into project ──────────────────────────

  const handleImportIntoProject = () => {
    if (results.length === 0) return;
    const pts: CoordinatePoint[] = results.map(r => ({
      id: r.inputId,
      easting:  r.minnaEasting,
      northing: r.minnaNorthing,
      elevation: r.minnaElevation || undefined,
      code: 'GPS',
      description: `GPS Import (WGS84: ${r.wgs84Lat.toFixed(6)}, ${r.wgs84Lon.toFixed(6)})`
    }));
    onImportPoints(pts);
    alert(`Imported ${pts.length} point${pts.length > 1 ? 's' : ''} into the project.`);
    onClose();
  };

  // ── Export KML ────────────────────────────────────────────────────────────

  const handleExportKML = () => {
    if (results.length === 0) return;
    exportKML(results, `datum_transform_${direction.toLowerCase()}.kml`);
  };

  const handleExportCSV = () => {
    if (results.length === 0) return;
    let csv = `Datum Transform — ${direction}\n`;
    csv += `ID,Minna E (m),Minna N (m),Minna Z (m),WGS84 Lat (°),WGS84 Lon (°),WGS84 H (m),UTM Zone,UTM E (m),UTM N (m)\n`;
    for (const r of results) {
      csv += `"${r.inputId}",${r.minnaEasting.toFixed(3)},${r.minnaNorthing.toFixed(3)},${r.minnaElevation.toFixed(3)},${r.wgs84Lat.toFixed(8)},${r.wgs84Lon.toFixed(8)},${r.wgs84Height.toFixed(3)},${r.utmZone}${r.utmZoneLetter},${r.utmEasting.toFixed(3)},${r.utmNorthing.toFixed(3)}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'datum_transform.csv';
    a.click();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary fallbackTitle="Datum Transform Recovery">
      <div className="modal-overlay">
        <div className="modal-content leveling-modal-studio">

          {/* Header */}
          <div className="modal-header">
            <div className="modal-title">
              <Globe size={18} className="text-cyan" />
              <span>Datum Transform — Minna (Clarke 1880) ↔ WGS84</span>
            </div>
            <div className="header-actions-group">
              <button className="btn-secondary-sm" onClick={handleLoadFromProject}>
                <Upload size={13} /> <span>Load Project Points</span>
              </button>
              <button className="btn-secondary-sm" onClick={handleExportCSV} disabled={results.length === 0}>
                <Download size={13} /> <span>Export CSV</span>
              </button>
              <button className="btn-secondary-sm" onClick={handleExportKML} disabled={results.length === 0}>
                <Globe size={13} /> <span>Export KML</span>
              </button>
              <button className="btn-primary-sm" onClick={handleImportIntoProject} disabled={results.length === 0 || direction !== 'WGS84_TO_MINNA'}>
                <Plus size={13} /> <span>Import to Project</span>
              </button>
              <button className="icon-btn" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="traverse-tabs-bar">
            <button className={`traverse-tab-btn ${activeTab === 'transform' ? 'active' : ''}`} onClick={() => setActiveTab('transform')}>
              <ArrowLeftRight size={14} /> <span>Transform Coordinates</span>
            </button>
            <button className={`traverse-tab-btn ${activeTab === 'export' ? 'active' : ''}`} onClick={() => setActiveTab('export')}>
              <Globe size={14} /> <span>Results &amp; Export ({results.length} Points)</span>
            </button>
          </div>

          <div className="traverse-studio-body">
            {activeTab === 'transform' ? (
              <div className="traverse-fieldbook-view">

                {/* Direction & Settings */}
                <div className="traverse-control-bar">
                  <div className="control-card">
                    <div className="control-card-title">Transform Direction</div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
                      <button
                        className={`btn-${direction === 'WGS84_TO_MINNA' ? 'primary' : 'secondary'}-sm`}
                        onClick={() => setDirection('WGS84_TO_MINNA')}
                        style={{ flex: 1 }}
                      >
                        WGS84 Lat/Lon → Minna Grid
                      </button>
                      <button
                        className={`btn-${direction === 'MINNA_TO_WGS84' ? 'primary' : 'secondary'}-sm`}
                        onClick={() => setDirection('MINNA_TO_WGS84')}
                        style={{ flex: 1 }}
                      >
                        Minna Grid → WGS84 Lat/Lon
                      </button>
                    </div>
                    <div className="form-group" style={{ marginTop: '12px' }}>
                      <label>Minna UTM Zone (Nigeria)</label>
                      <select value={minnaZone} onChange={e => setMinnaZone(parseInt(e.target.value))}>
                        <option value={31}>Zone 31N — Western Nigeria (W-Belt)</option>
                        <option value={32}>Zone 32N — Central Nigeria (Mid-Belt) ✓</option>
                        <option value={33}>Zone 33N — Eastern Nigeria (E-Belt)</option>
                      </select>
                    </div>
                  </div>
                  <div className="control-card">
                    <div className="control-card-title">Datum Parameters (Nigeria Official)</div>
                    <div style={{ padding: '10px', background: 'rgba(15,23,42,0.5)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.9' }}>
                      <div style={{ color: 'var(--cyan)', fontWeight: 700, marginBottom: '4px' }}>Helmert 3-Parameter Shift:</div>
                      ΔX = −92 m &nbsp;&nbsp; ΔY = −93 m &nbsp;&nbsp; ΔZ = +122 m<br />
                      <div style={{ color: 'var(--cyan)', fontWeight: 700, margin: '6px 0 4px' }}>Ellipsoids:</div>
                      Minna: Clarke 1880 (a = 6 378 249.145 m)<br />
                      WGS84: GRS80 (a = 6 378 137.000 m)<br />
                      <div style={{ color: 'var(--emerald)', marginTop: '6px' }}>Round-trip accuracy: ±0.01–0.1 m</div>
                    </div>
                  </div>
                </div>

                {/* Input Grid */}
                <div className="fieldbook-table-container">
                  {direction === 'WGS84_TO_MINNA' ? (
                    <>
                      <div className="table-header-action-row">
                        <span className="section-subtitle">WGS84 Input Coordinates (GPS / GNSS)</span>
                        <button className="btn-secondary-xs" onClick={handleAddWgsRow}>
                          <Plus size={12} className="inline-icon" /> <span>Add Row</span>
                        </button>
                      </div>
                      <table className="fieldbook-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Point ID</th>
                            <th>Latitude (° DD or DMS)</th>
                            <th>Longitude (° DD or DMS)</th>
                            <th>Ell. Height (m)</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {wgsRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="mono-cell">{idx + 1}</td>
                              <td><input type="text" className="table-input" value={row.id} onChange={e => handleUpdateWgsRow(idx, 'id', e.target.value)} /></td>
                              <td><input type="text" className="table-input" defaultValue={row.latDeg.toFixed(7)} onBlur={e => handleUpdateWgsRow(idx, 'latDeg', e.target.value)} placeholder="e.g. 8.96534" /></td>
                              <td><input type="text" className="table-input" defaultValue={row.lonDeg.toFixed(7)} onBlur={e => handleUpdateWgsRow(idx, 'lonDeg', e.target.value)} placeholder="e.g. 7.38945" /></td>
                              <td><input type="number" step="0.001" className="table-input" value={row.height ?? 0} onChange={e => handleUpdateWgsRow(idx, 'height', e.target.value)} /></td>
                              <td style={{ textAlign: 'center' }}>
                                <button className="delete-icon-btn" onClick={() => handleDeleteWgsRow(idx)}><Trash2 size={13} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : (
                    <>
                      <div className="table-header-action-row">
                        <span className="section-subtitle">Minna Grid Input Coordinates</span>
                        <button className="btn-secondary-xs" onClick={handleAddMinnaRow}>
                          <Plus size={12} className="inline-icon" /> <span>Add Row</span>
                        </button>
                      </div>
                      <table className="fieldbook-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Point ID</th>
                            <th>Easting (m)</th>
                            <th>Northing (m)</th>
                            <th>Elevation (m)</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {minnaRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="mono-cell">{idx + 1}</td>
                              <td><input type="text" className="table-input" value={row.id} onChange={e => handleUpdateMinnaRow(idx, 'id', e.target.value)} /></td>
                              <td><input type="number" step="0.001" className="table-input" value={row.easting} onChange={e => handleUpdateMinnaRow(idx, 'easting', e.target.value)} /></td>
                              <td><input type="number" step="0.001" className="table-input" value={row.northing} onChange={e => handleUpdateMinnaRow(idx, 'northing', e.target.value)} /></td>
                              <td><input type="number" step="0.001" className="table-input" value={row.elevation ?? 0} onChange={e => handleUpdateMinnaRow(idx, 'elevation', e.target.value)} /></td>
                              <td style={{ textAlign: 'center' }}>
                                <button className="delete-icon-btn" onClick={() => handleDeleteMinnaRow(idx)}><Trash2 size={13} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              </div>
            ) : (
              /* TAB 2: RESULTS */
              <div className="traverse-reduction-view">
                {results.length > 0 ? (
                  <>
                    <div className="arithmetic-check-card">
                      <div className="arithmetic-check-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Globe size={16} className="text-cyan" />
                          <span style={{ fontWeight: 700, color: '#f8fafc' }}>
                            {direction === 'WGS84_TO_MINNA' ? 'WGS84 → Minna Grid Results' : 'Minna Grid → WGS84 Results'}
                          </span>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                          Zone {minnaZone}N | Helmert ΔX=−92 ΔY=−93 ΔZ=+122 | Clarke 1880 ↔ WGS84
                        </span>
                      </div>
                      <div className="arithmetic-grid">
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">Points Transformed</div>
                          <div className="arithmetic-val mono-cell text-cyan" style={{ fontWeight: 700 }}>{results.length}</div>
                        </div>
                        <div className="arithmetic-item">
                          <div className="arithmetic-label">UTM Zone(s)</div>
                          <div className="arithmetic-val mono-cell">{[...new Set(results.map(r => `${r.utmZone}${r.utmZoneLetter}`))].join(', ')}</div>
                        </div>
                      </div>
                    </div>

                    <div className="reduction-table-container">
                      <table className="reduction-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>ID</th>
                            <th>Minna E (m)</th>
                            <th>Minna N (m)</th>
                            <th>WGS84 Lat (°)</th>
                            <th>WGS84 Lon (°)</th>
                            <th>WGS84 H (m)</th>
                            <th>UTM Zone</th>
                            <th>UTM E (m)</th>
                            <th>UTM N (m)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((r, idx) => (
                            <tr key={idx}>
                              <td className="mono-cell">{idx + 1}</td>
                              <td className="mono-cell" style={{ fontWeight: 600, color: '#f8fafc' }}>{r.inputId}</td>
                              <td className="mono-cell text-emerald">{r.minnaEasting.toFixed(3)}</td>
                              <td className="mono-cell text-emerald">{r.minnaNorthing.toFixed(3)}</td>
                              <td className="mono-cell text-cyan">{r.wgs84Lat.toFixed(7)}</td>
                              <td className="mono-cell text-cyan">{r.wgs84Lon.toFixed(7)}</td>
                              <td className="mono-cell">{r.wgs84Height.toFixed(3)}</td>
                              <td className="mono-cell">{r.utmZone}{r.utmZoneLetter}</td>
                              <td className="mono-cell">{r.utmEasting.toFixed(3)}</td>
                              <td className="mono-cell">{r.utmNorthing.toFixed(3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Add input coordinates in the Transform tab.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};
