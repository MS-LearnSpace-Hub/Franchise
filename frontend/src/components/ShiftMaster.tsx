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
            await api.post('/hr/shifts', form);
            setMsg({ type: 'success', text: 'Shift created successfully' });
            setForm({ shift_code: '', shift_name: '', start_time: '', end_time: '', grace_in_minutes: 0, grace_out_minutes: 0, status: 'ACTIVE' });
            fetchShifts();
        } catch (e: any) {
            setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to create shift' });
        }
    };

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
                    <input type="text" required value={form.shift_code} onChange={e => setForm({...form, shift_code: e.target.value})} className="w-full border rounded p-2 text-sm" />
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
                <div className="md:col-span-4">
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700">Save Shift</button>
                </div>
            </form>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-slate-600">
                            <th className="p-2 border-b">Code</th>
                            <th className="p-2 border-b">Name</th>
                            <th className="p-2 border-b">Start Time</th>
                            <th className="p-2 border-b">End Time</th>
                            <th className="p-2 border-b">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? <tr><td colSpan={5} className="p-4 text-center">Loading...</td></tr> : 
                            shifts.map(s => (
                                <tr key={s.id} className="border-b">
                                    <td className="p-2">{s.shift_code}</td>
                                    <td className="p-2">{s.shift_name}</td>
                                    <td className="p-2">{s.start_time}</td>
                                    <td className="p-2">{s.end_time}</td>
                                    <td className="p-2">{s.status}</td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
};
