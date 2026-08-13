import React, { useState, useEffect } from 'react';
import { UserProfile, SubscriptionTier } from '../../engine/auth/authTypes';
import {
  BillingFrequency,
  Currency,
  PaymentGateway,
  PaymentTransaction
} from '../../engine/subscription/subscriptionTypes';
import {
  SUBSCRIPTION_PLANS,
  calculatePlanPrice,
  processSubscriptionPayment,
  generateOfflineLicenseToken,
  verifyAndApplyOfflineLicense,
  getActiveOfflineLicense,
  getTransactionHistory
} from '../../engine/subscription/subscriptionEngine';
import {
  Crown,
  CheckCircle2,
  XCircle,
  CreditCard,
  Building2,
  ShieldCheck,
  Zap,
  Globe,
  Key,
  Copy,
  Receipt,
  AlertCircle,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface SubscriptionStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onSubscriptionUpdated?: (user: UserProfile) => void;
}

export const SubscriptionStudioModal: React.FC<SubscriptionStudioModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSubscriptionUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'checkout' | 'offline' | 'history'>('plans');
  const [billingCycle, setBillingCycle] = useState<BillingFrequency>('annual');
  const [currency, setCurrency] = useState<Currency>('NGN');

  // Checkout State
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('PROFESSIONAL');
  const [gateway, setGateway] = useState<PaymentGateway>('paystack');
  const [cardNumber, setCardNumber] = useState('5399 4100 0000 1234');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvv, setCardCvv] = useState('888');
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState<PaymentTransaction | null>(null);

  // Offline Token State
  const [tokenInput, setTokenInput] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [tokenStatusMsg, setTokenStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  // Transaction History
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);

  useEffect(() => {
    if (isOpen) {
      setTransactions(getTransactionHistory(currentUser?.id));
      setCheckoutSuccess(null);
      setTokenStatusMsg(null);
      setGeneratedToken(null);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const currentTier: SubscriptionTier = currentUser?.subscriptionTier || 'COMMUNITY';
  const selectedPlan = SUBSCRIPTION_PLANS.find(p => p.tier === selectedTier) || SUBSCRIPTION_PLANS[1];
  const activeOfflineLicense = getActiveOfflineLicense();

  const handleStartCheckout = (tier: SubscriptionTier) => {
    setSelectedTier(tier);
    setActiveTab('checkout');
    setCheckoutSuccess(null);
  };

  const handleProcessPayment = async () => {
    if (!currentUser) {
      alert('Please sign in or register before subscribing.');
      return;
    }

    setIsProcessing(true);
    try {
      // Simulate real gateway processing delay
      await new Promise(r => setTimeout(r, 1200));

      const res = await processSubscriptionPayment({
        user: currentUser,
        tier: selectedTier,
        frequency: billingCycle,
        currency,
        gateway,
        cardNumber,
        cardExpiry,
        cardCvv
      });

      setCheckoutSuccess(res.transaction);
      setTransactions(getTransactionHistory(currentUser.id));
      if (onSubscriptionUpdated) {
        onSubscriptionUpdated(res.updatedUser);
      }
    } catch (err: any) {
      alert(`Payment failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerateOfflineToken = () => {
    if (!currentUser) return;
    const token = generateOfflineLicenseToken(currentUser, currentTier === 'COMMUNITY' ? 'PROFESSIONAL' : currentTier, 30);
    setGeneratedToken(token);
    setCopied(false);
  };

  const handleActivateOfflineToken = () => {
    if (!tokenInput.trim()) {
      setTokenStatusMsg({ text: 'Please enter or paste your offline license token code.', isError: true });
      return;
    }

    const res = verifyAndApplyOfflineLicense(tokenInput, currentUser);
    if (res.success) {
      setTokenStatusMsg({ text: res.message, isError: false });
      setTokenInput('');
      if (currentUser && res.tier && onSubscriptionUpdated) {
        onSubscriptionUpdated({
          ...currentUser,
          subscriptionTier: res.tier,
          subscriptionExpiresAt: res.expiresAt
        });
      }
    } else {
      setTokenStatusMsg({ text: res.message, isError: true });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
                <h2 className="auth-title">Subscription &amp; Payment Gateway Studio</h2>
                <span className={`proj-code-badge ${currentTier === 'COMMUNITY' ? '' : 'pro'}`} style={{ fontSize: '10px' }}>
                  ACTIVE: {currentTier}
                </span>
              </div>
              <p className="auth-subtitle">
                SURCON digital stamping, Title Deed Plans, Bowditch balancing, team seats, and 30-day offline bush licenses.
              </p>
            </div>
            <button className="icon-btn auth-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* Navigation Tabs */}
          <div className="studio-tabs-bar" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className={`studio-tab-btn ${activeTab === 'plans' ? 'active' : ''}`}
              onClick={() => setActiveTab('plans')}
            >
              <Sparkles size={13} />
              <span>Subscription Plans</span>
            </button>
            <button
              type="button"
              className={`studio-tab-btn ${activeTab === 'checkout' ? 'active' : ''}`}
              onClick={() => setActiveTab('checkout')}
            >
              <CreditCard size={13} />
              <span>Payment Checkout</span>
            </button>
            <button
              type="button"
              className={`studio-tab-btn ${activeTab === 'offline' ? 'active' : ''}`}
              onClick={() => setActiveTab('offline')}
            >
              <Key size={13} />
              <span>Offline Bush License</span>
              {activeOfflineLicense && <span className="tab-pill-badge">Active</span>}
            </button>
            <button
              type="button"
              className={`studio-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <Receipt size={13} />
              <span>Billing Invoices ({transactions.length})</span>
            </button>
          </div>

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

                {/* Currency Switcher */}
                <div className="currency-switch">
                  <button
                    type="button"
                    className={`currency-btn ${currency === 'NGN' ? 'active' : ''}`}
                    onClick={() => setCurrency('NGN')}
                  >
                    🇳🇬 NGN (₦)
                  </button>
                  <button
                    type="button"
                    className={`currency-btn ${currency === 'USD' ? 'active' : ''}`}
                    onClick={() => setCurrency('USD')}
                  >
                    🌐 USD ($)
                  </button>
                </div>
              </div>

              {/* 3 Tier Cards Grid */}
              <div className="pricing-cards-grid">
                {SUBSCRIPTION_PLANS.map((plan) => {
                  const isCurrent = currentTier === plan.tier;
                  const price = calculatePlanPrice(plan, billingCycle, currency);
                  const formattedPrice = currency === 'NGN' ? `₦${price.toLocaleString()}` : `$${price}`;

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
                            Billed annually ({currency === 'NGN' ? `₦${Math.round(price / 12).toLocaleString()}/mo` : `$${Math.round(price / 12)}/mo`})
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
              {checkoutSuccess ? (
                <div className="checkout-success-banner">
                  <div className="success-icon-circle">
                    <CheckCircle2 size={36} className="text-emerald" />
                  </div>
                  <h3 className="success-title">Subscription Successfully Activated!</h3>
                  <p className="success-sub">
                    You are now upgraded to the <strong>{checkoutSuccess.tier} Tier</strong>. All professional cadastral modules, SURCON seal stamping, and organization seat limits are instantly unlocked.
                  </p>

                  <div className="receipt-summary-box">
                    <div className="receipt-row">
                      <span>Receipt Number:</span>
                      <strong>{checkoutSuccess.receiptNumber}</strong>
                    </div>
                    <div className="receipt-row">
                      <span>Payment Reference:</span>
                      <code>{checkoutSuccess.reference}</code>
                    </div>
                    <div className="receipt-row">
                      <span>Amount Paid:</span>
                      <strong>{checkoutSuccess.currency === 'NGN' ? `₦${checkoutSuccess.amount.toLocaleString()}` : `$${checkoutSuccess.amount}`} ({checkoutSuccess.frequency})</strong>
                    </div>
                    <div className="receipt-row">
                      <span>Gateway:</span>
                      <span>{checkoutSuccess.gateway === 'paystack' ? '🇳🇬 Paystack Direct' : '🌐 Stripe Global'}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px' }}>
                    <button type="button" className="btn-primary-sm" onClick={() => setActiveTab('plans')}>
                      <span>Return to Plans</span>
                    </button>
                    <button type="button" className="btn-secondary-sm" onClick={onClose}>
                      <span>Open CAD Workspace</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="checkout-grid-layout">
                  {/* Left: Gateway Selection & Billing Form */}
                  <div className="checkout-form-panel">
                    <h3 className="checkout-section-title">1. Select Payment Gateway</h3>

                    <div className="gateway-selector-grid">
                      <div
                        className={`gateway-card ${gateway === 'paystack' ? 'active' : ''}`}
                        onClick={() => { setGateway('paystack'); setCurrency('NGN'); }}
                      >
                        <div className="gateway-badge">NIGERIA &amp; AFRICA</div>
                        <div className="gateway-header">
                          <Building2 size={20} className="text-emerald" />
                          <span className="gateway-name">Paystack Direct</span>
                        </div>
                        <p className="gateway-desc">Nigerian Cards (Verve, Mastercard, Visa), Instant Bank Transfer, USSD (*737#), and Access Bank Debit.</p>
                      </div>

                      <div
                        className={`gateway-card ${gateway === 'stripe' ? 'active' : ''}`}
                        onClick={() => { setGateway('stripe'); setCurrency('USD'); }}
                      >
                        <div className="gateway-badge">INTERNATIONAL</div>
                        <div className="gateway-header">
                          <Globe size={20} className="text-cyan" />
                          <span className="gateway-name">Stripe Payments</span>
                        </div>
                        <p className="gateway-desc">Global Credit/Debit Cards (Visa, Mastercard, AMEX), Apple Pay, and Google Pay in USD.</p>
                      </div>
                    </div>

                    <h3 className="checkout-section-title" style={{ marginTop: '24px' }}>2. Payment Credentials (Sandboxed Simulation)</h3>

                    <div className="auth-form-group">
                      <label className="auth-label">Card Number</label>
                      <div className="auth-input-wrapper">
                        <CreditCard size={15} className="auth-input-icon" />
                        <input
                          type="text"
                          className="auth-input"
                          value={cardNumber}
                          onChange={(e) => setCardNumber(e.target.value)}
                          placeholder="5399 4100 0000 1234"
                        />
                      </div>
                    </div>

                    <div className="form-row-title-name" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <div className="auth-form-group">
                        <label className="auth-label">Expiration (MM/YY)</label>
                        <input
                          type="text"
                          className="auth-input"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="12/28"
                        />
                      </div>
                      <div className="auth-form-group">
                        <label className="auth-label">CVV Security Code</label>
                        <input
                          type="password"
                          maxLength={4}
                          className="auth-input"
                          value={cardCvv}
                          onChange={(e) => setCardCvv(e.target.value)}
                          placeholder="888"
                        />
                      </div>
                    </div>

                    <div className="security-guarantee-note">
                      <ShieldCheck size={16} className="text-emerald" />
                      <span>256-Bit SSL Encrypted &amp; PCI-DSS Level 1 Certified Checkout</span>
                    </div>
                  </div>

                  {/* Right: Order Summary Card */}
                  <div className="checkout-summary-panel">
                    <h3 className="checkout-section-title">Order Summary</h3>

                    <div className="summary-plan-card">
                      <div className="summary-plan-title">{selectedPlan.name}</div>
                      <div className="summary-plan-desc">{billingCycle === 'annual' ? '12 Months Access (2 Months Free)' : '1 Month Recurring Access'}</div>

                      <div className="summary-breakdown-list">
                        <div className="summary-item">
                          <span>Base License:</span>
                          <span>{currency === 'NGN' ? `₦${calculatePlanPrice(selectedPlan, billingCycle, currency).toLocaleString()}` : `$${calculatePlanPrice(selectedPlan, billingCycle, currency)}`}</span>
                        </div>
                        <div className="summary-item">
                          <span>SURCON Compliance Module:</span>
                          <span className="text-emerald">INCLUDED</span>
                        </div>
                        <div className="summary-item">
                          <span>Seats Allocated:</span>
                          <span>{selectedPlan.maxSeats} Seats</span>
                        </div>
                        <div className="summary-item">
                          <span>Estimated VAT / Tax:</span>
                          <span>{currency === 'NGN' ? '₦0.00' : '$0.00'}</span>
                        </div>
                      </div>

                      <div className="summary-total-divider" />

                      <div className="summary-total-row">
                        <span>Total Due Today:</span>
                        <span className="total-price-text">
                          {currency === 'NGN'
                            ? `₦${calculatePlanPrice(selectedPlan, billingCycle, currency).toLocaleString()}`
                            : `$${calculatePlanPrice(selectedPlan, billingCycle, currency)}`}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="btn-primary-sm btn-complete-checkout"
                        onClick={handleProcessPayment}
                        disabled={isProcessing}
                      >
                        <Zap size={15} />
                        <span>{isProcessing ? 'Authorizing Payment...' : `Authorize Payment (${currency === 'NGN' ? `₦${calculatePlanPrice(selectedPlan, billingCycle, currency).toLocaleString()}` : `$${calculatePlanPrice(selectedPlan, billingCycle, currency)}`})`}</span>
                      </button>

                      <p className="checkout-disclaimer">
                        By completing this transaction, you agree to the NSurvey Pro Geomatics Terms of Service. Licenses can be managed or transferred at any time.
                      </p>
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
                  <h3 className="offline-intro-title">Offline Fieldwork Cryptographic License</h3>
                  <p className="offline-intro-sub">
                    Surveying deep in the bush or remote cadastral sites without internet access? Generate and activate offline cryptographic tokens valid for up to 30 continuous offline days.
                  </p>
                </div>
              </div>

              {/* Status Banner */}
              {tokenStatusMsg && (
                <div className={`auth-feedback-banner ${tokenStatusMsg.isError ? 'error' : 'success'}`} style={{ marginBottom: '16px' }}>
                  {tokenStatusMsg.isError ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                  <span>{tokenStatusMsg.text}</span>
                </div>
              )}

              <div className="offline-grid-two-col">
                {/* Column 1: Activate Token */}
                <div className="offline-action-box">
                  <h4 className="box-title">1. Activate Offline Field License</h4>
                  <p className="box-desc">Enter your 30-day encrypted token code to unlock professional tools without internet.</p>

                  <textarea
                    rows={4}
                    className="offline-token-textarea"
                    placeholder="Paste license code starting with NSURV-LIC-..."
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
                    <span>Activate Bush License</span>
                  </button>
                </div>

                {/* Column 2: Generate Token */}
                <div className="offline-action-box">
                  <h4 className="box-title">2. Export Fieldwork Token (Before Heading to Site)</h4>
                  <p className="box-desc">Generate an encrypted offline credential while connected to carry to site.</p>

                  <button
                    type="button"
                    className="btn-secondary-sm"
                    style={{ width: '100%', marginBottom: '12px', justifyContent: 'center' }}
                    onClick={handleGenerateOfflineToken}
                  >
                    <Sparkles size={14} className="text-amber" />
                    <span>Generate 30-Day Field Token</span>
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
                        <span>{copied ? 'Copied to Clipboard!' : 'Copy Offline Code'}</span>
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
              {transactions.length === 0 ? (
                <div className="empty-state-box">
                  <Receipt size={32} className="text-muted" />
                  <p className="empty-title">No Billing Invoices Yet</p>
                  <p className="empty-sub">Your payment receipts, tax invoices, and SURCON billing statements will appear here.</p>
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
                            <strong>{tx.currency === 'NGN' ? `₦${tx.amount.toLocaleString()}` : `$${tx.amount}`}</strong>
                          </td>
                          <td>{tx.gateway === 'paystack' ? '🇳🇬 Paystack' : '🌐 Stripe'}</td>
                          <td>
                            <span className="status-pill active">PAID</span>
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
    </ErrorBoundary>
  );
};
