import React, { useState, useRef } from 'react';
import {
  parseSurvPackFiles,
  MigratedSurvPackProject,
  SurvPackParseResult
} from '../../engine/importers/survpackProjectImporter';
import {
  NSurveyBundle,
  downloadProjectPack
} from '../../engine/storage/nsurvBundle';
import { batchSaveProjectsToLibrary } from '../../engine/storage/projectDatabase';
import { UserProfile } from '../../engine/auth/authTypes';
import { Organization } from '../../engine/organization/orgTypes';
import {
  FolderArchive,
  Upload,
  Download,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  RefreshCw,
  FolderOpen,
  Save,
  Database
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface SurvPackMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
  activeOrg?: Organization | null;
  onMigrateToWorkspace: (project: MigratedSurvPackProject) => void;
  onOpenProjectLibrary?: () => void;
}

export const SurvPackMigrationModal: React.FC<SurvPackMigrationModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  activeOrg,
  onMigrateToWorkspace,
  onOpenProjectLibrary
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [parseResult, setParseResult] = useState<SurvPackParseResult | null>(null);
  const [selectedProjectIndex, setSelectedProjectIndex] = useState<number>(0);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [batchSuccessMsg, setBatchSuccessMsg] = useState<string | null>(null);

  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsProcessing(true);
    setBatchSuccessMsg(null);
    try {
      const fileArray = Array.from(files);
      const result = await parseSurvPackFiles(fileArray);
      setParseResult(result);
      setSelectedProjectIndex(0);
    } catch (e) {
      console.error('SurvPack migration error:', e);
      alert('Error parsing SurvPack files. Please ensure you selected a valid SurvPack 3.0 directory.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const selectedProj: MigratedSurvPackProject | undefined = parseResult?.projects[selectedProjectIndex];

  const handleOpenInWorkspace = () => {
    if (selectedProj) {
      onMigrateToWorkspace(selectedProj);
      onClose();
    }
  };

  // Convert all migrated projects to standard NSurveyBundle format
  const getProjectBundles = (): NSurveyBundle[] => {
    if (!parseResult) return [];
    return parseResult.projects.map((p) => ({
      format: 'NSURVEY_PROJECT_BUNDLE' as const,
      version: '1.0.0',
      exportedAt: Date.now(),
      app: 'NSurvey PRO Geomatics Suite',
      scope: {
        ownerUserId: currentUser?.id || 'guest',
        ownerName: currentUser?.fullName || 'Licensed Surveyor',
        organizationId: activeOrg?.id,
        organizationName: activeOrg?.name
      },
      project: p.metadata,
      points: p.points,
      parcels: p.parcels
    }));
  };

  // Batch Save all discovered projects to Project Library
  const handleBatchSaveToLibrary = async () => {
    if (!parseResult || parseResult.projects.length === 0) return;
    setIsProcessing(true);
    try {
      const bundles = getProjectBundles();
      const saved = await batchSaveProjectsToLibrary(
        bundles,
        currentUser?.id || 'guest',
        activeOrg?.id,
        activeOrg?.name
      );
      setBatchSuccessMsg(`Successfully saved all ${saved.length} projects to the Project Library!`);
    } catch (err: any) {
      alert(`Failed to batch save projects to library: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Export all discovered projects as a single .nsurvpack multi-project archive
  const handleExportAllAsPack = () => {
    if (!parseResult || parseResult.projects.length === 0) return;
    const bundles = getProjectBundles();
    downloadProjectPack(bundles, {
      packTitle: 'SurvPack 3.0 Legacy Batch Import',
      filename: `SURVPACK_MIGRATED_PACK_${parseResult.projects.length}_JOBS_${new Date().toISOString().split('T')[0]}.nsurvpack`,
      organizationId: activeOrg?.id,
      organizationName: activeOrg?.name,
      exportedBy: currentUser?.fullName || 'Licensed Surveyor'
    });
  };

  return (
    <ErrorBoundary>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content leveling-modal-studio"
          style={{ width: '1120px', maxWidth: '96vw', height: '88vh', maxHeight: '88vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="auth-modal-header">
            <div
              className="auth-badge-icon"
              style={{ background: 'rgba(6, 182, 212, 0.15)', borderColor: 'rgba(6, 182, 212, 0.35)' }}
            >
              <FolderArchive size={24} className="text-cyan" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 className="auth-title">SurvPack 3.0 Legacy Project Importer &amp; Migration Studio</h2>
                <span className="proj-code-badge pro" style={{ fontSize: '10px' }}>
                  LEGACY V3.0 ARCHIVES
                </span>
              </div>
              <p className="auth-subtitle">
                Universal parser &amp; batch migration engine for legacy SurvPack directory trees (<code>Pdetails.TXT</code>, <code>REGISTER.TXT</code>, <code>COORDS/</code>, <code>PLOTS/</code>, <code>PLOTPB/</code>).
              </p>
            </div>
            <button className="icon-btn auth-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* Body */}
          <div className="traverse-studio-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Hidden Inputs */}
            <input
              type="file"
              ref={folderInputRef}
              style={{ display: 'none' }}
              {...({ webkitdirectory: '', directory: '' } as any)}
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
            <input
              type="file"
              ref={filesInputRef}
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFilesSelected(e.target.files)}
            />

            {/* Dropzone & Upload Actions */}
            {!parseResult ? (
              <div
                className={`csv-dropzone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                style={{
                  border: '2px dashed rgba(148, 163, 184, 0.25)',
                  borderRadius: '12px',
                  padding: '48px 24px',
                  textAlign: 'center',
                  background: 'rgba(15, 23, 42, 0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '14px'
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '14px',
                    background: 'rgba(6, 182, 212, 0.12)',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <FolderOpen size={32} className="text-cyan" />
                </div>

                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' }}>
                    Select SurvPack 3.0 Project Directory
                  </h3>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, maxWidth: '520px', lineHeight: 1.5 }}>
                    Upload your legacy <code>SurvPack30/PROJECTS/CADASTRAL/</code> folder or select multiple <code>.TXT</code> files.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                  <button
                    type="button"
                    className="btn-primary-sm"
                    style={{ background: 'var(--cyan)' }}
                    onClick={() => folderInputRef.current?.click()}
                    disabled={isProcessing}
                  >
                    <FolderArchive size={14} />
                    <span>{isProcessing ? 'Parsing Directory...' : 'Upload SurvPack Folder'}</span>
                  </button>

                  <button
                    type="button"
                    className="btn-secondary-sm"
                    onClick={() => filesInputRef.current?.click()}
                    disabled={isProcessing}
                  >
                    <Upload size={14} />
                    <span>Select Specific Files</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Parsed Results Overview */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
                {/* Top Summary & Bulk Action Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                    borderRadius: '10px',
                    padding: '12px 18px',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <CheckCircle2 size={20} className="text-emerald" />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                        Discovered {parseResult.projects.length} SurvPack {parseResult.projects.length === 1 ? 'Project' : 'Projects'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        Processed {parseResult.totalFilesParsed} legacy files. Ready for individual migration or full library batch import.
                      </div>
                    </div>
                  </div>

                  {/* Bulk Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn-primary-sm"
                      style={{ background: 'var(--emerald)' }}
                      onClick={handleBatchSaveToLibrary}
                      disabled={isProcessing}
                      title="Save all discovered projects into the Project Library"
                    >
                      <Save size={13} />
                      <span>Batch Save All ({parseResult.projects.length}) to Library</span>
                    </button>

                    <button
                      type="button"
                      className="btn-secondary-sm"
                      onClick={handleExportAllAsPack}
                      title="Download as a single portable .nsurvpack multi-project archive"
                    >
                      <Download size={13} />
                      <span>Export All as .nsurvpack</span>
                    </button>

                    <button
                      type="button"
                      className="btn-secondary-sm"
                      onClick={() => { setParseResult(null); setBatchSuccessMsg(null); }}
                    >
                      <RefreshCw size={13} />
                      <span>New Scan</span>
                    </button>
                  </div>
                </div>

                {/* Batch Success Notification */}
                {batchSuccessMsg && (
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '8px',
                      padding: '10px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      color: '#10b981'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={16} />
                      <span>{batchSuccessMsg}</span>
                    </div>
                    {onOpenProjectLibrary && (
                      <button
                        type="button"
                        className="btn-primary-sm"
                        style={{ background: 'var(--emerald)', padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => {
                          onClose();
                          onOpenProjectLibrary();
                        }}
                      >
                        <Database size={12} />
                        <span>Open Project Library</span>
                        <ArrowRight size={11} />
                      </button>
                    )}
                  </div>
                )}

                {/* Main 2-Column Split: Left = Project Selector, Right = Details & Preview */}
                <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '16px', flex: 1, minHeight: 0 }}>
                  {/* Left Column: Discovered Projects List */}
                  <div
                    style={{
                      background: 'rgba(15, 23, 42, 0.5)',
                      border: '1px solid rgba(148, 163, 184, 0.15)',
                      borderRadius: '10px',
                      overflowY: 'auto',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', padding: '4px 8px' }}>
                      DISCOVERED PROJECTS ({parseResult.projects.length})
                    </div>
                    {parseResult.projects.map((proj, idx) => (
                      <div
                        key={proj.code}
                        onClick={() => setSelectedProjectIndex(idx)}
                        style={{
                          background: selectedProjectIndex === idx ? 'rgba(6, 182, 212, 0.15)' : 'rgba(30, 41, 59, 0.4)',
                          border: selectedProjectIndex === idx ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(148, 163, 184, 0.1)',
                          borderRadius: '8px',
                          padding: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                            {proj.code}
                          </span>
                          <span className="proj-code-badge" style={{ fontSize: '9px' }}>
                            {proj.points.length} pts
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {proj.metadata.title}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#64748b' }}>
                          <span>Plots: {proj.parcels.length}</span>
                          <span>•</span>
                          <span>Belt: {proj.metadata.gridBelt === 4.5 ? 'West' : proj.metadata.gridBelt === 8.5 ? 'Mid' : 'East'}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Right Column: Selected Project Detail Card & Preview */}
                  {selectedProj && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minHeight: 0 }}>
                      {/* Project Meta Card */}
                      <div
                        style={{
                          background: 'rgba(30, 41, 59, 0.5)',
                          border: '1px solid rgba(148, 163, 184, 0.15)',
                          borderRadius: '10px',
                          padding: '16px 20px',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: '12px'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>PROJECT CODE</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8' }}>{selectedProj.code}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>REGISTERED SURVEYOR</div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>{selectedProj.metadata.surveyorName}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>BEACONS FOUND</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#10b981' }}>{selectedProj.points.length} Points</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>PARCEL BOUNDARIES</div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fbbf24' }}>{selectedProj.parcels.length} Plots</div>
                        </div>

                        <div style={{ gridColumn: 'span 4', fontSize: '11px', color: '#94a3b8', borderTop: '1px solid rgba(148, 163, 184, 0.1)', paddingTop: '8px' }}>
                          <strong>Location:</strong> {selectedProj.metadata.location}
                        </div>
                      </div>

                      {/* Coordinates Preview Table */}
                      <div style={{ flex: 1, minHeight: '160px', overflowY: 'auto' }} className="table-wrapper">
                        <table className="survey-studio-table">
                          <thead>
                            <tr>
                              <th>BEACON ID</th>
                              <th>EASTING (X)</th>
                              <th>NORTHING (Y)</th>
                              <th>ELEVATION (Z)</th>
                              <th>CODE</th>
                              <th>DESCRIPTION</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedProj.points.slice(0, 100).map((pt) => (
                              <tr key={pt.id}>
                                <td><strong>{pt.id}</strong></td>
                                <td>{pt.easting.toLocaleString('en-US', { minimumFractionDigits: 3 })}</td>
                                <td>{pt.northing.toLocaleString('en-US', { minimumFractionDigits: 3 })}</td>
                                <td>{pt.elevation !== undefined ? pt.elevation.toFixed(3) : '-'}</td>
                                <td><span className="proj-code-badge" style={{ fontSize: '9px' }}>{pt.code}</span></td>
                                <td style={{ color: '#94a3b8', fontSize: '10px' }}>{pt.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {selectedProj.points.length > 100 && (
                        <div style={{ fontSize: '10px', color: '#64748b', textAlign: 'center' }}>
                          Showing first 100 of {selectedProj.points.length} coordinates. All points will be imported.
                        </div>
                      )}

                      {/* Action Bar */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: 'auto' }}>
                        <button
                          type="button"
                          className="btn-secondary-sm"
                          onClick={onClose}
                        >
                          Close
                        </button>

                        <button
                          type="button"
                          className="btn-primary-sm"
                          style={{ background: 'var(--emerald)' }}
                          onClick={handleOpenInWorkspace}
                        >
                          <Sparkles size={14} />
                          <span>Migrate &amp; Open "{selectedProj.code}" in CAD Workspace</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};
