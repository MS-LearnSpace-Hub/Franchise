import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

interface SchoolOption { id: number; school_name: string; }
interface BranchOption { id: number; branch_name: string; branch_code: string; school_id: number | null; }
interface UserRow {
  user_id: number;
  username: string;
  useremail: string;
  role: string;
  role_id: number | null;
  role_name?: string;
  is_active: boolean;
  school_id: number | null;
  school_name: string | null;
  branch_id: number | null;
  branch_name: string | null;
  branch_ids?: number[];
}
interface RoleOption { id: number; name: string; is_active: boolean; }

const ROLES = ['SuperAdmin', 'Admin', 'User'];

const ROLE_COLORS: Record<string, string> = {
  SuperAdmin: 'bg-purple-100 text-purple-700',
  Admin: 'bg-blue-100 text-blue-700',
  User: 'bg-green-100 text-green-700',
};

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'SuperAdmin';

  // Data
  const [users, setUsers] = useState<UserRow[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'roles' | 'schools' | 'branches'>('basic');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<{
    username: string;
    password: string;
    useremail: string;
    role: string;
    role_id: string;
    school_id: string;
    school_ids: number[];
    branch_id: string;
    branch_ids: number[];
  }>({
    username: '',
    password: '',
    useremail: '',
    role: 'User',
    role_id: '',
    school_id: '',
    school_ids: [],
    branch_id: '',
    branch_ids: [],
  });

  // Filter state
  const [filterSchool, setFilterSchool] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data.users || []);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to load users' });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSchools = useCallback(async () => {
    try {
      const res = await api.get('/schools');
      setSchools(res.data.schools || []);
    } catch { /* silent */ }
  }, []);

  const fetchBranches = useCallback(async () => {
    try {
      const res = await api.get('/branches');
      setBranches(res.data.branches || []);
    } catch { /* silent */ }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await api.get('/rbac/roles');
      setRoles(res.data.roles || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchSchools();
    fetchBranches();
    fetchRoles();
  }, [fetchUsers, fetchSchools, fetchBranches, fetchRoles]);

  useEffect(() => {
    if (!form.role_id && roles.length > 0) {
      const match = roles.find(r => r.name === form.role);
      if (match) setForm(f => ({ ...f, role_id: String(match.id) }));
    }
  }, [roles, form.role, form.role_id]);

  // ── Filtered branches (by selected school in form) ─────────────────────────
  const filteredBranches = form.school_ids && form.school_ids.length > 0
    ? branches.filter(b => b.school_id !== null && form.school_ids.includes(b.school_id))
    : form.school_id
    ? branches.filter(b => String(b.school_id) === form.school_id)
    : branches;

  // ── Form Helpers ───────────────────────────────────────────────────────────

  const resetForm = () => {
    const userRole = roles.find(r => r.name === 'User');
    setForm({ username: '', password: '', useremail: '', role: 'User', role_id: userRole ? String(userRole.id) : '', school_id: '', school_ids: [], branch_id: '', branch_ids: [] });
    setEditingId(null);
    setActiveTab('basic');
    setShowForm(false);
    setMessage(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (u: any) => {
    setForm({
      username: u.username,
      password: '',
      useremail: u.useremail || '',
      role: u.role,
      role_id: u.role_id ? String(u.role_id) : '',
      school_id: u.school_id ? String(u.school_id) : '',
      school_ids: u.school_ids || [],
      branch_id: u.branch_id ? String(u.branch_id) : '',
      branch_ids: u.branch_ids || [],
    });
    setEditingId(u.user_id);
    setActiveTab('basic');
    setShowForm(true);
    setMessage(null);
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!form.username) { setMessage({ type: 'error', text: 'Username is required' }); return; }
    if (!editingId && !form.password) { setMessage({ type: 'error', text: 'Password is required for new users' }); return; }
    if (!form.useremail) { setMessage({ type: 'error', text: 'Email is required' }); return; }

    setMessage(null);
    try {
      if (editingId) {
        // Update existing user
        const payload: any = {
          role: form.role,
          role_id: form.role_id ? Number(form.role_id) : null,
          useremail: form.useremail,
          branch_id: form.branch_id ? Number(form.branch_id) : null,
          branch_ids: form.branch_ids,
        };
        if (isSuperAdmin) {
          payload.school_id = form.school_id ? Number(form.school_id) : null;
          payload.school_ids = form.school_ids;
        }
        await api.put(`/users/${editingId}`, payload);
        setMessage({ type: 'success', text: 'User updated successfully' });
      } else {
        // Create new user
        const payload: any = {
          username: form.username,
          password: form.password,
          useremail: form.useremail,
          role: form.role,
          role_id: form.role_id ? Number(form.role_id) : undefined,
          branch_id: form.branch_id ? Number(form.branch_id) : undefined,
          school_id: form.school_id ? Number(form.school_id) : undefined,
          school_ids: form.school_ids,
          branch_ids: form.branch_ids,
        };
        await api.post('/users/add', payload);
        setMessage({ type: 'success', text: 'User created successfully' });
      }
      fetchUsers();
      const userRole = roles.find(r => r.name === 'User');
      setForm({ username: '', password: '', useremail: '', role: 'User', role_id: userRole ? String(userRole.id) : '', school_id: '', school_ids: [], branch_id: '', branch_ids: [] });
      setEditingId(null);
      setShowForm(false);
      // Don't clear message here so success banner shows
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save user' });
    }
  };

  // ── Deactivate / Reactivate ──────────────────────────────────────────────────

  const handleToggleActive = async (u: UserRow) => {
    const action = u.is_active ? 'deactivate' : 'reactivate';
    if (!window.confirm(`Are you sure you want to ${action} "${u.username}"?`)) return;
    try {
      if (u.is_active) {
        await api.delete(`/users/${u.user_id}`);
      } else {
        await api.put(`/users/${u.user_id}`, { is_active: true });
      }
      fetchUsers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.error || `Failed to ${action} user` });
    }
  };

  // ── Display Filtering ────────────────────────────────────────────────────────

  const displayedUsers = users.filter(u => {
    if (filterSchool && String(u.school_id) !== filterSchool) return false;
    if (filterRole && u.role !== filterRole) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return u.username.toLowerCase().includes(q) || (u.useremail || '').toLowerCase().includes(q);
    }
    return true;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isSuperAdmin ? 'Manage all users across all schools' : 'Manage users in your school'}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      {/* Global Message */}
      {message && !showForm && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'success'
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* ── Create / Edit Form Modal ─────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Edit User' : 'Create New User'}
              </h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs Header */}
            <div className="flex border-b border-gray-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={`flex-1 py-3 text-center text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === 'basic'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                Basic Info
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('roles')}
                className={`flex-1 py-3 text-center text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === 'roles'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                Roles
              </button>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveTab('schools')}
                  className={`flex-1 py-3 text-center text-xs font-semibold border-b-2 transition-colors ${
                    activeTab === 'schools'
                      ? 'border-blue-600 text-blue-600 bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Schools
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('branches')}
                className={`flex-1 py-3 text-center text-xs font-semibold border-b-2 transition-colors ${
                  activeTab === 'branches'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                Branches
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {message && (
                <div className={`p-3 rounded-lg text-sm ${message.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {message.text}
                </div>
              )}

              {/* TAB 1: BASIC INFO */}
              {activeTab === 'basic' && (
                <div className="space-y-4">
                  {/* Username (only when creating) */}
                  {!editingId ? (
                    <div>
                      <label htmlFor="um-username" className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                      <input
                        type="text"
                        value={form.username}
                        onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g. vizag_admin"
                        id="um-username"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">Username</label>
                      <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 font-semibold">
                        {form.username}
                      </div>
                    </div>
                  )}

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      type="email"
                      value={form.useremail}
                      onChange={e => setForm(f => ({ ...f, useremail: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="user@school.com"
                      id="um-email"
                    />
                  </div>

                  {/* Password (only when creating) */}
                  {!editingId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                      <input
                        type="password"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Min 8 characters"
                        id="um-password"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: ROLES */}
              {activeTab === 'roles' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-semibold">Assigned Role *</label>
                  <select
                    value={form.role_id || (roles.find(r => r.name === form.role)?.id ?? form.role)}
                    onChange={e => {
                      const selected = roles.find(r => String(r.id) === e.target.value);
                      setForm(f => ({
                        ...f,
                        role_id: selected ? String(selected.id) : '',
                        role: selected ? selected.name : e.target.value,
                      }));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    id="um-role"
                  >
                    {roles.length > 0 ? (
                      <>
                        {roles
                          .filter(r => r.is_active && (isSuperAdmin || r.name !== 'SuperAdmin'))
                          .map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        {!roles.some(r => r.id === Number(form.role_id) || r.name === form.role) && form.role && (
                          <option value={form.role_id || form.role}>{form.role}</option>
                        )}
                      </>
                    ) : (
                      ROLES.filter(r => isSuperAdmin || r !== 'SuperAdmin').map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))
                    )}
                  </select>
                  <p className="text-xs text-gray-500 mt-2">
                    Roles define user permissions across the platform. Changing roles may affect which modules are accessible.
                  </p>
                </div>
              )}

              {/* TAB 3: SCHOOL ACCESS */}
              {activeTab === 'schools' && isSuperAdmin && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Primary School</label>
                    <select
                      value={form.school_id}
                      onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      id="um-school"
                    >
                      <option value="">-- Select School --</option>
                      {schools.map(s => (
                        <option key={s.id} value={s.id}>{s.school_name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-semibold">Assigned Schools</label>
                    <div className="grid grid-cols-1 gap-2 p-3 bg-slate-50 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      {schools.length === 0 ? (
                        <span className="text-gray-400 text-xs">No schools available</span>
                      ) : (
                        schools.map(s => {
                          const isChecked = form.school_ids.includes(s.id);
                          return (
                            <label key={s.id} className="flex items-center space-x-3 text-sm text-gray-700 hover:bg-slate-100 p-2 rounded cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setForm(f => {
                                    const newSchoolIds = f.school_ids.includes(s.id)
                                      ? f.school_ids.filter(id => id !== s.id)
                                      : [...f.school_ids, s.id];
                                    return {
                                      ...f,
                                      school_ids: newSchoolIds,
                                      // Auto-set primary if empty
                                      school_id: f.school_id ? f.school_id : (newSchoolIds.length > 0 ? String(newSchoolIds[0]) : '')
                                    };
                                  });
                                }}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                              <span className="font-medium text-gray-900">{s.school_name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: BRANCH ACCESS */}
              {activeTab === 'branches' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-semibold">Assigned Branches</label>
                    <div className="grid grid-cols-1 gap-2 p-3 bg-slate-50 border border-gray-200 rounded-lg max-h-56 overflow-y-auto">
                      {filteredBranches.length === 0 ? (
                        <span className="text-gray-400 text-xs">No branches available for the selected school(s)</span>
                      ) : (
                        filteredBranches.map(b => {
                          const isChecked = form.branch_ids.includes(b.id);
                          return (
                            <label key={b.id} className="flex items-center space-x-3 text-sm text-gray-700 hover:bg-slate-100 p-2 rounded cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  setForm(f => {
                                    const newBranchIds = f.branch_ids.includes(b.id)
                                      ? f.branch_ids.filter(id => id !== b.id)
                                      : [...f.branch_ids, b.id];
                                    return {
                                      ...f,
                                      branch_ids: newBranchIds,
                                      branch_id: newBranchIds.length > 0 ? String(newBranchIds[0]) : '',
                                    };
                                  });
                                }}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                              <div className="flex flex-col">
                                <span className="font-medium text-gray-900">{b.branch_name}</span>
                                <span className="text-gray-400 text-xs">({b.branch_code})</span>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t bg-slate-50">
              <button
                onClick={handleSave}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow"
                id="um-save-btn"
              >
                {editingId ? 'Update User' : 'Create User'}
              </button>
              <button
                onClick={resetForm}
                className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by username or email..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          id="um-search"
        />
        {isSuperAdmin && (
          <select
            value={filterSchool}
            onChange={e => setFilterSchool(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Schools</option>
            {schools.map(s => (
              <option key={s.id} value={s.id}>{s.school_name}</option>
            ))}
          </select>
        )}
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* ── Users Table ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <svg className="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading users...
          </div>
        ) : displayedUsers.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <svg className="mx-auto mb-3 w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Role</th>
                  {isSuperAdmin && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">School</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Branch</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayedUsers.map((u, idx) => (
                  <tr key={u.user_id} className={`hover:bg-gray-50 transition-colors ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800">{u.username}</div>
                      <div className="text-xs text-gray-400">{u.useremail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-700'}`}>
                        {u.role}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-3 text-gray-600 text-xs">{u.school_name || '—'}</td>
                    )}
                    <td className="px-4 py-3 text-gray-600 text-xs">{u.branch_name || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${u.is_active
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red-50 text-red-700'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {u.user_id !== currentUser?.user_id && (
                          <button
                            onClick={() => handleToggleActive(u)}
                            className={`p-1.5 rounded transition-colors ${u.is_active
                              ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
                              : 'text-green-500 hover:text-green-700 hover:bg-green-50'}`}
                            title={u.is_active ? 'Deactivate' : 'Reactivate'}
                          >
                            {u.is_active ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Footer */}
        <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-500">
          Showing {displayedUsers.length} of {users.length} users
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
