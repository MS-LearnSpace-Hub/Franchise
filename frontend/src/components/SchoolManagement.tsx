import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { BuildingOfficeIcon, UserIcon, ShieldCheckIcon } from './icons';

interface Branch {
  id: number;
  branch_name: string;
  branch_code: string;
}

interface School {
  id: number;
  school_name: string;
  school_code: string | null;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  theme_color: string | null;
  subscription_plan: string | null;
  is_active: boolean;
  branch_count: number;
  branches: Branch[];
}

interface Location {
  code: string;
  name: string;
}

const SchoolManagement: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SuperAdmin';

  const [schools, setSchools] = useState<School[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // School modal/form states
  const [showSchoolForm, setShowSchoolForm] = useState(false);
  const [editingSchoolId, setEditingSchoolId] = useState<number | null>(null);
  const [schoolForm, setSchoolForm] = useState({
    school_name: '',
    school_code: '',
    address: '',
    phone: '',
    email: '',
    theme_color: '#4f46e5',
    subscription_plan: 'Standard',
  });

  // Branch form states
  const [activeBranchSchoolId, setActiveBranchSchoolId] = useState<number | null>(null);
  const [branchForm, setBranchForm] = useState({
    branch_name: '',
    branch_code: '',
    location_code: '',
  });

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/schools');
      setSchools(res.data.schools || []);
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to load schools' });
    } finally {
      setLoading(false);
    }
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

  const handleSaveSchool = async () => {
    if (!schoolForm.school_name.trim()) {
      setMsg({ type: 'error', text: 'School name is required' });
      return;
    }
    try {
      if (editingSchoolId) {
        await api.put(`/schools/${editingSchoolId}`, schoolForm);
      } else {
        await api.post('/schools', schoolForm);
      }
      setMsg({ type: 'success', text: editingSchoolId ? 'School updated successfully!' : 'School created successfully!' });
      setShowSchoolForm(false);
      fetchSchools();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to save school' });
    }
  };

  const handleSaveBranch = async () => {
    if (!branchForm.branch_name.trim() || !branchForm.branch_code.trim() || !branchForm.location_code) {
      setMsg({ type: 'error', text: 'All branch fields are required' });
      return;
    }
    try {
      await api.post(`/schools/${activeBranchSchoolId}/branches`, branchForm);
      setMsg({ type: 'success', text: 'Branch added successfully!' });
      setActiveBranchSchoolId(null);
      setBranchForm({ branch_name: '', branch_code: '', location_code: '' });
      fetchSchools();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to add branch' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">School Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isSuperAdmin ? 'Full administration of all schools and branches' : 'Manage your assigned schools and branches'}
          </p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => {
              setSchoolForm({ school_name: '', school_code: '', address: '', phone: '', email: '', theme_color: '#4f46e5', subscription_plan: 'Standard' });
              setEditingSchoolId(null);
              setShowSchoolForm(true);
              setMsg(null);
            }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow"
          >
            Create School
          </button>
        )}
      </div>

      {/* Messages */}
      {msg && (
        <div className={`mb-6 p-4 rounded-xl text-sm border ${
          msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {msg.text}
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <svg className="animate-spin w-8 h-8 mr-3 text-indigo-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span>Loading schools & branches...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {schools.map(school => (
            <div key={school.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              {/* School Info Block */}
              <div className="p-6 border-b border-slate-100 flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: school.theme_color || '#4f46e5' }}>
                    {school.school_name.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{school.school_name}</h2>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 mt-1">
                      Code: {school.school_code || 'N/A'}
                    </span>
                  </div>
                </div>
                {isSuperAdmin && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setSchoolForm({
                          school_name: school.school_name,
                          school_code: school.school_code || '',
                          address: school.address || '',
                          phone: school.phone || '',
                          email: school.email || '',
                          theme_color: school.theme_color || '#4f46e5',
                          subscription_plan: school.subscription_plan || 'Standard',
                        });
                        setEditingSchoolId(school.id);
                        setShowSchoolForm(true);
                        setMsg(null);
                      }}
                      className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Edit School"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* School Details */}
              <div className="px-6 py-4 bg-slate-50 grid grid-cols-2 gap-4 border-b border-slate-100 text-xs text-slate-600">
                <div>
                  <span className="font-semibold text-slate-500">Phone:</span> {school.phone || 'N/A'}
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Email:</span> {school.email || 'N/A'}
                </div>
                <div className="col-span-2">
                  <span className="font-semibold text-slate-500">Address:</span> {school.address || 'N/A'}
                </div>
              </div>

              {/* Branches Block */}
              <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-800">Branches ({school.branches.length})</h3>
                  {(isSuperAdmin || user?.role === 'Admin') && (
                    <button
                      onClick={() => {
                        setActiveBranchSchoolId(school.id);
                        setBranchForm({ branch_name: '', branch_code: '', location_code: '' });
                        setMsg(null);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                    >
                      + Add Branch
                    </button>
                  )}
                </div>

                <div className="space-y-3 flex-1">
                  {school.branches.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-sm italic">
                      No branches assigned/created.
                    </div>
                  ) : (
                    school.branches.map(branch => (
                      <div key={branch.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-slate-300 transition-colors">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">
                            {branch.branch_name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-medium text-slate-900 text-sm block">{branch.branch_name}</span>
                            <span className="text-xs text-slate-500">Code: {branch.branch_code}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* School Form Dialog */}
      {showSchoolForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{editingSchoolId ? 'Edit School Details' : 'Create New School'}</h2>
              <button onClick={() => setShowSchoolForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">School Name</label>
                <input
                  type="text"
                  value={schoolForm.school_name}
                  onChange={e => setSchoolForm(f => ({ ...f, school_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">School Code</label>
                  <input
                    type="text"
                    value={schoolForm.school_code}
                    onChange={e => setSchoolForm(f => ({ ...f, school_code: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Subscription Plan</label>
                  <input
                    type="text"
                    value={schoolForm.subscription_plan}
                    onChange={e => setSchoolForm(f => ({ ...f, subscription_plan: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Theme Color</label>
                <input
                  type="color"
                  value={schoolForm.theme_color}
                  onChange={e => setSchoolForm(f => ({ ...f, theme_color: e.target.value }))}
                  className="w-12 h-10 border border-slate-200 rounded-xl cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Email</label>
                <input
                  type="email"
                  value={schoolForm.email}
                  onChange={e => setSchoolForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Phone</label>
                <input
                  type="text"
                  value={schoolForm.phone}
                  onChange={e => setSchoolForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Address</label>
                <textarea
                  value={schoolForm.address}
                  onChange={e => setSchoolForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-20"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={handleSaveSchool} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-xl text-sm transition-colors">
                Save School
              </button>
              <button onClick={() => setShowSchoolForm(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 rounded-xl text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch Form Dialog */}
      {activeBranchSchoolId !== null && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Add New Branch</h2>
              <button onClick={() => setActiveBranchSchoolId(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Branch Name</label>
                <input
                  type="text"
                  placeholder="e.g. Hyderabad Branch"
                  value={branchForm.branch_name}
                  onChange={e => setBranchForm(f => ({ ...f, branch_name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Branch Code</label>
                <input
                  type="text"
                  placeholder="e.g. HYD"
                  value={branchForm.branch_code}
                  onChange={e => setBranchForm(f => ({ ...f, branch_code: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Location Code</label>
                <select
                  value={branchForm.location_code}
                  onChange={e => setBranchForm(f => ({ ...f, location_code: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">-- Select Location --</option>
                  {locations.map(loc => (
                    <option key={loc.code} value={loc.code}>{loc.name} ({loc.code})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={handleSaveBranch} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-xl text-sm transition-colors">
                Save Branch
              </button>
              <button onClick={() => setActiveBranchSchoolId(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 rounded-xl text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchoolManagement;
