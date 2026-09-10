import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';


interface DocumentType {
    id: number;
    code: string;
    name: string;
    description: string | null;
    is_required: boolean;
    allowed_extensions: string;
    max_file_size: number;
    requires_expiry: boolean;
    requires_document_number: boolean;
    is_active: boolean;
}

export const StaffDocumentTypeMaster: React.FC = () => {
    const { hasPermission } = useAuth();
    const canWrite = hasPermission('hr.hr.staff-document-types', 'write');

    const [list, setList] = useState<DocumentType[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);

    const blank = { 
        code: '', 
        name: '', 
        description: '', 
        is_required: false, 
        allowed_extensions: 'pdf,jpg,jpeg,png', 
        max_file_size: 5242880, 
        requires_expiry: false, 
        requires_document_number: false, 
        is_active: true 
    };
    
    const [form, setForm] = useState(blank);

    const fetchData = useCallback(async () => {
        const schoolId = localStorage.getItem('currentSchoolId');
        if (!schoolId || schoolId === 'all') return;
        setLoading(true);
        try {
            const res = await api.get('/hr/staff-document-types');
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
            if (editingId) {
                await api.put(`/hr/staff-document-types/${editingId}`, form);
                setMsg({ type: 'success', text: 'Document Type updated successfully.' });
            } else {
                await api.post('/hr/staff-document-types', form);
                setMsg({ type: 'success', text: 'Document Type created successfully.' });
            }
            setShowForm(false);
            fetchData();
        } catch (err: any) {
            setMsg({ type: 'error', text: err.response?.data?.error || 'Failed to save Document Type.' });
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (item: DocumentType) => {
        setForm({ ...item, description: item.description || '' });
        setEditingId(item.id);
        setShowForm(true);
        setMsg(null);
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800">Staff Document Types</h2>
                    {canWrite && !showForm && (
                        <button
                            onClick={() => { setForm(blank); setEditingId(null); setShowForm(true); setMsg(null); }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            Add Document Type
                        </button>
                    )}
                </div>

                {msg && (
                    <div className={`p-4 mb-4 rounded-lg text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {msg.text}
                    </div>
                )}

                {showForm ? (
                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-100">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">{editingId ? 'Edit' : 'Add'} Document Type</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Type Code <span className="text-red-500">*</span></label>
                                    <input 
                                        type="text" 
                                        required 
                                        disabled={!!editingId}
                                        value={form.code} 
                                        onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                                        className="w-full border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-slate-100"
                                        placeholder="e.g. AADHAAR"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Type Name <span className="text-red-500">*</span></label>
                                    <input 
                                        type="text" 
                                        required 
                                        value={form.name} 
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        className="w-full border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                        placeholder="e.g. Aadhaar Card"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                    <input 
                                        type="text" 
                                        value={form.description} 
                                        onChange={e => setForm({ ...form, description: e.target.value })}
                                        className="w-full border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Allowed Extensions</label>
                                    <input 
                                        type="text" 
                                        value={form.allowed_extensions} 
                                        onChange={e => setForm({ ...form, allowed_extensions: e.target.value })}
                                        className="w-full border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                        placeholder="pdf,jpg,jpeg,png"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Max File Size (MB)</label>
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={Math.round(form.max_file_size / 1048576)} 
                                        onChange={e => setForm({ ...form, max_file_size: parseInt(e.target.value) * 1048576 })}
                                        className="w-full border-slate-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                </div>
                                <div className="flex items-center space-x-4 pt-6">
                                    <label className="flex items-center text-sm text-slate-700">
                                        <input 
                                            type="checkbox" 
                                            checked={form.is_required} 
                                            onChange={e => setForm({ ...form, is_required: e.target.checked })}
                                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded mr-2"
                                        />
                                        Mandatory
                                    </label>
                                    <label className="flex items-center text-sm text-slate-700">
                                        <input 
                                            type="checkbox" 
                                            checked={form.requires_document_number} 
                                            onChange={e => setForm({ ...form, requires_document_number: e.target.checked })}
                                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded mr-2"
                                        />
                                        Requires Number
                                    </label>
                                    <label className="flex items-center text-sm text-slate-700">
                                        <input 
                                            type="checkbox" 
                                            checked={form.requires_expiry} 
                                            onChange={e => setForm({ ...form, requires_expiry: e.target.checked })}
                                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded mr-2"
                                        />
                                        Requires Expiry Date
                                    </label>
                                    <label className="flex items-center text-sm text-slate-700">
                                        <input 
                                            type="checkbox" 
                                            checked={form.is_active} 
                                            onChange={e => setForm({ ...form, is_active: e.target.checked })}
                                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300 rounded mr-2"
                                        />
                                        Active
                                    </label>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-4">
                                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                                <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
                                    {saving ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        {loading ? (
                            <div className="p-8 text-center text-slate-500">Loading...</div>
                        ) : list.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">No Document Types Found</div>
                        ) : (
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Code</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Extensions</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Required</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                        {canWrite && <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {list.map((t) => (
                                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{t.code}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                                {t.name}
                                                {t.description && <div className="text-xs text-slate-400 mt-0.5">{t.description}</div>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{t.allowed_extensions}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                                {t.is_required ? <span className="text-red-600 font-medium">Yes</span> : <span className="text-slate-400">No</span>}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${t.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {t.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            {canWrite && (
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <button onClick={() => handleEdit(t)} className="text-indigo-600 hover:text-indigo-900 p-1.5 rounded-lg hover:bg-indigo-50 transition-colors" title="Edit">
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
