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
            await api.post('/hr/designations', {
                ...form,
                department_id: Number(form.department_id)
            });
            setMsg({ type: 'success', text: 'Designation created successfully' });
            setForm({ department_id: '', designation_code: '', designation_name: '', description: '', display_order: 0, status: 'ACTIVE' });
            fetchData();
        } catch (e: any) {
            setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to create designation' });
        }
    };

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
                    <input type="text" required value={form.designation_code} onChange={e => setForm({ ...form, designation_code: e.target.value })} className="w-full border rounded p-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Name *</label>
                    <input type="text" required value={form.designation_name} onChange={e => setForm({ ...form, designation_name: e.target.value })} className="w-full border rounded p-2 text-sm" />
                </div>
                <div className="md:col-span-3">
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700">Save Designation</button>
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
