import React from 'react';
import { CadTool } from '../../engine/types';
import { MousePointer, Hand, PlusCircle, Ruler, Compass, Globe, Undo2, Redo2, History, PanelLeft, PanelRight, Maximize2, Minimize2, Layers, FileText } from 'lucide-react';

interface ToolbarProps {
  activeTool: CadTool;
  onSelectTool: (tool: CadTool) => void;
  onOpenCogo: () => void;
  onOpenEarthView?: () => void;
  onOpenTraverse?: () => void;
  onOpenCadStudio?: () => void;
  onOpenTdp?: () => void;
  activeView?: 'workspace' | 'cad_studio' | 'tdp_studio';
  onOpenHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  historyCount: number;
  isLeftVisible: boolean;
  isRightVisible: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onToggleMaximizeCanvas: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onSelectTool,
  onOpenCogo,
  onOpenEarthView = () => {},
  onOpenTraverse,
  onOpenCadStudio,
  onOpenTdp,
  activeView = 'workspace',
  onOpenHistory,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  historyCount,
  isLeftVisible,
  isRightVisible,
  onToggleLeft,
  onToggleRight,
  onToggleMaximizeCanvas
}) => {
  const isMaximized = !isLeftVisible && !isRightVisible;

  const tools: { id: CadTool; label: string; icon: React.ReactNode }[] = [
    { id: 'select', label: 'Select Object', icon: <MousePointer size={15} /> },
    { id: 'pan', label: 'Pan Viewport', icon: <Hand size={15} /> },
    { id: 'add_beacon', label: 'Add Beacon (Click Canvas)', icon: <PlusCircle size={15} /> },
    { id: 'measure', label: 'Measure Distance & Bearing', icon: <Ruler size={15} /> }
  ];

  return (
    <div className="cad-toolbar">
      {/* Left: Workbench & In-Canvas Drawing Tools */}
      <div className="toolbar-left-tools">
        {/* Workbench Panel Toggles */}
        <div className="tool-group">
          <button
            className={`tool-btn ${isLeftVisible ? 'active' : ''}`}
            title={isLeftVisible ? 'Hide Coordinates Panel' : 'Show Coordinates Panel'}
            onClick={onToggleLeft}
          >
            <PanelLeft size={15} />
            <span className="tool-btn-label">Coords</span>
          </button>
          <button
            className={`tool-btn ${isRightVisible ? 'active' : ''}`}
            title={isRightVisible ? 'Hide Inspector & Layers' : 'Show Inspector & Layers'}
            onClick={onToggleRight}
          >
            <PanelRight size={15} />
            <span className="tool-btn-label">Inspector</span>
          </button>
          <button
            className={`tool-btn ${isMaximized ? 'active' : ''}`}
            title={isMaximized ? 'Restore Panels' : 'Maximize Canvas (Full View)'}
            onClick={onToggleMaximizeCanvas}
          >
            {isMaximized ? <Minimize2 size={15} className="text-emerald" /> : <Maximize2 size={15} />}
            <span className="tool-btn-label">{isMaximized ? 'Restore' : 'Max View'}</span>
          </button>
        </div>

        <div className="tool-divider" />

        {/* Undo & Redo Group */}
        <div className="tool-group">
          <button
            className="tool-btn"
            title="Undo (Ctrl+Z)"
            disabled={!canUndo}
            onClick={onUndo}
            style={{ opacity: canUndo ? 1 : 0.4, cursor: canUndo ? 'pointer' : 'not-allowed' }}
          >
            <Undo2 size={15} />
            <span className="tool-btn-label">Undo</span>
          </button>
          <button
            className="tool-btn"
            title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={onRedo}
            style={{ opacity: canRedo ? 1 : 0.4, cursor: canRedo ? 'pointer' : 'not-allowed' }}
          >
            <Redo2 size={15} />
            <span className="tool-btn-label">Redo</span>
          </button>
          <button
            className="tool-btn"
            title="View Version Timeline & History"
            onClick={onOpenHistory}
          >
            <History size={15} className="text-cyan" />
            <span className="tool-btn-label">History ({historyCount})</span>
          </button>
        </div>

        <div className="tool-divider" />

        {/* CAD Navigation, Pointing, and Measurement Tools */}
        <div className="tool-group">
          {tools.map(t => {
            const isActive = activeTool === t.id;
            return (
              <button
                key={t.id}
                className={`tool-btn ${isActive ? 'active' : ''}`}
                title={t.label}
                onClick={() => onSelectTool(t.id)}
              >
                {t.icon}
                <span className="tool-btn-label">{t.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        <div className="tool-divider" />

        {/* COGO & Earth Satellite GIS Shortcuts */}
        <div className="tool-group">
          <button
            className="tool-btn"
            title="Open COGO Inversing & Forward Calculator"
            onClick={onOpenCogo}
          >
            <Compass size={15} className="text-emerald" />
            <span className="tool-btn-label">COGO</span>
          </button>

          <button
            className="tool-btn"
            title="Open Earth View — Satellite Imagery & Cadastral GIS Studio"
            onClick={onOpenEarthView}
          >
            <Globe size={15} className="text-cyan" />
            <span className="tool-btn-label">Earth View</span>
          </button>
        </div>
      </div>

      {/* Right: Studio Suite Action Launchers */}
      <div className="toolbar-studio-launchers">
        {onOpenTraverse && (
          <button
            id="btn-open-traverse-modal"
            className="btn-toolbar-studio"
            title="Traverse Field Book & Loop Balancing Studio"
            onClick={onOpenTraverse}
          >
            <Compass size={13} className="text-cyan" />
            <span>Traverse</span>
          </button>
        )}

        {onOpenCadStudio && (
          <button
            id="btn-open-cad-studio"
            className={`btn-toolbar-studio ${activeView === 'cad_studio' ? 'active' : ''}`}
            title="AutoCAD DWG/DXF Drafting Studio & Virtual Machine"
            onClick={onOpenCadStudio}
          >
            <Layers size={13} className="text-cyan" />
            <span>CAD Studio</span>
          </button>
        )}

        {onOpenTdp && (
          <button
            className={`btn-toolbar-primary ${activeView === 'tdp_studio' ? 'active' : ''}`}
            title="Generate Official Title Deed Plan (PDF / Print)"
            onClick={onOpenTdp}
          >
            <FileText size={13} />
            <span>TDP Studio</span>
          </button>
        )}
      </div>
    </div>
  );
};
