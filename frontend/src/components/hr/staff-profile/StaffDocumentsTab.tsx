import React from 'react';
import { StaffProfileData } from '../../StaffProfile';
import { StaffDocuments } from '../StaffDocuments';

interface Props {
    profile: StaffProfileData;
}

export const StaffDocumentsTab: React.FC<Props> = ({ profile }) => {
    return (
        <div className="space-y-6">
            <div className="border-b border-slate-200 pb-4">
                <h3 className="text-lg font-semibold text-slate-800">Documents</h3>
                <p className="text-sm text-slate-500 mt-1">
                    View staff documents based on configured document types.
                </p>
            </div>
            <StaffDocuments staffId={profile.id} mode="view" />
        </div>
    );
};
