import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { UserIcon } from './icons';

interface StaffProfileData {
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
    gender: string;
    date_of_birth: string | null;
    joining_date: string | null;
    blood_group: string;
    nationality: string;
    qualification: string;
    uan_no: string;
    today_attendance?: {
        first_in: string | null;
        last_out: string | null;
        status: string | null;
    } | null;
    school_name: string | null;
    branch_name: string | null;
}

import { Page } from '../App';

interface StaffProfileProps {
    staffId?: number;
    onBack?: () => void;
    navigateTo?: (page: Page) => void;
}

const StaffProfile: React.FC<StaffProfileProps> = ({ staffId, onBack, navigateTo }) => {
    const { user } = useAuth();
    const [profile, setProfile] = useState<StaffProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const endpoint = staffId ? `/hr/staff/${staffId}/profile` : '/hr/staff/profile';
                const res = await api.get(endpoint);
                setProfile(res.data);
            } catch (err: any) {
                console.error("Failed to load profile", err);
                setError("Failed to load staff profile");
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="p-6">
                <div className="bg-red-50 text-red-600 p-4 rounded-lg">
                    {error || "Profile not found."}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {onBack && (
                <div className="mb-4">
                    <button
                        onClick={onBack}
                        className="text-emerald-600 hover:text-emerald-700 flex items-center font-medium"
                    >
                        &larr; Back to Directory
                    </button>
                </div>
            )}
            {/* Header Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start">
                    {/* Avatar */}
                    <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0 text-emerald-600">
                        <UserIcon className="w-12 h-12" />
                    </div>

                    {/* Main Info */}
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">
                            {profile.display_name}
                        </h1>
                        <p className="text-sm text-slate-500 mt-1 uppercase">
                            {profile.staff_code} • {profile.designation_name || 'N/A'}
                        </p>
                        <p className="text-sm font-medium text-emerald-600 mt-1 uppercase">
                            {profile.department_name || 'N/A'}
                        </p>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="border-t border-slate-100 p-6 md:p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
                        <div>
                            <p className="text-slate-400 mb-1">Gender</p>
                            <p className="font-semibold text-slate-700 capitalize">{profile.gender.toLowerCase()}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">DOB</p>
                            <p className="font-semibold text-slate-700">
                                {profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                            </p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Nationality</p>
                            <p className="font-semibold text-slate-700">{profile.nationality}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Biometric Code</p>
                            <p className="font-semibold text-slate-700">{profile.biometric_id || '-'}</p>
                        </div>

                        <div>
                            <p className="text-slate-400 mb-1">Staff Code</p>
                            <p className="font-semibold text-slate-700">{profile.staff_code}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Email</p>
                            <p className="font-semibold text-slate-700">{profile.email || '-'}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Qualification</p>
                            <p className="font-semibold text-slate-700">{profile.qualification}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Join Date</p>
                            <p className="font-semibold text-slate-700">
                                {profile.joining_date ? new Date(profile.joining_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                            </p>
                        </div>

                        <div>
                            <p className="text-slate-400 mb-1">Designation</p>
                            <p className="font-semibold text-slate-700">{profile.designation_name || '-'}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Mobile No</p>
                            <p className="font-semibold text-slate-700">{profile.mobile || '-'}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Employee-ID</p>
                            <p className="font-semibold text-slate-700">{profile.employee_id || '-'}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Employment Status</p>
                            <p className="font-semibold text-slate-700 capitalize">{profile.employment_type.toLowerCase()}</p>
                        </div>

                        <div>
                            <p className="text-slate-400 mb-1">Department</p>
                            <p className="font-semibold text-slate-700">{profile.department_name || '-'}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">Blood Group</p>
                            <p className="font-semibold text-slate-700">{profile.blood_group}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">UAN No</p>
                            <p className="font-semibold text-slate-700">{profile.uan_no}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 mb-1">School & Branch</p>
                            <p className="font-semibold text-slate-700">
                                {profile.school_name || 'N/A'}<br />
                                <span className="text-xs text-slate-500 font-normal">{profile.branch_name || 'N/A'}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Attendance */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-slate-800">Today's Attendance</h2>
                        {navigateTo && (
                            <button
                                onClick={() => navigateTo('hr-attendance-summary')}
                                className="text-sm font-semibold text-red-500 hover:text-red-600"
                            >
                                View Attendance &rarr;
                            </button>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-2">
                            <div>
                                <p className="text-sm text-slate-500">Morning</p>
                                <p className="font-bold text-emerald-500">IN</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-slate-500">Check In Time</p>
                                <p className="font-bold text-slate-700">
                                    {profile.today_attendance?.first_in || '-'}
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-between items-center py-2 border-t border-slate-100">
                            <div>
                                <p className="text-sm text-slate-500">Evening</p>
                                <p className="font-bold text-red-500">OUT</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-slate-500">Check Out Time</p>
                                <p className="font-bold text-slate-700">
                                    {profile.today_attendance?.last_out || '-'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Leave Balance */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold text-slate-800">My Leave Balance</h2>
                        <button className="text-sm font-semibold text-red-500 hover:text-red-600">
                            View Leave History &rarr;
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <p className="text-sm font-medium text-slate-700">Compensatory Leave (Paid Leave)</p>
                            <p className="text-xs text-blue-500 mt-1">
                                Total Leaves: 0 | Leaves Taken: 0 | Leaves Balance: 0
                            </p>
                        </div>
                        <div className="border-t border-slate-100 pt-4">
                            <p className="text-sm font-medium text-slate-700">Causal Leave (Paid Leave)</p>
                            <p className="text-xs text-blue-500 mt-1">
                                Total Leaves: 12 | Leaves Taken: 0 | Leaves Balance: 12
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StaffProfile;
