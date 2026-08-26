import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';
import toast from 'react-hot-toast';
import { User, Mail, Phone, MapPin, ShieldAlert, Award, School, Building2, Calendar, Lock, ShieldCheck, UserCheck, History, RefreshCw } from 'lucide-react';
import Modal from '../components/common/Modal.jsx';
import FaceRegistrationModal from '../components/face/FaceRegistrationModal.jsx';

export default function Profile({ role }) {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  
  // Form states
  const [personalForm, setPersonalForm] = useState({
    email: '',
    phone: '',
    home_address: '',
    emergency_name: '',
    emergency_relation: '',
    emergency_phone: ''
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [faceWorkflow, setFaceWorkflow] = useState({ active_request: null, requests: [], history: [] });
  const [renewalRequestOpen, setRenewalRequestOpen] = useState(false);
  const [renewalReason, setRenewalReason] = useState('');
  const [submittingRenewal, setSubmittingRenewal] = useState(false);
  const [selfRenewalOpen, setSelfRenewalOpen] = useState(false);
  const [initialEnrollmentOpen, setInitialEnrollmentOpen] = useState(false);
  const initialEnrollmentPrompted = useRef(false);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      if (role === 'intern') {
        const res = await api.get('/interns/me/profile');
        const intern = res.data.intern;
        setProfile(intern);
        if (
          !initialEnrollmentPrompted.current
          && intern.self_face_enrollment_available
          && !intern.face_registered
          && intern.status === 'active'
        ) {
          initialEnrollmentPrompted.current = true;
          setInitialEnrollmentOpen(true);
        }
        setPersonalForm({
          email: intern.email || '',
          phone: intern.phone || '',
          home_address: intern.home_address || '',
          emergency_name: intern.emergency_name || '',
          emergency_relation: intern.emergency_relation || '',
          emergency_phone: intern.emergency_phone || ''
        });
        try {
          const workflowRes = await api.get('/interns/me/face-enrollment');
          setFaceWorkflow(workflowRes.data);
        } catch (workflowError) {
          console.error('Could not load face enrollment workflow:', workflowError);
          setFaceWorkflow({ active_request: null, requests: [], history: [] });
        }
      } else {
        // Admin profile
        setProfile({
          full_name: 'Administrator',
          username: user.username,
          role: 'Administrator'
        });
      }
    } catch {
      toast.error('Failed to load profile details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [role]);

  const handlePersonalSubmit = async (e) => {
    e.preventDefault();
    if (role !== 'intern') return;
    setSavingPersonal(true);
    try {
      await api.put('/interns/me/profile', personalForm);
      toast.success('Personal information updated successfully!');
      fetchProfile();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update personal information');
    } finally {
      setSavingPersonal(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordForm.currentPassword) {
      toast.error('Current password is required');
      return;
    }
    if (!passwordForm.newPassword) {
      toast.error('New password is required');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      await api.post('/auth/change-password', {
        current_password: passwordForm.currentPassword,
        new_password: passwordForm.newPassword
      });
      toast.success('Password updated successfully!');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to change password. Make sure current password is correct.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRenewalRequest = async () => {
    const reason = renewalReason.trim();
    if (reason.length < 10) {
      toast.error('Please provide a reason of at least 10 characters');
      return;
    }
    setSubmittingRenewal(true);
    try {
      await api.post('/interns/me/face-renewal-requests', { reason });
      toast.success('Face ID renewal request submitted');
      setRenewalRequestOpen(false);
      setRenewalReason('');
      await fetchProfile();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not submit renewal request');
    } finally {
      setSubmittingRenewal(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
        <p className="text-gray-500 text-sm">Loading profile details...</p>
      </div>
    );
  }

  const initials = (role === 'intern' ? profile?.full_name : 'Administrator')
    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const canSelfEnroll = Boolean(
    profile?.self_face_enrollment_available
    && !profile?.face_registered
    && profile?.status === 'active'
  );

  return (
    <div className={`max-w-6xl mx-auto space-y-6 animate-fade-in px-0 sm:px-4 ${role === 'intern' ? 'intern-mobile-page intern-profile-page' : ''}`}>
      {/* Title Header */}
      <div>
        <div className="flex items-center gap-2 text-gray-800 mb-1">
          <User className="w-6 h-6 text-pnp-800" />
          <h1 className="text-2xl font-bold tracking-tight text-gray-900" style={{ fontFamily: 'Outfit, sans-serif' }}>
            {role === 'intern' ? 'My Personal Intern Profile' : 'My Administrator Profile'}
          </h1>
        </div>
        <p className="text-gray-500 text-sm">
          {role === 'intern' 
            ? 'View your official school profile parameters, edit personal details, and update your portal password.'
            : 'Update your administrator portal secure password and view system parameters.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Personal Info Form */}
        <div className="lg:col-span-2 space-y-6">
          {role === 'intern' ? (
            <div className="card p-6 bg-white border border-gray-100 shadow-sm rounded-xl">
              <div className="flex items-center gap-2 pb-4 mb-6 border-b border-gray-100">
                <User className="w-4 h-4 text-pnp-800" />
                <h2 className="font-bold text-xs uppercase tracking-wider text-pnp-900">
                  Update Personal Information
                </h2>
              </div>

              <form onSubmit={handlePersonalSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Email Address</label>
                    <input
                      type="email"
                      className="form-input bg-gray-50/50"
                      placeholder="e.g. john.doe@pup.edu.ph"
                      value={personalForm.email}
                      onChange={e => setPersonalForm(f => ({ ...f, email: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Contact Phone</label>
                    <input
                      type="text"
                      className="form-input bg-gray-50/50"
                      placeholder="e.g. 09123456789"
                      value={personalForm.phone}
                      onChange={e => setPersonalForm(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>

                  <div className="form-group md:col-span-2">
                    <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Home Address</label>
                    <input
                      type="text"
                      className="form-input bg-gray-50/50"
                      placeholder="Enter your full home address"
                      value={personalForm.home_address}
                      onChange={e => setPersonalForm(f => ({ ...f, home_address: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <p className="text-[10px] uppercase font-extrabold tracking-widest text-blue-500 mb-4">
                    Emergency Contact Details
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="form-group">
                      <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Contact Name</label>
                      <input
                        type="text"
                        className="form-input bg-gray-50/50"
                        placeholder="e.g. Maria Doe"
                        value={personalForm.emergency_name}
                        onChange={e => setPersonalForm(f => ({ ...f, emergency_name: e.target.value }))}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Relationship</label>
                      <input
                        type="text"
                        className="form-input bg-gray-50/50"
                        placeholder="e.g. Mother"
                        value={personalForm.emergency_relation}
                        onChange={e => setPersonalForm(f => ({ ...f, emergency_relation: e.target.value }))}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Contact Phone</label>
                      <input
                        type="text"
                        className="form-input bg-gray-50/50"
                        placeholder="e.g. 09198765432"
                        value={personalForm.emergency_phone}
                        onChange={e => setPersonalForm(f => ({ ...f, emergency_phone: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="btn btn-primary bg-pnp-900 hover:bg-pnp-950 font-bold px-6 py-2.5 rounded-lg shadow-sm"
                    disabled={savingPersonal}
                  >
                    {savingPersonal ? 'Saving changes...' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            // Admin Personal info block
            <div className="card p-6 bg-white border border-gray-100 shadow-sm rounded-xl">
              <div className="flex items-center gap-2 pb-4 mb-6 border-b border-gray-100">
                <User className="w-4 h-4 text-pnp-800" />
                <h2 className="font-bold text-xs uppercase tracking-wider text-pnp-900">
                  Administrator Profile Details
                </h2>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-400">Username</p>
                    <p className="font-semibold text-gray-800 mt-1">{user.username}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-400">Role</p>
                    <p className="font-semibold text-gray-800 mt-1">System Administrator</p>
                  </div>
                </div>
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <p className="text-xs text-blue-700 font-semibold mb-1">Administrative Privileges</p>
                  <p className="text-xs text-blue-600">Full system read/write credentials, intern account creation, attendance approval, and system parameter management.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Password & Institutional Deployment */}
        <div className="space-y-6">
          {/* Update password card */}
          <div className="card p-6 bg-white border border-gray-100 shadow-sm rounded-xl">
            <div className="flex items-center gap-2 pb-4 mb-5 border-b border-gray-100">
              <Lock className="w-4 h-4 text-pnp-800" />
              <h2 className="font-bold text-xs uppercase tracking-wider text-pnp-900">
                Update Secure Password
              </h2>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="form-group">
                <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Current Password</label>
                <input
                  type="password"
                  className="form-input bg-gray-50/50 text-sm"
                  placeholder="Enter current password"
                  value={passwordForm.currentPassword}
                  onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">New Password</label>
                <input
                  type="password"
                  className="form-input bg-gray-50/50 text-sm"
                  placeholder="At least 6 characters"
                  value={passwordForm.newPassword}
                  onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label text-[11px] text-gray-500 uppercase font-bold tracking-wider">Confirm New Password</label>
                <input
                  type="password"
                  className="form-input bg-gray-50/50 text-sm"
                  placeholder="Confirm new password"
                  value={passwordForm.confirmPassword}
                  onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full bg-pnp-900 hover:bg-pnp-950 font-bold py-2.5 rounded-lg text-sm transition-all"
                disabled={savingPassword}
              >
                {savingPassword ? 'Applying...' : 'Apply Password'}
              </button>
            </form>
          </div>

          {/* Face Verification Registration Card (only for Interns) */}
          {role === 'intern' && profile && (
            <div className="card border border-blue-100 shadow-md rounded-xl overflow-hidden bg-gradient-to-br from-white to-blue-50/30">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wider">
                    Biometric Face Verification
                  </h3>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${
                  profile.face_registered
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}>
                  <UserCheck className="w-3.5 h-3.5" />
                  {profile.face_registered ? 'Registered' : 'Not Registered'}
                </span>
              </div>

              <div className="p-5 space-y-3">
                <p className="text-xs text-gray-600">
                  {profile.face_registered
                    ? 'Your face profile is registered and active for 1:1 attendance verification.'
                    : canSelfEnroll
                      ? 'As a fresh account, you may complete your initial Face ID registration yourself once. This option closes after a successful enrollment.'
                      : 'Your biometric profile has not been enrolled. Contact your administrator or assigned supervisor to complete enrollment in person.'}
                </p>

                {!profile.face_registered ? (
                  canSelfEnroll ? (
                    <button
                      type="button"
                      className="btn btn-primary w-full"
                      onClick={() => setInitialEnrollmentOpen(true)}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Register My Face Now
                    </button>
                  ) : (
                    <div className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold">
                      <ShieldCheck className="w-4 h-4" />
                      Initial enrollment is managed by authorized staff
                    </div>
                  )
                ) : faceWorkflow.active_request?.status === 'approved' ? (
                  <button
                    type="button"
                    className="btn btn-primary w-full"
                    onClick={() => setSelfRenewalOpen(true)}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Update Approved Face ID
                  </button>
                ) : faceWorkflow.active_request?.status === 'pending' ? (
                  <div className="w-full rounded-lg bg-amber-50 border border-amber-200 px-3 py-3">
                    <p className="text-xs font-bold text-amber-800">Renewal request pending review</p>
                    <p className="text-[11px] text-amber-700 mt-1">{faceWorkflow.active_request.reason}</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary w-full"
                    onClick={() => setRenewalRequestOpen(true)}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Request Face ID Renewal
                  </button>
                )}

                {faceWorkflow.history.length > 0 && (
                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 mb-2">
                      <History className="w-4 h-4 text-blue-600" />
                      <p className="text-xs font-bold text-gray-700">Enrollment history</p>
                    </div>
                    <div className="space-y-2">
                      {faceWorkflow.history.slice(0, 4).map(item => (
                        <div key={item.id} className="rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-gray-700 capitalize">{item.enrollment_type}</span>
                            <span className="text-[10px] text-gray-500">
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-600 mt-1">{item.renewal_reason}</p>
                          <p className="text-[10px] text-gray-500 mt-1">
                            Completed by {item.enrolled_by_name}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Institutional Deployment (only for Interns) */}
          {role === 'intern' && profile && (
            <div className="card deployment-card shadow-lg rounded-xl overflow-hidden">
              <div className="deployment-card-header p-5 border-b flex items-center gap-2">
                <Building2 className="deployment-card-icon w-5 h-5" />
                <h3 className="deployment-card-title font-bold text-xs uppercase tracking-wider">
                  Institutional Deployment
                </h3>
              </div>

              <div className="p-6 space-y-5 text-sm">
                <div>
                  <p className="deployment-card-label text-[10px] font-bold uppercase tracking-wider mb-1">Student ID</p>
                  <p className="deployment-card-value font-bold tracking-wide">{profile.student_id || '—'}</p>
                </div>

                <div>
                  <p className="deployment-card-label text-[10px] font-bold uppercase tracking-wider mb-1">University</p>
                  <p className="deployment-card-value font-medium">{profile.school || '—'}</p>
                </div>

                <div>
                  <p className="deployment-card-label text-[10px] font-bold uppercase tracking-wider mb-1">Designated Division</p>
                  <div className="deployment-card-division mt-1 px-3 py-2 border rounded-lg">
                    <p className="deployment-card-division-value font-bold text-xs tracking-wide">
                      {profile.division_name || profile.department_name || '—'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="deployment-card-label text-[10px] font-bold uppercase tracking-wider mb-1">Start Date</p>
                    <p className="deployment-card-value font-semibold text-xs">{profile.start_date || '—'}</p>
                  </div>
                  <div>
                    <p className="deployment-card-label text-[10px] font-bold uppercase tracking-wider mb-1">End Date</p>
                    <p className="deployment-card-value font-semibold text-xs">{profile.end_date || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={renewalRequestOpen}
        onClose={() => setRenewalRequestOpen(false)}
        title="Request Face ID Renewal"
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setRenewalRequestOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleRenewalRequest} disabled={submittingRenewal}>
              {submittingRenewal ? 'Submitting...' : 'Submit Request'}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-600 mb-4">
          Explain why your current Face ID needs to be replaced. An administrator or your assigned supervisor must approve it first.
        </p>
        <div className="form-group">
          <label className="form-label">Renewal reason</label>
          <textarea
            className="form-input min-h-28 resize-y"
            maxLength={500}
            value={renewalReason}
            onChange={event => setRenewalReason(event.target.value)}
            placeholder="Example: My appearance changed significantly and attendance verification no longer recognizes me."
          />
          <p className="text-[11px] text-gray-500 mt-1">
            {renewalReason.trim().length}/500 characters · minimum 10
          </p>
        </div>
      </Modal>

      <FaceRegistrationModal
        isOpen={initialEnrollmentOpen}
        onClose={() => setInitialEnrollmentOpen(false)}
        onSuccess={async () => {
          setInitialEnrollmentOpen(false);
          await Promise.all([fetchProfile(), refreshUser()]);
        }}
        intern={profile}
        selfEnrollment
      />

      <FaceRegistrationModal
        isOpen={selfRenewalOpen}
        onClose={() => setSelfRenewalOpen(false)}
        onSuccess={async () => {
          setSelfRenewalOpen(false);
          await fetchProfile();
        }}
        intern={profile}
        approvedRequest={faceWorkflow.active_request}
        selfRenewal
      />
    </div>
  );
}
