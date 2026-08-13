import React, { useState, useRef } from 'react';
import { UserProfile } from '../../engine/auth/authTypes';
import { updateUserProfile } from '../../engine/auth/authEngine';
import {
  User,
  Award,
  Building2,
  Phone,
  Mail,
  MapPin,
  Upload,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  FileCheck2,
  Crown
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onProfileUpdated: (updatedUser: UserProfile) => void;
  onOpenSubscription: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onProfileUpdated,
  onOpenSubscription
}) => {
  if (!isOpen || !currentUser) return null;

  const [fullName, setFullName] = useState(currentUser.fullName || '');
  const [title, setTitle] = useState(currentUser.title || 'Surv.');
  const [surconNumber, setSurconNumber] = useState(currentUser.surconNumber || '');
  const [nisChapter, setNisChapter] = useState(currentUser.nisChapter || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [companyName, setCompanyName] = useState(currentUser.companyName || '');
  const [officeAddress, setOfficeAddress] = useState(currentUser.officeAddress || '');

  // Digital Seal & Signature Assets
  const [digitalSealUrl, setDigitalSealUrl] = useState<string | undefined>(currentUser.digitalSealUrl);
  const [signatureUrl, setSignatureUrl] = useState<string | undefined>(currentUser.signatureUrl);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sealInputRef = useRef<HTMLInputElement | null>(null);
  const sigInputRef = useRef<HTMLInputElement | null>(null);

  const handleSealUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG with transparency recommended).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setDigitalSealUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSigUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG with transparency recommended).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setSignatureUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const updated = await updateUserProfile({
        fullName,
        title,
        surconNumber,
        nisChapter,
        phone,
        companyName,
        officeAddress,
        digitalSealUrl,
        signatureUrl
      });
      onProfileUpdated(updated);
      setSuccessMsg('Surveyor profile and digital seal credentials saved successfully!');
      setTimeout(() => {
        setSuccessMsg(null);
      }, 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const isPro = currentUser.subscriptionTier === 'PROFESSIONAL' || currentUser.subscriptionTier === 'ENTERPRISE';

  return (
    <ErrorBoundary>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content profile-modal-box" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="auth-modal-header">
            <div className="auth-badge-icon">
              <User size={22} className="text-emerald" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 className="auth-title">Surveyor Profile &amp; Seal</h2>
                <span className={`subscription-pill ${isPro ? 'pro-pill' : 'free-pill'}`}>
                  {isPro ? <Crown size={11} /> : null}
                  {currentUser.subscriptionTier}
                </span>
              </div>
              <p className="auth-subtitle">
                Manage your SURCON professional accreditation, firm information, and digital seal stamping assets.
              </p>
            </div>
            <button className="icon-btn auth-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* Success / Error Banners */}
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

          <form onSubmit={handleSave} className="profile-form-body">
            {/* Row 1: Title, Full Name */}
            <div className="form-row-title-name">
              <div className="auth-field-group">
                <label className="auth-label">Title</label>
                <select
                  className="auth-input select-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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
                <label className="auth-label">Full Name</label>
                <div className="auth-input-wrapper">
                  <User size={15} className="auth-input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Row 2: SURCON Reg No, NIS Chapter */}
            <div className="form-row-2">
              <div className="auth-field-group">
                <label className="auth-label">SURCON Registration Number</label>
                <div className="auth-input-wrapper">
                  <Award size={15} className="auth-input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="e.g. SURCON Reg. No. 1984/2019"
                    value={surconNumber}
                    onChange={(e) => setSurconNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="auth-field-group">
                <label className="auth-label">NIS Branch / Chapter</label>
                <div className="auth-input-wrapper">
                  <Building2 size={15} className="auth-input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="e.g. FCT Abuja Chapter"
                    value={nisChapter}
                    onChange={(e) => setNisChapter(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Row 3: Company & Email */}
            <div className="form-row-2">
              <div className="auth-field-group">
                <label className="auth-label">Survey Firm / Organization</label>
                <div className="auth-input-wrapper">
                  <Building2 size={15} className="auth-input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="e.g. Geotrek Survey & Engineering Services Ltd"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Account Email (Read-Only)</label>
                <div className="auth-input-wrapper">
                  <Mail size={15} className="auth-input-icon text-muted" />
                  <input
                    type="email"
                    className="auth-input disabled-input"
                    value={currentUser.email}
                    disabled
                  />
                </div>
              </div>
            </div>

            {/* Row 4: Phone & Office Address */}
            <div className="form-row-2">
              <div className="auth-field-group">
                <label className="auth-label">Phone Number</label>
                <div className="auth-input-wrapper">
                  <Phone size={15} className="auth-input-icon" />
                  <input
                    type="tel"
                    className="auth-input"
                    placeholder="+234 803 000 0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Office Address</label>
                <div className="auth-input-wrapper">
                  <MapPin size={15} className="auth-input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Office suite, building, street, city"
                    value={officeAddress}
                    onChange={(e) => setOfficeAddress(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* ─── DIGITAL SEAL & SIGNATURE ASSETS ─────────────────────────── */}
            <div className="seal-signature-section">
              <div className="section-subtitle">
                <FileCheck2 size={16} className="text-emerald" />
                <span>Surveyor's Digital Seal &amp; Signature Stamp</span>
              </div>
              <p className="seal-help-text">
                Upload your official transparent PNG seal stamp and signature. These assets are securely applied onto Title Deed Plans (TDP), Site Plans, and Computation Sheets.
              </p>

              <div className="seal-upload-grid">
                {/* 1. Official Surveyor Seal */}
                <div className="seal-card">
                  <div className="seal-card-header">
                    <span className="seal-card-title">SURCON Official Seal Stamp</span>
                    {digitalSealUrl && (
                      <button
                        type="button"
                        className="seal-delete-btn"
                        onClick={() => setDigitalSealUrl(undefined)}
                        title="Remove seal"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  <div className="seal-preview-box">
                    {digitalSealUrl ? (
                      <img src={digitalSealUrl} alt="Surveyor Seal" className="seal-img-preview" />
                    ) : (
                      <div className="seal-placeholder">
                        <Award size={32} className="text-muted" />
                        <span>No Seal Stamp Uploaded</span>
                        <small>Recommended: 400×400px transparent PNG</small>
                      </div>
                    )}
                  </div>

                  <input
                    type="file"
                    ref={sealInputRef}
                    onChange={handleSealUpload}
                    accept="image/png,image/svg+xml,image/jpeg"
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="btn-secondary-sm seal-btn"
                    onClick={() => sealInputRef.current?.click()}
                  >
                    <Upload size={13} />
                    <span>{digitalSealUrl ? 'Replace Seal Image' : 'Upload Seal (PNG)'}</span>
                  </button>
                </div>

                {/* 2. Official Signature */}
                <div className="seal-card">
                  <div className="seal-card-header">
                    <span className="seal-card-title">Surveyor's Signature</span>
                    {signatureUrl && (
                      <button
                        type="button"
                        className="seal-delete-btn"
                        onClick={() => setSignatureUrl(undefined)}
                        title="Remove signature"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  <div className="seal-preview-box">
                    {signatureUrl ? (
                      <img src={signatureUrl} alt="Signature" className="sig-img-preview" />
                    ) : (
                      <div className="seal-placeholder">
                        <FileCheck2 size={32} className="text-muted" />
                        <span>No Signature Uploaded</span>
                        <small>Transparent PNG recommended</small>
                      </div>
                    )}
                  </div>

                  <input
                    type="file"
                    ref={sigInputRef}
                    onChange={handleSigUpload}
                    accept="image/png,image/svg+xml,image/jpeg"
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="btn-secondary-sm seal-btn"
                    onClick={() => sigInputRef.current?.click()}
                  >
                    <Upload size={13} />
                    <span>{signatureUrl ? 'Replace Signature' : 'Upload Signature'}</span>
                  </button>
                </div>

                {/* 3. Live Title Deed Plan Certificate Stamp Preview */}
                <div className="seal-cert-preview-card">
                  <span className="cert-preview-title">TDP Certification Block Live Preview</span>
                  <div className="cert-mockup-box">
                    <div className="cert-text">
                      "I hereby certify that this survey was executed by me or under my direct supervision on the ground in accordance with the Survey Regulations..."
                    </div>
                    <div className="cert-signatures-area">
                      {digitalSealUrl && (
                        <img src={digitalSealUrl} alt="Seal Stamp" className="cert-seal-thumb" />
                      )}
                      <div className="cert-sig-line">
                        {signatureUrl && (
                          <img src={signatureUrl} alt="Sig" className="cert-sig-thumb" />
                        )}
                        <div className="cert-name">{title} {fullName || 'SURVEYOR NAME'}</div>
                        <div className="cert-surcon">{surconNumber || 'SURCON Reg. No. —'}</div>
                        <div className="cert-date">{new Date().toLocaleDateString('en-GB')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="profile-modal-footer">
              <div className="subscription-footer-info">
                <span>Tier: <strong>{currentUser.subscriptionTier}</strong></span>
                {!isPro && (
                  <button
                    type="button"
                    className="upgrade-link-btn"
                    onClick={() => { onClose(); onOpenSubscription(); }}
                  >
                    Upgrade to Professional PRO →
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn-secondary-sm" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-sm" disabled={saving}>
                  <ShieldCheck size={14} />
                  <span>{saving ? 'Saving...' : 'Save Profile Credentials'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </ErrorBoundary>
  );
};
