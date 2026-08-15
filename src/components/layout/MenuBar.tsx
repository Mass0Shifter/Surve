import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Download,
  FileCode,
  Table,
  RefreshCw,
  Plus,
  Undo2,
  Redo2,
  History,
  Tag,
  Maximize2,
  PanelLeft,
  PanelRight,
  Layers,
  Compass,
  Ruler,
  Settings,
  Globe,
  Target,
  Save,
  Printer,
  Calculator,
  Lock,
  FolderArchive
} from 'lucide-react';
import { NigerianGridBelt } from '../../engine/types';
import { UserProfile } from '../../engine/auth/authTypes';
import { FeatureId, hasFeatureAccess, getFeatureDefinition } from '../../engine/subscription/featureGating';

interface MenuBarProps {
  onNewProject: () => void;
  onOpenProjectLibrary?: () => void;
  onExportNSurv?: () => void;
  onImportNSurv?: () => void;
  onLoadDemo: () => void;
  onExportSCR: () => void;
  onExportDXF: () => void;
  onExportCSV: () => void;
  onOpenTdp: () => void;
  onOpenProjectSettings: () => void;

  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onOpenHistory: () => void;
  onOpenRenumber: () => void;

  isLeftVisible: boolean;
  isRightVisible: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleMaximize: () => void;

  onOpenTraverse: () => void;
  onOpenLeveling: () => void;
  onOpenTacheometry: () => void;
  onOpenSetout: () => void;
  onOpenDatumTransform: () => void;
  onOpenEarthView: () => void;
  onOpenAlignment: () => void;
  onOpenVerticalAlignment: () => void;
  onOpenSubdivision: () => void;
  onOpenDxf: () => void;
  onOpenCadStudio?: () => void;
  onOpenResection: () => void;
  onOpenCsvImporter: () => void;
  onOpenCogo: () => void;

  gridBelt: NigerianGridBelt;
  onSelectBelt: (belt: NigerianGridBelt) => void;
  autoSaveEnabled: boolean;
  onToggleAutoSave: () => void;
  currentUser?: UserProfile | null;
  onRequestUpgrade?: (featureId: FeatureId) => void;
  onOpenSurvpackImporter?: () => void;
}

type MenuKey = 'file' | 'edit' | 'view' | 'tools' | 'settings' | null;

