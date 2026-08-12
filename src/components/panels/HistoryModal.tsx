import React from 'react';
import { HistorySnapshot } from '../../engine/types';
import { History, Clock, ArrowRight, Trash2, CheckCircle2, RotateCcw } from 'lucide-react';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  currentSnapshot: HistorySnapshot;
  historyLimit: number;
  onSetHistoryLimit: (limit: number) => void;
  onJumpToSnapshot: (index: number, isUndo: boolean) => void;
  onClearHistory: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  undoStack,
  redoStack,
  currentSnapshot,
  historyLimit,
  onSetHistoryLimit,
  onJumpToSnapshot,
  onClearHistory
}) => {
  if (!isOpen) return null;

  const totalHistoryCount = undoStack.length + redoStack.length + 1;

  return (
    <div className="modal-overlay">
      <div className="modal-content history-modal">
        <div className="modal-header">
          <div className="modal-title">
            <History size={16} className="text-emerald" />
            <span>Version Control & Action Timeline ({totalHistoryCount} States)</span>
          </div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* History Limit Setting */}
          <div className="history-settings-bar">
            <div className="history-settings-label">
              <span>Max History Capacity:</span>
              <strong className="text-emerald">{historyLimit} points</strong>
              <span className="hint-text">(Max: 256)</span>
            </div>
            <div className="history-limit-controls">
              <input
                type="range"
                min="10"
                max="256"
                step="5"
                value={historyLimit}
                onChange={(e) => onSetHistoryLimit(parseInt(e.target.value) || 50)}
              />
              <button
                type="button"
                className="btn-danger-xs"
                title="Clear all undo/redo history"
                onClick={() => {
                  if (confirm('Clear all undo and redo history? Current workspace state will be kept.')) {
                    onClearHistory();
                  }
                }}
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Timeline List */}
          <div className="history-timeline-scroll">
            {/* 1. Redo Items (Future) */}
            {redoStack.slice().reverse().map((snap, idx) => {
              const actualIdx = redoStack.length - 1 - idx;
              return (
                <div
                  key={`redo-${actualIdx}`}
                  className="timeline-item redo-item"
                  onClick={() => {
                    onJumpToSnapshot(actualIdx, false);
                    onClose();
                  }}
                  title="Click to jump forward to this state"
                >
                  <div className="timeline-dot redo-dot" />
                  <div className="timeline-info">
                    <div className="timeline-desc text-muted">
                      <span>{snap.description}</span>
                      <span className="timeline-badge-sub">Redo State</span>
                    </div>
                    <div className="timeline-meta">
                      <Clock size={10} className="inline-icon" />
                      <span>{snap.timestamp ? new Date(snap.timestamp).toLocaleTimeString() : 'Recent'}</span>
                      <span>• {snap.points.length} Beacons</span>
                      <span>• {snap.parcels.length} Parcels</span>
                    </div>
                  </div>
                  <ArrowRight size={14} className="timeline-arrow text-muted" />
                </div>
              );
            })}

            {/* 2. Current State */}
            <div className="timeline-item current-item">
              <div className="timeline-dot current-dot" />
              <div className="timeline-info">
                <div className="timeline-desc text-emerald font-bold">
                  <CheckCircle2 size={13} className="inline-icon text-emerald" />
                  <span>Current Active State ({currentSnapshot.description || 'Live Workspace'})</span>
                </div>
                <div className="timeline-meta">
                  <Clock size={10} className="inline-icon" />
                  <span>Now</span>
                  <span>• {currentSnapshot.points.length} Beacons</span>
                  <span>• {currentSnapshot.parcels.length} Parcels</span>
                </div>
              </div>
            </div>

            {/* 3. Undo Items (Past) */}
            {undoStack.slice().reverse().map((snap, idx) => {
              const actualIdx = undoStack.length - 1 - idx;
              return (
                <div
                  key={`undo-${actualIdx}`}
                  className="timeline-item undo-item"
                  onClick={() => {
                    onJumpToSnapshot(actualIdx, true);
                    onClose();
                  }}
                  title="Click to restore this previous state"
                >
                  <div className="timeline-dot undo-dot" />
                  <div className="timeline-info">
                    <div className="timeline-desc">
                      <span>{snap.description}</span>
                    </div>
                    <div className="timeline-meta">
                      <Clock size={10} className="inline-icon" />
                      <span>{snap.timestamp ? new Date(snap.timestamp).toLocaleTimeString() : 'Past'}</span>
                      <span>• {snap.points.length} Beacons</span>
                      <span>• {snap.parcels.length} Parcels</span>
                    </div>
                  </div>
                  <RotateCcw size={13} className="timeline-arrow text-cyan" />
                </div>
              );
            })}

            {undoStack.length === 0 && redoStack.length === 0 && (
              <div className="empty-panel-msg">
                No past actions in history yet. All actions you perform will appear in this timeline.
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Close Timeline</button>
        </div>
      </div>
    </div>
  );
};
