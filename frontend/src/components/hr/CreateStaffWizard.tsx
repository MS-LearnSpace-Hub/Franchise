import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

interface CreateStaffWizardProps {
    onClose: () => void;
    onSuccess: (staffId: number) => void;
}

interface SelectOption {
    id: number;
    label: string;
    [key: string]: any;
}

const CreateStaffWizard: React.FC<CreateStaffWizardProps> = ({ onClose, onSuccess }) => {
    const { user } = useAuth();
    
    const allowedBranches = (user?.allowed_branches ?? []).map((b) => ({
        branch_id: b.branch_id,
        branch_name: b.branch_name,
        branch_code: b.branch_code,
    }));
    const isSingleBranch = allowedBranches.length <= 1;

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [form, setForm] = useState({
        branch_id: isSingleBranch && allowedBranches[0] ? String(allowedBranches[0].branch_id) : '',
        first_name: '',
        middle_name: '',
        last_name: '',
        gender: 'MALE',
        date_of_birth: '',
        mobile: '',
        email: '',
        joining_date: '',
        employment_type: 'PERMANENT',
        staff_category_id: '',
        staff_status_id: '',
        department_id: '',
        designation_id: '',
        id_generation_method: 'AUTO',
        staff_code: '',
        employee_id: '',
        biometric_id: ''
    });

    const [departments, setDepartments] = useState<SelectOption[]>([]);
    const [designations, setDesignations] = useState<SelectOption[]>([]);
    const [categories, setCategories] = useState<SelectOption[]>([]);
    const [statuses, setStatuses] = useState<SelectOption[]>([]);

    useEffect(() => {
        const fetchMasterData = async () => {
            setLoading(true);
            try {
                const params = form.branch_id ? { branch_id: form.branch_id } : {};
                const [deptRes, desigRes, catRes, statusRes] = await Promise.all([
                    api.get('/hr/departments', { params }),
                    api.get('/hr/designations', { params }),
                    api.get('/hr/staff-categories', { params }),
                    api.get('/hr/staff-statuses', { params })
                ]);
                setDepartments((deptRes.data || []).map((d: any) => ({ id: d.id, label: d.department_name })));
                setDesignations((desigRes.data || []).map((d: any) => ({ id: d.id, label: d.designation_name, department_id: d.department_id })));
                setCategories((catRes.data || []).map((c: any) => ({ id: c.id, label: c.category_name })));
                setStatuses((statusRes.data || []).map((s: any) => ({ id: s.id, label: s.status_name })));
            } catch (err) {
                console.error(err);
                setError('Failed to load master data');
            } finally {
                setLoading(false);
            }
        };
        fetchMasterData();
    }, [form.branch_id]);

    const filteredDesignations = form.department_id
        ? designations.filter((d) => d.department_id === Number(form.department_id))
        : designations;

    const handleSubmit = async () => {
        if (!form.first_name || !form.joining_date || !form.department_id || !form.designation_id || !form.staff_status_id || !form.branch_id) {
            setError('Please fill all mandatory fields (First Name, Joining Date, Department, Designation, Status, Branch).');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const res = await api.post('/hr/staff', form);
            if (res.data.success && res.data.staff_id) {
                onSuccess(res.data.staff_id);
            } else {
                setError(res.data.message || 'Failed to create staff');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Error creating staff record');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 max-w-4xl mx-auto">
            <div className="p-6 md:p-8">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-800">Create New Staff</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        ✕
                    </button>
                </div>

                {/* Stepper Header */}
                <div className="flex items-center mb-8">
                    <div className={`flex-1 text-center font-medium ${step === 1 ? 'text-emerald-600' : 'text-slate-400'}`}>
                        1. Basic Info
                    </div>
                    <div className="w-8 border-t-2 border-slate-200"></div>
                    <div className={`flex-1 text-center font-medium ${step === 2 ? 'text-emerald-600' : 'text-slate-400'}`}>
                        2. Employment
                    </div>
                </div>

                {error && <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>}

                {/* Step 1: Basic */}
                {step === 1 && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 uppercase"
                                    value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value.toUpperCase()})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Middle Name</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 uppercase"
                                    value={form.middle_name} onChange={e => setForm({...form, middle_name: e.target.value.toUpperCase()})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 uppercase"
                                    value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value.toUpperCase()})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                                <select className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                                    <option value="MALE">Male</option>
                                    <option value="FEMALE">Female</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                                <input type="date" className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Mobile</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                <input type="email" className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                            <button onClick={onClose} className="px-6 py-2 text-slate-600 hover:text-slate-800">Cancel</button>
                            <button onClick={() => setStep(2)} className="px-6 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700">Next →</button>
                        </div>
                    </div>
                )}

                {/* Step 2: Employment */}
                {step === 2 && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Branch *</label>
                                <select className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.branch_id} onChange={e => setForm({...form, branch_id: e.target.value})}
                                    disabled={isSingleBranch}>
                                    <option value="">Select Branch</option>
                                    {allowedBranches.map(b => (
                                        <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">ID Generation *</label>
                                <select className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.id_generation_method} onChange={e => setForm({...form, id_generation_method: e.target.value})}>
                                    <option value="AUTO">Auto Generate</option>
                                    <option value="MANUAL">Manual Entry</option>
                                </select>
                            </div>
                            
                            {form.id_generation_method === 'MANUAL' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Staff Code</label>
                                        <input type="text" className="w-full p-2 border border-slate-300 rounded uppercase"
                                            value={form.staff_code} onChange={e => setForm({...form, staff_code: e.target.value.toUpperCase()})} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Employee ID</label>
                                        <input type="text" className="w-full p-2 border border-slate-300 rounded uppercase"
                                            value={form.employee_id} onChange={e => setForm({...form, employee_id: e.target.value.toUpperCase()})} />
                                    </div>
                                </>
                            )}
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Biometric ID</label>
                                <input type="text" className="w-full p-2 border border-slate-300 rounded uppercase"
                                    value={form.biometric_id} onChange={e => setForm({...form, biometric_id: e.target.value.toUpperCase()})} />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Joining Date *</label>
                                <input type="date" className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.joining_date} onChange={e => setForm({...form, joining_date: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Employment Type</label>
                                <select className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.employment_type} onChange={e => setForm({...form, employment_type: e.target.value})}>
                                    <option value="PERMANENT">Permanent</option>
                                    <option value="CONTRACT">Contract</option>
                                    <option value="TEMPORARY">Temporary</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Staff Category</label>
                                <select className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.staff_category_id} onChange={e => setForm({...form, staff_category_id: e.target.value})}>
                                    <option value="">Select Category</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Department *</label>
                                <select className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.department_id} onChange={e => setForm({...form, department_id: e.target.value, designation_id: ''})}>
                                    <option value="">Select Department</option>
                                    {departments.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Designation *</label>
                                <select className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.designation_id} onChange={e => setForm({...form, designation_id: e.target.value})}>
                                    <option value="">Select Designation</option>
                                    {filteredDesignations.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Status *</label>
                                <select className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                    value={form.staff_status_id} onChange={e => setForm({...form, staff_status_id: e.target.value})}>
                                    <option value="">Select Status</option>
                                    {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-between pt-6 border-t border-slate-100">
                            <button onClick={() => setStep(1)} className="px-6 py-2 text-slate-600 hover:text-slate-800">← Back</button>
                            <button 
                                onClick={handleSubmit} 
                                disabled={saving}
                                className="px-6 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50">
                                {saving ? 'Creating...' : 'Create Staff'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CreateStaffWizard;
