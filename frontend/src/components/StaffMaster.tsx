import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

interface Staff {
    id: number;
    employee_code: string;
    first_name: string;
    last_name: string;
    display_name: string;
    department_name: string;
    designation_name: string;
    employment_type: string;
    employment_status: string;
    mobile: string;
    email: string;
}

export const StaffMaster: React.FC = () => {
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [departments, setDepartments] = useState<any[]>([]);
    const [designations, setDesignations] = useState<any[]>([]);
    const [shifts, setShifts] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const initialFormState = {
        employee_code: '',
        first_name: '',
        middle_name: '',
        last_name: '',
        gender: 'MALE',
        date_of_birth: '',
        
        mobile: '',
        email: '',
        address: '',
        city: '',
        state: '',
        country: '',
        pincode: '',

        joining_date: '',
        confirmation_date: '',
        relieving_date: '',
        employment_type: 'PERMANENT',
        employment_status: 'ACTIVE',
        
        department_id: '',
        designation_id: '',
        default_shift_id: '',
        
        attendance_source: 'MANUAL',
        create_login: false,
        role_id: ''
    };

    const [form, setForm] = useState(initialFormState);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [staffRes, deptRes, desigRes, shiftRes, roleRes] = await Promise.all([
                api.get('/hr/staff'),
                api.get('/hr/departments'),
                api.get('/hr/designations'),
                api.get('/hr/shifts'),
                api.get('/roles') // Assumes this endpoint exists for Role list
            ]);
            setStaffList(staffRes.data || []);
            setDepartments(deptRes.data || []);
            setDesignations(desigRes.data || []);
            setShifts(shiftRes.data || []);
            setRoles(roleRes.data.roles || []);
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
                department_id: form.department_id ? Number(form.department_id) : null,
                designation_id: form.designation_id ? Number(form.designation_id) : null,
                default_shift_id: form.default_shift_id ? Number(form.default_shift_id) : null,
                role_id: form.role_id ? Number(form.role_id) : null
            };
            await api.post('/hr/staff', payload);
            setMsg({ type: 'success', text: 'Staff created successfully' });
            setForm(initialFormState);
            fetchData();
        } catch (e: any) {
            setMsg({ type: 'error', text: e.response?.data?.error || 'Failed to create staff' });
        }
    };

    const renderInput = (label: string, field: keyof typeof form, type = "text", required = false) => (
        <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <input
                type={type}
                className="w-full text-sm border border-slate-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500"
                value={form[field] as string}
                onChange={e => setForm({ ...form, [field]: e.target.value })}
                required={required}
            />
        </div>
    );

    const renderSelect = (label: string, field: keyof typeof form, options: {value: string|number, label: string}[], required = false) => (
        <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <select
                className="w-full text-sm border border-slate-300 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                value={form[field] as string}
                onChange={e => setForm({ ...form, [field]: e.target.value })}
                required={required}
            >
                {!required && <option value="">Select {label}</option>}
                {required && !form[field] && <option value="" disabled>Select {label}</option>}
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
            </select>
        </div>
    );

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-7xl mx-auto">
            <h2 className="text-xl font-bold text-slate-800 mb-6">Staff Master</h2>

            {msg && (
                <div className={`mb-6 p-4 rounded-lg text-sm font-medium border ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                    {msg.text}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8 mb-10">
                
                {/* Personal Details Section */}
                <div className="bg-slate-50 p-5 rounded-lg border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">Personal Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {renderInput('First Name', 'first_name', 'text', true)}
                        {renderInput('Middle Name', 'middle_name')}
                        {renderInput('Last Name', 'last_name')}
                        {renderSelect('Gender', 'gender', [
                            {value: 'MALE', label: 'Male'},
                            {value: 'FEMALE', label: 'Female'},
                            {value: 'OTHER', label: 'Other'}
                        ], true)}
                        {renderInput('Date of Birth', 'date_of_birth', 'date')}
                    </div>
                </div>

                {/* Contact Details Section */}
                <div className="bg-slate-50 p-5 rounded-lg border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">Contact & Address</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {renderInput('Mobile', 'mobile')}
                        {renderInput('Email', 'email', 'email')}
                        {renderInput('Address', 'address')}
                        {renderInput('City', 'city')}
                        {renderInput('State', 'state')}
                        {renderInput('Country', 'country')}
                        {renderInput('Pincode', 'pincode')}
                    </div>
                </div>

                {/* Employment Details Section */}
                <div className="bg-slate-50 p-5 rounded-lg border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">Employment Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {renderInput('Employee Code (Auto if empty)', 'employee_code')}
                        {renderInput('Joining Date', 'joining_date', 'date', true)}
                        {renderInput('Confirmation Date', 'confirmation_date', 'date')}
                        {renderInput('Relieving Date', 'relieving_date', 'date')}
                        
                        {renderSelect('Employment Type', 'employment_type', [
                            {value: 'PERMANENT', label: 'Permanent'},
                            {value: 'CONTRACT', label: 'Contract'},
                            {value: 'TEMPORARY', label: 'Temporary'},
                            {value: 'INTERN', label: 'Intern'},
                            {value: 'PART_TIME', label: 'Part Time'}
                        ], true)}
                        
                        {renderSelect('Employment Status', 'employment_status', [
                            {value: 'ACTIVE', label: 'Active'},
                            {value: 'PROBATION', label: 'Probation'},
                            {value: 'NOTICE_PERIOD', label: 'Notice Period'},
                            {value: 'RESIGNED', label: 'Resigned'},
                            {value: 'TERMINATED', label: 'Terminated'},
                            {value: 'RETIRED', label: 'Retired'}
                        ], true)}

                        {renderSelect('Department', 'department_id', departments.map(d => ({value: d.id, label: d.department_name})))}
                        {renderSelect('Designation', 'designation_id', designations.map(d => ({value: d.id, label: d.designation_name})))}
                        {renderSelect('Default Shift', 'default_shift_id', shifts.map(s => ({value: s.id, label: `${s.shift_name} (${s.start_time}-${s.end_time})`})))}
                    </div>
                </div>

                {/* System Access & Attendance Section */}
                <div className="bg-slate-50 p-5 rounded-lg border border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">System & Attendance</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        {renderSelect('Attendance Source', 'attendance_source', [
                            {value: 'BIOMETRIC', label: 'Biometric'},
                            {value: 'MOBILE', label: 'Mobile App'},
                            {value: 'WEB', label: 'Web Portal'},
                            {value: 'MANUAL', label: 'Manual Only'}
                        ], true)}

                        <div className="flex items-center space-x-2 h-10 px-3 bg-white border border-slate-300 rounded-md">
                            <input
                                type="checkbox"
                                id="createLogin"
                                checked={form.create_login as boolean}
                                onChange={e => setForm({ ...form, create_login: e.target.checked })}
                                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
                            />
                            <label htmlFor="createLogin" className="text-sm font-medium text-slate-700">
                                Create Login Access
                            </label>
                        </div>
                        
                        {form.create_login && (
                            <div>
                                <label className="block text-xs font-medium text-slate-700 mb-1">Select Role</label>
                                <select
                                    className="w-full text-sm border border-slate-300 rounded-md p-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                                    value={form.role_id as string}
                                    onChange={e => setForm({ ...form, role_id: e.target.value })}
                                    required={form.create_login as boolean}
                                >
                                    <option value="">Select Role</option>
                                    {roles.map((r) => (
                                        <option key={r.id} value={r.id}>{r.role_name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end">
                    <button type="submit" disabled={loading} className="bg-emerald-600 text-white px-8 py-3 rounded-lg text-sm font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 shadow-sm transition-colors">
                        {loading ? 'Saving...' : 'Save Staff Profile'}
                    </button>
                </div>
            </form>

            {/* List Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Emp Code</th>
                            <th className="px-4 py-3 font-semibold">Name</th>
                            <th className="px-4 py-3 font-semibold">Department</th>
                            <th className="px-4 py-3 font-semibold">Designation</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                        {staffList.map((st) => (
                            <tr key={st.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 font-medium text-slate-900">{st.employee_code}</td>
                                <td className="px-4 py-3">{st.display_name}</td>
                                <td className="px-4 py-3">{st.department_name || '-'}</td>
                                <td className="px-4 py-3">{st.designation_name || '-'}</td>
                                <td className="px-4 py-3">
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${st.employment_status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>
                                        {st.employment_status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                        {staffList.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                    No staff records found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
