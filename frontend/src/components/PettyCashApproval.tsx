import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../config';

const PettyCashApproval: React.FC = () => {
    const globalYear = localStorage.getItem('academicYear') || '2026-2027';
    const [transactions, setTransactions] = useState<any[]>([]);
    const [allocations, setAllocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [activeTab, setActiveTab] = useState<'expenses' | 'funds'>('expenses');
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    const getHeaders = () => {
        const token = localStorage.getItem('token') || '';
        const currentBranch = localStorage.getItem('currentBranch') || 'All';
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Academic-Year': globalYear,
            'X-Branch': currentBranch
        };
    };

    const fetchTransactions = async () => {
        try {
            const res = await fetch(`${API_URL}/petty-cash`, { headers: getHeaders() });
            if (res.ok) {
                const data = await res.json();
                setTransactions(data);
            }
        } catch (e) {
            console.error('Error fetching transactions', e);
        }
    };

    const fetchAllocations = async () => {
        try {
            const res = await fetch(`${API_URL}/petty-cash/allocations`, { headers: getHeaders() });
            if (res.ok) {
                const data = await res.json();
                setAllocations(data);
            }
        } catch (e) {
            console.error('Error fetching allocations', e);
        }
    };

    useEffect(() => {
        if (activeTab === 'expenses') {
            fetchTransactions();
        } else {
            fetchAllocations();
        }
    }, [activeTab]);

    const handleApproval = async (id: number, type: 'expense' | 'fund', status: 'Approved' | 'Rejected') => {
        if (!window.confirm(`Are you sure you want to mark this as ${status}?`)) return;
        
        setLoading(true);
        setMessage('');
        try {
            const url = type === 'expense' 
                ? `${API_URL}/petty-cash/${id}/approve`
                : `${API_URL}/petty-cash/fund-allocation/${id}/approve`;
                
            const res = await fetch(url, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify({ approval_status: status })
            });
            const data = await res.json();
            
            if (res.ok) {
                setMessage(`Successfully marked as ${status}`);
                if (type === 'expense') {
                    fetchTransactions();
                } else {
                    fetchAllocations();
                }
            } else {
                setMessage(data.message || 'Error updating status');
            }
        } catch (e) {
            setMessage('Network error');
        } finally {
            setLoading(false);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => setMessage(''), 3000);
        }
    };

    const pendingTransactions = transactions.filter(t => t.approval_status === 'Pending' || !t.approval_status);
    const approvedTransactions = transactions.filter(t => t.approval_status === 'Approved');
    const rejectedTransactions = transactions.filter(t => t.approval_status === 'Rejected');

    const pendingAllocations = allocations.filter(a => a.approval_status === 'Pending' || !a.approval_status);
    const approvedAllocations = allocations.filter(a => a.approval_status === 'Approved');
    const rejectedAllocations = allocations.filter(a => a.approval_status === 'Rejected');

    const renderTransactionTable = (title: string, txns: any[], showActions: boolean) => (
        <div className="bg-white rounded shadow mb-6">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-800">{title}</h3>
                <span className="text-sm text-gray-500">{txns.length} entries</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="p-3 border">Date</th>
                            <th className="p-3 border">Voucher</th>
                            <th className="p-3 border">Type</th>
                            <th className="p-3 border">Ledger</th>
                            <th className="p-3 border">Amount</th>
                            <th className="p-3 border text-center">Status</th>
                            {showActions && <th className="p-3 border text-center">Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {txns.length === 0 && (
                            <tr>
                                <td colSpan={showActions ? 7 : 6} className="text-center p-4 text-gray-500">No records found.</td>
                            </tr>
                        )}
                        {txns.map(t => (
                            <tr key={t.id} className="hover:bg-gray-50 border-b">
                                <td className="p-3 border">{t.transaction_date}</td>
                                <td className="p-3 border">{t.voucher_name}</td>
                                <td className="p-3 border">
                                    <span className={`px-2 py-1 rounded text-xs ${t.voucher_type === 'Received' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {t.voucher_type}
                                    </span>
                                </td>
                                <td className="p-3 border">{t.ledger_name}</td>
                                <td className="p-3 border text-right font-semibold">₹{Number(t.amount).toFixed(2)}</td>
                                <td className="p-3 border text-center">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        t.approval_status === 'Approved' ? 'bg-green-100 text-green-800' :
                                        t.approval_status === 'Rejected' ? 'bg-red-100 text-red-800' :
                                        'bg-yellow-100 text-yellow-800'
                                    }`}>
                                        {t.approval_status || 'Pending'}
                                    </span>
                                </td>
                                {showActions && (
                                    <td className="p-3 border text-center space-x-2">
                                        <button 
                                            onClick={() => handleApproval(t.id, 'expense', 'Approved')}
                                            disabled={loading}
                                            className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs transition"
                                        >
                                            Approve
                                        </button>
                                        <button 
                                            onClick={() => handleApproval(t.id, 'expense', 'Rejected')}
                                            disabled={loading}
                                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs transition"
                                        >
                                            Reject
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderAllocationTable = (title: string, allcs: any[], showActions: boolean) => (
        <div className="bg-white rounded shadow mb-6">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-800">{title}</h3>
                <span className="text-sm text-gray-500">{allcs.length} entries</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="p-3 border">Date</th>
                            <th className="p-3 border">Branch</th>
                            <th className="p-3 border">Amount</th>
                            <th className="p-3 border">Remarks</th>
                            <th className="p-3 border text-center">Status</th>
                            {showActions && <th className="p-3 border text-center">Actions</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {allcs.length === 0 && (
                            <tr>
                                <td colSpan={showActions ? 6 : 5} className="text-center p-4 text-gray-500">No records found.</td>
                            </tr>
                        )}
                        {allcs.map(a => (
                            <tr key={a.id} className="hover:bg-gray-50 border-b">
                                <td className="p-3 border">{a.allocation_date}</td>
                                <td className="p-3 border">{a.branch_name}</td>
                                <td className="p-3 border text-green-600 font-semibold">₹{Number(a.amount).toFixed(2)}</td>
                                <td className="p-3 border">{a.remarks}</td>
                                <td className="p-3 border text-center">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        a.approval_status === 'Approved' ? 'bg-green-100 text-green-800' :
                                        a.approval_status === 'Rejected' ? 'bg-red-100 text-red-800' :
                                        'bg-yellow-100 text-yellow-800'
                                    }`}>
                                        {a.approval_status || 'Pending'}
                                    </span>
                                </td>
                                {showActions && (
                                    <td className="p-3 border text-center space-x-2">
                                        <button 
                                            onClick={() => handleApproval(a.id, 'fund', 'Approved')}
                                            disabled={loading}
                                            className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-xs transition"
                                        >
                                            Approve
                                        </button>
                                        <button 
                                            onClick={() => handleApproval(a.id, 'fund', 'Rejected')}
                                            disabled={loading}
                                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-xs transition"
                                        >
                                            Reject
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="p-4 bg-gray-50 min-h-screen space-y-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">
                    Petty Cash Approval
                </h2>
            </div>
            
            {message && (
                <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
                    {message}
                </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-6">
                <button
                    className={`px-6 py-3 font-medium text-sm transition ${
                        activeTab === 'expenses'
                            ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setActiveTab('expenses')}
                >
                    Petty Cash Expenses
                </button>
                <button
                    className={`px-6 py-3 font-medium text-sm transition ${
                        activeTab === 'funds'
                            ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setActiveTab('funds')}
                >
                    Fund Allocations
                </button>
            </div>

            {/* Content */}
            {activeTab === 'expenses' && (
                <div>
                    {renderTransactionTable("Pending Expense Approvals", pendingTransactions, true)}
                    {renderTransactionTable("Approved Expenses", approvedTransactions, false)}
                    {renderTransactionTable("Rejected Expenses", rejectedTransactions, false)}
                </div>
            )}

            {activeTab === 'funds' && (
                <div>
                    {renderAllocationTable("Pending Fund Allocations", pendingAllocations, true)}
                    {renderAllocationTable("Approved Fund Allocations", approvedAllocations, false)}
                    {renderAllocationTable("Rejected Fund Allocations", rejectedAllocations, false)}
                </div>
            )}
            
        </div>
    );
};

export default PettyCashApproval;
