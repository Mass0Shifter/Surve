import React from 'react';
import { CadTool } from '../../engine/types';
import { MousePointer, Hand, PlusCircle, Compass } from 'lucide-react';

interface ToolbarProps {
  activeTool: CadTool;
  onSelectTool: (tool: CadTool) => void;
  onOpenCogo: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ activeTool, onSelectTool, onOpenCogo }) => {
  const tools: { id: CadTool; label: string; icon: React.ReactNode }[] = [
    { id: 'select', label: 'Select Object', icon: <MousePointer size={15} /> },
    { id: 'pan', label: 'Pan Viewport', icon: <Hand size={15} /> },
    { id: 'add_beacon', label: 'Add Beacon (Click Canvas)', icon: <PlusCircle size={15} /> }
  ];

  return (
    <div className="cad-toolbar">
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
