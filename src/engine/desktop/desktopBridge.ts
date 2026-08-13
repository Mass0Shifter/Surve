/**
 * NSurvey PRO — Universal Desktop Bridge Engine
 * Provides a unified abstraction layer connecting UI components with
 * native OS APIs (Tauri 2.0 / Electron) while guaranteeing 100% web browser fallback.
 */

import { downloadNSurvBundle } from '../storage/nsurvBundle';
import { ProjectMetadata, CoordinatePoint, Parcel } from '../types';

export type DesktopRuntime = 'tauri' | 'electron' | 'web';

export interface SystemInfo {
  runtime: DesktopRuntime;
  platform: string;
  version: string;
  isDesktop: boolean;
}

/**
 * Detects the active runtime host environment.
 */
export function getDesktopRuntime(): DesktopRuntime {
  if (typeof window !== 'undefined') {
    if ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) {
      return 'tauri';
    }
    if ((window as any).electronAPI || (window as any).process?.versions?.electron) {
      return 'electron';
    }
  }
  return 'web';
}

/**
 * Checks if the application is running inside a native desktop container.
 */
export function isDesktopApp(): boolean {
  return getDesktopRuntime() !== 'web';
}

/**
 * Retrieves system environment metadata.
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  const runtime = getDesktopRuntime();
  const isDesktop = runtime !== 'web';

  if (runtime === 'tauri') {
    try {
      const tauri = (window as any).__TAURI__;
      const os = tauri?.os;
      const app = tauri?.app;
      const platform = os ? await os.platform() : 'Windows (Tauri)';
      const version = app ? await app.getVersion() : '1.0.0';
      return { runtime, platform, version, isDesktop };
    } catch {
      return { runtime, platform: 'Windows (Tauri Native)', version: '1.0.0', isDesktop };
    }
  }

  if (runtime === 'electron') {
    const electron = (window as any).electronAPI;
    return {
      runtime,
      platform: electron?.platform || 'Desktop (Electron)',
      version: electron?.version || '1.0.0',
      isDesktop
    };
  }

  return {
    runtime: 'web',
    platform: typeof navigator !== 'undefined' ? navigator.platform : 'Web Browser',
    version: '1.0.0-web',
    isDesktop: false
  };
}

/**
 * Native Window Controls (Minimize, Maximize, Close)
 */
export async function minimizeWindow(): Promise<void> {
  const runtime = getDesktopRuntime();
  if (runtime === 'tauri') {
    try {
      const { getCurrentWindow } = (window as any).__TAURI__.window;
      await getCurrentWindow().minimize();
    } catch (e) {
      console.warn('Tauri minimize error:', e);
    }
  } else if (runtime === 'electron') {
    (window as any).electronAPI?.minimize();
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  const runtime = getDesktopRuntime();
  if (runtime === 'tauri') {
    try {
      const { getCurrentWindow } = (window as any).__TAURI__.window;
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      console.warn('Tauri maximize error:', e);
    }
  } else if (runtime === 'electron') {
    (window as any).electronAPI?.toggleMaximize();
  }
}

export async function closeWindow(): Promise<void> {
  const runtime = getDesktopRuntime();
  if (runtime === 'tauri') {
    try {
      const { getCurrentWindow } = (window as any).__TAURI__.window;
      await getCurrentWindow().close();
    } catch (e) {
      console.warn('Tauri close error:', e);
    }
  } else if (runtime === 'electron') {
    (window as any).electronAPI?.close();
  }
}

/**
 * Universal Native File Save Adapter.
 * In desktop mode, triggers native Windows Save File dialog; in browser, triggers download.
 */
export async function saveProjectFileNative(
  project: ProjectMetadata,
  points: CoordinatePoint[],
  parcels: Parcel[],
  _options?: { defaultFilename?: string }
): Promise<boolean> {
  const runtime = getDesktopRuntime();

  if (runtime === 'tauri') {
    try {
      const dialog = (window as any).__TAURI__?.dialog;
      const fs = (window as any).__TAURI__?.fs;

      if (dialog && fs) {
        const filePath = await dialog.save({
          filters: [
            { name: 'NSurvey Project Bundle', extensions: ['nsurv'] },
            { name: 'All Files', extensions: ['*'] }
          ],
          defaultPath: `${project.code || 'PROJECT'}.nsurv`
        });

        if (filePath) {
          const bundleJson = JSON.stringify({
            format: 'NSURVEY_PROJECT_BUNDLE',
            version: '1.0.0',
            exportedAt: Date.now(),
            app: 'NSurvey PRO Geomatics Suite',
            project,
            points,
            parcels
          }, null, 2);

          await fs.writeTextFile(filePath, bundleJson);
          return true;
        }
        return false; // User cancelled
      }
    } catch (err) {
      console.warn('Tauri native save failed, falling back to browser download:', err);
    }
  }

  // Fallback to browser Blob download
  downloadNSurvBundle(project, points, parcels);
  return true;
}
