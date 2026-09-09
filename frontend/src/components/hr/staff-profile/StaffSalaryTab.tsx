import React, { useState, useEffect } from 'react';
import { StaffProfileData } from '../../StaffProfile';
import api from '../../../api';

interface Props {
    profile: StaffProfileData;
}

export const StaffSalaryTab: React.FC<Props> = ({ profile }) => {
    const [salary, setSalary] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSalary = async () => {
            try {
                const res = await api.get(`/hr/staff/${profile.id}/salary`);
                if (res.data.success) {
                    setSalary(res.data.data);
                }
            } catch (err) {
                console.error("Failed to fetch salary details", err);
            } finally {
                setLoading(false);
            }
        };
        fetchSalary();
    }, [profile.id]);

    if (loading) return <div>Loading...</div>;

    return (
        <div className="space-y-8">
            <div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Current Salary</h3>
                    <button className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Edit Salary Details</button>
                </div>
                {salary ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Salary Type</label>
                            <p className="font-semibold text-slate-800 uppercase">{salary.salary_type}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Basic Salary</label>
                            <p className="font-semibold text-slate-800">₹ {salary.basic_salary?.toLocaleString() || '-'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Gross Salary</label>
                            <p className="font-semibold text-slate-800">₹ {salary.gross_salary?.toLocaleString() || '-'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Payment Mode</label>
                            <p className="font-semibold text-slate-800 uppercase">{salary.payment_mode}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Effective From</label>
                            <p className="font-semibold text-slate-800">
                                {salary.effective_from ? new Date(salary.effective_from).toLocaleDateString('en-GB') : '-'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Payroll Status</label>
                            <p className="font-semibold text-slate-800 uppercase">{salary.payroll_status}</p>
                        </div>
                    </div>
                ) : (
                    <div className="text-slate-500 text-sm py-4">No salary details configured.</div>
                )}
            </div>

            <div>
                <div className="flex justify-between items-center border-b border-slate-200 pb-2 mb-4">
                    <h3 className="text-lg font-semibold text-slate-800">Payroll Configuration</h3>
                </div>
                {salary ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Gratuity Applicable</label>
                            <p className="font-semibold text-slate-800">{salary.gratuity_applicable ? 'Yes' : 'No'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Bonus Applicable</label>
                            <p className="font-semibold text-slate-800">{salary.bonus_applicable ? 'Yes' : 'No'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Overtime Applicable</label>
                            <p className="font-semibold text-slate-800">{salary.overtime_applicable ? 'Yes' : 'No'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-500 mb-1">Notice Period (Days)</label>
                            <p className="font-semibold text-slate-800">{salary.notice_period_days || '-'}</p>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-500 mb-1">Remarks</label>
                            <p className="font-semibold text-slate-800">{salary.remarks || '-'}</p>
                        </div>
                    </div>
                ) : (
                    <div className="text-slate-500 text-sm py-4">-</div>
                )}
            </div>
        </div>
    );
};
