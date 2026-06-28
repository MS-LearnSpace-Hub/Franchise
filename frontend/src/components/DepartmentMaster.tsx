import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

interface Department {
    id: number;
    department_code: string;
    department_name: string;
    description: string;
    display_order: number;
    status: string;
}

export const DepartmentMaster: React.FC = () => {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);


    const [form, setForm] = useState({
        department_code: '',
        department_name: '',
        description: '',
        display_order: 0,
        status: 'ACTIVE'
    });

    const fetchDepartments = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/hr/departments');
            setDepartments(res.data || []);
        } catch (e: any) {
            console.error('Failed to load departments', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDepartments();
    }, [fetchDepartments]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`/hr/departments/${editingId}`, form);
                setMsg({ type: 'success', text: 'Department updated successfully' });
            } else {
                await api.post('/hr/departments', form);
                setMsg({ type: 'success', text: 'Department created successfully' });
            }
            setForm({ department_code: '', department_name: '', description: '', display_order: 0, status: 'ACTIVE' });
            setEditingId(null);
            fetchDepartments();
        } catch (e: any) {
            setMsg({ type: 'error', text: e.response?.data?.error || `Failed to ${editingId ? 'update' : 'create'} department` });
        }
    };

    const handleEdit = (d: Department) => {
        setEditingId(d.id);
        setForm({
            department_code: d.department_code,
            department_name: d.department_name,
            description: d.description || '',
            display_order: d.display_order || 0,
            status: d.status || 'ACTIVE'
        });
    };

    const currentSchoolId = localStorage.getItem('currentSchoolId');
    if (!currentSchoolId || currentSchoolId === 'all') {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
                <h2 className="text-lg font-bold text-slate-800 mb-2">Department Master</h2>
                <p className="text-slate-500 text-sm">Please select a specific school from the top navigation to view and manage departments.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Department Master</h2>

            {msg && (
                <div className={`mb-4 p-3 rounded text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {msg.text}
                </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Code *</label>
                    <input type="text" required value={form.department_code} onChange={e => setForm({ ...form, department_code: e.target.value.replace(/\D/g, '') })} disabled={!!editingId} className="w-full border rounded p-2 text-sm disabled:bg-gray-100" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Name *</label>
                    <input type="text" required value={form.department_name} onChange={e => setForm({ ...form, department_name: e.target.value })} className="w-full border rounded p-2 text-sm" />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                    <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded p-2 text-sm" />
                </div>
                <div className="flex gap-2">
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700">{editingId ? 'Update' : 'Save'} Department</button>
                    {editingId && (
                        <button type="button" onClick={() => { setEditingId(null); setForm({ department_code: '', department_name: '', description: '', display_order: 0, status: 'ACTIVE' }); }} className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300">Cancel</button>
                    )}
                </div>
            </form>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-50 text-slate-600">
                            <th className="p-2 border-b">Code</th>
                            <th className="p-2 border-b">Name</th>
                            <th className="p-2 border-b">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? <tr><td colSpan={3} className="p-4 text-center">Loading...</td></tr> :
                            departments.map(d => (
                                <tr key={d.id} className="border-b">
                                    <td className="p-2">{d.department_code}</td>
                                    <td className="p-2">{d.department_name}</td>
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
