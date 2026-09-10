import React, { useState, useEffect, useRef } from 'react';
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
    const { user, hasPermission } = useAuth();
    
    const allowedBranches = (user?.allowed_branches ?? []).map((b) => ({
        branch_id: b.branch_id,
        branch_name: b.branch_name,
        branch_code: b.branch_code,
    }));
    const isSingleBranch = allowedBranches.length <= 1;

    // Permissions
    const showBankTab = hasPermission('hr.hr.staff-bank', 'write') || hasPermission('hr.hr.staff-payroll', 'write');
    const showSalaryTab = hasPermission('hr.hr.staff-payroll', 'write');
    const showLoginTab = hasPermission('hr.hr.staff-login', 'write') || true;

    const [activeTab, setActiveTab] = useState('personal');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form states
    const [form, setForm] = useState({
        branch_id: isSingleBranch && allowedBranches[0] ? String(allowedBranches[0].branch_id) : '',
        first_name: '', middle_name: '', last_name: '',
        gender: 'MALE', date_of_birth: '',
        mobile: '', email: '',
        address: '', city: '', state: '', country: '', pincode: '',
        joining_date: '',
        employment_type: 'PERMANENT',
        staff_category_id: '', staff_status_id: '',
        department_id: '', designation_id: '', default_shift_id: '',
        reporting_manager_id: '', attendance_source: 'MANUAL',
        id_generation_method: 'AUTO',
        staff_code: '', employee_id: '', biometric_id: ''
    });

    const [bankForm, setBankForm] = useState({
        account_holder_name: '', bank_name: '', branch_name: '',
        account_number: '', ifsc_code: '', account_type: 'SAVINGS',
        upi_id: '', pan_number: '', aadhaar_number: '',
        pf_applicable: false, pf_number: '',
        esi_applicable: false, esi_number: '',
        pt_applicable: false, tds_applicable: false
    });

    const [salaryForm, setSalaryForm] = useState({
        salary_type: 'MONTHLY', basic_salary: '', gross_salary: '',
        payment_mode: 'BANK_TRANSFER', effective_from: '',
        payroll_status: 'ACTIVE', gratuity_applicable: false,
        bonus_applicable: false, overtime_applicable: false,
        notice_period_days: '30', payroll_remarks: ''
    });

    const [roleId, setRoleId] = useState<string>('');

    const [departments, setDepartments] = useState<SelectOption[]>([]);
    const [designations, setDesignations] = useState<SelectOption[]>([]);
    const [categories, setCategories] = useState<SelectOption[]>([]);
    const [statuses, setStatuses] = useState<SelectOption[]>([]);
    const [shifts, setShifts] = useState<SelectOption[]>([]);
    const [managers, setManagers] = useState<SelectOption[]>([]);
    const [roles, setRoles] = useState<SelectOption[]>([]);

    useEffect(() => {
        const fetchMasterData = async () => {
            setLoading(true);
            try {
                const params = form.branch_id ? { branch_id: form.branch_id } : {};
                const [deptRes, desigRes, catRes, statusRes, shiftRes, mgrRes, rolesRes] = await Promise.all([
                    api.get('/hr/departments', { params }),
                    api.get('/hr/designations', { params }),
                    api.get('/hr/staff-categories', { params }),
                    api.get('/hr/staff-statuses', { params }),
                    api.get('/hr/shifts', { params }),
                    api.get('/hr/staff/managers', { params }),
                    api.get('/rbac/roles')
                ]);
                setDepartments((deptRes.data || []).map((d: any) => ({ id: d.id, label: d.department_name })));
                setDesignations((desigRes.data || []).map((d: any) => ({ id: d.id, label: d.designation_name, department_id: d.department_id })));
                setCategories((catRes.data || []).map((c: any) => ({ id: c.id, label: c.category_name })));
                setStatuses((statusRes.data || []).map((s: any) => ({ id: s.id, label: s.status_name })));
                setShifts((shiftRes.data || []).map((s: any) => ({ id: s.id, label: s.shift_name })));
                setManagers((mgrRes.data || []).map((m: any) => ({ id: m.id, label: `${m.display_name} (${m.staff_code})` })));
                setRoles((rolesRes.data?.roles || []).map((r: any) => ({ id: r.id, label: r.name || r.role_name })));
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
            setError('Please fill all mandatory fields (First Name, Joining Date, Department, Designation, Status, Branch) in Personal & Employment.');
            setActiveTab('employment');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            // 1. Create Staff
            const payload = {
                ...form,
                role_id: roleId ? Number(roleId) : undefined
            };
            const staffRes = await api.post('/hr/staff', payload);
            if (!staffRes.data.success || !staffRes.data.staff_id) {
                throw new Error(staffRes.data.message || 'Failed to create staff');
            }
            
            const staffId = staffRes.data.staff_id;

            // 2. Save Bank Details
            if (showBankTab && Object.keys(bankForm).length > 0) {
                await api.put(`/hr/staff/${staffId}/profile/account`, bankForm);
            }
            
            // 3. Save Salary Details
            if (showSalaryTab && (salaryForm.basic_salary || salaryForm.gross_salary)) {
                await api.put(`/hr/staff/${staffId}/profile/salary`, {
                    ...salaryForm,
                    basic_salary: Number(salaryForm.basic_salary) || null,
                    gross_salary: Number(salaryForm.gross_salary) || null,
                    notice_period_days: Number(salaryForm.notice_period_days) || 0
                });
            }

            onSuccess(staffId);
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Error creating staff record');
        } finally {
            setSaving(false);
        }
    };

    const tabs = [
        { id: 'personal', label: '1. Personal' },
        { id: 'employment', label: '2. Employment' },
        ...(showBankTab ? [{ id: 'bank', label: '3. Bank & Statutory' }] : []),
        ...(showSalaryTab ? [{ id: 'salary', label: '4. Salary & Payroll' }] : []),
        ...(showLoginTab ? [{ id: 'login', label: '5. Login & Access' }] : []),
    ];

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 max-w-6xl mx-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h2 className="text-xl font-bold text-slate-800">Create New Staff</h2>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-xl">✕</button>
            </div>

            <div className="flex border-b border-slate-200 overflow-x-auto hide-scrollbar">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`whitespace-nowrap px-6 py-4 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === tab.id ? 'border-emerald-600 text-emerald-700 bg-emerald-50' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="p-6 md:p-8">
                {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>}

                {/* Tab: Personal */}
                {activeTab === 'personal' && (
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Personal Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 uppercase"
                                        value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value.toUpperCase()})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Middle Name</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 uppercase"
                                        value={form.middle_name} onChange={e => setForm({...form, middle_name: e.target.value.toUpperCase()})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 uppercase"
                                        value={form.last_name} onChange={e => setForm({...form, last_name: e.target.value.toUpperCase()})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Gender *</label>
                                    <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
                                        <option value="MALE">Male</option>
                                        <option value="FEMALE">Female</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                                    <input type="date" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})} />
                                </div>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Contact & Address</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                                    <input type="email" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.state} onChange={e => setForm({...form, state: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Employment */}
                {activeTab === 'employment' && (
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Employment Information</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Branch *</label>
                                    <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 bg-white"
                                        value={form.branch_id} onChange={e => setForm({...form, branch_id: e.target.value})}>
                                        <option value="">Select Branch</option>
                                        {allowedBranches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Joining Date *</label>
                                    <input type="date" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.joining_date} onChange={e => setForm({...form, joining_date: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Employment Type *</label>
                                    <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.employment_type} onChange={e => setForm({...form, employment_type: e.target.value})}>
                                        <option value="PERMANENT">Permanent</option>
                                        <option value="CONTRACT">Contract</option>
                                        <option value="PROBATION">Probation</option>
                                        <option value="INTERN">Intern</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Department *</label>
                                    <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.department_id} onChange={e => setForm({...form, department_id: e.target.value})}>
                                        <option value="">Select Department</option>
                                        {departments.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Designation *</label>
                                    <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.designation_id} onChange={e => setForm({...form, designation_id: e.target.value})} disabled={!form.department_id}>
                                        <option value="">Select Designation</option>
                                        {filteredDesignations.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Staff Category *</label>
                                    <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.staff_category_id} onChange={e => setForm({...form, staff_category_id: e.target.value})}>
                                        <option value="">Select Category</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Status *</label>
                                    <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.staff_status_id} onChange={e => setForm({...form, staff_status_id: e.target.value})}>
                                        <option value="">Select Status</option>
                                        {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Default Shift</label>
                                    <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.default_shift_id} onChange={e => setForm({...form, default_shift_id: e.target.value})}>
                                        <option value="">Select Shift</option>
                                        {shifts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Reporting Manager</label>
                                    <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={form.reporting_manager_id} onChange={e => setForm({...form, reporting_manager_id: e.target.value})}>
                                        <option value="">Select Manager</option>
                                        {managers.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Bank & Statutory */}
                {activeTab === 'bank' && showBankTab && (
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Bank Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Account Number</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={bankForm.account_number} onChange={e => setBankForm({...bankForm, account_number: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">IFSC Code</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 uppercase"
                                        value={bankForm.ifsc_code} onChange={e => setBankForm({...bankForm, ifsc_code: e.target.value.toUpperCase()})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Bank Name</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={bankForm.bank_name} onChange={e => setBankForm({...bankForm, bank_name: e.target.value})} />
                                </div>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Statutory Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">PAN Number</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 uppercase"
                                        value={bankForm.pan_number} onChange={e => setBankForm({...bankForm, pan_number: e.target.value.toUpperCase()})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Aadhaar Number</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={bankForm.aadhaar_number} onChange={e => setBankForm({...bankForm, aadhaar_number: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">UAN / PF Number</label>
                                    <input type="text" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={bankForm.pf_number} onChange={e => setBankForm({...bankForm, pf_number: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Salary & Payroll */}
                {activeTab === 'salary' && showSalaryTab && (
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Salary Details</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Basic Salary</label>
                                    <input type="number" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={salaryForm.basic_salary} onChange={e => setSalaryForm({...salaryForm, basic_salary: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Gross Salary</label>
                                    <input type="number" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={salaryForm.gross_salary} onChange={e => setSalaryForm({...salaryForm, gross_salary: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Effective From</label>
                                    <input type="date" className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                                        value={salaryForm.effective_from} onChange={e => setSalaryForm({...salaryForm, effective_from: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Login & Access */}
                {activeTab === 'login' && showLoginTab && (
                    <div className="space-y-8">
                        <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-blue-800">
                            <strong>Note:</strong> A login account is generated automatically using the Staff Code as both username and password. The user will be forced to change their password on first login.
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Assign Initial Role</label>
                            <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 max-w-md"
                                value={roleId} onChange={e => setRoleId(e.target.value)}>
                                <option value="">Select Role (Optional)</option>
                                {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                            </select>
                        </div>
                    </div>
                )}

                {/* Footer Controls */}
                <div className="flex justify-between pt-8 mt-8 border-t border-slate-200">
                    <button type="button" onClick={onClose} disabled={saving} className="px-6 py-2.5 text-slate-600 hover:text-slate-800 font-semibold transition">
                        Cancel
                    </button>
                    <div className="flex gap-4">
                        {tabs.findIndex(t => t.id === activeTab) < tabs.length - 1 && (
                            <button 
                                type="button"
                                onClick={() => setActiveTab(tabs[tabs.findIndex(t => t.id === activeTab) + 1].id)} 
                                className="px-6 py-2.5 bg-slate-100 text-slate-800 rounded-lg hover:bg-slate-200 font-semibold transition"
                            >
                                Next Step →
                            </button>
                        )}
                        <button 
                            type="button"
                            onClick={handleSubmit} 
                            disabled={saving}
                            className="px-8 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-bold shadow-sm transition"
                        >
                            {saving ? 'Creating Staff...' : 'Save & Create Staff'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateStaffWizard;
