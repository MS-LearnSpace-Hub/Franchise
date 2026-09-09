import React from 'react';
import { StaffProfileData } from '../../StaffProfile';

interface Props {
    profile: StaffProfileData;
}

export const StaffLoginAccessTab: React.FC<Props> = ({ profile }) => {
    return (
        <div className="space-y-8 max-w-3xl">
            <div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Login Account</h3>
                    <button className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Reset Password</button>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                        <div>
                            <label className="block text-slate-500 mb-1">Username</label>
                            <p className="font-semibold text-slate-800">
                                {profile.email ? profile.email.split('@')[0] : (profile.first_name + '.' + (profile.last_name || '')).toLowerCase()}
                            </p>
                        </div>
                        <div>
                            <label className="block text-slate-500 mb-1">Email</label>
                            <p className="font-semibold text-slate-800">{profile.email || '-'}</p>
                        </div>
                        <div>
                            <label className="block text-slate-500 mb-1">Account Status</label>
                            <p className="font-semibold text-emerald-600">● Active</p>
                        </div>
                        <div>
                            <label className="block text-slate-500 mb-1">Last Login</label>
                            <p className="font-semibold text-slate-800">Not available</p>
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">System Role</h3>
                    <button className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Change Role</button>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-5">
                    <div className="mb-4">
                        <label className="block text-slate-500 mb-1">Current Role</label>
                        <div className="inline-block px-4 py-2 bg-white border border-slate-200 rounded-lg font-semibold text-slate-800">
                            Staff / Employee
                        </div>
                    </div>
                    <p className="text-xs text-slate-500">Role changes are restricted based on your organizational hierarchy.</p>
                </div>
            </div>
        </div>
    );
};
