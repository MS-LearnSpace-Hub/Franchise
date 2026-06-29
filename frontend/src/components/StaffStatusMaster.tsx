import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

interface StaffStatus {
    id: number;
    status_code: string;
    status_name: string;
    description: string | null;
    display_order: number;
    is_active: boolean;
    status_type: 'ACTIVE' | 'INACTIVE';
}

const statusBadgeColor: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-800',
    PROBATION: 'bg-amber-100 text-amber-800',
    NOTICE_PERIOD: 'bg-orange-100 text-orange-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    RESIGNED: 'bg-slate-100 text-slate-600',
    TERMINATED: 'bg-red-200 text-red-900',
    RETIRED: 'bg-purple-100 text-purple-800',
};

export const StaffStatusMaster: React.FC = () => {
    const { hasPermission } = useAuth();
    const canWrite = hasPermission('hr.hr.staff-statuses', 'write');

    const [list, setList] = useState<StaffStatus[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);

    const blank: any = { status_code: '', status_name: '', description: '', display_order: 0, is_active: true, status_type: 'ACTIVE' };
    const [form, setForm] = useState(blank);

    const fetchData = useCallback(async () => {
        const schoolId = localStorage.getItem('currentSchoolId');
        if (!schoolId || schoolId === 'all') return;
        setLoading(true);
        try {
            const res = await api.get('/hr/staff-statuses');
            setList(res.data || []);
        } catch {
            /* silent */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMsg(null);
        try {
            const payload = {
                ...form,
                status_code: form.status_code.toUpperCase().replace(/\s+/g, '_').trim(),
                display_order: Number(form.display_order),
            };
            if (editingId) {
                await api.put(`/hr/staff-statuses/${editingId}`, payload);
                setMsg({ type: 'success', text: `Status "${form.status_name}" updated.` });
            } else {
                await api.post('/hr/staff-statuses', payload);
                setMsg({ type: 'success', text: `Status "${form.status_name}" created.` });
            }
            setForm(blank);
            setShowForm(false);
            fetchData();
        } catch (e: any) {
            setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to create status.' });
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (s: StaffStatus) => {
        setEditingId(s.id);
        setForm({
            status_code: s.status_code,
            status_name: s.status_name,
            description: s.description || '',
            display_order: s.display_order || 0,
            is_active: s.is_active
        });
        setShowForm(true);
        window.scrollTo(0, 0);
    };

    const currentSchoolId = localStorage.getItem('currentSchoolId');
    if (!currentSchoolId || currentSchoolId === 'all') {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center mt-6">
                <h2 className="text-lg font-bold text-slate-800 mb-2">Staff Status Master</h2>
                <p className="text-slate-500 text-sm">Please select a specific school from the top navigation to view and manage staff statuses.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Staff Status Master</h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Employment statuses — Active, Probation, Notice Period, etc.
                    </p>
                </div>
                {canWrite && (
                    <button
                        id="btn-add-status"
                        onClick={() => { setShowForm(!showForm); setMsg(null); }}
                        className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showForm ? "M6 18L18 6M6 6l12 12" : "M12 4v16m8-8H4"} />
                        </svg>
                        {showForm ? 'Cancel' : 'Add Status'}
                    </button>
                )}
            </div>

            {/* Message */}
            {msg && (
                <div className={`rounded-lg border p-3 text-sm font-medium ${msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    {msg.text}
                </div>
            )}

            {/* Form */}
            {showForm && canWrite && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-bold text-slate-700 mb-5">New Employment Status</h3>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
                                Status Code <span className="text-red-500">*</span>
                            </label>
                            <input
                                id="status-code"
                                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-violet-500 outline-none font-mono uppercase"
                                placeholder="e.g. NOTICE_PERIOD"
                                value={form.status_code}
                                onChange={e => setForm({ ...form, status_code: e.target.value })}
                                required
                                maxLength={30}
                            />
                            <p className="text-xs text-slate-400 mt-1">Use UPPER_SNAKE_CASE. Spaces auto-converted to underscores.</p>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
                                Status Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                id="status-name"
                                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-violet-500 outline-none"
                                placeholder="e.g. Notice Period"
                                value={form.status_name}
                                onChange={e => setForm({ ...form, status_name: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">Description</label>
                            <input
                                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-violet-500 outline-none"
                                placeholder="Optional description"
                                value={form.description}
                                onChange={e => setForm({ ...form, description: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">Display Order</label>
                            <input
                                type="number"
                                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-violet-500 outline-none"
                                value={form.display_order}
                                onChange={e => setForm({ ...form, display_order: Number(e.target.value) })}
                                min={0}
                            />
                        </div>
                        <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">Status Type</label>
                                <select
                                    className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-violet-500 outline-none"
                                    value={form.status_type}
                                    onChange={e => setForm({ ...form, status_type: e.target.value as 'ACTIVE' | 'INACTIVE' })}
                                >
                                    <option value="ACTIVE">Active (Credentials Work)</option>
                                    <option value="INACTIVE">Inactive (Credentials Disabled)</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 items-end">
                                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition">
                                    Cancel
                                </button>
                                <button
                                    id="btn-save-status"
                                    type="submit"
                                    disabled={saving}
                                    className="px-6 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg disabled:opacity-60 transition"
                                >
                                    {saving ? 'Saving…' : editingId ? 'Update Status' : 'Save Status'}
                                </button>
                                {editingId && (
                                    <button type="button" onClick={() => { setEditingId(null); setForm(blank); setShowForm(false); }} className="px-6 py-2 text-sm font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition ml-2">Cancel</button>
                                )}
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">#</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Code</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status Name</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Active</th>
                            {canWrite && <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {list.map((s) => (
                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3 text-slate-400 text-xs">{s.id}</td>
                                <td className="px-4 py-3">
                                    <span className={`font-mono text-xs px-2 py-1 rounded font-semibold ${statusBadgeColor[s.status_code] ?? 'bg-slate-100 text-slate-600'}`}>
                                        {s.status_code}
                                    </span>
                                </td>
                                <td className="px-4 py-3 font-semibold text-slate-800">{s.status_name}</td>
                                <td className="px-4 py-3 text-slate-500 text-xs">{s.description ?? '—'}</td>
                                <td className="px-4 py-3 text-slate-500">{s.display_order}</td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${s.status_type === 'ACTIVE' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {s.status_type}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {s.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                {canWrite && (
                                    <td className="px-4 py-3">
                                        <button onClick={() => handleEdit(s)} className="text-violet-600 hover:text-violet-800 text-sm font-medium">Edit</button>
                                    </td>
                                )}
                            </tr>
                        ))}
                        {list.length === 0 && (
                            <tr>
                                <td colSpan={canWrite ? 7 : 6} className="px-4 py-10 text-center text-slate-400 text-sm">
                                    {loading ? 'Loading…' : 'No statuses found.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
