import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import StaffProfile from './StaffProfile';
import { EyeIcon, DashboardIcon } from './icons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Staff {
    id: number;
    staff_code: string;
    employee_id: string | null;
    biometric_id: string | null;
    first_name: string;
    last_name: string;
    display_name: string;
    department_name: string | null;
    designation_name: string | null;
    staff_category_name: string | null;
    staff_status_name: string | null;
    employment_type: string;
    employment_status: string;
    mobile: string | null;
    email: string | null;
    joining_date: string | null;
    branch_id: number | null;
    branch_name: string | null;
    school_name: string | null;
}

interface SelectOption {
    id: number;
    label: string;
    [key: string]: any;
}

// ─── Status badge helper ──────────────────────────────────────────────────────

const statusColor: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-800',
    PROBATION: 'bg-amber-100 text-amber-800',
    NOTICE_PERIOD: 'bg-orange-100 text-orange-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    RESIGNED: 'bg-slate-100 text-slate-600',
    TERMINATED: 'bg-red-200 text-red-900',
    RETIRED: 'bg-purple-100 text-purple-800',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function StaffDirectory() {
    const { user, hasPermission } = useAuth();

    const canWrite = hasPermission('hr.hr.staff-master', 'write');

    // ── Available branches for scoping
    // SuperAdmin/Admin see all from allowed_branches; branch-level user sees only their branch
    const currentSchoolId = localStorage.getItem('currentSchoolId') || String(user?.school_id || '');
    const allowedBranches: Array<{ branch_id: number; branch_name: string; branch_code: string }> =
        (user?.allowed_branches ?? [])
            .filter((b: any) => {
                if (currentSchoolId && currentSchoolId !== 'All' && currentSchoolId !== 'null') {
                    return String(b.school_id) === currentSchoolId;
                }
                return true;
            })
            .map((b: any) => ({
                branch_id: b.branch_id,
                branch_name: b.branch_name,
                branch_code: b.branch_code,
            }));

    const isSingleBranch = allowedBranches.length <= 1;

    // ── State ─────────────────────────────────────────────────────────────────
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [departments, setDepartments] = useState<SelectOption[]>([]);
    const [designations, setDesignations] = useState<SelectOption[]>([]);
    const [shifts, setShifts] = useState<SelectOption[]>([]);
    const [roles, setRoles] = useState<SelectOption[]>([]);
    const [categories, setCategories] = useState<SelectOption[]>([]);
    const [statuses, setStatuses] = useState<SelectOption[]>([]);
    const [managers, setManagers] = useState<SelectOption[]>([]);  // reporting manager dropdown
    const [managerSearch, setManagerSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [viewingStaffId, setViewingStaffId] = useState<number | null>(null);

    // ── Advanced Search State
    const [searchBranchId, setSearchBranchId] = useState<string>('');
    const [searchDeptId, setSearchDeptId] = useState<string>('');
    const [searchStatus, setSearchStatus] = useState<string>('');
    const [searchBy, setSearchBy] = useState<string>('staff_code');
    const [searchQuery, setSearchQuery] = useState<string>('');

    const [result, setResult] = useState<{
        success: boolean;
        staff_code?: string;
        employee_id?: string;
        biometric_id?: string;
        message: string;
    } | null>(null);

    // ── Form state ────────────────────────────────────────────────────────────
    const blankForm: any = {
        id: null,
        // Branch
        branch_id: isSingleBranch && allowedBranches[0] ? String(allowedBranches[0].branch_id) : '',
        // Personal
        first_name: '',
        middle_name: '',
        last_name: '',
        gender: 'MALE',
        date_of_birth: '',
        // Contact
        mobile: '',
        email: '',
        address: '',
        city: '',
        state: '',
        country: '',
        pincode: '',
        // Employment
        joining_date: '',
        confirmation_date: '',
        employment_type: 'PERMANENT',
        staff_category_id: '',
        staff_status_id: '',
        department_id: '',
        designation_id: '',
        default_shift_id: '',
        attendance_source: 'MANUAL',
        // System access
        role_id: '',
        // Identifiers
        staff_code: '',
        employee_id: '',
        biometric_id: '',
        reporting_manager_id: '',
    };

    const [form, setForm] = useState(blankForm);

    // ── Filtered designations by selected dept ────────────────────────────────
    const filteredDesignations = form.department_id
        ? designations.filter((d) => d.department_id === Number(form.department_id))
        : designations;

    // ── Data fetching ─────────────────────────────────────────────────────────
    const fetchMasterData = useCallback(async (branchId?: string) => {
        try {
            const params = branchId ? { branch_id: branchId } : {};
            const [deptRes, desigRes, shiftRes, catRes, statusRes, mgrRes] = await Promise.all([
                api.get('/hr/departments', { params }),
                api.get('/hr/designations', { params }),
                api.get('/hr/shifts', { params }),
                api.get('/hr/staff-categories', { params }),
                api.get('/hr/staff-statuses', { params }),
                api.get('/hr/staff/managers', { params }),
            ]);

            setDepartments(
                (deptRes.data || []).map((d: any) => ({
                    id: d.id,
                    // Show numeric code in label so HR knows what code to set in dept master
                    label: d.department_numeric_code
                        ? `${d.department_name} (${d.department_numeric_code})`
                        : d.department_name,
                    numeric_code: d.department_numeric_code,
                }))
            );
            setDesignations(
                (desigRes.data || []).map((d: any) => ({
                    id: d.id,
                    label: d.designation_name,
                    department_id: d.department_id,
                }))
            );
            setShifts(
                (shiftRes.data || []).map((s: any) => ({
                    id: s.id,
                    label: `${s.shift_name} (${s.start_time}–${s.end_time})`,
                }))
            );
            setCategories(
                (catRes.data || []).map((c: any) => ({ id: c.id, label: c.category_name }))
            );
            setStatuses(
                (statusRes.data || []).map((s: any) => ({ id: s.id, label: s.status_name }))
            );
            setManagers(
                (mgrRes.data || []).map((m: any) => ({
                    id: m.id,
                    label: m.display_name,
                    // Extra context for the dropdown option
                    sublabel: [m.designation_name, m.staff_code].filter(Boolean).join(' · '),
                    department_id: m.department_id
                }))
            );
        } catch (e) {
            console.error('Failed to load HR master data', e);
        }
    }, []);


    const fetchData = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (searchBranchId) params.branch_id = searchBranchId;
            if (searchDeptId) params.department_id = searchDeptId;
            if (searchStatus) params.status = searchStatus;
            if (searchQuery) {
                params.search_by = searchBy;
                params.search_query = searchQuery;
            }

            const staffRes = await api.get('/hr/staff', { params });
            setStaffList(staffRes.data || []);

            try {
                const roleRes = await api.get('/rbac/roles');
                setRoles((roleRes.data?.roles || []).map((r: any) => ({ id: r.id, label: r.name || r.role_name })));
            } catch (roleErr) {
                console.warn('Failed to load roles, ignoring.', roleErr);
            }
        } catch (e) {
            console.error('Failed to load HR data', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        fetchMasterData(form.branch_id);
    }, [form.branch_id, fetchMasterData]);

    // ── Form helpers ──────────────────────────────────────────────────────────
    const set = (field: string, value: string) =>
        setForm((prev: any) => ({ ...prev, [field]: value }));

    const handleEdit = async (staffId: number) => {
        setResult(null);
        try {
            const res = await api.get(`/hr/staff/${staffId}`);
            const data = res.data;
            setForm({
                id: data.id,
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
                attendance_source: data.attendance_source || 'MANUAL',
                role_id: '', // Exclude role_id when editing
                staff_code: data.staff_code || '',
                employee_id: data.employee_id || '',
                biometric_id: data.biometric_id || '',
                reporting_manager_id: data.reporting_manager_id ? String(data.reporting_manager_id) : '',
            });
            setShowForm(true);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            console.error("Failed to load staff details", e);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setResult(null);
        try {
            const payload = {
                ...form,
                branch_id: form.branch_id ? Number(form.branch_id) : null,
                department_id: form.department_id ? Number(form.department_id) : null,
                designation_id: form.designation_id ? Number(form.designation_id) : null,
                default_shift_id: form.default_shift_id ? Number(form.default_shift_id) : null,
                staff_category_id: form.staff_category_id ? Number(form.staff_category_id) : null,
                staff_status_id: form.staff_status_id ? Number(form.staff_status_id) : null,
                role_id: form.role_id ? Number(form.role_id) : null,
                reporting_manager_id: form.reporting_manager_id ? Number(form.reporting_manager_id) : null,
            };

            let res;
            if (form.id) {
                res = await api.put(`/hr/staff/${form.id}`, payload);
            } else {
                res = await api.post('/hr/staff', payload);
            }

            setResult({
                success: true,
                staff_code: res.data.staff_code,
                employee_id: res.data.employee_id,
                biometric_id: res.data.biometric_id,
                message: res.data.message,
            });
            setForm(blankForm);
            setShowForm(false);
            fetchData();
        } catch (e: any) {
            setResult({
                success: false,
                message: e.response?.data?.error || 'Failed to save staff. Please try again.',
            });
        } finally {
            setSaving(false);
        }
    };

    // ── Filtered list ─────────────────────────────────────────────────────────
    const filteredStaff = staffList;

    // ── Render helpers ────────────────────────────────────────────────────────
    const renderInput = ({ label, field, type = 'text', required = false, placeholder, disabled = false }: { label: string; field: string; type?: string; required?: boolean; placeholder?: string; disabled?: boolean }) => (
        <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <input
                type={type}
                className={`w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 outline-none transition ${disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500'}`}
                value={(form as any)[field] ?? ''}
                onChange={(e) => set(field, e.target.value)}
                required={required}
                placeholder={placeholder}
                disabled={disabled}
            />
        </div>
    );

    const renderSelect = ({
        label, field, options, required = false, placeholder
    }: {
        label: string; field: string; options: SelectOption[]; required?: boolean; placeholder?: string
    }) => (
        <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <select
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                value={(form as any)[field] ?? ''}
                onChange={(e) => set(field, e.target.value)}
                required={required}
            >
                <option value="">{placeholder ?? `Select ${label}`}</option>
                {options.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                ))}
            </select>
        </div>
    );

    const renderStaticSelect = ({
        label, field, options, required = false
    }: {
        label: string; field: string; options: { value: string; label: string }[]; required?: boolean
    }) => (
        <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <select
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                value={(form as any)[field] ?? ''}
                onChange={(e) => set(field, e.target.value)}
                required={required}
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </div>
    );

    // ── JSX ───────────────────────────────────────────────────────────────────
    if (viewingStaffId) {
        return <StaffProfile staffId={viewingStaffId} onBack={() => setViewingStaffId(null)} />;
    }

    return (
        <div className="space-y-6">

            {/* ── Page header ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Search for Staff</h2>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {staffList.length} staff member{staffList.length !== 1 ? 's' : ''} registered
                    </p>
                </div>
            </div>

            {/* ── Result banner ─────────────────────────────────────────────── */}
            {result && (
                <div className={`rounded-xl border p-4 ${result.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    {result.success ? (
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-semibold text-emerald-800 text-sm">{result.message}</p>
                                <div className="mt-2 flex flex-wrap gap-3">
                                    {result.staff_code && (
                                        <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-mono font-bold px-3 py-1.5 rounded-lg">
                                            🪪 Staff Code: {result.staff_code}
                                        </span>
                                    )}
                                    {result.employee_id && (
                                        <span className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 text-xs font-mono font-bold px-3 py-1.5 rounded-lg">
                                            🔑 Employee ID: {result.employee_id}
                                        </span>
                                    )}
                                    {result.staff_code && (
                                        <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-lg">
                                            🔐 Temporary password = Staff Code (must change on first login)
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-red-800 text-sm font-medium">{result.message}</p>
                    )}
                </div>
            )}

            {/* ── Add Staff Form ────────────────────────────────────────────── */}
            {/* ── Filters and List (Hidden when editing/adding) ──────────────── */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-end gap-3 mb-4">
                {/* Branch Dropdown */}
                {!isSingleBranch && (
                    <div className="w-48">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Branch</label>
                        <select
                            className="w-full text-sm border border-slate-300 rounded-lg bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                            value={searchBranchId}
                            onChange={(e) => setSearchBranchId(e.target.value)}
                        >
                            <option value="">-All Branches-</option>
                            {allowedBranches.map((b) => (
                                <option key={b.branch_id} value={b.branch_id}>
                                    {b.branch_name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Department Dropdown */}
                <div className="w-48">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Department</label>
                    <select
                        className="w-full text-sm border border-slate-300 rounded-lg bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        value={searchDeptId}
                        onChange={(e) => setSearchDeptId(e.target.value)}
                    >
                        <option value="">All Departments</option>
                        {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.label}</option>
                        ))}
                    </select>
                </div>

                {/* Status Dropdown */}
                <div className="w-40">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
                    <select
                        className="w-full text-sm border border-slate-300 rounded-lg bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        value={searchStatus}
                        onChange={(e) => setSearchStatus(e.target.value)}
                    >
                        <option value="">All</option>
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                    </select>
                </div>

                {/* Search By Dropdown */}
                <div className="w-40">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Search By</label>
                    <select
                        className="w-full text-sm border border-slate-300 rounded-lg bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                        value={searchBy}
                        onChange={(e) => setSearchBy(e.target.value)}
                    >
                        <option value="staff_code">Staff Code</option>
                        <option value="employee_id">Employee ID</option>
                        <option value="biometric_id">Biometric ID</option>
                        <option value="first_name">Staff Name</option>
                        <option value="mobile">Mobile</option>
                        <option value="email">Email</option>
                    </select>
                </div>

                {/* Search Input */}
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Search Query</label>
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchData()}
                    />
                </div>

                {/* Search Button */}
                <div>
                    <button
                        onClick={fetchData}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
                    >
                        Search
                    </button>
                </div>
            </div>
            <div className="mb-4">
                <span className="text-xs text-slate-500">
                    {loading ? 'Loading…' : `${filteredStaff.length} result${filteredStaff.length !== 1 ? 's' : ''}`}
                </span>
            </div>

            {/* ── Staff Table ───────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Department / Designation</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">School & Branch</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                                {canWrite && <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredStaff.map((st) => (
                                <tr key={st.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                                                <span className="text-emerald-700 font-bold text-sm">
                                                    {st.first_name?.[0] ?? '?'}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-800">{st.display_name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                        {st.staff_code}
                                                    </span>
                                                    {st.employee_id && (
                                                        <span className="font-mono text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                                            ID: {st.employee_id}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs font-medium text-slate-700 bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                                            {st.staff_category_name ?? '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-slate-700">{st.department_name ?? '—'}</p>
                                        <p className="text-xs text-slate-400">{st.designation_name ?? ''}</p>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 text-xs capitalize">
                                        {st.employment_type?.toLowerCase().replace('_', ' ') ?? '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium text-slate-700">{st.school_name ?? '—'}</p>
                                        <p className="text-xs text-slate-400">{st.branch_name ?? '—'}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor[st.staff_status_name?.toUpperCase() ?? st.employment_status] ?? 'bg-slate-100 text-slate-600'}`}>
                                            {st.staff_status_name ?? st.employment_status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 text-xs">
                                        <p>{st.mobile ?? '—'}</p>
                                        <p className="truncate max-w-[140px]">{st.email ?? ''}</p>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => setViewingStaffId(st.id)}
                                                className="text-blue-600 hover:text-blue-800 p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                                                title="View Profile"
                                            >
                                                <EyeIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredStaff.length === 0 && (
                                <tr>
                                    <td colSpan={canWrite ? 8 : 7} className="px-4 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
                                            </svg>
                                            <span className="text-sm">
                                                {loading ? 'Loading staff…' : 'No staff found. Add your first staff member above.'}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ─── Section header sub-component ────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: string; title: string; subtitle?: string }> = ({
    icon, title, subtitle
}) => (
    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
        <span className="text-lg">{icon}</span>
        <div>
            <h4 className="text-sm font-bold text-slate-700">{title}</h4>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
    </div>
);

