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
            await api.post('/hr/departments', form);
            setMsg({ type: 'success', text: 'Department created successfully' });
            setForm({ department_code: '', department_name: '', description: '', display_order: 0, status: 'ACTIVE' });
            fetchDepartments();
        } catch (e: any) {
            setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to create department' });
        }
    };

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
                    <input type="text" required value={form.department_code} onChange={e => setForm({ ...form, department_code: e.target.value })} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Name *</label>
                    <input type="text" required value={form.department_name} onChange={e => setForm({ ...form, department_name: e.target.value })} className="w-full border rounded p-2 text-sm" />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                    <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700">Save Department</button>
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
                                    <td className="p-2">{d.status}</td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
};
