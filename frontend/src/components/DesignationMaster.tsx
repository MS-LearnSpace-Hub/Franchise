import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

interface Designation {
    id: number;
    department_id: number;
    department_name: string;
    designation_code: string;
    designation_name: string;
    description: string;
    display_order: number;
    status: string;
}

export const DesignationMaster: React.FC = () => {
    const [designations, setDesignations] = useState<Designation[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [form, setForm] = useState({
        department_id: '',
        designation_code: '',
        designation_name: '',
        description: '',
        display_order: 0,
        status: 'ACTIVE'
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [desigRes, deptRes] = await Promise.all([
                api.get('/hr/designations'),
                api.get('/hr/departments')
            ]);
            setDesignations(desigRes.data || []);
            setDepartments(deptRes.data || []);
        } catch (e: any) {
            console.error('Failed to load data', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                ...form,
                department_id: Number(form.department_id)
            };
            if (editingId) {
                await api.put(`/hr/designations/${editingId}`, payload);
                setMsg({ type: 'success', text: 'Designation updated successfully' });
            } else {
                await api.post('/hr/designations', payload);
                setMsg({ type: 'success', text: 'Designation created successfully' });
            }
            setForm({ department_id: '', designation_code: '', designation_name: '', description: '', display_order: 0, status: 'ACTIVE' });
            setEditingId(null);
            fetchData();
        } catch (e: any) {
            setMsg({ type: 'error', text: e.response?.data?.error || `Failed to ${editingId ? 'update' : 'create'} designation` });
        }
    };

    const handleEdit = (d: Designation) => {
        setEditingId(d.id);
        setForm({
            department_id: String(d.department_id),
            designation_code: d.designation_code,
            designation_name: d.designation_name,
            description: d.description || '',
            display_order: d.display_order || 0,
            status: d.status || 'ACTIVE'
        });
    };

    const currentSchoolId = localStorage.getItem('currentSchoolId');
    if (!currentSchoolId || currentSchoolId === 'all') {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
                <h2 className="text-lg font-bold text-slate-800 mb-2">Designation Master</h2>
                <p className="text-slate-500 text-sm">Please select a specific school from the top navigation to view and manage designations.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Designation Master</h2>

            {msg && (
                <div className={`mb-4 p-3 rounded text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {msg.text}
                </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Department *</label>
                    <select required value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })} className="w-full border rounded p-2 text-sm">
                        <option value="">Select Department</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.department_name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Code *</label>
                    <input type="text" required value={form.designation_code} onChange={e => setForm({ ...form, designation_code: e.target.value })} disabled={!!editingId} className="w-full border rounded p-2 text-sm disabled:bg-gray-100" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Name *</label>
                    <input type="text" required value={form.designation_name} onChange={e => setForm({ ...form, designation_name: e.target.value })} className="w-full border rounded p-2 text-sm" />
                </div>
                <div className="md:col-span-3 flex gap-2">
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700">{editingId ? 'Update' : 'Save'} Designation</button>
                    {editingId && (
                        <button type="button" onClick={() => { setEditingId(null); setForm({ department_id: '', designation_code: '', designation_name: '', description: '', display_order: 0, status: 'ACTIVE' }); }} className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300">Cancel</button>
                    )}
                </div>
            </form>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-slate-600">
                            <th className="p-2 border-b">Department</th>
                            <th className="p-2 border-b">Code</th>
                            <th className="p-2 border-b">Name</th>
                            <th className="p-2 border-b">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? <tr><td colSpan={4} className="p-4 text-center">Loading...</td></tr> :
                            designations.map(d => (
                                <tr key={d.id} className="border-b">
                                    <td className="p-2">{d.department_name}</td>
                                    <td className="p-2">{d.designation_code}</td>
                                    <td className="p-2">{d.designation_name}</td>
                                    <td className="p-2">
                                        <span className={`px-2 py-1 text-xs rounded-full ${d.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {d.status}
                                        </span>
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
