import React from 'react';
import { StaffProfileData } from '../../StaffProfile';

interface Props {
    profile: StaffProfileData;
}

export const StaffPersonalTab: React.FC<Props> = ({ profile }) => {
    return (
        <div className="space-y-6">
            <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">First Name</label>
                    <p className="font-semibold text-slate-800 uppercase">{profile.first_name}</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">Last Name</label>
                    <p className="font-semibold text-slate-800 uppercase">{profile.last_name || '-'}</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">Gender</label>
                    <p className="font-semibold text-slate-800 capitalize">{profile.gender.toLowerCase()}</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">Date of Birth</label>
                    <p className="font-semibold text-slate-800">
                        {profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString('en-GB') : '-'}
                    </p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">Blood Group</label>
                    <p className="font-semibold text-slate-800">{profile.blood_group || '-'}</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">Nationality</label>
                    <p className="font-semibold text-slate-800">{profile.nationality || '-'}</p>
                </div>
            </div>

            <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2 mt-8">Contact Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">Mobile</label>
                    <p className="font-semibold text-slate-800">{profile.mobile || '-'}</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-500 mb-1">Email</label>
                    <p className="font-semibold text-slate-800">{profile.email || '-'}</p>
                </div>
            </div>
        </div>
    );
};
