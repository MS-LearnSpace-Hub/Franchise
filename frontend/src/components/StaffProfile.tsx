import React, { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import { UserIcon } from './icons';
import { StaffOverviewTab } from './hr/staff-profile/StaffOverviewTab';
import { StaffPersonalTab } from './hr/staff-profile/StaffPersonalTab';
import { StaffEmploymentTab } from './hr/staff-profile/StaffEmploymentTab';
import { StaffBankStatutoryTab } from './hr/staff-profile/StaffBankStatutoryTab';
import { StaffSalaryTab } from './hr/staff-profile/StaffSalaryTab';
import { StaffDocumentsTab } from './hr/staff-profile/StaffDocumentsTab';
import { StaffLoginAccessTab } from './hr/staff-profile/StaffLoginAccessTab';

export interface StaffProfileData {
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
    const [activeTab, setActiveTab] = useState('overview');

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

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'personal', label: 'Personal' },
        { id: 'employment', label: 'Employment' },
        { id: 'bank', label: 'Bank & Statutory' },
        { id: 'salary', label: 'Salary & Payroll' },
        { id: 'documents', label: 'Documents' },
        { id: 'login', label: 'Login & Access' }
    ];

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

                {/* Tabs */}
                <div className="border-t border-slate-100 px-6 md:px-8 bg-slate-50/50">
                    <div className="flex space-x-6 overflow-x-auto">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`whitespace-nowrap py-4 border-b-2 font-medium text-sm transition-colors ${
                                    activeTab === tab.id
                                        ? 'border-emerald-600 text-emerald-600'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tab Content Area */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8">
                {activeTab === 'overview' && <StaffOverviewTab profile={profile} />}
                {activeTab === 'personal' && <StaffPersonalTab profile={profile} />}
                {activeTab === 'employment' && <StaffEmploymentTab profile={profile} />}
                {activeTab === 'bank' && <StaffBankStatutoryTab profile={profile} />}
                {activeTab === 'salary' && <StaffSalaryTab profile={profile} />}
                {activeTab === 'documents' && <StaffDocumentsTab profile={profile} />}
                {activeTab === 'login' && <StaffLoginAccessTab profile={profile} />}
            </div>
        </div>
    );
};

export default StaffProfile;
