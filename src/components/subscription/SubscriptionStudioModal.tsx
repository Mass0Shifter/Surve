import React, { useState, useEffect } from 'react';
import { UserProfile, SubscriptionTier } from '../../engine/auth/authTypes';
import { BillingFrequency, PaymentTransaction } from '../../engine/subscription/subscriptionTypes';
import {
  SUBSCRIPTION_PLANS,
  calculatePlanPrice,
  startCheckout,
  requestOfflineLicense,
  activateOfflineLicense,
  getActiveOfflineLicense,
  fetchTransactionHistory
} from '../../engine/subscription/subscriptionEngine';
import { effectiveTier } from '../../engine/subscription/featureGating';
import { isAccountsEnabled } from '../../engine/auth/authEngine';
import {
  Crown,
  CheckCircle2,
  XCircle,
  CreditCard,
  Building2,
  ShieldCheck,
  Key,
  Copy,
  Receipt,
  AlertCircle,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

export interface PaymentNotice {
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'ERROR';
  message: string;
}

interface SubscriptionStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onSubscriptionUpdated?: (user: UserProfile) => void;
  onRequireSignIn?: () => void;
  paymentNotice?: PaymentNotice | null;
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;

export const SubscriptionStudioModal: React.FC<SubscriptionStudioModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSubscriptionUpdated,
  onRequireSignIn,
  paymentNotice
}) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'checkout' | 'offline' | 'history'>('plans');
  const [billingCycle, setBillingCycle] = useState<BillingFrequency>('annual');
  const currency = 'NGN' as const;

  // Checkout State
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('PROFESSIONAL');
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Offline Licence State
  const [tokenInput, setTokenInput] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [tokenStatusMsg, setTokenStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);

  // Transaction History
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCheckoutError(null);
    setTokenStatusMsg(null);
    setGeneratedToken(null);
    if (paymentNotice) setActiveTab('checkout');
    if (currentUser && isAccountsEnabled()) {
      fetchTransactionHistory()
        .then((t) => { setTransactions(t); setHistoryError(null); })
        .catch((e) => setHistoryError(e.message));
    } else {
      setTransactions([]);
    }
  }, [isOpen, currentUser, paymentNotice]);

  if (!isOpen) return null;

  const currentTier: SubscriptionTier = effectiveTier(currentUser);
  const selectedPlan = SUBSCRIPTION_PLANS.find(p => p.tier === selectedTier) || SUBSCRIPTION_PLANS[1];
  const activeOfflineLicense = getActiveOfflineLicense(currentUser?.id);
  const paidTx = transactions.filter(t => t.status === 'SUCCESS');

  const handleStartCheckout = (tier: SubscriptionTier) => {
    setSelectedTier(tier);
    setActiveTab('checkout');
    setCheckoutError(null);
  };

  const handleProcessPayment = async () => {
    if (!currentUser) {
      onRequireSignIn?.();
      setCheckoutError('Please sign in or create an account before subscribing.');
      return;
    }
    setIsProcessing(true);
    setCheckoutError(null);
    try {
      await startCheckout(selectedTier, billingCycle); // redirects to Paystack
    } catch (err: any) {
      setCheckoutError(err.message || 'Could not start checkout.');
      setIsProcessing(false);
    }
  };

  const handleGenerateOfflineToken = async () => {
    if (!currentUser) return;
    setIsIssuing(true);
    setTokenStatusMsg(null);
    try {
      const token = await requestOfflineLicense(30);
      setGeneratedToken(token);
      setCopied(false);
      const res = await activateOfflineLicense(token, currentUser);
      setTokenStatusMsg({ text: res.success ? `${res.message} Copy the code below to use it on another device.` : res.message, isError: !res.success });
    } catch (err: any) {
      setTokenStatusMsg({ text: err.message || 'Could not issue a licence.', isError: true });
    } finally {
      setIsIssuing(false);
    }
  };

  const handleActivateOfflineToken = async () => {
    if (!tokenInput.trim()) {
      setTokenStatusMsg({ text: 'Please paste your offline licence code.', isError: true });
      return;
    }
    const res = await activateOfflineLicense(tokenInput, currentUser);
    setTokenStatusMsg({ text: res.message, isError: !res.success });
    if (res.success) {
      setTokenInput('');
      if (currentUser) onSubscriptionUpdated?.(currentUser);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setTokenStatusMsg({ text: 'Copy failed — select the code and copy it manually.', isError: true });
    }
  };

  return (
    <ErrorBoundary>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content subscription-modal-box" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="auth-modal-header">
            <div className="auth-badge-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>
              <Crown size={24} className="text-amber" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 className="auth-title">Plans &amp; Billing</h2>
                <span className={`proj-code-badge ${currentTier === 'COMMUNITY' ? '' : 'pro'}`} style={{ fontSize: '10px' }}>
                  ACTIVE: {currentTier}
                </span>
              </div>
              <p className="auth-subtitle">
                SURCON seal stamping, Title Deed Plans, traverse balancing, team seats and 30-day offline field licences.
              </p>
            </div>
            <button className="icon-btn auth-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* Navigation Tabs */}
          <div className="traverse-tabs-bar" style={{ marginBottom: '16px', background: 'transparent' }}>
            <button
              type="button"
              className={`traverse-tab-btn ${activeTab === 'plans' ? 'active' : ''}`}
              onClick={() => setActiveTab('plans')}
            >
              <Sparkles size={13} />
              <span>Subscription Plans</span>
            </button>
            <button
              type="button"
              className={`traverse-tab-btn ${activeTab === 'checkout' ? 'active' : ''}`}
              onClick={() => setActiveTab('checkout')}
            >
              <CreditCard size={13} />
              <span>Payment Checkout</span>
            </button>
            <button
              type="button"
              className={`traverse-tab-btn ${activeTab === 'offline' ? 'active' : ''}`}
              onClick={() => setActiveTab('offline')}
            >
              <Key size={13} />
              <span>Offline Field Licence</span>
              {activeOfflineLicense && <span className="tab-pill-badge">Active</span>}
            </button>
            <button
              type="button"
              className={`traverse-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <Receipt size={13} />
              <span>Billing History ({paidTx.length})</span>
            </button>
          </div>

          {/* Modal Scrollable Body */}
          <div className="subscription-modal-body">
            {/* TAB 1: PLANS COMPARISON GRID */}
            {activeTab === 'plans' && (
              <div className="subscription-plans-view">
              {/* Controls Bar: Cycle & Currency */}
              <div className="subscription-controls-bar">
                {/* Frequency Pill Switcher */}
                <div className="billing-cycle-switch">
                  <button
                    type="button"
                    className={`cycle-btn ${billingCycle === 'monthly' ? 'active' : ''}`}
                    onClick={() => setBillingCycle('monthly')}
                  >
                    Monthly Billing
                  </button>
                  <button
                    type="button"
                    className={`cycle-btn ${billingCycle === 'annual' ? 'active' : ''}`}
                    onClick={() => setBillingCycle('annual')}
                  >
                    <span>Annual Billing</span>
                    <span className="discount-pill">Save 17% (2 Months Free)</span>
                  </button>
                </div>

                <div className="currency-switch">
                  <span className="currency-btn active">🇳🇬 Prices in NGN (₦)</span>
                </div>
              </div>

              {/* 3 Tier Cards Grid */}
              <div className="pricing-cards-grid">
                {SUBSCRIPTION_PLANS.map((plan) => {
                  const isCurrent = currentTier === plan.tier;
                  const price = calculatePlanPrice(plan, billingCycle, currency);
                  const formattedPrice = naira(price);

                  return (
                    <div
                      key={plan.tier}
                      className={`pricing-card ${plan.isPopular ? 'popular-card' : ''} ${isCurrent ? 'current-plan-card' : ''}`}
                    >
                      {plan.isPopular && (
                        <div className="popular-badge">
                          <Crown size={11} />
                          <span>MOST POPULAR FOR LICENSED SURVEYORS</span>
                        </div>
                      )}

                      <div className="pricing-card-header">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h3 className="plan-name">{plan.name}</h3>
                          {plan.badge && <span className="plan-tier-badge">{plan.badge}</span>}
                        </div>
                        <p className="plan-tagline">{plan.tagline}</p>

                        <div className="plan-price-box">
                          <span className="price-amount">{formattedPrice}</span>
                          <span className="price-period">{price === 0 ? 'Forever' : billingCycle === 'annual' ? '/year' : '/month'}</span>
                        </div>
                        {billingCycle === 'annual' && price > 0 && (
                          <div className="annual-savings-note">
                            Billed annually ({naira(Math.round(price / 12))}/mo)
                          </div>
                        )}
                      </div>

                      {/* Action Button */}
                      <div className="plan-action-box">
                        {isCurrent ? (
                          <button type="button" className="btn-current-plan" disabled>
                            <CheckCircle2 size={14} className="text-emerald" />
                            <span>Current Plan Active</span>
                          </button>
                        ) : plan.tier === 'COMMUNITY' ? (
                          <button type="button" className="btn-outline-plan" disabled>
                            <span>Included Free</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`btn-upgrade-plan ${plan.isPopular ? 'btn-emerald-glow' : ''}`}
                            onClick={() => handleStartCheckout(plan.tier)}
                          >
                            <span>Upgrade to {plan.name.split(' ')[0]}</span>
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>

                      <div className="pricing-divider" />

                      {/* Features Matrix */}
                      <div className="plan-features-list">
                        <div className="feature-group-label">INCLUDED CAPACITIES:</div>
                        <div className="feature-item-row highlight">
                          <CheckCircle2 size={13} className="text-emerald" />
                          <span><strong>{plan.maxSeats} {plan.maxSeats === 1 ? 'Surveyor Seat' : 'Team Surveyor Seats'}</strong></span>
                        </div>

                        {plan.features.map((feat, idx) => (
                          <div key={idx} className={`feature-item-row ${feat.included ? '' : 'disabled'}`}>
                            {feat.included ? (
                              <CheckCircle2 size={13} className={feat.highlight ? 'text-emerald' : 'text-cyan'} />
                            ) : (
                              <XCircle size={13} className="text-muted" />
                            )}
                            <span className={feat.highlight ? 'feature-highlight' : ''}>{feat.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: CHECKOUT & PAYMENT */}
          {activeTab === 'checkout' && (
            <div className="subscription-checkout-view">
              {paymentNotice && (
                <div className={paymentNotice.status === 'SUCCESS' ? 'form-warning-banner banner-success' : 'form-error-banner'} style={{ marginBottom: '16px' }}>
                  {paymentNotice.status === 'SUCCESS' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                  <span>{paymentNotice.message}</span>
                </div>
              )}
              {checkoutError && (
                <div className="form-error-banner" style={{ marginBottom: '16px' }}>
                  <AlertCircle size={15} />
                  <span>{checkoutError}</span>
                </div>
              )}
              {selectedPlan.tier === 'COMMUNITY' ? (
                <div className="empty-state-box">
                  <p className="empty-title">Choose a paid plan</p>
                  <button type="button" className="btn-primary-sm" onClick={() => setActiveTab('plans')}>View Plans</button>
                </div>
              ) : (
                <div className="checkout-grid-layout">
                  <div className="checkout-form-panel">
                    <h3 className="checkout-section-title">Secure checkout with Paystack</h3>
                    <div className="gateway-card active">
                      <div className="gateway-badge">CARDS · BANK TRANSFER · USSD</div>
                      <div className="gateway-header">
                        <Building2 size={20} className="text-emerald" />
                        <span className="gateway-name">Paystack</span>
                      </div>
                      <p className="gateway-desc">
                        You will be taken to Paystack's secure payment page to pay with Verve, Mastercard or Visa, bank transfer or USSD.
                        NSurvey never sees or stores your card details. Your plan activates as soon as Paystack confirms the payment.
                      </p>
                    </div>
                    <div className="billing-cycle-switch" style={{ marginTop: '16px' }}>
                      <button type="button" className={`cycle-btn ${billingCycle === 'monthly' ? 'active' : ''}`} onClick={() => setBillingCycle('monthly')}>Monthly</button>
                      <button type="button" className={`cycle-btn ${billingCycle === 'annual' ? 'active' : ''}`} onClick={() => setBillingCycle('annual')}>
                        <span>Annual</span>
                        <span className="discount-pill">2 months free</span>
                      </button>
                    </div>
                    {!currentUser && (
                      <p className="auth-info-note" style={{ marginTop: '12px' }}>
                        You need an NSurvey account to subscribe.{' '}
                        <button type="button" className="auth-forgot-link" onClick={() => onRequireSignIn?.()}>Sign in or create one</button>
                      </p>
                    )}
                  </div>

                  <div className="checkout-summary-panel">
                    <h3 className="checkout-section-title">Order Summary</h3>
                    <div className="summary-plan-card">
                      <div className="summary-plan-title">{selectedPlan.name}</div>
                      <div className="summary-plan-desc">{billingCycle === 'annual' ? '12 months access (2 months free)' : '1 month access'}</div>
                      <div className="summary-breakdown-list">
                        <div className="summary-item">
                          <span>Seats included:</span>
                          <span>{selectedPlan.maxSeats}</span>
                        </div>
                      </div>
                      <div className="summary-total-divider" />
                      <div className="summary-total-row">
                        <span>Total due today:</span>
                        <span className="total-price-text">{naira(calculatePlanPrice(selectedPlan, billingCycle, currency))}</span>
                      </div>
                      <button
                        type="button"
                        className="btn-primary-sm btn-complete-checkout"
                        onClick={handleProcessPayment}
                        disabled={isProcessing || !isAccountsEnabled()}
                      >
                        <CreditCard size={15} />
                        <span>{isProcessing ? 'Opening Paystack…' : `Pay ${naira(calculatePlanPrice(selectedPlan, billingCycle, currency))} with Paystack`}</span>
                      </button>
                    </div>
                    {!isAccountsEnabled() && (
                      <p className="checkout-disclaimer">Payments are not configured for this deployment yet.</p>
                    )}
                    <p className="checkout-disclaimer">
                      Plans are not auto-renewed — you will be reminded to renew before expiry. Renewing early adds the new period to your remaining time.
                    </p>
                    <div className="security-guarantee-note">
                      <ShieldCheck size={16} className="text-emerald" />
                      <span>Payment processed by Paystack (PCI-DSS compliant)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: OFFLINE BUSH LICENSE */}
          {activeTab === 'offline' && (
            <div className="subscription-offline-view">
              <div className="offline-intro-card">
                <div className="offline-intro-icon">
                  <Key size={26} className="text-amber" />
                </div>
                <div>
                  <h3 className="offline-intro-title">Offline Field Licence</h3>
                  <p className="offline-intro-sub">
                    Working on a remote site with no internet? Get a signed licence while you are online — it keeps your paid tools unlocked on this device for up to 30 days (never beyond your plan's expiry). Paste the same code on another device to use it there.
                  </p>
                </div>
              </div>

              {/* Status Banner */}
              {tokenStatusMsg && (
                <div className={tokenStatusMsg.isError ? 'form-error-banner' : 'form-warning-banner banner-success'} style={{ marginBottom: '16px' }}>
                  {tokenStatusMsg.isError ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                  <span>{tokenStatusMsg.text}</span>
                </div>
              )}

              <div className="offline-grid-two-col">
                {/* Column 1: Activate Token */}
                <div className="offline-action-box">
                  <h4 className="box-title">Activate a licence code</h4>
                  <p className="box-desc">Paste a licence code you got earlier. Verification works fully offline.</p>

                  <textarea
                    rows={4}
                    className="offline-token-textarea"
                    placeholder="Paste licence code starting with NSURV-LIC2-..."
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                  />

                  <button
                    type="button"
                    className="btn-primary-sm"
                    style={{ width: '100%', marginTop: '10px', justifyContent: 'center' }}
                    onClick={handleActivateOfflineToken}
                  >
                    <ShieldCheck size={14} />
                    <span>Activate Licence</span>
                  </button>
                </div>

                {/* Column 2: Generate Token */}
                <div className="offline-action-box">
                  <h4 className="box-title">Get a licence (before heading to site)</h4>
                  <p className="box-desc">Requires an active Professional or Enterprise plan and an internet connection.</p>

                  <button
                    type="button"
                    className="btn-secondary-sm"
                    style={{ width: '100%', marginBottom: '12px', justifyContent: 'center' }}
                    onClick={handleGenerateOfflineToken}
                    disabled={isIssuing || !currentUser}
                  >
                    <Sparkles size={14} className="text-amber" />
                    <span>{isIssuing ? 'Issuing…' : 'Get 30-Day Field Licence'}</span>
                  </button>

                  {generatedToken && (
                    <div className="generated-token-preview">
                      <div className="token-text-box">
                        <code>{generatedToken}</code>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary-sm"
                        style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
                        onClick={() => copyToClipboard(generatedToken)}
                      >
                        <Copy size={13} />
                        <span>{copied ? 'Copied!' : 'Copy Licence Code'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: BILLING INVOICES */}
          {activeTab === 'history' && (
            <div className="subscription-history-view">
              {historyError && (
                <div className="form-error-banner" style={{ marginBottom: '12px' }}>
                  <AlertCircle size={15} />
                  <span>{historyError}</span>
                </div>
              )}
              {transactions.length === 0 ? (
                <div className="empty-state-box">
                  <Receipt size={32} className="text-muted" />
                  <p className="empty-title">No payments yet</p>
                  <p className="empty-sub">Your Paystack payment receipts will appear here.</p>
                </div>
              ) : (
                <div className="invoices-table-container">
                  <table className="invoices-table">
                    <thead>
                      <tr>
                        <th>RECEIPT REF</th>
                        <th>PLAN TIER</th>
                        <th>DATE</th>
                        <th>AMOUNT</th>
                        <th>GATEWAY</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td>
                            <strong>{tx.receiptNumber}</strong>
                            <div style={{ fontSize: '10px', color: '#64748b' }}>{tx.reference}</div>
                          </td>
                          <td>
                            <span className="proj-code-badge pro" style={{ fontSize: '10px' }}>
                              {tx.tier} ({tx.frequency})
                            </span>
                          </td>
                          <td>{new Date(tx.timestamp).toLocaleDateString('en-GB')}</td>
                          <td>
                            <strong>{tx.currency === 'NGN' ? naira(tx.amount) : `${tx.currency} ${tx.amount}`}</strong>
                          </td>
                          <td>Paystack</td>
                          <td>
                            <span className={`proj-code-badge ${tx.status === 'SUCCESS' ? 'pro' : ''}`}>
                              {tx.status === 'SUCCESS' ? 'PAID' : tx.status === 'PENDING' ? 'PENDING' : 'FAILED'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};
