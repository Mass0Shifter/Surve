import React from 'react';
import { FeatureId, getFeatureDefinition } from '../../engine/subscription/featureGating';
import { Crown, Sparkles, CheckCircle2, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface UpgradePromptModalProps {
  isOpen: boolean;
  featureId: FeatureId | null;
  onClose: () => void;
  onOpenSubscription: () => void;
}

export const UpgradePromptModal: React.FC<UpgradePromptModalProps> = ({
  isOpen,
  featureId,
  onClose,
  onOpenSubscription
}) => {
  if (!isOpen || !featureId) return null;

  const def = getFeatureDefinition(featureId);
  const isEnterpriseOnly = def.minTier === 'ENTERPRISE';

  const handleUpgradeClick = () => {
    onClose();
    onOpenSubscription();
  };

  return (
    <ErrorBoundary>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content"
          style={{
            width: '540px',
            maxWidth: '95vw',
            background: '#090d16',
            border: isEnterpriseOnly ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '14px',
            padding: '24px 28px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(16, 185, 129, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Badge */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: isEnterpriseOnly ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  border: isEnterpriseOnly ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(16, 185, 129, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {isEnterpriseOnly ? (
                  <Crown size={22} className="text-amber" />
                ) : (
                  <Lock size={22} className="text-emerald" />
                )}
              </div>
              <div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: isEnterpriseOnly ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    color: isEnterpriseOnly ? '#fbbf24' : '#34d399',
                    border: isEnterpriseOnly ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)'
                  }}
                >
                  {isEnterpriseOnly ? 'ENTERPRISE TIER REQUIRED' : 'PROFESSIONAL TIER REQUIRED'}
                </span>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#f8fafc', margin: '4px 0 0' }}>
                  {def.name}
                </h3>
              </div>
            </div>
            <button className="icon-btn" onClick={onClose}>✕</button>
          </div>

          {/* Tagline */}
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0', lineHeight: 1.5 }}>
            {def.tagline}
          </p>

          {/* Benefits Box */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(148, 163, 184, 0.15)',
              borderRadius: '10px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.3px' }}>
              UNLOCKED WITH {def.minTier} SUBSCRIPTION:
            </div>
            {def.benefits.map((b, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#cbd5e1' }}>
                <CheckCircle2 size={14} className="text-emerald" style={{ flexShrink: 0 }} />
                <span>{b}</span>
              </div>
            ))}
          </div>

          {/* Sandboxed Simulation Note */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              color: '#38bdf8',
              background: 'rgba(6, 182, 212, 0.08)',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(6, 182, 212, 0.2)'
            }}
          >
            <Sparkles size={14} />
            <span>Sandbox Mode Active: You can upgrade instantly with test credentials in the Subscription Studio!</span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              className="btn-secondary-sm"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={onClose}
            >
              <span>Continue on Community</span>
            </button>
            <button
              type="button"
              className="btn-primary-sm"
              style={{ flex: 1.4, justifyContent: 'center', background: 'var(--emerald)' }}
              onClick={handleUpgradeClick}
            >
              <ShieldCheck size={14} />
              <span>Upgrade Plan to Unlock</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};
