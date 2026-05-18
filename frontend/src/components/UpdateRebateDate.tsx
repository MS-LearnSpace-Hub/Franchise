import React, { useState, useEffect } from 'react';
import api from '../api';

interface Installment {
    id: number;
    installment_no: number;
    title: string;
    start_date: string;
    end_date: string;
    last_pay_date: string;
    is_admission: boolean;
    description?: string;
    fee_type_id?: number | null;
    fee_type_name?: string;
    branch?: string;
    location?: string;
    academic_year?: string;
}

const UpdateRebateDate: React.FC = () => {
    const [installments, setInstallments] = useState<Installment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [newDates, setNewDates] = useState<Record<number, string>>({});
    const [savingId, setSavingId] = useState<number | null>(null);

    const branch = localStorage.getItem('currentBranch') || 'All';
    const academicYear = localStorage.getItem('academicYear') || '';

    useEffect(() => {
        fetchInstallments();
    }, [branch, academicYear]);

    const fetchInstallments = async () => {
    try {
        setLoading(true);
        const response = await api.get(`/installment-schedule?branch=${branch}`);
        
        // Handle both response formats safely
        const installmentsData = Array.isArray(response.data) 
            ? response.data 
            : (response.data.installments || []);
        
        // Filter by academic year (backend should already filter, but safety check)
        const filtered = academicYear 
            ? installmentsData.filter((inst: Installment) => 
                !inst.academic_year || inst.academic_year === academicYear
              )
            : installmentsData;
            
        setInstallments(filtered);
        setError('');
    } catch (err: any) {
        console.error("Error fetching installments", err);
        setError(err.response?.data?.error || 'Failed to fetch installments');
    } finally {
        setLoading(false);
    }
};

    const handleDateChange = (id: number, value: string) => {
        setNewDates(prev => ({ ...prev, [id]: value }));
    };

    const handleSave = async (inst: Installment) => {
        const newDate = newDates[inst.id];
        if (!newDate) {
            setError('Please select a new date before saving.');
            setTimeout(() => setError(''), 3000);
            return;
        }

        try {
            setSavingId(inst.id);
            setSuccessMessage('');
            setError('');

            const payload = {
                installment_title: inst.title,
                academic_year: inst.academic_year || academicYear,
                branch: branch,
                new_due_date: newDate
            };

            const response = await api.put('/update-rebate-date', payload);
            
            setSuccessMessage(`Success: ${response.data.message}`);
            setTimeout(() => setSuccessMessage(''), 5000);
            
            // Clear the local state for this row
            setNewDates(prev => {
                const updated = { ...prev };
                delete updated[inst.id];
                return updated;
            });
            
        } catch (err: any) {
            console.error("Error updating rebate date", err);
            setError(err.response?.data?.error || 'Failed to update rebate date');
            setTimeout(() => setError(''), 5000);
        } finally {
            setSavingId(null);
        }
    };

    if (loading) {
        return <div className="p-6">Loading installments...</div>;
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <span className="text-violet-600 mr-2">📅</span> Update Rebate Date
            </h2>

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6 shadow-sm border border-red-100 flex items-center">
                    <span className="mr-2">⚠️</span> {error}
                </div>
            )}

            {successMessage && (
                <div className="bg-green-50 text-green-600 p-4 rounded-md mb-6 shadow-sm border border-green-100 flex items-center">
                    <span className="mr-2">✅</span> {successMessage}
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-200">
                    <p className="text-sm text-gray-600">
                        Update the due date (rebate date) for student fees corresponding to each installment in the current branch <strong>({branch})</strong> and academic year <strong>({academicYear})</strong>.
                        Note: This will not change the installment definition's Last Pay Date, but it will update the actual due dates for all students assigned this fee.
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">Title</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">Fee Type</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">Start Date</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">End Date</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">Original Cutoff Date</th>
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">New Rebate Date</th>
                                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-b">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {installments.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                        No installments found for the current branch and academic year.
                                    </td>
                                </tr>
                            ) : (
                                installments.map(inst => (
                                    <tr key={inst.id} className="hover:bg-gray-50 border-b last:border-b-0">
                                        <td className="px-4 py-3 text-sm text-gray-800 font-medium">
                                            {inst.title}
                                            {inst.is_admission && <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded">Admission</span>}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{inst.fee_type_name || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {new Date(inst.start_date).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {new Date(inst.end_date).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                            {new Date(inst.last_pay_date).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            <input
                                                type="date"
                                                value={newDates[inst.id] || ''}
                                                onChange={(e) => handleDateChange(inst.id, e.target.value)}
                                                className="w-full px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-violet-500"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => handleSave(inst)}
                                                disabled={!newDates[inst.id] || savingId === inst.id}
                                                className={`px-4 py-1.5 rounded text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-violet-500 transition-colors ${
                                                    !newDates[inst.id] 
                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                    : savingId === inst.id
                                                        ? 'bg-violet-400 text-white cursor-wait'
                                                        : 'bg-violet-600 text-white hover:bg-violet-700'
                                                }`}
                                            >
                                                {savingId === inst.id ? 'Saving...' : 'Update'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default UpdateRebateDate;
