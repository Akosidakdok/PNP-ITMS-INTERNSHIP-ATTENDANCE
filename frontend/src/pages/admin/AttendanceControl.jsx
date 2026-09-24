import { useState, useEffect, useCallback } from 'react';
import {
  Sliders, Plus, Edit2, Users, UserPlus, CheckCircle, XCircle,
  Clock, ShieldAlert, Check, X, Search, AlertCircle, RefreshCw
} from 'lucide-react';
import api from '../../utils/api.js';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { divisionLabel } from '../../utils/display.js';

export default function AttendanceControl() {
  const [activeTab, setActiveTab] = useState('attendance');
  const [profiles, setProfiles] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [adminAccountsLoading, setAdminAccountsLoading] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminForm, setAdminForm] = useState({
    username: '', password: '', full_name: '', email: '', phone: '', status: 'active'
  });
  const [loading, setLoading] = useState(true);

  // Profile Create / Edit modal state
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({
    profile_name: '',
    time_in: '08:00',
    time_out: '17:00',
    first_scan_enabled: true,
    second_scan_enabled: true,
    status: 'active',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Status Toggle Confirmation state
  const [statusConfirmModalOpen, setStatusConfirmModalOpen] = useState(false);
  const [profileToToggle, setProfileToToggle] = useState(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Manage Account Assignments modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedProfileForAssign, setSelectedProfileForAssign] = useState(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState(new Set());
  const [accountSearch, setAccountSearch] = useState('');
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [assignConfirmModalOpen, setAssignConfirmModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [profRes, accRes] = await Promise.all([
        api.get('/admin/attendance-control/profiles'),
        api.get('/admin/attendance-control/accounts'),
      ]);
      setProfiles(profRes.data.profiles || []);
      setAccounts(accRes.data.accounts || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load attendance parameters.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadAdminAccounts = useCallback(async () => {
    setAdminAccountsLoading(true);
    try {
      const response = await api.get('/admin/accounts');
      setAdminAccounts(response.data.accounts || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load admin accounts.');
    } finally {
      setAdminAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'admins') loadAdminAccounts();
  }, [activeTab, loadAdminAccounts]);

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    if (adminForm.password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    setAdminSaving(true);
    try {
      await api.post('/admin/accounts', adminForm);
      toast.success('Admin account created successfully.');
      setAdminForm({ username: '', password: '', full_name: '', email: '', phone: '', status: 'active' });
      loadAdminAccounts();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create admin account.');
    } finally {
      setAdminSaving(false);
    }
  };

  // Format HH:MM:SS to 12-hour AM/PM for display
  const formatTimeDisplay = (timeStr) => {
    if (!timeStr) return '--:--';
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayHours = h % 12 || 12;
      return `${String(displayHours).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  // Open Create Profile Modal
  const handleOpenCreate = () => {
    setEditingProfile(null);
    setProfileForm({
      profile_name: '',
      time_in: '08:00',
      time_out: '17:00',
      first_scan_enabled: true,
      second_scan_enabled: true,
      status: 'active',
    });
    setProfileModalOpen(true);
  };

  // Open Edit Profile Modal
  const handleOpenEdit = (profile) => {
    setEditingProfile(profile);
    setProfileForm({
      profile_name: profile.profile_name,
      time_in: profile.time_in ? profile.time_in.slice(0, 5) : '08:00',
      time_out: profile.time_out ? profile.time_out.slice(0, 5) : '17:00',
      first_scan_enabled: Boolean(profile.first_scan_enabled),
      second_scan_enabled: Boolean(profile.second_scan_enabled),
      status: profile.status || 'active',
    });
    setProfileModalOpen(true);
  };

  // Save Profile (Create or Update)
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileForm.profile_name.trim()) {
      toast.error('Profile name is required.');
      return;
    }

    setSavingProfile(true);
    try {
      if (editingProfile) {
        await api.put(`/admin/attendance-control/profiles/${editingProfile.id}`, profileForm);
        toast.success('Attendance profile updated.');
      } else {
        await api.post('/admin/attendance-control/profiles', profileForm);
        toast.success('Attendance profile created.');
      }
      setProfileModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save attendance profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Open Status Toggle Confirmation
  const handleOpenToggleStatus = (profile) => {
    setProfileToToggle(profile);
    setStatusConfirmModalOpen(true);
  };

  // Execute Status Toggle
  const handleConfirmToggleStatus = async () => {
    if (!profileToToggle) return;
    setTogglingStatus(true);
    const newStatus = profileToToggle.status === 'active' ? 'inactive' : 'active';
    try {
      await api.patch(`/admin/attendance-control/profiles/${profileToToggle.id}/status`, {
        status: newStatus,
      });
      toast.success(`Profile "${profileToToggle.profile_name}" set to ${newStatus}.`);
      setStatusConfirmModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile status.');
    } finally {
      setTogglingStatus(false);
      setProfileToToggle(null);
    }
  };

  // Open Manage Accounts Modal
  const handleOpenManageAccounts = (profile) => {
    setSelectedProfileForAssign(profile);
    // Determine accounts currently assigned to this profile
    const assignedIds = new Set(
      accounts
        .filter(acc => acc.assigned_profile?.profile_id === profile.id)
        .map(acc => acc.id)
    );
    setSelectedAccountIds(assignedIds);
    setAccountSearch('');
    setAssignModalOpen(true);
  };

  // Toggle account checkbox
  const handleToggleAccount = (accountId) => {
    setSelectedAccountIds(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  // Execute Save Assignments
  const handleConfirmSaveAssignments = async () => {
    if (!selectedProfileForAssign) return;
    setSavingAssignments(true);
    try {
      const accountIdsArray = Array.from(selectedAccountIds);
      await api.post('/admin/attendance-control/assignments', {
        attendance_profile_id: selectedProfileForAssign.id,
        account_ids: accountIdsArray,
      });
      toast.success(`Updated account assignments for ${selectedProfileForAssign.profile_name}.`);
      setAssignConfirmModalOpen(false);
      setAssignModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save account assignments.');
    } finally {
      setSavingAssignments(false);
    }
  };

  // Filtered accounts for assignment modal
  const filteredAccounts = accounts.filter(acc => {
    const q = accountSearch.toLowerCase();
    return (
      (acc.full_name || '').toLowerCase().includes(q) ||
      (acc.username || '').toLowerCase().includes(q) ||
      (acc.student_id || '').toLowerCase().includes(q) ||
      (acc.division_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
            <Sliders className="w-6 h-6 text-blue-700" />
            Superadmin Attendance Control
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Configure automated scan rules, attendance schedules, and account profile assignments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {activeTab === 'attendance' && <button
            type="button"
            className="btn btn-primary btn-sm flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800"
            onClick={handleOpenCreate}
          >
            <Plus className="w-4 h-4" />
            Create Profile
          </button>}
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit" role="tablist" aria-label="Superadmin controls">
        <button type="button" role="tab" aria-selected={activeTab === 'attendance'}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'attendance' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('attendance')}>
          <Sliders className="w-4 h-4 inline-block mr-1.5 -mt-0.5" /> Attendance Control
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'admins'}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'admins' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={() => setActiveTab('admins')}>
          <UserPlus className="w-4 h-4 inline-block mr-1.5 -mt-0.5" /> Admin Accounts
        </button>
      </div>

      {activeTab === 'attendance' && <>
      {/* Profiles Table Card */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Attendance Profiles
            </h2>
            <p className="text-xs text-gray-400">
              Profiles determine automatic Time In and Time Out values recorded during scans.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full">
            {profiles.length} Total Profiles
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700 mb-2"></div>
            <p>Loading attendance profiles...</p>
          </div>
        ) : profiles.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            <Sliders className="w-12 h-12 mx-auto text-gray-300 mb-2" />
            <p className="font-semibold text-gray-700">No attendance profiles created yet</p>
            <p className="text-xs text-gray-400 mt-1">Click "Create Profile" to set up your first attendance schedule.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table attendance-control-table">
              <thead>
                <tr>
                  <th>Profile Name</th>
                  <th>Configured Time In</th>
                  <th>Configured Time Out</th>
                  <th>First Scan Rule</th>
                  <th>Second Scan Rule</th>
                  <th>Status</th>
                  <th>Assigned Accounts</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(profile => {
                  const isActive = profile.status === 'active';
                  return (
                    <tr key={profile.id} className="hover:bg-gray-50/60">
                      <td>
                        <p className="font-bold text-gray-800 text-sm">{profile.profile_name}</p>
                        <p className="text-[11px] text-gray-400">ID: #{profile.id}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 font-semibold text-gray-700 text-xs">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          {formatTimeDisplay(profile.time_in)}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 font-semibold text-gray-700 text-xs">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          {formatTimeDisplay(profile.time_out)}
                        </div>
                      </td>
                      <td>
                        {profile.first_scan_enabled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
                            <Check className="w-3 h-3" />
                            Auto ({formatTimeDisplay(profile.time_in)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-500">
                            <X className="w-3 h-3" />
                            Actual Scan
                          </span>
                        )}
                      </td>
                      <td>
                        {profile.second_scan_enabled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
                            <Check className="w-3 h-3" />
                            Auto ({formatTimeDisplay(profile.time_out)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-500">
                            <X className="w-3 h-3" />
                            Actual Scan
                          </span>
                        )}
                      </td>
                      <td>
                        {isActive ? (
                          <span className="badge badge-success text-[11px]">Active</span>
                        ) : (
                          <span className="badge badge-secondary text-[11px] bg-gray-100 text-gray-500">Inactive</span>
                        )}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          {profile.assigned_accounts_count || 0} Accounts
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
                            onClick={() => handleOpenManageAccounts(profile)}
                            title="Manage Assigned Accounts"
                          >
                            <Users className="w-3.5 h-3.5 text-blue-600" />
                            Manage Accounts
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
                            onClick={() => handleOpenEdit(profile)}
                            title="Edit Profile"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-gray-600" />
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm text-xs ${
                              isActive
                                ? 'btn-danger'
                                : 'btn-secondary text-green-700 hover:bg-green-50'
                            }`}
                            onClick={() => handleOpenToggleStatus(profile)}
                          >
                            {isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Account Assignment Quick Overview Card */}
      <div className="card p-5">
        <h2 className="font-bold text-gray-800 text-base mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Assigned Personnel Summary
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Each account receives its attendance schedule automatically from its assigned profile.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {accounts.map(acc => {
            const prof = acc.assigned_profile;
            return (
              <div key={acc.id} className="p-3 rounded-xl border border-gray-200 bg-gray-50/50 flex flex-col justify-between">
                <div>
                  <p className="font-bold text-gray-800 text-xs truncate">{acc.full_name || acc.username}</p>
                  <p className="text-[11px] text-gray-400 truncate">{divisionLabel(acc.division_name)} • ID: {acc.student_id || acc.id}</p>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-200/60 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-gray-500 font-medium">Profile:</span>
                  {prof ? (
                    <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                      {prof.profile_name}
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400 italic">Unassigned</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          CREATE / EDIT PROFILE MODAL
      ───────────────────────────────────────────────────────────── */}
      </>}

      {activeTab === 'admins' && (
        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex items-start gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700"><UserPlus className="w-5 h-5" /></div>
              <div>
                <h2 className="font-bold text-gray-800 text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>Create Admin Account</h2>
                <p className="text-xs text-gray-500 mt-0.5">Create an administrator account with access to the administration portal.</p>
              </div>
            </div>
            <form onSubmit={handleCreateAdmin} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="form-group"><label className="form-label">Full Name <span className="text-red-500">*</span></label><input className="form-input" value={adminForm.full_name} onChange={e => setAdminForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Juan Dela Cruz" required /></div>
              <div className="form-group"><label className="form-label">Username <span className="text-red-500">*</span></label><input className="form-input" value={adminForm.username} onChange={e => setAdminForm(f => ({ ...f, username: e.target.value }))} placeholder="e.g. juan.delacruz" required /></div>
              <div className="form-group"><label className="form-label">Email Address <span className="text-red-500">*</span></label><input type="email" className="form-input" value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))} placeholder="admin@example.com" required /></div>
              <div className="form-group"><label className="form-label">Initial Password <span className="text-red-500">*</span></label><input type="password" minLength="8" className="form-input" value={adminForm.password} onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))} placeholder="At least 8 characters" required /></div>
              <div className="form-group"><label className="form-label">Contact Number</label><input className="form-input" value={adminForm.phone} onChange={e => setAdminForm(f => ({ ...f, phone: e.target.value }))} placeholder="0917-XXX-XXXX" /></div>
              <div className="form-group justify-end"><button type="submit" className="btn btn-primary bg-blue-700 hover:bg-blue-800 w-full sm:w-fit sm:self-end" disabled={adminSaving}><UserPlus className="w-4 h-4" /> {adminSaving ? 'Creating...' : 'Create Admin Account'}</button></div>
            </form>
          </div>
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between"><div><h2 className="font-bold text-gray-800 text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>Administrator Accounts</h2><p className="text-xs text-gray-400">{adminAccounts.length} admin account{adminAccounts.length === 1 ? '' : 's'} available.</p></div><span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full">Admin Only</span></div>
            {adminAccountsLoading ? <div className="py-10 text-center text-gray-500 text-sm">Loading admin accounts...</div> : adminAccounts.length === 0 ? <div className="py-10 text-center text-gray-400 text-sm">No admin accounts have been created yet.</div> : (
              <div className="overflow-x-auto"><table className="table table-card-mobile attendance-control-admin-table"><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Contact</th><th>Status</th></tr></thead><tbody>{adminAccounts.map(account => <tr key={account.id}><td data-label="Name"><p className="font-bold text-gray-800 text-sm">{account.full_name}</p><p className="text-[11px] text-gray-400">ID: #{account.id}</p></td><td data-label="Username" className="text-sm text-gray-700">{account.username}</td><td data-label="Email" className="text-sm text-gray-600">{account.email}</td><td data-label="Contact" className="text-sm text-gray-600">{account.phone || '—'}</td><td data-label="Status"><span className={`badge ${account.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>{account.status || 'active'}</span></td></tr>)}</tbody></table></div>
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title={editingProfile ? `Edit Profile: ${editingProfile.profile_name}` : 'Create Attendance Profile'}
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setProfileModalOpen(false)}
              disabled={savingProfile}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary bg-blue-700 hover:bg-blue-800"
              onClick={handleSaveProfile}
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving...' : editingProfile ? 'Update Profile' : 'Create Profile'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveProfile} className="space-y-4 text-sm">
          <div className="form-group">
            <label className="form-label font-semibold text-gray-700">
              Profile Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="form-input text-sm"
              placeholder="e.g. Regular 8AM–5PM, Night Shift 1PM–10PM"
              value={profileForm.profile_name}
              onChange={(e) => setProfileForm(f => ({ ...f, profile_name: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label font-semibold text-gray-700">Time In (Official DTR)</label>
              <input
                type="time"
                className="form-input text-sm"
                value={profileForm.time_in}
                onChange={(e) => setProfileForm(f => ({ ...f, time_in: e.target.value }))}
                required
              />
              <span className="text-[11px] text-gray-400">Default: 08:00 AM</span>
            </div>
            <div className="form-group">
              <label className="form-label font-semibold text-gray-700">Time Out (Official DTR)</label>
              <input
                type="time"
                className="form-input text-sm"
                value={profileForm.time_out}
                onChange={(e) => setProfileForm(f => ({ ...f, time_out: e.target.value }))}
                required
              />
              <span className="text-[11px] text-gray-400">Default: 05:00 PM</span>
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-gray-100">
            <p className="font-semibold text-gray-700 text-xs uppercase tracking-wider">Automated Scan Rules</p>
            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-gray-800">
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                checked={profileForm.first_scan_enabled}
                onChange={(e) => setProfileForm(f => ({ ...f, first_scan_enabled: e.target.checked }))}
              />
              <span>Enable Automatic First Scan (records configured Time In regardless of arrival minute)</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-medium text-gray-800">
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                checked={profileForm.second_scan_enabled}
                onChange={(e) => setProfileForm(f => ({ ...f, second_scan_enabled: e.target.checked }))}
              />
              <span>Enable Automatic Second Scan (records configured Time Out regardless of departure minute)</span>
            </label>
          </div>

          <div className="form-group pt-2 border-t border-gray-100">
            <label className="form-label font-semibold text-gray-700">Profile Status</label>
            <select
              className="form-input form-select text-sm"
              value={profileForm.status}
              onChange={(e) => setProfileForm(f => ({ ...f, status: e.target.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          CONFIRM STATUS TOGGLE MODAL
      ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={statusConfirmModalOpen}
        onClose={() => setStatusConfirmModalOpen(false)}
        title="Confirm Profile Status Change"
        size="sm"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStatusConfirmModalOpen(false)}
              disabled={togglingStatus}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary bg-blue-700 hover:bg-blue-800"
              onClick={handleConfirmToggleStatus}
              disabled={togglingStatus}
            >
              {togglingStatus ? 'Updating...' : 'Confirm'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-gray-800">
                Are you sure you want to {profileToToggle?.status === 'active' ? 'deactivate' : 'activate'} the profile:
              </p>
              <p className="font-bold text-gray-900 mt-1">{profileToToggle?.profile_name}?</p>
              {profileToToggle?.status === 'active' && (
                <p className="text-xs text-amber-700 mt-2">
                  Accounts assigned to an inactive profile will revert to recording raw actual scan times until reactivated or reassigned.
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          MANAGE ACCOUNT ASSIGNMENTS MODAL
      ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={`Assign Accounts — ${selectedProfileForAssign?.profile_name}`}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-gray-500">
              {selectedAccountIds.size} accounts selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAssignModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary bg-blue-700 hover:bg-blue-800"
                onClick={() => setAssignConfirmModalOpen(true)}
              >
                Save Assignments
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search personnel by name, student ID, division..."
              className="form-input text-xs pl-9 w-full"
              value={accountSearch}
              onChange={(e) => setAccountSearch(e.target.value)}
            />
          </div>

          <div className="flex justify-between items-center text-xs text-gray-500 px-1">
            <span>Select accounts to assign to this schedule profile:</span>
            <div className="flex gap-3">
              <button
                type="button"
                className="text-blue-600 hover:underline font-semibold"
                onClick={() => {
                  const allIds = new Set(filteredAccounts.map(a => a.id));
                  setSelectedAccountIds(allIds);
                }}
              >
                Select All
              </button>
              <button
                type="button"
                className="text-gray-500 hover:underline"
                onClick={() => setSelectedAccountIds(new Set())}
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Accounts list */}
          <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {filteredAccounts.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs">
                No accounts match your search.
              </div>
            ) : (
              filteredAccounts.map(acc => {
                const isSelected = selectedAccountIds.has(acc.id);
                const currentProfile = acc.assigned_profile;
                const isAssignedElsewhere = currentProfile && currentProfile.profile_id !== selectedProfileForAssign?.id;

                return (
                  <label
                    key={acc.id}
                    className={`flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={isSelected}
                        onChange={() => handleToggleAccount(acc.id)}
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 text-xs truncate">{acc.full_name || acc.username}</p>
                        <p className="text-[11px] text-gray-400 truncate">
                          ID: {acc.student_id || acc.id} • {divisionLabel(acc.division_name)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 ml-2">
                      {isAssignedElsewhere ? (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium">
                          Assigned to: {currentProfile.profile_name}
                        </span>
                      ) : currentProfile ? (
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-medium">
                          Currently Assigned
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 italic">
                          No profile
                        </span>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          CONFIRM ASSIGNMENTS MODAL
      ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={assignConfirmModalOpen}
        onClose={() => setAssignConfirmModalOpen(false)}
        title="Confirm Account Assignments"
        size="sm"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAssignConfirmModalOpen(false)}
              disabled={savingAssignments}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary bg-blue-700 hover:bg-blue-800"
              onClick={handleConfirmSaveAssignments}
              disabled={savingAssignments}
            >
              {savingAssignments ? 'Saving...' : 'Confirm & Apply'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-gray-800">
                You are assigning <strong>{selectedAccountIds.size} accounts</strong> to:
              </p>
              <p className="font-bold text-blue-800 mt-1">{selectedProfileForAssign?.profile_name}</p>
              <p className="text-xs text-gray-500 mt-2">
                Their subsequent attendance scans will automatically follow this profile's configured Time In and Time Out schedule.
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