export const MenuBar: React.FC<MenuBarProps> = ({
  onNewProject,
  onOpenProjectLibrary,
  onExportNSurv,
  onImportNSurv,
  onLoadDemo,
  onExportSCR,
  onExportDXF,
  onExportCSV,
  onOpenTdp,
  onOpenProjectSettings,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenHistory,
  onOpenRenumber,
  isLeftVisible,
  isRightVisible,
  onToggleLeft,
  onToggleRight,
  onToggleMaximize,
  onOpenTraverse,
  onOpenLeveling,
  onOpenTacheometry,
  onOpenSetout,
  onOpenDatumTransform,
  onOpenEarthView,
  onOpenAlignment,
  onOpenVerticalAlignment,
  onOpenSubdivision,
  onOpenDxf,
  onOpenCadStudio,
  onOpenResection,
  onOpenCsvImporter,
  onOpenCogo,
  gridBelt,
  onSelectBelt,
  autoSaveEnabled,
  onToggleAutoSave,
  currentUser,
  onRequestUpgrade,
  onOpenSurvpackImporter
}) => {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, []);

  const handleMenuClick = (key: MenuKey) => {
    setOpenMenu(openMenu === key ? null : key);
  };

  const handleAction = (action: () => void) => {
    action();
    setOpenMenu(null);
  };

  const checkAccessAndRun = (featureId: FeatureId, action: () => void) => {
    if (hasFeatureAccess(currentUser, featureId)) {
      handleAction(action);
    } else if (onRequestUpgrade) {
      setOpenMenu(null);
      onRequestUpgrade(featureId);
    } else {
      handleAction(action);
    }
  };

  const renderTierBadge = (featureId: FeatureId) => {
    if (hasFeatureAccess(currentUser, featureId)) return null;
    const def = getFeatureDefinition(featureId);
    return (
      <span
        style={{
          marginLeft: 'auto',
          fontSize: '9px',
          fontWeight: 700,
          padding: '1px 5px',
          borderRadius: '3px',
          background: def.minTier === 'ENTERPRISE' ? 'rgba(245,158,11,0.18)' : 'rgba(16,185,129,0.18)',
          color: def.minTier === 'ENTERPRISE' ? '#fbbf24' : '#34d399',
          border: def.minTier === 'ENTERPRISE' ? '1px solid rgba(245,158,11,0.35)' : '1px solid rgba(16,185,129,0.35)',
          display: 'flex',
          alignItems: 'center',
          gap: '3px'
        }}
      >
        <Lock size={9} /> {def.minTier === 'ENTERPRISE' ? 'ENTERPRISE' : 'PRO'}
      </span>
    );
  };

  return (
    <div className="cad-menu-bar" ref={menuBarRef}>
      {/* 1. FILE MENU */}
      <div className={`menu-bar-item-container ${openMenu === 'file' ? 'open' : ''}`}>
        <button
          className={`menu-bar-btn ${openMenu === 'file' ? 'active' : ''}`}
          onClick={() => handleMenuClick('file')}
        >
          File
        </button>

        {openMenu === 'file' && (
          <div className="menu-dropdown-popup">
            <div className="menu-dropdown-item" onClick={() => handleAction(onNewProject)}>
              <div className="menu-item-left">
                <Plus size={14} className="text-muted" />
                <span>New Blank Project</span>
              </div>
              <span className="menu-shortcut">Ctrl+N</span>
            </div>

            {onOpenProjectLibrary && (
              <div className="menu-dropdown-item" onClick={() => handleAction(onOpenProjectLibrary)}>
                <div className="menu-item-left">
                  <Save size={14} className="text-emerald" />
                  <span>Project Library &amp; Repositories...</span>
                </div>
                <span className="menu-shortcut">Ctrl+O</span>
              </div>
            )}

            {onExportNSurv && (
              <div className="menu-dropdown-item" onClick={() => handleAction(onExportNSurv)}>
                <div className="menu-item-left">
                  <Download size={14} className="text-cyan" />
                  <span>Export Native .nsurv Bundle...</span>
                </div>
                <span className="menu-shortcut">Ctrl+S</span>
              </div>
            )}

            {onImportNSurv && (
              <div className="menu-dropdown-item" onClick={() => handleAction(onImportNSurv)}>
                <div className="menu-item-left">
                  <Upload size={14} className="text-cyan" />
                  <span>Import Native .nsurv Bundle...</span>
                </div>
              </div>
            )}

            <div className="menu-dropdown-divider" />

            <div className="menu-dropdown-item" onClick={() => handleAction(onOpenCsvImporter)}>
              <div className="menu-item-left">
                <Upload size={14} className="text-muted" />
                <span>Universal Field CSV Importer...</span>
              </div>
              <span className="menu-shortcut">Ctrl+I</span>
            </div>

            {onOpenSurvpackImporter && (
              <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('LEGACY_BATCH_IMPORT', onOpenSurvpackImporter)}>
                <div className="menu-item-left">
                  <FolderArchive size={14} className="text-cyan" />
                  <span>Import SurvPack 3.0 Project Archive...</span>
                </div>
                {renderTierBadge('LEGACY_BATCH_IMPORT')}
              </div>
            )}

            <div className="menu-dropdown-item" onClick={() => handleAction(onLoadDemo)}>
              <div className="menu-item-left">
                <RefreshCw size={14} className="text-emerald" />
                <span>Load Demo Benchmark (CKC Extension)</span>
              </div>
            </div>

            <div className="menu-dropdown-divider" />

            <div className="menu-dropdown-item" onClick={() => handleAction(onExportSCR)}>
              <div className="menu-item-left">
                <FileCode size={14} className="text-cyan" />
                <span>Export AutoCAD Script (.SCR)</span>
              </div>
            </div>

            <div className="menu-dropdown-item" onClick={() => handleAction(onExportDXF)}>
              <div className="menu-item-left">
                <Download size={14} className="text-emerald" />
                <span>Export Vector CAD Drawing (.DXF)</span>
              </div>
            </div>

            <div className="menu-dropdown-item" onClick={() => handleAction(onExportCSV)}>
              <div className="menu-item-left">
                <Table size={14} className="text-muted" />
                <span>Export Coordinate Book (CSV / Excel)</span>
              </div>
            </div>

            <div className="menu-dropdown-item" onClick={() => handleAction(onOpenTdp)}>
              <div className="menu-item-left">
                <Printer size={14} className="text-emerald" />
                <span>Print / Export Title Deed Plan (TDP PDF)...</span>
              </div>
              <span className="menu-shortcut">Ctrl+P</span>
            </div>

            <div className="menu-dropdown-divider" />

            <div className="menu-dropdown-item" onClick={() => handleAction(onOpenProjectSettings)}>
              <div className="menu-item-left">
                <Settings size={14} className="text-muted" />
                <span>Project Metadata & Location...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. EDIT MENU */}
      <div className={`menu-bar-item-container ${openMenu === 'edit' ? 'open' : ''}`}>
        <button
          className={`menu-bar-btn ${openMenu === 'edit' ? 'active' : ''}`}
          onClick={() => handleMenuClick('edit')}
        >
          Edit
        </button>

        {openMenu === 'edit' && (
          <div className="menu-dropdown-popup">
            <div
              className={`menu-dropdown-item ${!canUndo ? 'disabled' : ''}`}
              onClick={() => canUndo && handleAction(onUndo)}
            >
              <div className="menu-item-left">
                <Undo2 size={14} className="text-muted" />
                <span>Undo</span>
              </div>
              <span className="menu-shortcut">Ctrl+Z</span>
            </div>

            <div
              className={`menu-dropdown-item ${!canRedo ? 'disabled' : ''}`}
              onClick={() => canRedo && handleAction(onRedo)}
            >
              <div className="menu-item-left">
                <Redo2 size={14} className="text-muted" />
                <span>Redo</span>
              </div>
              <span className="menu-shortcut">Ctrl+Y</span>
            </div>

            <div className="menu-dropdown-item" onClick={() => handleAction(onOpenHistory)}>
              <div className="menu-item-left">
                <History size={14} className="text-cyan" />
                <span>Version Control Snapshot Timeline...</span>
              </div>
              <span className="menu-shortcut">Ctrl+H</span>
            </div>

            <div className="menu-dropdown-divider" />

            <div className="menu-dropdown-item" onClick={() => handleAction(onOpenRenumber)}>
              <div className="menu-item-left">
                <Tag size={14} className="text-emerald" />
                <span>Batch Prefix & Renumber Beacons (frmRenum)...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. VIEW MENU */}
      <div className={`menu-bar-item-container ${openMenu === 'view' ? 'open' : ''}`}>
        <button
          className={`menu-bar-btn ${openMenu === 'view' ? 'active' : ''}`}
          onClick={() => handleMenuClick('view')}
        >
          View
        </button>

        {openMenu === 'view' && (
          <div className="menu-dropdown-popup">
            <div className="menu-dropdown-item" onClick={() => handleAction(onToggleLeft)}>
              <div className="menu-item-left">
                <PanelLeft size={14} className={isLeftVisible ? 'text-emerald' : 'text-muted'} />
                <span>{isLeftVisible ? 'Hide Coordinate Table (Left Sidebar)' : 'Show Coordinate Table (Left Sidebar)'}</span>
              </div>
            </div>

            <div className="menu-dropdown-item" onClick={() => handleAction(onToggleRight)}>
              <div className="menu-item-left">
                <PanelRight size={14} className={isRightVisible ? 'text-emerald' : 'text-muted'} />
                <span>{isRightVisible ? 'Hide Parcel & Layers (Right Sidebar)' : 'Show Parcel & Layers (Right Sidebar)'}</span>
              </div>
            </div>

            <div className="menu-dropdown-divider" />

            <div className="menu-dropdown-item" onClick={() => handleAction(onToggleMaximize)}>
              <div className="menu-item-left">
                <Maximize2 size={14} className="text-cyan" />
                <span>Toggle Fullscreen Canvas Max View</span>
              </div>
            </div>

            <div className="menu-dropdown-divider" />

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('EARTH_VIEW_STUDIO', onOpenEarthView)}>
              <div className="menu-item-left">
                <Globe size={14} className="text-emerald" />
                <span>Earth View Satellite &amp; GIS Studio...</span>
              </div>
              {renderTierBadge('EARTH_VIEW_STUDIO')}
            </div>
          </div>
        )}
      </div>

      {/* 4. TOOLS MENU (Geomatics Suite) */}
      <div className={`menu-bar-item-container ${openMenu === 'tools' ? 'open' : ''}`}>
        <button
          className={`menu-bar-btn ${openMenu === 'tools' ? 'active' : ''}`}
          onClick={() => handleMenuClick('tools')}
        >
          Tools
        </button>

        {openMenu === 'tools' && (
          <div className="menu-dropdown-popup">
            <div className="menu-dropdown-item" onClick={() => handleAction(onOpenCogo)}>
              <div className="menu-item-left">
                <Calculator size={14} className="text-emerald" />
                <span>COGO Coordinate Geometry &amp; Inversing Studio</span>
              </div>
            </div>

            <div className="menu-dropdown-divider" />

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('TRAVERSE_BALANCING', onOpenTraverse)}>
              <div className="menu-item-left">
                <Compass size={14} className="text-cyan" />
                <span>Traverse Reduction & Loop Balancing Studio</span>
              </div>
              {renderTierBadge('TRAVERSE_BALANCING')}
            </div>

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('LEVELING_STUDIO', onOpenLeveling)}>
              <div className="menu-item-left">
                <Ruler size={14} className="text-emerald" />
                <span>Spirit Leveling Studio (HPC &amp; Rise/Fall)</span>
              </div>
              {renderTierBadge('LEVELING_STUDIO')}
            </div>

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('TACHEOMETRY_DTM', onOpenTacheometry)}>
              <div className="menu-item-left">
                <Compass size={14} className="text-amber" />
                <span>Stadia &amp; Total Station Tacheometry Studio</span>
              </div>
              {renderTierBadge('TACHEOMETRY_DTM')}
            </div>

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('SETOUT_STAKING', onOpenSetout)}>
              <div className="menu-item-left">
                <Target size={14} className="text-amber" />
                <span>Setout / Setting-Out Studio</span>
              </div>
              {renderTierBadge('SETOUT_STAKING')}
            </div>

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('EARTH_VIEW_STUDIO', onOpenEarthView)}>
              <div className="menu-item-left">
                <Globe size={14} className="text-emerald" />
                <span>Earth View Satellite &amp; GIS Studio</span>
              </div>
              {renderTierBadge('EARTH_VIEW_STUDIO')}
            </div>

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('DATUM_TRANSFORM', onOpenDatumTransform)}>
              <div className="menu-item-left">
                <Globe size={14} className="text-cyan" />
                <span>Datum Transform (Minna ↔ WGS84)</span>
              </div>
              {renderTierBadge('DATUM_TRANSFORM')}
            </div>

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('ALIGNMENT_STUDIO', onOpenAlignment)}>
              <div className="menu-item-left">
                <Compass size={14} className="text-magenta" style={{ color: '#ec4899' }} />
                <span>Horizontal Alignment &amp; Earthworks Studio</span>
              </div>
              {renderTierBadge('ALIGNMENT_STUDIO')}
            </div>

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('VERTICAL_ALIGNMENT', onOpenVerticalAlignment)}>
              <div className="menu-item-left">
                <Compass size={14} className="text-emerald" />
                <span>Road Vertical Curve Profile Studio</span>
              </div>
              {renderTierBadge('VERTICAL_ALIGNMENT')}
            </div>

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('SUBDIVISION_STUDIO', onOpenSubdivision)}>
              <div className="menu-item-left">
                <Layers size={14} className="text-emerald" />
                <span>Area Sub-Division &amp; Land Splitting Studio</span>
              </div>
              {renderTierBadge('SUBDIVISION_STUDIO')}
            </div>

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('DXF_STUDIO', onOpenCadStudio || onOpenDxf)}>
              <div className="menu-item-left">
                <Layers size={14} className="text-cyan" />
                <span>AutoCAD DWG &amp; Script (.SCR) Drafting Studio</span>
              </div>
              {renderTierBadge('DXF_STUDIO')}
            </div>

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('DXF_STUDIO', onOpenDxf)}>
              <div className="menu-item-left">
                <FileCode size={14} className="text-muted" />
                <span>AutoCAD DXF File Exchange Studio</span>
              </div>
              {renderTierBadge('DXF_STUDIO')}
            </div>

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('RESECTION_STUDIO', onOpenResection)}>
              <div className="menu-item-left">
                <Target size={14} className="text-amber" />
                <span>Resection &amp; COGO Intersections Studio</span>
              </div>
              {renderTierBadge('RESECTION_STUDIO')}
            </div>

            <div className="menu-dropdown-item" onClick={() => handleAction(onOpenCsvImporter)}>
              <div className="menu-item-left">
                <Upload size={14} className="text-cyan" />
                <span>Universal Field CSV &amp; Raw Schema Importer</span>
              </div>
            </div>

            <div className="menu-dropdown-divider" />

            <div className="menu-dropdown-item" onClick={() => checkAccessAndRun('TDP_PRINT_STUDIO', onOpenTdp)}>
              <div className="menu-item-left">
                <FileText size={14} className="text-emerald" />
                <span>Official Title Deed Plan (TDP) Print Studio</span>
              </div>
              {renderTierBadge('TDP_PRINT_STUDIO')}
            </div>
          </div>
        )}
      </div>

      {/* 5. SETTINGS MENU */}
      <div className={`menu-bar-item-container ${openMenu === 'settings' ? 'open' : ''}`}>
        <button
          className={`menu-bar-btn ${openMenu === 'settings' ? 'active' : ''}`}
          onClick={() => handleMenuClick('settings')}
        >
          Settings
        </button>

        {openMenu === 'settings' && (
          <div className="menu-dropdown-popup">
            <div className="menu-dropdown-header">Coordinate System (Minna Datum)</div>
            
            <div
              className={`menu-dropdown-item ${gridBelt === NigerianGridBelt.WEST_BELT ? 'selected' : ''}`}
              onClick={() => handleAction(() => onSelectBelt(NigerianGridBelt.WEST_BELT))}
            >
              <div className="menu-item-left">
                <Globe size={14} className="text-muted" />
                <span>Minna West Belt (4.5°E)</span>
              </div>
              {gridBelt === NigerianGridBelt.WEST_BELT && <span className="menu-check">✓</span>}
            </div>

            <div
              className={`menu-dropdown-item ${gridBelt === NigerianGridBelt.MID_BELT ? 'selected' : ''}`}
              onClick={() => handleAction(() => onSelectBelt(NigerianGridBelt.MID_BELT))}
            >
              <div className="menu-item-left">
                <Globe size={14} className="text-emerald" />
                <span>Minna Mid Belt (8.5°E - Abuja FCT)</span>
              </div>
              {gridBelt === NigerianGridBelt.MID_BELT && <span className="menu-check">✓</span>}
            </div>

            <div
              className={`menu-dropdown-item ${gridBelt === NigerianGridBelt.EAST_BELT ? 'selected' : ''}`}
              onClick={() => handleAction(() => onSelectBelt(NigerianGridBelt.EAST_BELT))}
            >
              <div className="menu-item-left">
                <Globe size={14} className="text-muted" />
                <span>Minna East Belt (12.5°E)</span>
              </div>
              {gridBelt === NigerianGridBelt.EAST_BELT && <span className="menu-check">✓</span>}
            </div>

            <div className="menu-dropdown-divider" />

            <div className="menu-dropdown-item" onClick={() => handleAction(onToggleAutoSave)}>
              <div className="menu-item-left">
                <Save size={14} className={autoSaveEnabled ? 'text-emerald' : 'text-muted'} />
                <span>{autoSaveEnabled ? 'Pause Project Auto-Save' : 'Enable Project Auto-Save'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
