import React, { useState } from 'react';
import {
  loginUser,
  registerUser,
  requestPasswordReset
} from '../../engine/auth/authEngine';
import { UserProfile } from '../../engine/auth/authTypes';
import {
  User,
  Lock,
  Mail,
  Award,
  Building2,
  Phone,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserProfile) => void;
  initialTab?: 'login' | 'register' | 'forgot';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
  initialTab = 'login'
}) => {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>(initialTab);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Register Form State
  const [regFullName, setRegFullName] = useState('');
  const [regTitle, setRegTitle] = useState('Surv.');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regSurcon, setRegSurcon] = useState('');
  const [regNisChapter, setRegNisChapter] = useState('');
  const [regCompany, setRegCompany] = useState('');
  const [regPhone, setRegPhone] = useState('');

  // Forgot Password State
  const [resetEmail, setResetEmail] = useState('');

  // UI Status
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const user = await loginUser({
        email: loginEmail,
        password: loginPassword,
        rememberMe
      });
      setSuccessMsg(`Welcome back, ${user.title || ''} ${user.fullName}!`);
      setTimeout(() => {
        onAuthSuccess(user);
        onClose();
      }, 500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const user = await registerUser({
        fullName: regFullName,
        title: regTitle,
        email: regEmail,
        password: regPassword,
        surconNumber: regSurcon,
        nisChapter: regNisChapter,
        companyName: regCompany,
        phone: regPhone
      });
      setSuccessMsg(`Account created successfully! Welcome to NSurvey PRO, ${user.fullName}.`);
      setTimeout(() => {
        onAuthSuccess(user);
        onClose();
      }, 600);
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await requestPasswordReset(resetEmail);
      setSuccessMsg(res.message);
    } catch (err: any) {
      setErrorMsg(err.message || 'Password reset request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (type: 'pro' | 'free') => {
    setLoading(true);
    setErrorMsg(null);
    const email = type === 'pro' ? 'surv.chikezie@geotrek.ng' : 'cadastral.demo@nsurvey.app';
    try {
      const user = await loginUser({ email, password: 'password123', rememberMe: true });
      setSuccessMsg(`Logged in as ${type === 'pro' ? 'Professional Licensed Surveyor' : 'Community User'}`);
      setTimeout(() => {
        onAuthSuccess(user);
        onClose();
      }, 400);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ErrorBoundary>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content auth-modal-box" onClick={(e) => e.stopPropagation()}>
          {/* Header Banner */}
          <div className="auth-modal-header">
            <div className="auth-badge-icon">
              <ShieldCheck size={22} className="text-emerald" />
            </div>
            <div>
              <h2 className="auth-title">NSurvey PRO Account</h2>
              <p className="auth-subtitle">
                {tab === 'login' && 'Sign in to access your surveyor profile, organizations, and project cloud.'}
                {tab === 'register' && 'Register your professional surveyor credentials and workspace.'}
                {tab === 'forgot' && 'Reset your account security password.'}
              </p>
            </div>
            <button className="icon-btn auth-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* Tab Navigation */}
          <div className="auth-tabs">
            <button
              className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setErrorMsg(null); setSuccessMsg(null); }}
            >
              Sign In
            </button>
            <button
              className={`auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setErrorMsg(null); setSuccessMsg(null); }}
            >
              Create Account
            </button>
            <button
              className={`auth-tab-btn ${tab === 'forgot' ? 'active' : ''}`}
              onClick={() => { setTab('forgot'); setErrorMsg(null); setSuccessMsg(null); }}
            >
              Reset Password
            </button>
          </div>

          {/* Notification Alerts */}
          {errorMsg && (
            <div className="form-error-banner" style={{ margin: '12px 20px 0' }}>
              <AlertCircle size={14} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="form-warning-banner" style={{ margin: '12px 20px 0', background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', color: '#6ee7b7' }}>
              <CheckCircle2 size={14} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ─── TAB 1: SIGN IN ──────────────────────────────────────────────── */}
          {tab === 'login' && (
            <form className="auth-form-body" onSubmit={handleLoginSubmit}>
              <div className="auth-field-group">
                <label className="auth-label">Email Address</label>
                <div className="auth-input-wrapper">
                  <Mail size={15} className="auth-input-icon" />
                  <input
                    type="email"
                    className="auth-input"
                    placeholder="e.g. surveyor@geotrek.ng"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="auth-field-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="auth-label">Password</label>
                  <button
                    type="button"
                    className="auth-forgot-link"
                    onClick={() => { setTab('forgot'); setErrorMsg(null); setSuccessMsg(null); }}
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="auth-input-wrapper">
                  <Lock size={15} className="auth-input-icon" />
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="••••••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="auth-checkbox-row">
                <label className="auth-checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Keep me signed in on this workstation</span>
                </label>
              </div>

              <button type="submit" className="btn-primary-auth" disabled={loading}>
                {loading ? 'Authenticating...' : 'Sign In to Workspace'}
                <ArrowRight size={15} />
              </button>

              {/* Quick Demo Login Preset Buttons */}
              <div className="auth-demo-divider">
                <span>Quick Demonstration Logins</span>
              </div>

              <div className="auth-demo-buttons">
                <button
                  type="button"
                  className="auth-demo-btn pro-demo"
                  onClick={() => handleQuickDemoLogin('pro')}
                  disabled={loading}
                >
                  <Zap size={14} className="text-emerald" />
                  <div>
                    <strong>Pro Surveyor Account</strong>
                    <small>Surv. (Dr.) Precious Chikezie (SURCON Reg. 1984)</small>
                  </div>
                </button>

                <button
                  type="button"
                  className="auth-demo-btn free-demo"
                  onClick={() => handleQuickDemoLogin('free')}
                  disabled={loading}
                >
                  <User size={14} className="text-cyan" />
                  <div>
                    <strong>Community Free User</strong>
                    <small>Abubakar Ibrahim (Cadastral Consult)</small>
                  </div>
                </button>
              </div>
            </form>
          )}

          {/* ─── TAB 2: CREATE ACCOUNT ───────────────────────────────────────── */}
          {tab === 'register' && (
            <form className="auth-form-body" onSubmit={handleRegisterSubmit}>
              <div className="form-row-2">
                <div className="auth-field-group">
                  <label className="auth-label">Professional Title</label>
                  <select
                    className="auth-input select-input"
                    value={regTitle}
                    onChange={(e) => setRegTitle(e.target.value)}
                  >
                    <option value="Surv.">Surv.</option>
                    <option value="Surv. (Dr.)">Surv. (Dr.)</option>
                    <option value="Surv. (Prof.)">Surv. (Prof.)</option>
                    <option value="Surv. (Chief)">Surv. (Chief)</option>
                    <option value="Engr.">Engr.</option>
                    <option value="Mr.">Mr.</option>
                    <option value="Mrs.">Mrs.</option>
                    <option value="Ms.">Ms.</option>
                  </select>
                </div>

                <div className="auth-field-group">
                  <label className="auth-label">Full Name *</label>
                  <div className="auth-input-wrapper">
                    <User size={15} className="auth-input-icon" />
                    <input
                      type="text"
                      className="auth-input"
                      placeholder="e.g. John K. Adewale"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="form-row-2">
                <div className="auth-field-group">
                  <label className="auth-label">Email Address *</label>
                  <div className="auth-input-wrapper">
                    <Mail size={15} className="auth-input-icon" />
                    <input
                      type="email"
                      className="auth-input"
                      placeholder="john@adewalesurvey.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="auth-field-group">
                  <label className="auth-label">Password *</label>
                  <div className="auth-input-wrapper">
                    <Lock size={15} className="auth-input-icon" />
                    <input
                      type="password"
                      className="auth-input"
                      placeholder="At least 8 characters"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      minLength={6}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="form-row-2">
                <div className="auth-field-group">
                  <label className="auth-label">SURCON Registration No. (Optional)</label>
                  <div className="auth-input-wrapper">
                    <Award size={15} className="auth-input-icon" />
                    <input
                      type="text"
                      className="auth-input"
                      placeholder="e.g. SURCON Reg. No. 2150"
                      value={regSurcon}
                      onChange={(e) => setRegSurcon(e.target.value)}
                    />
                  </div>
                </div>

                <div className="auth-field-group">
                  <label className="auth-label">NIS Chapter / Branch</label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="e.g. Lagos State Branch"
                    value={regNisChapter}
                    onChange={(e) => setRegNisChapter(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="auth-field-group">
                  <label className="auth-label">Survey Firm / Company Name</label>
                  <div className="auth-input-wrapper">
                    <Building2 size={15} className="auth-input-icon" />
                    <input
                      type="text"
                      className="auth-input"
                      placeholder="e.g. Adewale & Partners Geomatics"
                      value={regCompany}
                      onChange={(e) => setRegCompany(e.target.value)}
                    />
                  </div>
                </div>

                <div className="auth-field-group">
                  <label className="auth-label">Phone Number</label>
                  <div className="auth-input-wrapper">
                    <Phone size={15} className="auth-input-icon" />
                    <input
                      type="tel"
                      className="auth-input"
                      placeholder="+234 800 000 0000"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <button type="submit" className="btn-primary-auth" disabled={loading} style={{ marginTop: '8px' }}>
                {loading ? 'Creating Account...' : 'Register Professional Account'}
                <ArrowRight size={15} />
              </button>
            </form>
          )}

          {/* ─── TAB 3: RESET PASSWORD ───────────────────────────────────────── */}
          {tab === 'forgot' && (
            <form className="auth-form-body" onSubmit={handleResetSubmit}>
              <p className="auth-info-note">
                Enter your registered email address and we will dispatch a secure link to reset your account password.
              </p>

              <div className="auth-field-group">
                <label className="auth-label">Registered Email</label>
                <div className="auth-input-wrapper">
                  <Mail size={15} className="auth-input-icon" />
                  <input
                    type="email"
                    className="auth-input"
                    placeholder="e.g. surveyor@geotrek.ng"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary-auth" disabled={loading}>
                {loading ? 'Dispatching Link...' : 'Send Password Reset Link'}
                <ArrowRight size={15} />
              </button>

              <div style={{ textAlign: 'center', marginTop: '12px' }}>
                <button
                  type="button"
                  className="auth-forgot-link"
                  onClick={() => { setTab('login'); setErrorMsg(null); setSuccessMsg(null); }}
                >
                  ← Return to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};
