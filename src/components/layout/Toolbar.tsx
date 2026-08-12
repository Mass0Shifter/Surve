import React from 'react';
import { CadTool } from '../../engine/types';
import { MousePointer, Hand, PlusCircle, Compass, Undo2, Redo2 } from 'lucide-react';

interface ToolbarProps {
  activeTool: CadTool;
  onSelectTool: (tool: CadTool) => void;
  onOpenCogo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onSelectTool,
  onOpenCogo,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}) => {
  const tools: { id: CadTool; label: string; icon: React.ReactNode }[] = [
    { id: 'select', label: 'Select Object', icon: <MousePointer size={15} /> },
    { id: 'pan', label: 'Pan Viewport', icon: <Hand size={15} /> },
    { id: 'add_beacon', label: 'Add Beacon (Click Canvas)', icon: <PlusCircle size={15} /> }
  ];

  return (
    <div className="cad-toolbar">
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
      </div>

      <div className="tool-divider" />

      {/* CAD Navigation & Pointing Tools */}
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

      {/* COGO Shortcut */}
      <div className="tool-group">
        <button
          className="tool-btn"
          title="Open COGO Inversing & Forward Calculator"
          onClick={onOpenCogo}
        >
          <Compass size={15} className="text-emerald" />
          <span className="tool-btn-label">COGO</span>
        </button>
      </div>
    </div>
  );
};
