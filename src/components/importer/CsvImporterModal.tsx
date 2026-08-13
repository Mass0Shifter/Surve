import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CoordinatePoint } from '../../engine/types';
import {
  ColumnMappingConfig,
  ColumnFieldType,
  detectDelimiter,
  guessColumnMapping,
  parseSurveyCSV,
  splitLine
} from '../../engine/importer/csvImporterEngine';
import { UploadCloud, FileSpreadsheet, CheckCircle2, RefreshCw } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

const DEMO_FIELD_CSV = `PT_ID,EASTING,NORTHING,ELEVATION,CODE,DESCRIPTION
PB101,294312.450,992100.125,345.200,CTRL,Primary Control Station
PB102,294366.001,992113.559,346.100,PB,Property Corner Beacon
PB103,294350.210,992080.330,345.800,PB,Property Corner Beacon
PB104,294295.105,992065.800,344.900,PB,Property Corner Beacon
STN_01,294410.500,992125.000,347.000,TOPO,Spot Height Tree
STN_02,294395.200,992090.500,346.500,TOPO,Spot Height Road Edge
STN_03,294312.450,992150.000,346.000,TOPO,Culvert Invert`;

interface CsvImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportPoints: (points: CoordinatePoint[]) => void;
}

export const CsvImporterModal: React.FC<CsvImporterModalProps> = ({
  isOpen,
  onClose,
  onImportPoints
}) => {
  const [rawText, setRawText] = useState<string>(DEMO_FIELD_CSV);
  const [fileName, setFileName] = useState<string>('sample_field_data.csv');
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [selectedDelimiter, setSelectedDelimiter] = useState<string>('AUTO');
  const [columnMapping, setColumnMapping] = useState<ColumnMappingConfig>({
    0: 'ID',
    1: 'EASTING',
    2: 'NORTHING',
    3: 'ELEVATION',
    4: 'CODE',
    5: 'DESCRIPTION'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect when text changes
  useEffect(() => {
    if (!rawText.trim()) return;
    const delim = selectedDelimiter === 'AUTO' ? detectDelimiter(rawText) : selectedDelimiter;
    const lines = rawText.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
    const rows = lines.slice(0, 5).map(l => splitLine(l, delim));
    const guessed = guessColumnMapping(rows, hasHeader);
    setColumnMapping(guessed);
  }, [rawText, selectedDelimiter, hasHeader]);

  // Parse result
  const parseResult = useMemo(() => {
    if (!rawText.trim()) return null;
    const delim = selectedDelimiter === 'AUTO' ? undefined : selectedDelimiter;
    try {
      return parseSurveyCSV(rawText, columnMapping, hasHeader, delim);
    } catch (err: any) {
      return null;
    }
  }, [rawText, columnMapping, hasHeader, selectedDelimiter]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleLoadDemo = () => {
    setFileName('sample_field_data.csv');
    setRawText(DEMO_FIELD_CSV);
  };

  const handleMappingChange = (colIdx: number, type: ColumnFieldType) => {
    setColumnMapping(prev => ({
      ...prev,
      [colIdx]: type
    }));
  };

  const handleExecuteImport = () => {
    if (!parseResult || parseResult.points.length === 0) {
      alert('No valid survey points found to import. Check your column mappings.');
      return;
    }

    onImportPoints(parseResult.points);
    alert(`Successfully imported ${parseResult.points.length} survey coordinates into your CAD workspace!`);
    onClose();
  };

  return (
    <ErrorBoundary fallbackTitle="CSV Importer Recovery">
      <div className="modal-overlay">
        <div className="modal-content leveling-modal-studio">
          
          {/* Header */}
          <div className="modal-header">
            <div className="modal-title">
              <UploadCloud size={18} className="text-cyan" />
              <span>Universal Field CSV &amp; Custom Schema Importer</span>
            </div>
            <div className="header-actions-group">
              <button className="btn-secondary-sm" onClick={handleLoadDemo}>
                <RefreshCw size={13} /> <span>Load Sample CSV</span>
              </button>
              {parseResult && parseResult.validCount > 0 && (
                <button className="btn-primary-sm" onClick={handleExecuteImport}>
                  <CheckCircle2 size={13} /> <span>Import {parseResult.validCount} Points to Workspace</span>
                </button>
              )}
              <button className="icon-btn" onClick={onClose}>✕</button>
            </div>
          </div>

          {/* Body */}
          <div className="traverse-studio-body">
            
            {/* Top Control Bar */}
            <div className="traverse-control-bar">
              
              {/* File Upload Zone */}
              <div className="control-card">
                <div className="control-card-title">1. Raw Survey File Upload</div>
                
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed rgba(6,182,212,0.4)',
                    background: 'rgba(15,23,42,0.4)',
                    borderRadius: '8px',
                    padding: '16px',
                    textAlign: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <FileSpreadsheet size={24} style={{ color: 'var(--cyan)', margin: '0 auto 6px' }} />
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                    {fileName ? `Loaded: ${fileName}` : 'Click or Drop Field File (.csv, .txt, .dat, .asc)'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Supports Leica, Trimble, Topcon, South, FOIF, Stonex raw data
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.dat,.asc,.pts,.xyz"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </div>

              {/* Format & Delimiter Settings */}
              <div className="control-card">
                <div className="control-card-title">2. Delimiter &amp; Header Settings</div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="form-group">
                    <label>Delimiter</label>
                    <select
                      value={selectedDelimiter}
                      onChange={e => setSelectedDelimiter(e.target.value)}
                    >
                      <option value="AUTO">Auto-Detect ({parseResult?.detectedDelimiter || 'Comma'})</option>
                      <option value=",">Comma (,)</option>
                      <option value="&#9;">Tab (\t)</option>
                      <option value=";">Semicolon (;)</option>
                      <option value=" ">Space ( )</option>
                      <option value="|">Pipe (|)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <label className="checkbox-label" style={{ marginTop: '14px' }}>
                      <input
                        type="checkbox"
                        checked={hasHeader}
                        onChange={e => setHasHeader(e.target.checked)}
                      />
                      <span>First line contains headers</span>
                    </label>
                  </div>
                </div>

                {parseResult && (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '10px', fontSize: '11px' }}>
                    <span>Total Rows: <strong style={{ color: '#f8fafc' }}>{parseResult.totalRows}</strong></span>
                    <span>Valid Points: <strong style={{ color: '#34d399' }}>{parseResult.validCount}</strong></span>
                    {parseResult.errorCount > 0 && (
                      <span>Errors: <strong style={{ color: '#fda4af' }}>{parseResult.errorCount}</strong></span>
                    )}
                  </div>
                )}
              </div>

            </div>

            {/* Column Mapping Section */}
            {parseResult && parseResult.columnCount > 0 && (
              <div className="control-card" style={{ padding: '12px 16px' }}>
                <div className="control-card-title">3. Custom Column Mapping</div>
                <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {Array.from({ length: parseResult.columnCount }).map((_, cIdx) => (
                    <div key={cIdx} style={{ minWidth: '130px', background: 'rgba(15,23,42,0.6)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(148,163,184,0.1)' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--cyan)', marginBottom: '4px' }}>
                        Column {cIdx + 1}
                      </div>
                      <select
                        value={columnMapping[cIdx] || 'IGNORE'}
                        onChange={e => handleMappingChange(cIdx, e.target.value as ColumnFieldType)}
                        style={{ width: '100%' }}
                      >
                        <option value="ID">Beacon ID (Name)</option>
                        <option value="EASTING">Easting (X)</option>
                        <option value="NORTHING">Northing (Y)</option>
                        <option value="ELEVATION">Elevation (Z / RL)</option>
                        <option value="CODE">Feature Code</option>
                        <option value="DESCRIPTION">Description</option>
                        <option value="IGNORE">-- Ignore --</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw Data Preview Table */}
            {parseResult && (
              <div className="traverse-fieldbook-view">
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Preview of Parsed Survey Coordinates (First {parseResult.previewRows.length} Rows):
                </div>

                <div className="table-wrapper">
                  <table className="traverse-table">
                    <thead>
                      <tr>
                        {Array.from({ length: parseResult.columnCount }).map((_, cIdx) => {
                          const mapping = columnMapping[cIdx] || 'IGNORE';
                          return (
                            <th key={cIdx}>
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: '3px',
                                fontSize: '10px',
                                background: mapping !== 'IGNORE' ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.05)',
                                color: mapping !== 'IGNORE' ? 'var(--cyan)' : 'var(--text-muted)'
                              }}>
                                {mapping}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.previewRows.map((row, rIdx) => (
                        <tr key={rIdx} style={{ opacity: hasHeader && rIdx === 0 ? 0.6 : 1 }}>
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="mono-cell">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>
    </ErrorBoundary>
  );
};
