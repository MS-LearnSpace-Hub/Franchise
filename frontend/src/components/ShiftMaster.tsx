import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

interface Shift {
    id: number;
    shift_code: string;
    shift_name: string;
    start_time: string;
    end_time: string;
    grace_in_minutes: number;
    grace_out_minutes: number;
    status: string;
}

export const ShiftMaster: React.FC = () => {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [form, setForm] = useState({
        shift_code: '',
        shift_name: '',
        start_time: '',
        end_time: '',
        grace_in_minutes: 0,
        grace_out_minutes: 0,
        status: 'ACTIVE'
    });

    const fetchShifts = useCallback(async () => {
        const schoolId = localStorage.getItem('currentSchoolId');
        if (!schoolId || schoolId === 'all') return;
        setLoading(true);
        try {
            const res = await api.get('/hr/shifts');
            setShifts(res.data || []);
        } catch (e: any) {
            console.error('Failed to load shifts', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchShifts();
    }, [fetchShifts]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`/hr/shifts/${editingId}`, form);
                setMsg({ type: 'success', text: 'Shift updated successfully' });
            } else {
                await api.post('/hr/shifts', form);
                setMsg({ type: 'success', text: 'Shift created successfully' });
            }
            setForm({ shift_code: '', shift_name: '', start_time: '', end_time: '', grace_in_minutes: 0, grace_out_minutes: 0, status: 'ACTIVE' });
            setEditingId(null);
            fetchShifts();
        } catch (e: any) {
            setMsg({ type: 'error', text: e.response?.data?.error || `Failed to ${editingId ? 'update' : 'create'} shift` });
        }
    };

    const handleEdit = (s: Shift) => {
        setEditingId(s.id);
        setForm({
            shift_code: s.shift_code,
            shift_name: s.shift_name,
            start_time: s.start_time,
            end_time: s.end_time,
            grace_in_minutes: s.grace_in_minutes || 0,
            grace_out_minutes: s.grace_out_minutes || 0,
            status: s.status || 'ACTIVE'
        });
    };

    const currentSchoolId = localStorage.getItem('currentSchoolId');
    if (!currentSchoolId || currentSchoolId === 'all') {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
                <h2 className="text-lg font-bold text-slate-800 mb-2">Shift Master</h2>
                <p className="text-slate-500 text-sm">Please select a specific school from the top navigation to view and manage shifts.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Shift Master</h2>
            
            {msg && (
                <div className={`mb-4 p-3 rounded text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {msg.text}
                </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Code *</label>
                    <input type="text" required value={form.shift_code} onChange={e => setForm({...form, shift_code: e.target.value})} disabled={!!editingId} className="w-full border rounded p-2 text-sm disabled:bg-gray-100" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Name *</label>
                    <input type="text" required value={form.shift_name} onChange={e => setForm({...form, shift_name: e.target.value})} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Start Time *</label>
                    <input type="time" required value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">End Time *</label>
                    <input type="time" required value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Grace In (mins)</label>
                    <input type="number" value={form.grace_in_minutes} onChange={e => setForm({...form, grace_in_minutes: Number(e.target.value)})} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Grace Out (mins)</label>
                    <input type="number" value={form.grace_out_minutes} onChange={e => setForm({...form, grace_out_minutes: Number(e.target.value)})} className="w-full border rounded p-2 text-sm" />
                </div>
                <div className="md:col-span-4 flex gap-2">
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700">{editingId ? 'Update' : 'Save'} Shift</button>
                    {editingId && (
                        <button type="button" onClick={() => { setEditingId(null); setForm({ shift_code: '', shift_name: '', start_time: '', end_time: '', grace_in_minutes: 0, grace_out_minutes: 0, status: 'ACTIVE' }); }} className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300">Cancel</button>
                    )}
                </div>
            </form>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-slate-600">
                            <th className="p-2 border-b">Code</th>
                            <th className="p-2 border-b">Name</th>
                            <th className="p-2 border-b">Timings</th>
                            <th className="p-2 border-b">Status</th>
                            <th className="p-2 border-b">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? <tr><td colSpan={5} className="p-4 text-center">Loading...</td></tr> : 
                            shifts.map(s => (
                                <tr key={s.id} className="border-b">
                                    <td className="p-2">{s.shift_code}</td>
                                    <td className="p-2">{s.shift_name}</td>
                                    <td className="p-2">{s.start_time} - {s.end_time}</td>
                                    <td className="p-2">
                                        <span className={`px-2 py-1 text-xs rounded-full ${s.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {s.status}
                                        </span>
                                    </td>
                                    <td className="p-2">
                                        <button onClick={() => handleEdit(s)} className="text-blue-500 hover:text-blue-700 text-sm">Edit</button>
                                    </td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ShiftMaster;
