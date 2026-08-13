import React, { useState, useEffect, useRef } from 'react';
import {
  Organization
} from '../../engine/organization/orgTypes';
import {
  getOrganizationsForUser,
  getActiveOrganization,
  createOrganization,
  inviteMemberToOrg,
  removeMemberFromOrg,
  updateMemberRoleInOrg,
  updateOrganizationDetails,
  canUserCreateOrg
} from '../../engine/organization/orgEngine';
import { UserProfile, UserRole } from '../../engine/auth/authTypes';
import { NigerianGridBelt } from '../../engine/types';
import {
  Building2,
  Users,
  Plus,
  ShieldCheck,
  Award,
  Mail,
  Phone,
  MapPin,
  Trash2,
  Crown,
  CheckCircle2,
  AlertCircle,
  Upload,
  UserCheck
} from 'lucide-react';
import { ErrorBoundary } from '../common/ErrorBoundary';

interface OrganizationStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onOpenSubscription: () => void;
}

export const OrganizationStudioModal: React.FC<OrganizationStudioModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onOpenSubscription
}) => {
  const [tab, setTab] = useState<'overview' | 'members' | 'create'>('overview');
  const [userOrgs, setUserOrgs] = useState<Organization[]>([]);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);

  // Edit Org State
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editBelt, setEditBelt] = useState<NigerianGridBelt>(NigerianGridBelt.MID_BELT);
  const [officialSealUrl, setOfficialSealUrl] = useState<string | undefined>();

  // Create Org Form State
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgAddress, setNewOrgAddress] = useState('');
  const [newOrgPhone, setNewOrgPhone] = useState('');
  const [newOrgEmail, setNewOrgEmail] = useState('');
  const [newOrgBelt, setNewOrgBelt] = useState<NigerianGridBelt>(NigerianGridBelt.MID_BELT);

  // Invite Member Form State
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invFullName, setInvFullName] = useState('');
  const [invTitle, setInvTitle] = useState('Surv.');
  const [invSurcon, setInvSurcon] = useState('');
  const [invRole, setInvRole] = useState<UserRole>('SURVEYOR');

  // UI Status
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const sealFileRef = useRef<HTMLInputElement | null>(null);

  const refreshOrgs = () => {
    if (!currentUser) return;
    const orgs = getOrganizationsForUser(currentUser.id);
    setUserOrgs(orgs);
    const active = getActiveOrganization(currentUser) || orgs[0] || null;
    setActiveOrg(active);

    if (active) {
      setEditName(active.name);
      setEditAddress(active.officeAddress || '');
      setEditPhone(active.phone || '');
      setEditEmail(active.email || '');
      setEditBelt(active.defaultGridBelt);
      setOfficialSealUrl(active.officialSealUrl);
    }
  };

  useEffect(() => {
    if (isOpen && currentUser) {
      refreshOrgs();
      if (!getActiveOrganization(currentUser) && getOrganizationsForUser(currentUser.id).length === 0) {
        setTab('create');
      }
    }
  }, [isOpen, currentUser]);

  if (!isOpen || !currentUser) return null;

  const isSubscribed = canUserCreateOrg(currentUser);
  const isOrgOwner = activeOrg && activeOrg.ownerUserId === currentUser.id;

  // Handlers
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const created = await createOrganization({
        name: newOrgName,
        officeAddress: newOrgAddress,
        phone: newOrgPhone,
        email: newOrgEmail,
        defaultGridBelt: newOrgBelt
      }, currentUser);

      setSuccessMsg(`Organization "${created.name}" created successfully!`);
      refreshOrgs();
      setTab('overview');
      setNewOrgName('');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      await updateOrganizationDetails(activeOrg.id, {
        name: editName,
        officeAddress: editAddress,
        phone: editPhone,
        email: editEmail,
        defaultGridBelt: editBelt,
        officialSealUrl
      }, currentUser);

      setSuccessMsg('Organization details updated successfully.');
      refreshOrgs();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      await inviteMemberToOrg(activeOrg.id, {
        email: invEmail,
        fullName: invFullName,
        title: invTitle,
        surconNumber: invSurcon,
        role: invRole
      }, currentUser);

      setSuccessMsg(`Invited ${invFullName} (${invRole}) to ${activeOrg.name}.`);
      setShowInviteForm(false);
      setInvEmail('');
      setInvFullName('');
      setInvSurcon('');
      refreshOrgs();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string, memberName: string) => {
    if (!activeOrg) return;
    if (!confirm(`Are you sure you want to remove ${memberName} from ${activeOrg.name}?`)) return;

    try {
      await removeMemberFromOrg(activeOrg.id, memberUserId, currentUser);
      setSuccessMsg(`Removed ${memberName} from organization.`);
      refreshOrgs();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleRoleChange = async (memberUserId: string, newRole: UserRole) => {
    if (!activeOrg) return;
    try {
      await updateMemberRoleInOrg(activeOrg.id, memberUserId, newRole, currentUser);
      setSuccessMsg('Member access role updated.');
      refreshOrgs();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleSealUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setOfficialSealUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <ErrorBoundary>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content org-modal-box" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="auth-modal-header">
            <div className="auth-badge-icon" style={{ background: 'rgba(56, 189, 248, 0.12)', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
              <Building2 size={22} className="text-cyan" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 className="auth-title">
                  {activeOrg ? activeOrg.name : 'Organization & Team Studio'}
                </h2>
                {activeOrg && (
                  <span className="subscription-pill pro-pill">
                    <Crown size={11} /> {activeOrg.subscriptionTier}
                  </span>
                )}
                {userOrgs.length > 1 && (
                  <select
                    className="member-role-select"
                    style={{ marginLeft: '8px' }}
                    value={activeOrg?.id}
                    onChange={(e) => {
                      const selected = userOrgs.find(o => o.id === e.target.value) || null;
                      setActiveOrg(selected);
                      if (selected) {
                        setEditName(selected.name);
                        setEditAddress(selected.officeAddress || '');
                        setEditPhone(selected.phone || '');
                        setEditEmail(selected.email || '');
                        setEditBelt(selected.defaultGridBelt);
                        setOfficialSealUrl(selected.officialSealUrl);
                      }
                    }}
                  >
                    {userOrgs.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <p className="auth-subtitle">
                Manage surveying firm profile, team members, RBAC permissions, and team project repositories.
              </p>
            </div>
            <button className="icon-btn auth-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* Tab Navigation */}
          <div className="auth-tabs">
            {activeOrg && (
              <>
                <button
                  className={`auth-tab-btn ${tab === 'overview' ? 'active' : ''}`}
                  onClick={() => { setTab('overview'); setErrorMsg(null); setSuccessMsg(null); }}
                >
                  Firm Overview
                </button>
                <button
                  className={`auth-tab-btn ${tab === 'members' ? 'active' : ''}`}
                  onClick={() => { setTab('members'); setErrorMsg(null); setSuccessMsg(null); }}
                >
                  Team Members ({activeOrg.members.length}/{activeOrg.maxSeats})
                </button>
              </>
            )}
            <button
              className={`auth-tab-btn ${tab === 'create' ? 'active' : ''}`}
              onClick={() => { setTab('create'); setErrorMsg(null); setSuccessMsg(null); }}
            >
              + Create Organization
            </button>
          </div>

          {/* Alerts */}
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

          {/* ─── TAB 1: FIRM OVERVIEW ────────────────────────────────────────── */}
          {tab === 'overview' && activeOrg && (
            <form onSubmit={handleSaveOverview} className="profile-form-body">
              <div className="form-row-2">
                <div className="auth-field-group">
                  <label className="auth-label">Firm / Organization Name *</label>
                  <div className="auth-input-wrapper">
                    <Building2 size={15} className="auth-input-icon" />
                    <input
                      type="text"
                      className="auth-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="auth-field-group">
                  <label className="auth-label">Default Nigerian Grid Belt</label>
                  <select
                    className="auth-input select-input"
                    value={editBelt}
                    onChange={(e) => setEditBelt(parseFloat(e.target.value) as NigerianGridBelt)}
                  >
                    <option value={NigerianGridBelt.WEST_BELT}>West Belt (4.5°E - Lagos/Ibadan)</option>
                    <option value={NigerianGridBelt.MID_BELT}>Mid Belt (8.5°E - Abuja/Kaduna/Enugu)</option>
                    <option value={NigerianGridBelt.EAST_BELT}>East Belt (12.5°E - Port Harcourt/Maiduguri)</option>
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div className="auth-field-group">
                  <label className="auth-label">Official Firm Email</label>
                  <div className="auth-input-wrapper">
                    <Mail size={15} className="auth-input-icon" />
                    <input
                      type="email"
                      className="auth-input"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="info@geotrek.ng"
                    />
                  </div>
                </div>

                <div className="auth-field-group">
                  <label className="auth-label">Office Contact Phone</label>
                  <div className="auth-input-wrapper">
                    <Phone size={15} className="auth-input-icon" />
                    <input
                      type="tel"
                      className="auth-input"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+234 803 000 0000"
                    />
                  </div>
                </div>
              </div>

              <div className="auth-field-group">
                <label className="auth-label">Registered Office Address</label>
                <div className="auth-input-wrapper">
                  <MapPin size={15} className="auth-input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="Suite, building, street, state"
                  />
                </div>
              </div>

              {/* Firm Official Seal */}
              <div className="seal-signature-section">
                <div className="section-subtitle">
                  <Award size={16} className="text-cyan" />
                  <span>Official Organization / Firm Stamp</span>
                </div>
                <p className="seal-help-text">
                  This official corporate seal stamp is automatically applied to collaborative Title Deed Plans and Survey Reports produced by firm members.
                </p>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div className="seal-preview-box" style={{ width: '120px', height: '100px' }}>
                    {officialSealUrl ? (
                      <img src={officialSealUrl} alt="Firm Seal" className="seal-img-preview" />
                    ) : (
                      <div className="seal-placeholder">
                        <Building2 size={28} className="text-muted" />
                        <small>No Seal</small>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="file"
                      ref={sealFileRef}
                      onChange={handleSealUpload}
                      accept="image/png,image/svg+xml"
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      className="btn-secondary-sm"
                      onClick={() => sealFileRef.current?.click()}
                    >
                      <Upload size={13} /> <span>Upload Firm Stamp (PNG)</span>
                    </button>
                    {officialSealUrl && (
                      <button
                        type="button"
                        className="seal-delete-btn"
                        onClick={() => setOfficialSealUrl(undefined)}
                        style={{ alignSelf: 'flex-start' }}
                      >
                        Remove Stamp
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="profile-modal-footer" style={{ padding: '12px 0 0', background: 'transparent' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Created {new Date(activeOrg.createdAt).toLocaleDateString()} • {activeOrg.members.length} Active Members
                </span>
                <button type="submit" className="btn-primary-sm" disabled={loading}>
                  <ShieldCheck size={14} />
                  <span>{loading ? 'Saving...' : 'Update Organization Details'}</span>
                </button>
              </div>
            </form>
          )}

          {/* ─── TAB 2: TEAM MEMBERS & INVITES ───────────────────────────────── */}
          {tab === 'members' && activeOrg && (
            <div className="profile-form-body">
              {/* Seat Allocation Progress Bar */}
              <div className="seat-capacity-card">
                <div className="seat-capacity-header">
                  <span className="seat-capacity-title">Subscription Seat Allocation</span>
                  <span className="seat-capacity-nums">
                    <strong>{activeOrg.members.length}</strong> / {activeOrg.maxSeats} Seats Used
                  </span>
                </div>
                <div className="seat-progress-track">
                  <div
                    className="seat-progress-fill"
                    style={{ width: `${(activeOrg.members.length / activeOrg.maxSeats) * 100}%` }}
                  />
                </div>
                <div className="seat-capacity-footer">
                  <small>
                    {activeOrg.members.length >= activeOrg.maxSeats
                      ? 'Seat capacity full. Upgrade to Enterprise to add up to 20 team surveyors.'
                      : `${activeOrg.maxSeats - activeOrg.members.length} more seat(s) available.`}
                  </small>
                  {activeOrg.members.length >= activeOrg.maxSeats && (
                    <button type="button" className="upgrade-link-btn" onClick={onOpenSubscription}>
                      Upgrade Seats →
                    </button>
                  )}
                </div>
              </div>

              {/* Action Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="section-subtitle">
                  <Users size={15} className="text-emerald" /> Team Member Directory
                </span>
                <button
                  className="btn-primary-sm"
                  onClick={() => setShowInviteForm(!showInviteForm)}
                  disabled={activeOrg.members.length >= activeOrg.maxSeats}
                >
                  <Plus size={13} />
                  <span>Invite Surveyor</span>
                </button>
              </div>

              {/* Invite Member Drawer Form */}
              {showInviteForm && (
                <form onSubmit={handleInviteSubmit} className="invite-form-drawer">
                  <span className="invite-drawer-title">Send Organization Team Invite</span>
                  <div className="form-row-title-name">
                    <div className="auth-field-group">
                      <label className="auth-label">Title</label>
                      <select
                        className="auth-input select-input"
                        value={invTitle}
                        onChange={(e) => setInvTitle(e.target.value)}
                      >
                        <option value="Surv.">Surv.</option>
                        <option value="Surv. (Dr.)">Surv. (Dr.)</option>
                        <option value="Surv. (Prof.)">Surv. (Prof.)</option>
                        <option value="Engr.">Engr.</option>
                        <option value="Mr.">Mr.</option>
                        <option value="Mrs.">Mrs.</option>
                        <option value="Ms.">Ms.</option>
                      </select>
                    </div>

                    <div className="auth-field-group">
                      <label className="auth-label">Full Name *</label>
                      <div className="auth-input-wrapper">
                        <Users size={14} className="auth-input-icon" />
                        <input
                          type="text"
                          className="auth-input"
                          placeholder="e.g. Tunde Bakare"
                          value={invFullName}
                          onChange={(e) => setInvFullName(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-row-2">
                    <div className="auth-field-group">
                      <label className="auth-label">Email Address *</label>
                      <div className="auth-input-wrapper">
                        <Mail size={14} className="auth-input-icon" />
                        <input
                          type="email"
                          className="auth-input"
                          placeholder="tunde@geotrek.ng"
                          value={invEmail}
                          onChange={(e) => setInvEmail(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="auth-field-group">
                      <label className="auth-label">SURCON Reg. No. (Optional)</label>
                      <div className="auth-input-wrapper">
                        <Award size={14} className="auth-input-icon" />
                        <input
                          type="text"
                          className="auth-input"
                          placeholder="SURCON Reg. No. 2480"
                          value={invSurcon}
                          onChange={(e) => setInvSurcon(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="auth-field-group">
                    <label className="auth-label">Access Role *</label>
                    <select
                      className="auth-input select-input"
                      value={invRole}
                      onChange={(e) => setInvRole(e.target.value as UserRole)}
                    >
                      <option value="SURVEYOR">Field Surveyor (Full Calculation &amp; Editing)</option>
                      <option value="ADMIN">Principal Surveyor / Admin (QA &amp; Seals)</option>
                      <option value="VIEWER">Draftsman / Viewer (Read-Only)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                    <button type="button" className="btn-secondary-sm" onClick={() => setShowInviteForm(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary-sm" disabled={loading}>
                      <UserCheck size={14} />
                      <span>Send Team Invitation</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Members Table */}
              <div className="table-wrapper">
                <table className="survey-studio-table">
                  <thead>
                    <tr>
                      <th>Surveyor</th>
                      <th>Email</th>
                      <th>SURCON No.</th>
                      <th>Role</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeOrg.members.map(member => (
                      <tr key={member.userId}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="user-avatar-circle" style={{ width: '22px', height: '22px', fontSize: '9px' }}>
                              {member.fullName.charAt(0).toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                              {member.title ? `${member.title} ` : ''}{member.fullName}
                            </span>
                          </div>
                        </td>
                        <td className="mono-cell" style={{ fontSize: '10px' }}>{member.email}</td>
                        <td className="mono-cell" style={{ fontSize: '10px' }}>{member.surconNumber || '—'}</td>
                        <td>
                          {isOrgOwner && member.role !== 'OWNER' ? (
                            <select
                              className="member-role-select"
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.userId, e.target.value as UserRole)}
                            >
                              <option value="ADMIN">ADMIN</option>
                              <option value="SURVEYOR">SURVEYOR</option>
                              <option value="VIEWER">VIEWER</option>
                            </select>
                          ) : (
                            <span className={`role-badge role-${member.role.toLowerCase()}`}>
                              {member.role}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {member.role !== 'OWNER' && isOrgOwner && (
                            <button
                              className="delete-icon-btn"
                              title="Remove member from organization"
                              onClick={() => handleRemoveMember(member.userId, member.fullName)}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── TAB 3: CREATE NEW ORGANIZATION ──────────────────────────────── */}
          {tab === 'create' && (
            <div className="profile-form-body">
              {!isSubscribed ? (
                /* Subscription Paywall Gate */
                <div className="org-paywall-card">
                  <div className="paywall-crown-icon">
                    <Crown size={32} className="text-amber" />
                  </div>
                  <h3 className="paywall-title">Organization &amp; Team Collaboration requires PRO</h3>
                  <p className="paywall-desc">
                    Multi-tenant organization workspaces, surveyor credential verification, shared `.nsurv` team project repositories, and multi-user RBAC are exclusive to the <strong>Professional Surveyor</strong> and <strong>Enterprise Firm</strong> plans.
                  </p>

                  <div className="paywall-feature-list">
                    <div className="paywall-feature-item">
                      <CheckCircle2 size={15} className="text-emerald" />
                      <span>Create and manage your surveying firm workspace</span>
                    </div>
                    <div className="paywall-feature-item">
                      <CheckCircle2 size={15} className="text-emerald" />
                      <span>Invite team members with Role-Based Access Control (RBAC)</span>
                    </div>
                    <div className="paywall-feature-item">
                      <CheckCircle2 size={15} className="text-emerald" />
                      <span>Centralized official firm seal and Title Deed Plan stamp</span>
                    </div>
                    <div className="paywall-feature-item">
                      <CheckCircle2 size={15} className="text-emerald" />
                      <span>Cloud &amp; local shared project library repository</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn-primary-auth"
                    style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', marginTop: '8px' }}
                    onClick={() => { onClose(); onOpenSubscription(); }}
                  >
                    <Crown size={15} />
                    <span>Upgrade to Professional PRO (₦25,000 / $35/mo)</span>
                  </button>
                </div>
              ) : (
                /* Create Organization Form */
                <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="form-row-2">
                    <div className="auth-field-group">
                      <label className="auth-label">Firm / Organization Name *</label>
                      <div className="auth-input-wrapper">
                        <Building2 size={15} className="auth-input-icon" />
                        <input
                          type="text"
                          className="auth-input"
                          placeholder="e.g. Horizon Geomatics & Consult Ltd"
                          value={newOrgName}
                          onChange={(e) => setNewOrgName(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="auth-field-group">
                      <label className="auth-label">Default Grid Belt</label>
                      <select
                        className="auth-input select-input"
                        value={newOrgBelt}
                        onChange={(e) => setNewOrgBelt(parseFloat(e.target.value) as NigerianGridBelt)}
                      >
                        <option value={NigerianGridBelt.WEST_BELT}>West Belt (4.5°E - Lagos)</option>
                        <option value={NigerianGridBelt.MID_BELT}>Mid Belt (8.5°E - Abuja)</option>
                        <option value={NigerianGridBelt.EAST_BELT}>East Belt (12.5°E - Port Harcourt)</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row-2">
                    <div className="auth-field-group">
                      <label className="auth-label">Corporate Email</label>
                      <div className="auth-input-wrapper">
                        <Mail size={15} className="auth-input-icon" />
                        <input
                          type="email"
                          className="auth-input"
                          placeholder="office@horizongeomatics.com"
                          value={newOrgEmail}
                          onChange={(e) => setNewOrgEmail(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="auth-field-group">
                      <label className="auth-label">Office Phone Number</label>
                      <div className="auth-input-wrapper">
                        <Phone size={15} className="auth-input-icon" />
                        <input
                          type="tel"
                          className="auth-input"
                          placeholder="+234 800 000 0000"
                          value={newOrgPhone}
                          onChange={(e) => setNewOrgPhone(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="auth-field-group">
                    <label className="auth-label">Office Address</label>
                    <div className="auth-input-wrapper">
                      <MapPin size={15} className="auth-input-icon" />
                      <input
                        type="text"
                        className="auth-input"
                        placeholder="Suite number, commercial plaza, street, city"
                        value={newOrgAddress}
                        onChange={(e) => setNewOrgAddress(e.target.value)}
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn-primary-auth" disabled={loading || !newOrgName.trim()} style={{ marginTop: '8px' }}>
                    <Plus size={15} />
                    <span>{loading ? 'Creating Organization...' : 'Establish Organization Workspace'}</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};
