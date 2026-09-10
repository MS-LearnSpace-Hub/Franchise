import React, { useState, useEffect, useRef } from 'react';
import api from '../../api';
import { useAuth } from '../../contexts/AuthContext';

interface SelectOption {
    id: number;
    label: string;
    [key: string]: any;
}

interface Props {
    staffId: number;
    onClose: () => void;
    onSuccess: () => void;
}

export const UpdateStaffDetails: React.FC<Props> = ({ staffId, onClose, onSuccess }) => {
    const { user, hasPermission } = useAuth();
    
    const allowedBranches = (user?.allowed_branches ?? []).map((b) => ({
        branch_id: b.branch_id,
        branch_name: b.branch_name,
        branch_code: b.branch_code,
    }));

    // Permissions
    const showBankTab = hasPermission('hr.hr.staff-bank', 'write') || hasPermission('hr.hr.staff-payroll', 'write');
    const showSalaryTab = hasPermission('hr.hr.staff-payroll', 'write');
    const showDocumentsTab = hasPermission('hr.hr.staff-documents', 'write') || true;
    const showLoginTab = hasPermission('hr.hr.staff-login', 'write') || true;

    const [activeTab, setActiveTab] = useState('personal');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [departments, setDepartments] = useState<SelectOption[]>([]);
    const [designations, setDesignations] = useState<SelectOption[]>([]);
    const [shifts, setShifts] = useState<SelectOption[]>([]);
    const [categories, setCategories] = useState<SelectOption[]>([]);
    const [statuses, setStatuses] = useState<SelectOption[]>([]);
    const [managers, setManagers] = useState<SelectOption[]>([]);
    const [roles, setRoles] = useState<SelectOption[]>([]);

    const [form, setForm] = useState<any>({
        branch_id: '',
        first_name: '', middle_name: '', last_name: '',
        gender: 'MALE', date_of_birth: '',
        mobile: '', email: '',
        address: '', city: '', state: '', country: '', pincode: '',
        joining_date: '', confirmation_date: '',
        employment_type: 'PERMANENT',
        staff_category_id: '', staff_status_id: '',
        department_id: '', designation_id: '', default_shift_id: '',
        reporting_manager_id: '',
        attendance_source: 'MANUAL',
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

    const [existingDocs, setExistingDocs] = useState<any[]>([]);
    const [documents, setDocuments] = useState<File[]>([]);
    const [roleId, setRoleId] = useState<string>('');

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Fetch staff details
                const res = await api.get(`/hr/staff/${staffId}`);
                const data = res.data;
                
                setForm({
                    branch_id: data.branch_id ? String(data.branch_id) : '',
                    first_name: data.first_name || '',
                    middle_name: data.middle_name || '',
                    last_name: data.last_name || '',
                    gender: data.gender || 'MALE',
                    date_of_birth: data.date_of_birth || '',
                    mobile: data.mobile || '',
                    email: data.email || '',
                    address: data.address || '',
                    city: data.city || '',
                    state: data.state || '',
                    country: data.country || '',
                    pincode: data.pincode || '',
                    joining_date: data.joining_date || '',
                    confirmation_date: data.confirmation_date || '',
                    employment_type: data.employment_type || 'PERMANENT',
                    staff_category_id: data.staff_category_id ? String(data.staff_category_id) : '',
                    staff_status_id: data.staff_status_id ? String(data.staff_status_id) : '',
                    department_id: data.department_id ? String(data.department_id) : '',
                    designation_id: data.designation_id ? String(data.designation_id) : '',
                    default_shift_id: data.default_shift_id ? String(data.default_shift_id) : '',
                    reporting_manager_id: data.reporting_manager_id ? String(data.reporting_manager_id) : '',
                    attendance_source: data.attendance_source || 'MANUAL',
                });

                if (showBankTab || showSalaryTab) {
                    try {
                        const [bankRes, salaryRes] = await Promise.all([
                            api.get(`/hr/staff/${staffId}/profile/bank`),
                            api.get(`/hr/staff/${staffId}/profile/salary`)
                        ]);
                        
                        if (bankRes.data && Object.keys(bankRes.data).length > 0) {
                            setBankForm(prev => ({ ...prev, ...bankRes.data }));
                        }
                        if (salaryRes.data && Object.keys(salaryRes.data).length > 0) {
                            setSalaryForm(prev => ({ ...prev, ...salaryRes.data }));
                        }
                    } catch (e) {
                        console.error("Failed to load payroll data", e);
                    }
                }

                if (showDocumentsTab) {
                    try {
                        const docsRes = await api.get(`/hr/staff/${staffId}/documents`);
                        setExistingDocs(docsRes.data || []);
                    } catch (e) {
                        console.error("Failed to load existing documents", e);
                    }
                }

                // Fetch masters
                const params = data.branch_id ? { branch_id: data.branch_id } : {};
                const [deptRes, desigRes, shiftRes, catRes, statusRes, mgrRes, rolesRes] = await Promise.all([
                    api.get('/hr/departments', { params }),
                    api.get('/hr/designations', { params }),
                    api.get('/hr/shifts', { params }),
                    api.get('/hr/staff-categories', { params }),
                    api.get('/hr/staff-statuses', { params }),
                    api.get('/hr/staff/managers', { params }),
                    api.get('/rbac/roles')
                ]);

                setDepartments((deptRes.data || []).map((d: any) => ({ id: d.id, label: d.department_name })));
                setDesignations((desigRes.data || []).map((d: any) => ({ id: d.id, label: d.designation_name, department_id: d.department_id })));
                setShifts((shiftRes.data || []).map((s: any) => ({ id: s.id, label: s.shift_name })));
                setCategories((catRes.data || []).map((c: any) => ({ id: c.id, label: c.category_name })));
                setStatuses((statusRes.data || []).map((s: any) => ({ id: s.id, label: s.status_name })));
                setManagers((mgrRes.data || []).map((m: any) => ({ id: m.id, label: `${m.first_name} ${m.last_name || ''} (${m.staff_code})` })));
                setRoles((rolesRes.data?.roles || []).map((r: any) => ({ id: r.id, label: r.name || r.role_name })));

            } catch (e: any) {
                console.error(e);
                setError("Failed to load staff details for editing.");
            } finally {
                setLoading(false);
            }
        };

        fetchInitialData();
    }, [staffId, showBankTab, showSalaryTab, showDocumentsTab]);

    const filteredDesignations = form.department_id
        ? designations.filter((d) => d.department_id === Number(form.department_id))
        : designations;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setDocuments([...documents, ...Array.from(e.target.files)]);
        }
    };
    const removeDocument = (index: number) => {
        setDocuments(documents.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        
        if (!form.first_name || !form.joining_date || !form.department_id || !form.designation_id || !form.staff_status_id || !form.branch_id) {
            setError('Please fill all mandatory fields (First Name, Joining Date, Department, Designation, Status, Branch) in Personal & Employment Details.');
            setActiveTab('employment');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const payload = {
                ...form,
                branch_id: form.branch_id ? Number(form.branch_id) : null,
                department_id: form.department_id ? Number(form.department_id) : null,
                designation_id: form.designation_id ? Number(form.designation_id) : null,
                default_shift_id: form.default_shift_id ? Number(form.default_shift_id) : null,
                staff_category_id: form.staff_category_id ? Number(form.staff_category_id) : null,
                staff_status_id: form.staff_status_id ? Number(form.staff_status_id) : null,
                reporting_manager_id: form.reporting_manager_id ? Number(form.reporting_manager_id) : null,
                role_id: roleId ? Number(roleId) : undefined
            };

            await api.put(`/hr/staff/${staffId}`, payload);

            if (showBankTab && (bankForm.account_number || bankForm.pan_number || bankForm.aadhaar_number)) {
                await api.put(`/hr/staff/${staffId}/profile/bank`, bankForm);
            }
            if (showSalaryTab && (salaryForm.basic_salary || salaryForm.gross_salary)) {
                await api.put(`/hr/staff/${staffId}/profile/salary`, {
                    ...salaryForm,
                    basic_salary: Number(salaryForm.basic_salary) || null,
                    gross_salary: Number(salaryForm.gross_salary) || null,
                    notice_period_days: Number(salaryForm.notice_period_days) || 0
                });
            }

            if (showDocumentsTab && documents.length > 0) {
                const formData = new FormData();
                documents.forEach(doc => {
                    formData.append('documents', doc);
                    formData.append('document_types', 'OTHER');
                });
                try {
                    await api.post(`/hr/staff/${staffId}/documents`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                } catch (docErr) {
                    console.error("Document upload failed:", docErr);
                }
            }

            onSuccess();
        } catch (e: any) {
            setError(e.response?.data?.error || 'Failed to update staff details.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
        );
    }

    const tabs = [
        { id: 'personal', label: '1. Personal' },
        { id: 'employment', label: '2. Employment' },
        ...(showBankTab ? [{ id: 'bank', label: '3. Bank & Statutory' }] : []),
        ...(showSalaryTab ? [{ id: 'salary', label: '4. Salary & Payroll' }] : []),
        ...(showDocumentsTab ? [{ id: 'documents', label: '5. Documents' }] : []),
        ...(showLoginTab ? [{ id: 'login', label: '6. Login & Access' }] : []),
    ];

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 max-w-6xl mx-auto">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h2 className="text-xl font-bold text-slate-800">Update Staff Details</h2>
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
                                    <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 bg-slate-100"
                                        value={form.branch_id} onChange={e => setForm({...form, branch_id: e.target.value})} disabled>
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

                {/* Tab: Documents */}
                {activeTab === 'documents' && showDocumentsTab && (
                    <div className="space-y-6">
                        {existingDocs.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-slate-700 mb-3">Existing Documents</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {existingDocs.map((doc: any) => (
                                        <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                            <div className="text-2xl">📄</div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-700 truncate">{doc.file_name || doc.document_type}</p>
                                            </div>
                                            <a href={`/api/hr/staff/${staffId}/documents/${doc.id}/download`} target="_blank" rel="noreferrer" className="text-blue-600 text-xs font-semibold hover:underline">
                                                View
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <h3 className="text-sm font-semibold text-slate-700 mb-3 border-t border-slate-100 pt-4">Upload New Documents</h3>
                        <div className="bg-slate-50 p-6 rounded-xl border border-dashed border-slate-300 text-center">
                            <input 
                                type="file" 
                                multiple 
                                className="hidden" 
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                            />
                            <div className="text-slate-500 mb-4">Select identity, educational, or experience documents to upload.</div>
                            <button 
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
                            >
                                + Select Files
                            </button>
                        </div>
                        {documents.length > 0 && (
                            <div className="bg-white rounded-lg border border-slate-200">
                                {documents.map((file, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 border-b border-slate-100 last:border-0">
                                        <div className="flex items-center gap-3">
                                            <div className="text-2xl">📄</div>
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">{file.name}</p>
                                                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        </div>
                                        <button onClick={() => removeDocument(i)} className="text-red-500 hover:text-red-700 p-2">✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Tab: Login & Access */}
                {activeTab === 'login' && showLoginTab && (
                    <div className="space-y-8">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Update Role Assignment</label>
                            <select className="w-full p-2.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 max-w-md"
                                value={roleId} onChange={e => setRoleId(e.target.value)}>
                                <option value="">No Change</option>
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
                            {saving ? 'Updating...' : 'Save & Update Staff'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
