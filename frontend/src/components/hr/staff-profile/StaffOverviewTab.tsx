import React from 'react';
import { StaffProfileData } from '../../StaffProfile';

interface Props {
    profile: StaffProfileData;
}

export const StaffOverviewTab: React.FC<Props> = ({ profile }) => {
    return (
        <div className="space-y-6">
            {/* Overview sections go here */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Personal Information */}
                <div className="bg-slate-50 rounded-lg p-5 border border-slate-100">
                    <h3 className="font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">Personal Information</h3>
                    <div className="space-y-3 text-sm">
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">Full Name</span>
                            <span className="col-span-2 font-medium text-slate-800 uppercase">{profile.display_name}</span>
                        </div>
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">Gender</span>
                            <span className="col-span-2 font-medium text-slate-800 capitalize">{profile.gender.toLowerCase()}</span>
                        </div>
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">DOB</span>
                            <span className="col-span-2 font-medium text-slate-800">
                                {profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString('en-GB') : '-'}
                            </span>
                        </div>
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">Mobile</span>
                            <span className="col-span-2 font-medium text-slate-800">{profile.mobile || '-'}</span>
                        </div>
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">Email</span>
                            <span className="col-span-2 font-medium text-slate-800">{profile.email || '-'}</span>
                        </div>
                    </div>
                </div>

                {/* Employment */}
                <div className="bg-slate-50 rounded-lg p-5 border border-slate-100">
                    <h3 className="font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">Employment</h3>
                    <div className="space-y-3 text-sm">
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">Staff Code</span>
                            <span className="col-span-2 font-medium text-slate-800 uppercase">{profile.staff_code}</span>
                        </div>
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">Employee ID</span>
                            <span className="col-span-2 font-medium text-slate-800 uppercase">{profile.employee_id || '-'}</span>
                        </div>
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">Department</span>
                            <span className="col-span-2 font-medium text-slate-800 uppercase">{profile.department_name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">Designation</span>
                            <span className="col-span-2 font-medium text-slate-800 uppercase">{profile.designation_name || '-'}</span>
                        </div>
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">Status</span>
                            <span className="col-span-2 font-medium text-slate-800 uppercase">{profile.staff_status_name || profile.employment_status}</span>
                        </div>
                    </div>
                </div>

                {/* Bank & Statutory Preview */}
                <div className="bg-slate-50 rounded-lg p-5 border border-slate-100">
                    <h3 className="font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">Bank & Statutory (Preview)</h3>
                    <div className="space-y-3 text-sm">
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">Bank</span>
                            <span className="col-span-2 font-medium text-slate-800">Setup Pending</span>
                        </div>
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">A/C Number</span>
                            <span className="col-span-2 font-medium text-slate-800">-</span>
                        </div>
                        <div className="grid grid-cols-3">
                            <span className="text-slate-500">UAN No</span>
                            <span className="col-span-2 font-medium text-slate-800 uppercase">{profile.uan_no || '-'}</span>
                        </div>
                    </div>
                </div>

                {/* Documents Preview */}
                <div className="bg-slate-50 rounded-lg p-5 border border-slate-100">
                    <h3 className="font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">Documents (Preview)</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500">Identity Documents</span>
                            <span className="font-medium text-emerald-600">Check Documents Tab</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
