import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import { canWrite } from '../utils/permissions';
import { useAuth } from '../contexts/AuthContext';

interface School {
  id: number; school_name: string; school_code: string | null;
  logo_url: string | null; address: string | null; phone: string | null;
  email: string | null; theme_color: string | null; subscription_plan: string | null;
  is_active: boolean; branch_count: number;
  branches: Array<{ id: number; branch_name: string; branch_code: string }>;
}

interface Location {
  code: string;
  name: string;
}

interface BranchForm { branch_name: string; branch_code: string; location_code: string; }

const FranchiseManagement: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = canWrite(user, 'system.franchise.franchise-management');

  const [activeTab, setActiveTab] = useState<'schools' | 'locations'>('schools');
  const [schools, setSchools] = useState<School[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Location form
  const [showLocForm, setShowLocForm] = useState(false);
  const [locForm, setLocForm] = useState({ name: '', code: '' });

  // School form
  const [showSchoolForm, setShowSchoolForm] = useState(false);
  const [editingSchoolId, setEditingSchoolId] = useState<number | null>(null);
  const [schoolForm, setSchoolForm] = useState({
    school_name: '', school_code: '', address: '', phone: '', email: '',
    theme_color: '#009746', subscription_plan: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Branch form
  const [activeBranchSchoolId, setActiveBranchSchoolId] = useState<number | null>(null);
  const [branchForm, setBranchForm] = useState<BranchForm>({ branch_name: '', branch_code: '', location_code: '' });
  const [savingBranch, setSavingBranch] = useState(false);

  // Use relative URLs so Vite proxy forwards /static/* to Flask (port 5001)
  const API_BASE = '';

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/schools');
      setSchools(res.data.schools || []);
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to load schools' });
    } finally { setLoading(false); }
  }, []);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await api.get('/org/locations');
      setLocations(res.data.locations || []);
    } catch (e: any) {
      console.error('Failed to load locations:', e);
    }
  }, []);

  useEffect(() => {
    fetchSchools();
    fetchLocations();
  }, [fetchSchools, fetchLocations]);

  // ── School CRUD ──────────────────────────────────────────────────────────

  const openCreateSchool = () => {
    setSchoolForm({ school_name: '', school_code: '', address: '', phone: '', email: '', theme_color: '#009746', subscription_plan: '' });
    setLogoFile(null); setLogoPreview(null); setEditingSchoolId(null);
    setShowSchoolForm(true); setMsg(null);
  };

  const openEditSchool = (s: School) => {
    setSchoolForm({
      school_name: s.school_name, school_code: s.school_code || '',
      address: s.address || '', phone: s.phone || '', email: s.email || '',
      theme_color: s.theme_color || '#009746', subscription_plan: s.subscription_plan || '',
    });
    setLogoPreview(s.logo_url ? (s.logo_url.startsWith('http') ? s.logo_url : `${API_BASE}${s.logo_url}`) : null);
    setLogoFile(null); setEditingSchoolId(s.id);
    setShowSchoolForm(true); setMsg(null);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    // Revoke previous blob URL to prevent memory leak
    if (logoPreview && logoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(logoPreview);
    }
    setLogoPreview(URL.createObjectURL(f));
  };

  const handleSaveSchool = async () => {
    if (!schoolForm.school_name.trim()) { setMsg({ type: 'error', text: 'School name is required' }); return; }
    setMsg(null);
    try {
      let schoolId = editingSchoolId;
      if (editingSchoolId) {
        await api.put(`/schools/${editingSchoolId}`, schoolForm);
      } else {
        const res = await api.post('/schools', schoolForm);
        schoolId = res.data.school_id;
      }
      // Upload logo if selected
      if (logoFile && schoolId) {
        const fd = new FormData();
        fd.append('logo', logoFile);
        await api.post(`/schools/${schoolId}/logo`, fd, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      }
      setMsg({ type: 'success', text: editingSchoolId ? 'School updated!' : 'School created!' });
      setShowSchoolForm(false); fetchSchools();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to save school' });
    }
  };

  const handleDeleteSchool = async (id: number, name: string) => {
    if (!window.confirm(`Deactivate school "${name}"?`)) return;
    try {
      await api.delete(`/schools/${id}`);
      fetchSchools();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to delete school' });
    }
  };

  // ── Location CRUD ────────────────────────────────────────────────────────

  const handleSaveLocation = async () => {
    if (!locForm.name || !locForm.code) {
      setMsg({ type: 'error', text: 'Location name and code (3 letters) are required' });
      return;
    }
    try {
      await api.post('/org/locations', locForm);
      setMsg({ type: 'success', text: 'Location created!' });
      setLocForm({ name: '', code: '' });
      setShowLocForm(false);
      fetchLocations();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to create location' });
    }
  };

  // ── Branch CRUD ──────────────────────────────────────────────────────────

  const handleSaveBranch = async (schoolId: number) => {
    if (!branchForm.branch_name.trim() || !branchForm.branch_code.trim() || !branchForm.location_code) {
      setMsg({ type: 'error', text: 'Branch name, code, and location are required' }); return;
    }
    setSavingBranch(true); setMsg(null);
    try {
      await api.post('/branches', { ...branchForm, school_id: schoolId });
      setBranchForm({ branch_name: '', branch_code: '', location_code: '' });
      setActiveBranchSchoolId(null);
      setMsg({ type: 'success', text: 'Branch added!' });
      fetchSchools();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to add branch' });
    } finally { setSavingBranch(false); }
  };

  const handleDeleteBranch = async (branchId: number) => {
    if (!window.confirm('Remove this branch?')) return;
    try {
      await api.delete(`/branches/${branchId}`);
      fetchSchools();
    } catch (e: any) {
      setMsg({ type: 'error', text: 'Failed to remove branch' });
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Franchise Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage schools, locations, and branches</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('schools')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'schools' ? 'bg-purple-600 text-white shadow' : 'bg-white text-gray-600 border'}`}
          >
            Schools
          </button>
          <button
            onClick={() => setActiveTab('locations')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'locations' ? 'bg-purple-600 text-white shadow' : 'bg-white text-gray-600 border'}`}
          >
            Locations (Cities)
          </button>
        </div>

        {isSuperAdmin && activeTab === 'schools' && (
          <button onClick={openCreateSchool}
            className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors shadow">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New School
          </button>
        )}

        {isSuperAdmin && activeTab === 'locations' && (
          <button onClick={() => { setShowLocForm(true); setMsg(null); }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Location
          </button>
        )}
      </div>

      {msg && !showSchoolForm && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {/* ── School Form Modal ──────────────────────────────────────────────── */}
      {showSchoolForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="text-lg font-bold text-gray-900">{editingSchoolId ? 'Edit School' : 'New School'}</h2>
              <button onClick={() => setShowSchoolForm(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {msg && (
                <div className={`p-3 rounded-lg text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {msg.text}
                </div>
              )}

              {/* Logo Upload */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-50 cursor-pointer hover:border-purple-400 transition-colors"
                  onClick={() => fileRef.current?.click()}>
                  {logoPreview
                    ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                    : <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">School Logo</p>
                  <p className="text-xs text-gray-400 mb-2">PNG, JPG, WebP (click to upload)</p>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="text-xs bg-purple-50 text-purple-600 border border-purple-200 px-3 py-1 rounded-lg hover:bg-purple-100 transition-colors">
                    Choose File
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                </div>
              </div>

              {[
                { label: 'School Name *', key: 'school_name', type: 'text', placeholder: 'e.g. Madhuri Vidyalaya' },
                { label: 'School Code', key: 'school_code', type: 'text', placeholder: 'e.g. MV001' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'school@example.com' },
                { label: 'Phone', key: 'phone', type: 'text', placeholder: '+91 99999 99999' },
                { label: 'Address', key: 'address', type: 'text', placeholder: 'Full address' },
                { label: 'Subscription Plan', key: 'subscription_plan', type: 'text', placeholder: 'e.g. Enterprise, Basic' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                  <input type={type} value={(schoolForm as any)[key]}
                    onChange={e => setSchoolForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500" />
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Theme Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={schoolForm.theme_color}
                    onChange={e => setSchoolForm(f => ({ ...f, theme_color: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer" />
                  <span className="text-sm text-gray-500">{schoolForm.theme_color}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t">
              <button onClick={handleSaveSchool}
                className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
                {editingSchoolId ? 'Update School' : 'Create School'}
              </button>
              <button onClick={() => setShowSchoolForm(false)}
                className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Location Form Modal ──────────────────────────────────────────────── */}
      {showLocForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900">New Location</h2>
              <button onClick={() => setShowLocForm(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {msg && (
                <div className={`p-3 rounded-lg text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {msg.text}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City/Location Name</label>
                <input type="text" value={locForm.name} onChange={e => setLocForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Hyderabad" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Short Code (3 letters)</label>
                <input type="text" value={locForm.code} onChange={e => setLocForm(f => ({ ...f, code: e.target.value.toUpperCase().slice(0, 3) }))}
                  placeholder="e.g. HYD" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t">
              <button onClick={handleSaveLocation} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium">Create Location</button>
              <button onClick={() => setShowLocForm(false)} className="flex-1 bg-gray-100 py-2 rounded-lg text-sm font-medium">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs Content ───────────────────────────────────────────────────── */}
      {activeTab === 'locations' ? (
        <div className="bg-white rounded-2xl border shadow-sm p-6">
          <h2 className="font-bold text-gray-900 mb-4">Existing Locations</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {locations.map(loc => (
              <div key={loc.code} className="bg-gray-50 border rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-800">{loc.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{loc.code}</p>
                </div>
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                  {loc.code}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading schools...</div>
          ) : schools.length === 0 ? (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-dashed border-gray-300">
              <svg className="mx-auto w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="text-sm">No schools found. Create your first school to get started.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {schools.map(school => (
                <div key={school.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                  {/* School Header */}
                  <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-purple-50 to-white">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-xl border-2 border-purple-100 overflow-hidden bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                        {school.logo_url
                          ? <img src={`${API_BASE}${school.logo_url}`} alt={school.school_name}
                            className="w-full h-full object-contain"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          : <span className="text-2xl font-bold text-purple-300">{school.school_name[0]}</span>
                        }
                      </div>
                      <div>
                        <h2 className="font-bold text-gray-900 text-lg">{school.school_name}</h2>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {school.school_code && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">{school.school_code}</span>
                          )}
                          <span className="text-xs text-gray-400">{school.branch_count} branch{school.branch_count !== 1 ? 'es' : ''}</span>
                          {school.subscription_plan && (
                            <span className="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">{school.subscription_plan}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isSuperAdmin && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditSchool(school)}
                          className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-2 rounded-lg transition-colors" title="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDeleteSchool(school.id, school.school_name)}
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Deactivate">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Branches */}
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-700">Branches</h3>
                      <button onClick={() => { setActiveBranchSchoolId(school.id); setBranchForm({ branch_name: '', branch_code: '', location_code: '' }); setMsg(null); }}
                        className="text-xs flex items-center gap-1 text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1 rounded-lg transition-colors">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Branch
                      </button>
                    </div>

                    {/* Inline Add Branch Form */}
                    {activeBranchSchoolId === school.id && (
                      <div className="mb-4 p-4 bg-purple-50 rounded-xl border border-purple-100">
                        <p className="text-xs font-semibold text-purple-700 mb-3">New Branch</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <input value={branchForm.branch_name} onChange={e => setBranchForm(f => ({ ...f, branch_name: e.target.value }))}
                            placeholder="Branch Name *" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500" />
                          <input value={branchForm.branch_code} onChange={e => setBranchForm(f => ({ ...f, branch_code: e.target.value }))}
                            placeholder="Code * (e.g. VZG01)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500" />

                          <select
                            value={branchForm.location_code}
                            onChange={e => setBranchForm(f => ({ ...f, location_code: e.target.value }))}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                          >
                            <option value="">-- Select Location --</option>
                            {locations.map(loc => (
                              <option key={loc.code} value={loc.code}>{loc.name} ({loc.code})</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => handleSaveBranch(school.id)} disabled={savingBranch}
                            className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                            {savingBranch ? 'Saving...' : 'Save Branch'}
                          </button>
                          <button onClick={() => setActiveBranchSchoolId(null)}
                            className="px-4 bg-white border border-gray-300 text-gray-600 py-2 rounded-lg text-xs hover:bg-gray-50 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Branch List */}
                    {school.branches.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-lg border border-dashed">No branches yet</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {school.branches.map(b => (
                          <div key={b.id} className="flex items-center justify-between bg-gray-50 border rounded-xl px-4 py-3 group hover:border-purple-200 hover:bg-purple-50 transition-colors">
                            <div>
                              <p className="font-medium text-gray-800 text-sm">{b.branch_name}</p>
                              <p className="text-xs text-gray-400 font-mono">{b.branch_code}</p>
                            </div>
                            <button onClick={() => handleDeleteBranch(b.id)}
                              className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-red-400 hover:text-red-600 p-1 rounded transition-all">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FranchiseManagement;
