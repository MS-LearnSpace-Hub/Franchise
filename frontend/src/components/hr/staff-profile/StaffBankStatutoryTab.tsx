import React, { useState, useEffect } from 'react';
import { StaffProfileData } from '../../StaffProfile';
import api from '../../../api';

interface Props {
    profile: StaffProfileData;
}

export const StaffBankStatutoryTab: React.FC<Props> = ({ profile }) => {
    const [account, setAccount] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAccount = async () => {
            try {
                const res = await api.get(`/hr/staff/${profile.id}/profile/account`);
                if (res.data && Object.keys(res.data).length > 0) {
                    setAccount(res.data);
                }
            } catch (err) {
                console.error("Failed to fetch bank account details", err);
            } finally {
                setLoading(false);
            }
        };
        fetchAccount();
    }, [profile.id]);

    if (loading) return <div>Loading...</div>;

    return (
        <div className="space-y-8">
            <div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Bank Account</h3>
                    <button className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Edit Bank Details</button>
                </div>
                {account ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Account Holder Name</label>
                            <p className="font-semibold text-slate-800 uppercase">{account.account_holder_name}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Bank Name</label>
                            <p className="font-semibold text-slate-800 uppercase">{account.bank_name}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Branch Name</label>
                            <p className="font-semibold text-slate-800 uppercase">{account.branch_name || '-'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Account Number</label>
                            <p className="font-mono font-semibold text-slate-800 uppercase">
                                {account.account_number ? '••••' + account.account_number.slice(-4) : '-'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">IFSC Code</label>
                            <p className="font-semibold text-slate-800 uppercase">{account.ifsc_code}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Account Type</label>
                            <p className="font-semibold text-slate-800 uppercase">{account.account_type}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">UPI ID</label>
                            <p className="font-semibold text-slate-800">{account.upi_id || '-'}</p>
                        </div>
                    </div>
                ) : (
                    <div className="text-slate-500 text-sm py-4">No bank account details configured.</div>
                )}
            </div>

            <div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Statutory Information</h3>
                    <button className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Edit Statutory Info</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">PAN Number</label>
                        <p className="font-mono font-semibold text-slate-800 uppercase">{account?.pan_number || '-'}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">Aadhaar Number</label>
                        <p className="font-mono font-semibold text-slate-800">
                            {account?.aadhaar_number ? '•••• •••• ' + account.aadhaar_number.slice(-4) : '-'}
                        </p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">UAN Number</label>
                        <p className="font-semibold text-slate-800 uppercase">{profile.uan_no || '-'}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">PF Applicable</label>
                        <p className="font-semibold text-slate-800">{account?.pf_applicable ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">ESI Number</label>
                        <p className="font-semibold text-slate-800 uppercase">{account?.esi_number || '-'}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">ESI Applicable</label>
                        <p className="font-semibold text-slate-800">{account?.esi_applicable ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">PT Applicable</label>
                        <p className="font-semibold text-slate-800">{account?.pt_applicable ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-500 mb-1">TDS Applicable</label>
                        <p className="font-semibold text-slate-800">{account?.tds_applicable ? 'Yes' : 'No'}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
