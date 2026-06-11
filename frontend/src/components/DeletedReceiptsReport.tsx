import React, { useState, useEffect } from 'react';
import api from '../api';

const DeletedReceiptsReport: React.FC = () => {
    const [receipts, setReceipts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchReport();
    }, []);

    const fetchReport = async () => {
        try {
            setLoading(true);
            const res = await api.get('/reports/fees/deleted-receipts');
            setReceipts(res.data.receipts || []);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to load report');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-6 font-sans">
            <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center">
                <span className="bg-red-100 text-red-600 p-2 rounded-lg mr-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </span>
                Deleted Receipts Report
            </h2>

            {loading ? (
                <div className="p-4 bg-white rounded-xl shadow-sm text-center">Loading report...</div>
            ) : error ? (
                <div className="p-4 bg-white rounded-xl shadow-sm text-red-500 text-center">Error: {error}</div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b border-slate-100 text-slate-600 font-semibold uppercase text-xs tracking-wider">
                                <tr>
                                    <th className="px-4 py-4">Receipt No</th>
                                    <th className="px-4 py-4">Student</th>
                                    <th className="px-4 py-4">Adm No</th>
                                    <th className="px-4 py-4">Class</th>
                                    <th className="px-4 py-4">Branch</th>
                                    <th className="px-4 py-4">Fee Type</th>
                                    <th className="px-4 py-4 text-right">Amount</th>
                                    <th className="px-4 py-4">Date</th>
                                    <th className="px-4 py-4">Collected By</th>
                                    <th className="px-4 py-4 text-red-600">Deleted By</th>
                                    <th className="px-4 py-4 text-red-600">Deleted At</th>
                                    <th className="px-4 py-4 text-red-600">Reason</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {receipts.length === 0 ? (
                                    <tr><td colSpan={12} className="px-4 py-8 text-center text-slate-500">No deleted receipts found</td></tr>
                                ) : (
                                    receipts.map((r, idx) => (
                                        <tr key={idx} className="hover:bg-red-50/30 transition-colors">
                                            <td className="px-4 py-4 font-medium text-slate-800">{r.receipt_no}</td>
                                            <td className="px-4 py-4 text-slate-600">{r.student_name}</td>
                                            <td className="px-4 py-4 text-blue-600">{r.admission_no}</td>
                                            <td className="px-4 py-4 text-slate-600">{r.class} {r.section}</td>
                                            <td className="px-4 py-4 text-slate-600">{r.branch}</td>
                                            <td className="px-4 py-4 text-slate-600 truncate max-w-[150px]" title={r.fee_type_str}>{r.fee_type_str}</td>
                                            <td className="px-4 py-4 text-right font-medium text-slate-800">₹{(r.amount_paid || 0).toLocaleString()}</td>
                                            <td className="px-4 py-4 text-slate-600">{r.date}</td>
                                            <td className="px-4 py-4 text-slate-600">{r.collected_by}</td>
                                            <td className="px-4 py-4 font-medium text-red-600">{r.deleted_by}</td>
                                            <td className="px-4 py-4 text-red-600 text-xs">{r.deleted_at}</td>
                                            <td className="px-4 py-4 text-red-600 text-xs italic max-w-[150px] truncate" title={r.cancel_reason}>{r.cancel_reason}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DeletedReceiptsReport;
