import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sliders, Plus, Edit2, Users, UserPlus, CheckCircle, XCircle,
  Clock, ShieldAlert, Check, X, Search, AlertCircle, RefreshCw,
  ExternalLink, ArrowRight, Calendar
} from 'lucide-react';
import api from '../../utils/api.js';
import Modal from '../../components/common/Modal.jsx';
import toast from 'react-hot-toast';
import { divisionLabel } from '../../utils/display.js';

const getTodayDateStr = () => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return parts;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const addDaysToStr = (dateStr, days) => {
  if (!dateStr) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + Number(days)));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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

  // Individual Intern Attendance Control modal state
  const [individualModalOpen, setIndividualModalOpen] = useState(false);
  const [selectedAccountForControl, setSelectedAccountForControl] = useState(null);
  const [controlMode, setControlMode] = useState('custom'); // 'custom' | 'shared' | 'none'
  const [customScheduleForm, setCustomScheduleForm] = useState({
    time_in: '08:00',
    time_out: '18:00',
    first_scan_enabled: true,
    second_scan_enabled: true,
  });
  const [selectedSharedProfileId, setSelectedSharedProfileId] = useState('');
  const [savingIndividualControl, setSavingIndividualControl] = useState(false);

  // Duration / Effectivity state for Individual Control
  const [durationOption, setDurationOption] = useState('today'); // 'today' | 'days' | 'range' | 'ongoing'
  const [daysCount, setDaysCount] = useState(3);
  const [customStartDate, setCustomStartDate] = useState(getTodayDateStr());
  const [customEndDate, setCustomEndDate] = useState(addDaysToStr(getTodayDateStr(), 2));

  // Search & Filter state
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [personnelFilter, setPersonnelFilter] = useState('all'); // 'all' | 'individual' | 'shared' | 'none'
  const [profileTableFilter, setProfileTableFilter] = useState('all'); // 'all' | 'shared' | 'individual'

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

  // Calculate expected rendered hours between two times (deducting 1 hour lunch if spanning 12:00-13:00)
  const calculateEstimatedHours = (inStr, outStr) => {
    if (!inStr || !outStr) return null;
    try {
      const [hIn, mIn] = inStr.split(':').map(Number);
      const [hOut, mOut] = outStr.split(':').map(Number);
      const startMin = hIn * 60 + mIn;
      const endMin = hOut * 60 + mOut;
      if (endMin <= startMin) return null;

      const elapsedMinutes = endMin - startMin;
      const lunchStart = 12 * 60;
      const lunchEnd = 13 * 60;
      const overlapStart = Math.max(startMin, lunchStart);
      const overlapEnd = Math.min(endMin, lunchEnd);
      const lunchOverlap = Math.max(0, overlapEnd - overlapStart);

      const creditedMinutes = Math.max(0, elapsedMinutes - lunchOverlap);
      const hours = (creditedMinutes / 60).toFixed(1).replace(/\.0$/, '');
      return {
        hours,
        elapsedHours: (elapsedMinutes / 60).toFixed(1).replace(/\.0$/, ''),
        lunchDeducted: lunchOverlap > 0,
      };
    } catch {
      return null;
    }
  };

  // Open Individual Intern Attendance Control Modal
  const handleOpenIndividualControl = (account) => {
    setSelectedAccountForControl(account);
    const prof = account.assigned_profile;
    const todayStr = getTodayDateStr();

    if (prof?.is_individual) {
      setControlMode('custom');
      setCustomScheduleForm({
        time_in: prof.time_in ? prof.time_in.slice(0, 5) : '08:00',
        time_out: prof.time_out ? prof.time_out.slice(0, 5) : '18:00',
        first_scan_enabled: prof.first_scan_enabled ?? true,
        second_scan_enabled: prof.second_scan_enabled ?? true,
      });

      // Populate duration option from assigned profile
      if (prof.duration_type === 'today') {
        setDurationOption('today');
        setDaysCount(1);
        setCustomStartDate(prof.start_date || todayStr);
        setCustomEndDate(prof.end_date || todayStr);
      } else if (prof.duration_type === 'days' && prof.start_date && prof.end_date) {
        setDurationOption('days');
        const diffMs = new Date(prof.end_date) - new Date(prof.start_date);
        const diffDays = Math.max(1, Math.round(diffMs / 86400000) + 1);
        setDaysCount(diffDays);
        setCustomStartDate(prof.start_date);
        setCustomEndDate(prof.end_date);
      } else if (prof.duration_type === 'range' && prof.start_date && prof.end_date) {
        setDurationOption('range');
        setCustomStartDate(prof.start_date);
        setCustomEndDate(prof.end_date);
        setDaysCount(3);
      } else if (prof.duration_type === 'ongoing') {
        setDurationOption('ongoing');
        setDaysCount(3);
        setCustomStartDate(todayStr);
        setCustomEndDate(addDaysToStr(todayStr, 2));
      } else {
        setDurationOption('today');
        setDaysCount(3);
        setCustomStartDate(todayStr);
        setCustomEndDate(addDaysToStr(todayStr, 2));
      }

      const defaultShared = profiles.find(p => !p.is_individual);
      setSelectedSharedProfileId(defaultShared ? String(defaultShared.id) : '');
    } else if (prof) {
      setControlMode('shared');
      setSelectedSharedProfileId(String(prof.profile_id || prof.id));
      setCustomScheduleForm({
        time_in: prof.time_in ? prof.time_in.slice(0, 5) : '08:00',
        time_out: prof.time_out ? prof.time_out.slice(0, 5) : '18:00',
        first_scan_enabled: prof.first_scan_enabled ?? true,
        second_scan_enabled: prof.second_scan_enabled ?? true,
      });
      setDurationOption('today');
      setDaysCount(3);
      setCustomStartDate(todayStr);
      setCustomEndDate(addDaysToStr(todayStr, 2));
    } else {
      setControlMode('none');
      setCustomScheduleForm({
        time_in: '08:00',
        time_out: '18:00',
        first_scan_enabled: true,
        second_scan_enabled: true,
      });
      setDurationOption('today');
      setDaysCount(3);
      setCustomStartDate(todayStr);
      setCustomEndDate(addDaysToStr(todayStr, 2));
      const defaultShared = profiles.find(p => !p.is_individual);
      setSelectedSharedProfileId(defaultShared ? String(defaultShared.id) : '');
    }

    setIndividualModalOpen(true);
  };

  // Execute Save Individual Control
  const handleSaveIndividualControl = async (e) => {
    if (e) e.preventDefault();
    if (!selectedAccountForControl) return;

    if (controlMode === 'shared' && !selectedSharedProfileId) {
      toast.error('Please select an attendance profile.');
      return;
    }

    setSavingIndividualControl(true);
    try {
      const payload = {
        mode: controlMode,
        profile_id: controlMode === 'shared' ? Number(selectedSharedProfileId) : undefined,
        custom_schedule: controlMode === 'custom' ? customScheduleForm : undefined,
        duration: {
          type: durationOption,
          days_count: durationOption === 'days' ? Number(daysCount) : undefined,
          start_date: durationOption === 'range' ? customStartDate : undefined,
          end_date: durationOption === 'range' ? customEndDate : undefined,
        },
      };

      await api.post(`/admin/attendance-control/individual/${selectedAccountForControl.id}`, payload);

      const name = selectedAccountForControl.full_name || selectedAccountForControl.username;
      if (controlMode === 'custom') {
        const durationText =
          durationOption === 'today'
            ? 'for Today Only'
            : durationOption === 'days'
            ? `for ${daysCount} Days`
            : durationOption === 'range'
            ? `from ${customStartDate} to ${customEndDate}`
            : 'indefinitely';
        toast.success(`Custom schedule configured ${durationText} for ${name}.`);
      } else if (controlMode === 'shared') {
        const found = profiles.find(p => String(p.id) === String(selectedSharedProfileId));
        toast.success(`Assigned "${found?.profile_name || 'profile'}" to ${name}.`);
      } else {
        toast.success(`Switched ${name} to raw actual scan times.`);
      }

      setIndividualModalOpen(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update individual control.');
    } finally {
      setSavingIndividualControl(false);
    }
  };

  // Filtered personnel for summary grid
  const filteredPersonnel = accounts.filter(acc => {
    const q = personnelSearch.toLowerCase().trim();
    const prof = acc.assigned_profile;
    const isIndiv = prof?.is_individual;

    if (personnelFilter === 'individual' && !isIndiv) return false;
    if (personnelFilter === 'shared' && (!prof || isIndiv)) return false;
    if (personnelFilter === 'none' && prof) return false;

    if (!q) return true;
    return (
      (acc.full_name || '').toLowerCase().includes(q) ||
      (acc.username || '').toLowerCase().includes(q) ||
      (acc.student_id || '').toLowerCase().includes(q) ||
      (acc.division_name || '').toLowerCase().includes(q) ||
      (prof?.profile_name || '').toLowerCase().includes(q)
    );
  });

  // Filtered profiles for profiles table
  const filteredProfiles = profiles.filter(prof => {
    if (profileTableFilter === 'shared' && prof.is_individual) return false;
    if (profileTableFilter === 'individual' && !prof.is_individual) return false;
    return true;
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
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-gray-800 text-base" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Attendance Profiles
            </h2>
            <p className="text-xs text-gray-400">
              Profiles determine automatic Time In and Time Out values recorded during scans.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  profileTableFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
                onClick={() => setProfileTableFilter('all')}
              >
                All ({profiles.length})
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  profileTableFilter === 'shared'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
                onClick={() => setProfileTableFilter('shared')}
              >
                Shared ({profiles.filter(p => !p.is_individual).length})
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  profileTableFilter === 'individual'
                    ? 'bg-white text-purple-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
                onClick={() => setProfileTableFilter('individual')}
              >
                Individual ({profiles.filter(p => p.is_individual).length})
              </button>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full hidden sm:inline-block">
              {filteredProfiles.length} Shown
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-gray-500 text-sm">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700 mb-2"></div>
            <p>Loading attendance profiles...</p>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            <Sliders className="w-12 h-12 mx-auto text-gray-300 mb-2" />
            <p className="font-semibold text-gray-700">No attendance profiles match the filter</p>
            <p className="text-xs text-gray-400 mt-1">Click "Create Profile" to set up a new attendance schedule.</p>
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
                {filteredProfiles.map(profile => {
                  const isActive = profile.status === 'active';
                  return (
                    <tr key={profile.id} className="hover:bg-gray-50/60">
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-gray-800 text-sm">{profile.clean_name || profile.profile_name}</p>
                          {profile.is_individual ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              <Sliders className="w-2.5 h-2.5 text-purple-600" />
                              Individual Override
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              Shared
                            </span>
                          )}
                          {profile.duration_label && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                              <Calendar className="w-2.5 h-2.5" />
                              {profile.duration_label}
                            </span>
                          )}
                        </div>
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-bold text-gray-800 text-base flex items-center gap-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              <Users className="w-5 h-5 text-blue-700" />
              Assigned Personnel Summary & Individual Control
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Click on any intern to configure their exclusive individual schedule or reassign their profile.
            </p>
          </div>

          {/* Quick search input */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search intern name, ID, division..."
                className="form-input text-xs pl-8 py-1.5 w-full"
                value={personnelSearch}
                onChange={(e) => setPersonnelSearch(e.target.value)}
              />
              {personnelSearch && (
                <button
                  type="button"
                  onClick={() => setPersonnelSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4 text-xs">
          <button
            type="button"
            className={`px-3 py-1 rounded-lg font-medium transition-colors ${
              personnelFilter === 'all'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            onClick={() => setPersonnelFilter('all')}
          >
            All Interns ({accounts.length})
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-lg font-medium transition-colors ${
              personnelFilter === 'individual'
                ? 'bg-purple-700 text-white shadow-sm'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
            }`}
            onClick={() => setPersonnelFilter('individual')}
          >
            Individual Control ({accounts.filter(a => a.assigned_profile?.is_individual).length})
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-lg font-medium transition-colors ${
              personnelFilter === 'shared'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
            }`}
            onClick={() => setPersonnelFilter('shared')}
          >
            Shared Profiles ({accounts.filter(a => a.assigned_profile && !a.assigned_profile.is_individual).length})
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-lg font-medium transition-colors ${
              personnelFilter === 'none'
                ? 'bg-gray-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            onClick={() => setPersonnelFilter('none')}
          >
            Raw Actual Scans ({accounts.filter(a => !a.assigned_profile).length})
          </button>
        </div>

        {/* Interns Grid */}
        {filteredPersonnel.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-xs">
            <Users className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="font-semibold text-gray-600">No personnel found</p>
            <p className="mt-1">Try adjusting your search query or filter selection.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredPersonnel.map(acc => {
              const prof = acc.assigned_profile;
              const isIndiv = prof?.is_individual;

              return (
                <div
                  key={acc.id}
                  onClick={() => handleOpenIndividualControl(acc)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group hover:shadow-md hover:-translate-y-0.5 ${
                    isIndiv
                      ? 'border-purple-200 bg-purple-50/20 hover:border-purple-500 hover:bg-purple-50/40'
                      : prof
                      ? 'border-gray-200 bg-white hover:border-blue-500 hover:bg-blue-50/20'
                      : 'border-dashed border-gray-300 bg-gray-50/60 hover:border-gray-400'
                  }`}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleOpenIndividualControl(acc); }}
                  title="Click to configure individual attendance control"
                >
                  <div>
                    {/* Top Row: Avatar & Name */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                          isIndiv
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {acc.full_name?.charAt(0)?.toUpperCase() || 'I'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 text-xs truncate group-hover:text-blue-700 transition-colors">
                            {acc.full_name || acc.username}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">
                            {divisionLabel(acc.division_name)} • ID: {acc.student_id || acc.id}
                          </p>
                        </div>
                      </div>

                      {/* Tag */}
                      {isIndiv ? (
                        <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          <Sliders className="w-2.5 h-2.5 text-purple-600" />
                          Individual
                        </span>
                      ) : prof ? (
                        <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          Shared
                        </span>
                      ) : (
                        <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
                          Raw Scans
                        </span>
                      )}
                    </div>

                    {/* Middle: Schedule Information */}
                    <div className="p-2 rounded-lg bg-gray-50/80 border border-gray-100 text-xs space-y-1 mt-2">
                      <div className="flex items-center justify-between text-gray-700">
                        <span className="text-[11px] text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-blue-600" />
                          Hours:
                        </span>
                        <span className="font-semibold text-[11px] text-gray-800">
                          {prof ? `${formatTimeDisplay(prof.time_in)} – ${formatTimeDisplay(prof.time_out)}` : 'Actual Scans'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-200/50">
                        <span>Profile Name:</span>
                        <span className="font-medium text-gray-700 truncate max-w-[130px]" title={prof?.profile_name}>
                          {prof?.clean_name || prof?.profile_name || 'Unassigned'}
                        </span>
                      </div>
                      {isIndiv && prof?.duration_label && (
                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-purple-100/70">
                          <span className="text-gray-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-purple-600" />
                            Effectivity:
                          </span>
                          <span className={`font-semibold px-1.5 py-0.5 rounded text-[10px] ${
                            prof.is_effective_today
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            {prof.duration_label}
                            {!prof.is_effective_today && ' (Expired)'}
                          </span>
                        </div>
                      )}
                      {prof && (
                        <div className="flex items-center justify-between text-[10px] text-gray-400 pt-0.5">
                          <span>Auto Rules:</span>
                          <span>
                            {prof.first_scan_enabled ? 'Auto In' : 'Actual In'} • {prof.second_scan_enabled ? 'Auto Out' : 'Actual Out'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-gray-400">Click to configure</span>
                    <span className="text-[11px] font-semibold text-blue-600 group-hover:text-blue-700 flex items-center gap-1">
                      Configure Control
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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

      {/* ─────────────────────────────────────────────────────────────
          INDIVIDUAL INTERN ATTENDANCE CONTROL MODAL
      ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={individualModalOpen}
        onClose={() => setIndividualModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 text-blue-700 rounded-lg">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <p className="text-base font-bold text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Individual Attendance Control
              </p>
              <p className="text-xs text-gray-500 font-normal">
                {selectedAccountForControl?.full_name || selectedAccountForControl?.username}
              </p>
            </div>
          </div>
        }
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full">
            <div>
              {selectedAccountForControl && (
                <a
                  href={`/admin/dtr?intern=${selectedAccountForControl.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary btn-sm text-xs flex items-center gap-1 text-gray-700 hover:text-blue-700"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                  View Intern DTR Logs
                </a>
              )}
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => setIndividualModalOpen(false)}
                disabled={savingIndividualControl}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary bg-blue-700 hover:bg-blue-800 text-xs flex items-center gap-1.5"
                onClick={handleSaveIndividualControl}
                disabled={savingIndividualControl}
              >
                {savingIndividualControl ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Save & Apply Control
                  </>
                )}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          {/* Intern Personnel Summary Header */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-700 text-white font-bold flex items-center justify-center text-sm shadow-sm">
                {selectedAccountForControl?.full_name?.charAt(0)?.toUpperCase() || 'I'}
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">
                  {selectedAccountForControl?.full_name || selectedAccountForControl?.username}
                </p>
                <p className="text-xs text-gray-500">
                  ID: <span className="font-mono text-gray-700">{selectedAccountForControl?.student_id || selectedAccountForControl?.id}</span> • {divisionLabel(selectedAccountForControl?.division_name)}
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[11px] text-gray-500 block">Current Status</span>
              {selectedAccountForControl?.assigned_profile?.is_individual ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
                  <Sliders className="w-3 h-3 text-purple-600" />
                  Individual Control Active
                </span>
              ) : selectedAccountForControl?.assigned_profile ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  Shared: {selectedAccountForControl.assigned_profile.profile_name}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                  Raw Physical Scans
                </span>
              )}
            </div>
          </div>

          {/* Exclusive Target Notice */}
          <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-900">Per-Intern Attendance Control</p>
              <p className="text-blue-800 text-[11px] mt-0.5">
                Any changes saved here will <strong>strictly and exclusively apply to {selectedAccountForControl?.full_name}</strong>. Other personnel will remain unaffected.
              </p>
            </div>
          </div>

          {/* Mode Selector Tabs */}
          <div>
            <label className="form-label font-bold text-gray-700 text-xs uppercase tracking-wider mb-2 block">
              Control Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                className={`p-3 rounded-xl border text-left transition-all ${
                  controlMode === 'custom'
                    ? 'border-purple-600 bg-purple-50/60 shadow-sm ring-2 ring-purple-600/20'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => setControlMode('custom')}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-purple-600" />
                    Custom Schedule
                  </span>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                    Personalized
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Custom hours & auto-scan rules only for this intern.
                </p>
              </button>

              <button
                type="button"
                className={`p-3 rounded-xl border text-left transition-all ${
                  controlMode === 'shared'
                    ? 'border-blue-600 bg-blue-50/60 shadow-sm ring-2 ring-blue-600/20'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => setControlMode('shared')}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    Shared Profile
                  </span>
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                    Standard
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Assign to a standard shared profile.
                </p>
              </button>

              <button
                type="button"
                className={`p-3 rounded-xl border text-left transition-all ${
                  controlMode === 'none'
                    ? 'border-gray-600 bg-gray-100 shadow-sm ring-2 ring-gray-400/20'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => setControlMode('none')}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-gray-600" />
                    Actual Scans
                  </span>
                  <span className="text-[10px] text-gray-600 bg-gray-200 px-1.5 py-0.5 rounded">
                    Raw
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">
                  No automated times; records actual physical punch.
                </p>
              </button>
            </div>
          </div>

          {/* Mode 1: Custom Schedule Form */}
          {controlMode === 'custom' && (
            <div className="space-y-4 pt-3 border-t border-gray-100 animate-fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="form-label font-semibold text-gray-700 text-xs">
                    Time In (Official DTR entry)
                  </label>
                  <input
                    type="time"
                    className="form-input text-sm"
                    value={customScheduleForm.time_in}
                    onChange={(e) => setCustomScheduleForm(f => ({ ...f, time_in: e.target.value }))}
                    required
                  />
                  <span className="text-[11px] text-gray-400">
                    Formatted: {formatTimeDisplay(customScheduleForm.time_in)}
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label font-semibold text-gray-700 text-xs">
                    Time Out (Official DTR entry)
                  </label>
                  <input
                    type="time"
                    className="form-input text-sm"
                    value={customScheduleForm.time_out}
                    onChange={(e) => setCustomScheduleForm(f => ({ ...f, time_out: e.target.value }))}
                    required
                  />
                  <span className="text-[11px] text-gray-400">
                    Formatted: {formatTimeDisplay(customScheduleForm.time_out)} (e.g. 18:00 for 9 hrs)
                  </span>
                </div>
              </div>

              {/* Dynamic Workday Credit Preview */}
              {(() => {
                const est = calculateEstimatedHours(customScheduleForm.time_in, customScheduleForm.time_out);
                if (!est) return null;
                return (
                  <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between text-xs text-emerald-900">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Clock className="w-4 h-4 text-emerald-600" />
                      Calculated Workday Rendering:
                    </span>
                    <div className="text-right">
                      <span className="font-bold text-sm text-emerald-800">
                        {est.hours} Hours / day
                      </span>
                      {est.lunchDeducted && (
                        <span className="text-[10px] text-emerald-600 block">
                          ({est.elapsedHours} hrs elapsed − 1 hr lunch deduction)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Scan Automation Rules */}
              <div className="space-y-2.5 pt-2 border-t border-gray-100">
                <p className="font-semibold text-gray-700 text-xs uppercase tracking-wider">
                  Automated Scan Behaviors for {selectedAccountForControl?.full_name?.split(' ')[0] || 'Intern'}
                </p>

                <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50/70 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 mt-0.5 cursor-pointer"
                    checked={customScheduleForm.first_scan_enabled}
                    onChange={(e) => setCustomScheduleForm(f => ({ ...f, first_scan_enabled: e.target.checked }))}
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-gray-800 block">
                      Automatic First Scan ({formatTimeDisplay(customScheduleForm.time_in)})
                    </span>
                    <span className="text-gray-500 text-[11px]">
                      When enabled, scanning in will automatically credit {formatTimeDisplay(customScheduleForm.time_in)} on their official DTR.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50/70 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 mt-0.5 cursor-pointer"
                    checked={customScheduleForm.second_scan_enabled}
                    onChange={(e) => setCustomScheduleForm(f => ({ ...f, second_scan_enabled: e.target.checked }))}
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-gray-800 block">
                      Automatic Second Scan ({formatTimeDisplay(customScheduleForm.time_out)})
                    </span>
                    <span className="text-gray-500 text-[11px]">
                      When enabled, scanning out will automatically credit {formatTimeDisplay(customScheduleForm.time_out)} on their official DTR.
                    </span>
                  </div>
                </label>
              </div>

              {/* Schedule Duration / Effectivity */}
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-700 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                    Schedule Duration & Effectivity
                  </p>
                  <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                    {durationOption === 'today' && 'Today Only'}
                    {durationOption === 'days' && `${daysCount} Days`}
                    {durationOption === 'range' && `${customStartDate} to ${customEndDate}`}
                    {durationOption === 'ongoing' && 'Ongoing'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setDurationOption('today')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      durationOption === 'today'
                        ? 'border-purple-600 bg-purple-50/70 text-purple-900 ring-2 ring-purple-500/20 shadow-xs'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="font-bold text-xs">Today Only</div>
                    <p className="text-[10px] text-gray-500 mt-0.5">1 day • reverts tomorrow</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDurationOption('days')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      durationOption === 'days'
                        ? 'border-purple-600 bg-purple-50/70 text-purple-900 ring-2 ring-purple-500/20 shadow-xs'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="font-bold text-xs">Number of Days</div>
                    <p className="text-[10px] text-gray-500 mt-0.5">e.g. 2, 3, 5, 7 days</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDurationOption('range')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      durationOption === 'range'
                        ? 'border-purple-600 bg-purple-50/70 text-purple-900 ring-2 ring-purple-500/20 shadow-xs'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="font-bold text-xs">Date Range</div>
                    <p className="text-[10px] text-gray-500 mt-0.5">Custom start & end</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDurationOption('ongoing')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      durationOption === 'ongoing'
                        ? 'border-purple-600 bg-purple-50/70 text-purple-900 ring-2 ring-purple-500/20 shadow-xs'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="font-bold text-xs">Ongoing</div>
                    <p className="text-[10px] text-gray-500 mt-0.5">Permanent / no expiry</p>
                  </button>
                </div>

                {/* Duration Details based on selection */}
                {durationOption === 'today' && (
                  <div className="p-3 rounded-lg bg-purple-50/60 border border-purple-200/80 text-xs text-purple-950 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-purple-600 flex-shrink-0" />
                      <span>
                        Effective for <strong>Today only ({getTodayDateStr()})</strong>.
                      </span>
                    </div>
                    <span className="text-[11px] text-purple-700">
                      Reverts automatically to standard profile tomorrow.
                    </span>
                  </div>
                )}

                {durationOption === 'days' && (
                  <div className="p-3 rounded-lg bg-purple-50/60 border border-purple-200/80 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-semibold text-gray-700">How many days should this schedule last?</label>
                      <span className="font-bold text-purple-800 text-sm">{daysCount} day{daysCount > 1 ? 's' : ''}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden shadow-xs">
                        <button
                          type="button"
                          className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 font-bold transition-colors"
                          onClick={() => setDaysCount(d => Math.max(1, (Number(d) || 1) - 1))}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          className="w-14 text-center text-xs font-semibold py-1.5 border-x border-gray-200 focus:outline-none"
                          value={daysCount}
                          onChange={(e) => setDaysCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        />
                        <button
                          type="button"
                          className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 font-bold transition-colors"
                          onClick={() => setDaysCount(d => (Number(d) || 1) + 1)}
                        >
                          +
                        </button>
                      </div>

                      {/* Quick Day Presets */}
                      <div className="flex items-center gap-1.5">
                        {[2, 3, 5, 7, 10, 14].map(n => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setDaysCount(n)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                              Number(daysCount) === n
                                ? 'bg-purple-600 text-white shadow-xs'
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {n}d
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="text-[11px] text-purple-800 bg-white/80 p-2 rounded-lg border border-purple-100 flex items-center justify-between">
                      <span>
                        Effective: <strong>{getTodayDateStr()}</strong> to <strong>{addDaysToStr(getTodayDateStr(), Math.max(0, daysCount - 1))}</strong>
                      </span>
                      <span className="text-gray-500">({daysCount} calendar days including today)</span>
                    </div>
                  </div>
                )}

                {durationOption === 'range' && (
                  <div className="p-3 rounded-lg bg-purple-50/60 border border-purple-200/80 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <label className="font-semibold text-gray-700 block mb-1">Start Date</label>
                        <input
                          type="date"
                          className="form-input text-xs"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          required
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-gray-700 block mb-1">End Date</label>
                        <input
                          type="date"
                          className="form-input text-xs"
                          value={customEndDate}
                          min={customStartDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      This schedule will apply exclusively from <strong>{customStartDate}</strong> until <strong>{customEndDate}</strong>.
                    </p>
                  </div>
                )}

                {durationOption === 'ongoing' && (
                  <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <span>This schedule will remain active permanently until manually updated or reverted.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mode 2: Shared Profile Form */}
          {controlMode === 'shared' && (
            <div className="space-y-3 pt-3 border-t border-gray-100 animate-fade-in">
              <div className="form-group">
                <label className="form-label font-semibold text-gray-700 text-xs">
                  Select Attendance Profile <span className="text-red-500">*</span>
                </label>
                <select
                  className="form-input form-select text-xs"
                  value={selectedSharedProfileId}
                  onChange={(e) => setSelectedSharedProfileId(e.target.value)}
                  required
                >
                  <option value="">-- Choose a shared profile --</option>
                  {profiles
                    .filter(p => !p.is_individual)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.profile_name} ({formatTimeDisplay(p.time_in)} – {formatTimeDisplay(p.time_out)})
                      </option>
                    ))}
                </select>
              </div>

              {/* Selected Profile Preview */}
              {(() => {
                const selectedP = profiles.find(p => String(p.id) === String(selectedSharedProfileId));
                if (!selectedP) return null;
                return (
                  <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/80 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-semibold text-blue-900">
                      <span>{selectedP.profile_name}</span>
                      <span className="badge badge-success text-[10px]">{selectedP.status}</span>
                    </div>
                    <div className="text-gray-600 text-[11px] grid grid-cols-2 gap-2 pt-1 border-t border-blue-200/40">
                      <div>Time In: <strong>{formatTimeDisplay(selectedP.time_in)}</strong></div>
                      <div>Time Out: <strong>{formatTimeDisplay(selectedP.time_out)}</strong></div>
                      <div>First Scan: <strong>{selectedP.first_scan_enabled ? 'Auto' : 'Actual'}</strong></div>
                      <div>Second Scan: <strong>{selectedP.second_scan_enabled ? 'Auto' : 'Actual'}</strong></div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Mode 3: Actual Scans Notice */}
          {controlMode === 'none' && (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600 space-y-2 pt-3 border-t border-gray-100 animate-fade-in">
              <p className="font-semibold text-gray-800">Raw Scan Timestamp Recording</p>
              <p>
                No automated profile times will be applied. Whenever <strong>{selectedAccountForControl?.full_name}</strong> scans their QR badge or face, their exact arrival and departure timestamps will be recorded directly.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
