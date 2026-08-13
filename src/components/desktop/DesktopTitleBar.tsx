import React from 'react';
import {
  isDesktopApp,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow
} from '../../engine/desktop/desktopBridge';
import { Minus, Square, X, Compass } from 'lucide-react';
import { ProjectMetadata } from '../../engine/types';

interface DesktopTitleBarProps {
  project?: ProjectMetadata;
  forceShow?: boolean;
}

export const DesktopTitleBar: React.FC<DesktopTitleBarProps> = ({ project, forceShow }) => {
  const isDesktop = forceShow || isDesktopApp();

  if (!isDesktop) return null;

  return (
    <div className="desktop-titlebar" data-tauri-drag-region>
      {/* Left: App Brand & Icon */}
      <div className="desktop-titlebar-left" data-tauri-drag-region>
        <div className="desktop-app-icon">
          <Compass size={14} className="text-cyan" />
        </div>
        <span className="desktop-app-title">NSurvey PRO</span>
        <span className="desktop-app-edition">Desktop v1.0.0</span>
      </div>

      {/* Center: Current Active Project Title */}
      <div className="desktop-titlebar-center" data-tauri-drag-region>
        {project ? (
          <div className="desktop-project-badge">
            <span className="proj-code-badge pro" style={{ fontSize: '9px', padding: '1px 5px' }}>
              {project.code || 'JOB'}
            </span>
            <span className="desktop-project-name">{project.title || 'Untitled Survey Project'}</span>
          </div>
        ) : (
          <span className="desktop-project-name">Geomatics CAD &amp; Computational Suite</span>
        )}
      </div>

      {/* Right: Window Controls */}
      <div className="desktop-titlebar-right">
        <button
          type="button"
          className="desktop-window-btn minimize"
          onClick={minimizeWindow}
          title="Minimize"
        >
          <Minus size={12} />
        </button>

        <button
          type="button"
          className="desktop-window-btn maximize"
          onClick={toggleMaximizeWindow}
          title="Maximize / Restore"
        >
          <Square size={10} />
        </button>

        <button
          type="button"
          className="desktop-window-btn close"
          onClick={closeWindow}
          title="Close NSurvey PRO"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
};
