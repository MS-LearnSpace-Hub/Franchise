import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';
import FeeReceipt from './FeeReceipt';
import { TrashIcon, PrinterIcon, RefreshIcon } from './icons';

interface FeeItem {
    payment_id: number;
    fee_type: string;
    installment: string;
    amount_paid: string;
    concession_amount: string;
    gross_amount: string;
    due_amount: string;
    status: string;
}

interface ReceiptSummary {
    receipt_no: string;
    student_id: number;
    student_name: string;
    admission_no: string;
    enrollment_no: string;
    father_name: string;
    father_phone: string;
    branch: string;
    academic_year: string;
    class_name: string;
    section: string;
    payment_date: string;
    payment_mode: string;
    payment_note: string;
    collected_by: string;
    status: 'A' | 'I';
    cancel_reason: string;
    items: FeeItem[];
    total_paid: string;
    total_concession: string;
    total_gross: string;
    total_due: string;
}

const PREDEFINED_REASONS = [
    "Entered incorrect payment amount",
    "Wrong student / admission number selected",
    "Duplicate payment entry",
    "Cheque bounced / Transaction failed",
    "Student concession applied erroneously",
    "Parent requested refund / adjustment",
    "Other (specify below)"
];

// Reusable Pagination Component consistent with Fee Reports
const Pagination: React.FC<{
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalRecords: number;
    perPage: number;
    onPerPageChange: (perPage: number) => void;
}> = ({ currentPage, totalPages, onPageChange, totalRecords, perPage, onPerPageChange }) => {
    if (totalRecords === 0) return null;

    const visiblePages = 3;
    const startPage = Math.max(1, Math.min(currentPage, totalPages - visiblePages + 1));
    const endPage = Math.min(totalPages, startPage + visiblePages - 1);
    const pages = Array.from({ length: Math.max(0, endPage - startPage + 1) }, (_, i) => startPage + i);
    const showLastPage = endPage < totalPages;

    const startRecord = (currentPage - 1) * perPage + 1;
    const endRecord = Math.min(currentPage * perPage, totalRecords);

    return (
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm">
            <div className="flex items-center gap-3">
                <span className="text-slate-500 italic text-xs sm:text-sm">
                    Showing <span className="font-semibold text-slate-700">{startRecord}</span> to <span className="font-semibold text-slate-700">{endRecord}</span> of <span className="font-semibold text-slate-700">{totalRecords}</span> records
                </span>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Rows:</span>
                    <select
                        value={perPage}
                        onChange={(e) => onPerPageChange(Number(e.target.value))}
                        className="px-2 py-1 border border-slate-300 rounded-md bg-white text-xs text-slate-700 focus:ring-1 focus:ring-red-500"
                    >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                </div>
            </div>

            {totalPages > 1 && (
                <div className="flex items-center gap-1 flex-wrap">
                    <button
                        disabled={currentPage === 1}
                        onClick={() => onPageChange(currentPage - 1)}
                        className="px-3 py-1 text-xs sm:text-sm font-medium text-slate-600 hover:text-red-600 disabled:opacity-30 disabled:hover:text-slate-600 mr-1 rounded hover:bg-slate-200/60 transition-colors"
                    >
                        Previous
                    </button>

                    {pages.map((p) => (
                        <button
                            key={p}
                            onClick={() => onPageChange(p)}
                            className={`min-w-[30px] h-[30px] px-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${currentPage === p
                                ? 'bg-red-600 text-white shadow-sm'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                }`}
                        >
                            {p}
                        </button>
                    ))}

                    {showLastPage && (
                        <>
                            <span className="px-1 text-slate-400">...</span>
                            <button
                                onClick={() => onPageChange(totalPages)}
                                className={`min-w-[30px] h-[30px] px-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${currentPage === totalPages
                                    ? 'bg-red-600 text-white shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                                    }`}
                            >
                                {totalPages}
                            </button>
                        </>
                    )}

                    <button
                        disabled={currentPage === totalPages}
                        onClick={() => onPageChange(currentPage + 1)}
                        className="px-3 py-1 text-xs sm:text-sm font-medium text-slate-600 hover:text-red-600 disabled:opacity-30 disabled:hover:text-slate-600 ml-1 rounded hover:bg-slate-200/60 transition-colors"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
};

const DeleteFeeReceipt: React.FC = () => {
    const { user, hasPermission } = useAuth();

    // Permissions
    const canDeleteReceipt =
        hasPermission('fees.fee.delete-fee-receipt', 'delete') ||
        hasPermission('fees.fee.delete-fee-receipt', 'write') ||
        hasPermission('fees.fee.take-fee', 'delete');

    const canReadReceipts =
        hasPermission('fees.fee.delete-fee-receipt', 'read') ||
        canDeleteReceipt ||
        hasPermission('fees.fee.fee-reports', 'read') ||
        hasPermission('fees.fee.take-fee', 'read');

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [receiptNoSearch, setReceiptNoSearch] = useState('');
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSection, setSelectedSection] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'A' | 'I'>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const [perPage, setPerPage] = useState(10);

    // Classes & Sections list
    const [classes, setClasses] = useState<string[]>([]);
    const [sections, setSections] = useState<string[]>([]);

    // Data states
    const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Cancel modal states
    const [receiptToCancel, setReceiptToCancel] = useState<ReceiptSummary | null>(null);
    const [selectedReasonOption, setSelectedReasonOption] = useState(PREDEFINED_REASONS[0]);
    const [customReason, setCustomReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);

    // Print Receipt states
    const [receiptDataForPrint, setReceiptDataForPrint] = useState<any | null>(null);
    const [loadingReceiptData, setLoadingReceiptData] = useState(false);

    // Fetch classes for filtering
    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const res = await api.get('/classes');
                if (res.data && res.data.classes) {
                    const classNames = Array.from(
                        new Set(res.data.classes.map((c: any) => String(c.class_name || c.name)))
                    ).filter(Boolean) as string[];
                    setClasses(classNames);
                }
            } catch (err) {
                console.error("Error fetching classes:", err);
            }
        };
        fetchClasses();
    }, []);

    // Fetch sections dynamically when selectedClass changes
    useEffect(() => {
        const fetchSections = async () => {
            if (!selectedClass) {
                setSections([]);
                setSelectedSection('');
                return;
            }
            try {
                const branch = localStorage.getItem('currentBranch') || 'All';
                const academicYear = localStorage.getItem('academicYear') || '';
                const response = await api.get('/sections', {
                    params: {
                        class: selectedClass,
                        branch: branch === 'All Branches' || branch === 'All' ? 'All' : branch,
                        academic_year: academicYear
                    }
                });
                const fetchedSections = (response.data.sections || []).map((s: any) =>
                    typeof s === 'object' ? s.section : String(s)
                );
                setSections(fetchedSections);
            } catch (error) {
                console.error('Error fetching sections:', error);
                setSections([]);
            }
        };
        fetchSections();
    }, [selectedClass]);

    // Fetch Receipts
    const fetchReceipts = useCallback(async () => {
        if (!canReadReceipts) return;
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (searchTerm.trim()) params.append('search', searchTerm.trim());
            if (receiptNoSearch.trim()) params.append('receipt_no', receiptNoSearch.trim());
            if (selectedClass) params.append('class', selectedClass);
            if (selectedSection) params.append('section', selectedSection);
            if (statusFilter !== 'all') params.append('status', statusFilter);
            if (startDate) params.append('start_date', startDate);
            if (endDate) params.append('end_date', endDate);

            const res = await api.get(`/fees/receipts/search?${params.toString()}`);
            setReceipts(res.data.receipts || []);
            setCurrentPage(1); // Reset to page 1 on new search
        } catch (err: any) {
            console.error("Error searching receipts:", err);
            setError(err.response?.data?.error || "Failed to fetch fee receipts");
        } finally {
            setLoading(false);
        }
    }, [canReadReceipts, searchTerm, receiptNoSearch, selectedClass, selectedSection, statusFilter, startDate, endDate]);

    // Initial and filter-change fetch
    useEffect(() => {
        fetchReceipts();
    }, [statusFilter, selectedClass, selectedSection]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        fetchReceipts();
    };

    const handleResetFilters = () => {
        setSearchTerm('');
        setReceiptNoSearch('');
        setSelectedClass('');
        setSelectedSection('');
        setStatusFilter('all');
        setStartDate('');
        setEndDate('');
        setCurrentPage(1);
        setTimeout(() => {
            fetchReceipts();
        }, 50);
    };

    // Open Cancel Modal
    const handleOpenCancelModal = (receipt: ReceiptSummary) => {
        setReceiptToCancel(receipt);
        setSelectedReasonOption(PREDEFINED_REASONS[0]);
        setCustomReason('');
        setError(null);
        setSuccessMessage(null);
    };

    // Perform Cancellation
    const handleConfirmCancel = async () => {
        if (!receiptToCancel) return;

        const finalReason = selectedReasonOption === "Other (specify below)"
            ? customReason.trim()
            : customReason.trim()
                ? `${selectedReasonOption} - ${customReason.trim()}`
                : selectedReasonOption;

        if (!finalReason) {
            alert("Please provide a cancellation reason.");
            return;
        }

        setIsCancelling(true);
        try {
            const res = await api.post(`/fees/receipt/${encodeURIComponent(receiptToCancel.receipt_no)}/cancel`, {
                reason: finalReason
            });

            setSuccessMessage(res.data.message || `Receipt #${receiptToCancel.receipt_no} has been cancelled successfully.`);
            setReceiptToCancel(null);
            fetchReceipts();
        } catch (err: any) {
            console.error("Error cancelling receipt:", err);
            alert(err.response?.data?.error || "Failed to cancel receipt.");
        } finally {
            setIsCancelling(false);
        }
    };

    // Handle Print Receipt
    const handlePrintReceipt = async (receiptNo: string) => {
        setLoadingReceiptData(true);
        try {
            const res = await api.get(`/reports/fees/receipt/${encodeURIComponent(receiptNo)}`);
            const payments = res.data.payments || [];
            if (payments.length === 0) {
                alert("Receipt details not found.");
                return;
            }

            const totalPaid = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || p.amount_paid || 0), 0);
            const totalConcession = payments.reduce((sum: number, p: any) => sum + parseFloat(p.concession || p.concession_amount || 0), 0);
            const totalGross = payments.reduce((sum: number, p: any) => sum + parseFloat(p.gross_amount || 0), 0) || (totalPaid + totalConcession);
            const totalDue = payments.reduce((sum: number, p: any) => sum + parseFloat(p.due_amount || 0), 0);

            const formatted = {
                studentName: res.data.studentName || payments[0]?.name || "N/A",
                fatherName: res.data.fatherName || payments[0]?.fatherName || "N/A",
                fatherPhone: res.data.fatherPhone || payments[0]?.fatherPhone || "N/A",
                admissionNo: res.data.admissionNo || payments[0]?.admNo || "N/A",
                branch: res.data.branch || payments[0]?.branch || "N/A",
                className: res.data.className || payments[0]?.class || "N/A",
                receiptNo: receiptNo,
                paymentDate: res.data.paymentDate || payments[0]?.payment_date,
                paymentMode: res.data.paymentMode || payments[0]?.mode || "Cash",
                paymentNote: res.data.paymentNote || "",
                items: payments.map((p: any) => ({
                    title: `${p.fee_type || ''} ${p.installment || ''}`.trim() || 'Fee Item',
                    payable: parseFloat(p.gross_amount || p.amount || 0)
                })),
                amount: totalGross,
                concession: totalConcession,
                payable: totalGross - totalConcession,
                paid: totalPaid,
                due: totalDue
            };

            setReceiptDataForPrint(formatted);
        } catch (err: any) {
            console.error("Error loading receipt for print:", err);
            alert(err.response?.data?.error || "Failed to load receipt details.");
        } finally {
            setLoadingReceiptData(false);
        }
    };

    // Calculate Summary Stats
    const activeCount = receipts.filter(r => r.status === 'A').length;
    const cancelledCount = receipts.filter(r => r.status === 'I').length;
    const totalCollected = receipts
        .filter(r => r.status === 'A')
        .reduce((sum, r) => sum + parseFloat(r.total_paid || '0'), 0);

    // Paginated records calculation
    const totalPages = Math.ceil(receipts.length / perPage) || 1;
    const paginatedReceipts = useMemo(() => {
        const start = (currentPage - 1) * perPage;
        return receipts.slice(start, start + perPage);
    }, [receipts, currentPage, perPage]);

    if (!canReadReceipts) {
        return (
            <div className="p-8 max-w-4xl mx-auto">
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-6 text-center">
                    <h3 className="text-xl font-bold mb-2">Access Restricted</h3>
                    <p>You do not have permission to view or delete fee receipts.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <span className="p-2 bg-red-100 text-red-600 rounded-xl">
                            <TrashIcon className="w-6 h-6" />
                        </span>
                        Delete / Cancel Fee Receipt
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Search and cancel erroneous fee receipts. Cancelling will revert student fee ledger balances and mark receipt as cancelled.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchReceipts}
                        disabled={loading}
                        className="inline-flex items-center px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl text-sm transition-colors"
                    >
                        <RefreshIcon className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Notification Messages */}
            {successMessage && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2 font-medium">
                        <span>✓</span>
                        <span>{successMessage}</span>
                    </div>
                    <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">✕</button>
                </div>
            )}

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2 font-medium">
                        <span>⚠</span>
                        <span>{error}</span>
                    </div>
                    <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">✕</button>
                </div>
            )}

            {/* Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Found</p>
                        <p className="text-2xl font-bold text-slate-800 mt-1">{receipts.length}</p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                        #
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Receipts</p>
                        <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                        ✓
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cancelled Receipts</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">{cancelledCount}</p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold">
                        ✕
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Total Paid</p>
                        <p className="text-2xl font-bold text-blue-600 mt-1">₹{totalCollected.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                        ₹
                    </div>
                </div>
            </div>

            {/* Search & Filter Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <form onSubmit={handleSearchSubmit} className="space-y-4">
                    {/* Primary Search Bar */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                        <div className="md:col-span-4">
                            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                                Exact Receipt Number
                            </label>
                            <input
                                type="text"
                                value={receiptNoSearch}
                                onChange={(e) => setReceiptNoSearch(e.target.value)}
                                placeholder="e.g. 10, 1024, REC-2026..."
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm font-medium"
                            />
                        </div>

                        <div className="md:col-span-5">
                            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                                Search Student / Adm No / Name
                            </label>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Student name, admission no, or enrollment no..."
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                            />
                        </div>

                        <div className="md:col-span-3 flex items-end gap-2">
                            <button
                                type="submit"
                                className="flex-1 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl text-sm shadow-sm transition-colors flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                Search
                            </button>
                            <button
                                type="button"
                                onClick={handleResetFilters}
                                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors"
                            >
                                Reset
                            </button>
                        </div>
                    </div>

                    {/* Secondary Filters */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-slate-100 text-sm">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => {
                                    setStatusFilter(e.target.value as any);
                                    setCurrentPage(1);
                                }}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                            >
                                <option value="all">All Receipts (Active & Cancelled)</option>
                                <option value="A">Active Only</option>
                                <option value="I">Cancelled Only</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Class</label>
                            <select
                                value={selectedClass}
                                onChange={(e) => {
                                    setSelectedClass(e.target.value);
                                    setSelectedSection('');
                                    setCurrentPage(1);
                                }}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                            >
                                <option value="">All Classes</option>
                                {classes.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Section</label>
                            <select
                                value={selectedSection}
                                onChange={(e) => {
                                    setSelectedSection(e.target.value);
                                    setCurrentPage(1);
                                }}
                                disabled={!selectedClass || sections.length === 0}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400"
                            >
                                <option value="">All Sections</option>
                                {sections.map((s, idx) => (
                                    <option key={idx} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">From Date</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">To Date</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                            />
                        </div>
                    </div>
                </form>
            </div>

            {/* Receipts Table & Pagination */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 text-base">
                        Fee Receipts List ({receipts.length})
                    </h3>
                    <span className="text-xs text-slate-500">
                        Page {currentPage} of {totalPages}
                    </span>
                </div>

                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="bg-slate-100/70 text-slate-700 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                                <th className="px-4 py-3">Receipt No</th>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Student Info</th>
                                <th className="px-4 py-3">Class / Sec</th>
                                <th className="px-4 py-3">Fee Details</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3 text-right">Concession</th>
                                <th className="px-4 py-3">Mode</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={10} className="text-center py-12 text-slate-500">
                                        <div className="flex flex-col items-center justify-center">
                                            <RefreshIcon className="w-8 h-8 animate-spin text-red-500 mb-2" />
                                            <span>Loading fee receipts...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedReceipts.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="text-center py-12 text-slate-500">
                                        <div className="max-w-md mx-auto">
                                            <p className="text-base font-semibold text-slate-700 mb-1">No receipts found</p>
                                            <p className="text-xs text-slate-500">Try changing your search keywords, receipt number or date filters.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedReceipts.map((r) => {
                                    const isCancelled = r.status === 'I';
                                    return (
                                        <tr
                                            key={r.receipt_no}
                                            className={`hover:bg-slate-50/80 transition-colors ${isCancelled ? 'bg-red-50/40' : ''}`}
                                        >
                                            {/* Receipt No */}
                                            <td className="px-4 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                                                #{r.receipt_no}
                                                <div className="text-[11px] font-normal text-slate-500">{r.academic_year}</div>
                                            </td>

                                            {/* Date */}
                                            <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap">
                                                {r.payment_date || 'N/A'}
                                            </td>

                                            {/* Student Details */}
                                            <td className="px-4 py-3.5">
                                                <div className="font-semibold text-slate-900">{r.student_name}</div>
                                                <div className="text-xs text-slate-500">Adm: {r.admission_no || 'N/A'} {r.branch ? `• ${r.branch}` : ''}</div>
                                            </td>

                                            {/* Class / Section */}
                                            <td className="px-4 py-3.5 whitespace-nowrap text-slate-700">
                                                {r.class_name ? `${r.class_name} ${r.section ? `(${r.section})` : ''}` : 'N/A'}
                                            </td>

                                            {/* Fee Details */}
                                            <td className="px-4 py-3.5">
                                                <div className="space-y-0.5 max-w-xs">
                                                    {r.items.map((it, idx) => (
                                                        <div key={idx} className="text-xs text-slate-700 flex items-center gap-1">
                                                            <span className="font-medium">{it.fee_type}</span>
                                                            {it.installment && it.installment !== 'One-Time' && (
                                                                <span className="text-slate-500">({it.installment})</span>
                                                            )}
                                                            <span className="text-slate-400">•</span>
                                                            <span className="text-slate-600">₹{parseFloat(it.amount_paid).toLocaleString('en-IN')}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>

                                            {/* Total Amount */}
                                            <td className="px-4 py-3.5 text-right font-bold text-slate-900 whitespace-nowrap">
                                                ₹{parseFloat(r.total_paid).toLocaleString('en-IN')}
                                            </td>

                                            {/* Total Concession */}
                                            <td className="px-4 py-3.5 text-right text-slate-600 whitespace-nowrap">
                                                {parseFloat(r.total_concession) > 0 ? `₹${parseFloat(r.total_concession).toLocaleString('en-IN')}` : '₹0'}
                                            </td>

                                            {/* Mode */}
                                            <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap">
                                                <span className="px-2 py-0.5 rounded text-xs bg-slate-100 font-medium">
                                                    {r.payment_mode || 'Cash'}
                                                </span>
                                            </td>

                                            {/* Status */}
                                            <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                                {isCancelled ? (
                                                    <div className="inline-flex flex-col items-center">
                                                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                                                            Cancelled
                                                        </span>
                                                        {r.cancel_reason && (
                                                            <span className="text-[11px] text-red-600 max-w-[150px] truncate mt-0.5 italic" title={r.cancel_reason}>
                                                                {r.cancel_reason}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                                                        Active
                                                    </span>
                                                )}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-2">
                                                    {/* Print / View Button */}
                                                    <button
                                                        onClick={() => handlePrintReceipt(r.receipt_no)}
                                                        disabled={loadingReceiptData}
                                                        title="View / Print Receipt"
                                                        className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                                    >
                                                        <PrinterIcon className="w-4 h-4" />
                                                    </button>

                                                    {/* Cancel / Delete Button */}
                                                    {canDeleteReceipt && (
                                                        <button
                                                            onClick={() => handleOpenCancelModal(r)}
                                                            disabled={isCancelled}
                                                            title={isCancelled ? "Already cancelled" : "Delete / Cancel this Receipt"}
                                                            className={`p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium ${isCancelled
                                                                ? 'text-slate-300 cursor-not-allowed'
                                                                : 'text-red-600 hover:text-red-800 hover:bg-red-50'
                                                                }`}
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                            <span className="hidden xl:inline">Cancel</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={(p) => setCurrentPage(p)}
                    totalRecords={receipts.length}
                    perPage={perPage}
                    onPerPageChange={(n) => {
                        setPerPage(n);
                        setCurrentPage(1);
                    }}
                />
            </div>

            {/* Cancel Confirmation Modal */}
            {receiptToCancel && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
                        {/* Modal Header */}
                        <div className="bg-red-50 border-b border-red-100 p-6 flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
                                <TrashIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-red-900">
                                    Cancel Fee Receipt #{receiptToCancel.receipt_no}
                                </h3>
                                <p className="text-sm text-red-700 mt-1">
                                    Student: <span className="font-semibold">{receiptToCancel.student_name}</span> (Adm: {receiptToCancel.admission_no})
                                </p>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-5">
                            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-xl text-xs space-y-1">
                                <p className="font-bold flex items-center gap-1">
                                    <span>⚠</span> Warning: Financial Ledger Reversal
                                </p>
                                <p>
                                    Cancelling this receipt (Amount: <strong>₹{parseFloat(receiptToCancel.total_paid).toLocaleString('en-IN')}</strong>) will immediately revert all associated fee payments. The student's due balances will be restored.
                                </p>
                            </div>

                            {/* Predefined Reason Selection */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
                                    Select Cancellation Reason *
                                </label>
                                <select
                                    value={selectedReasonOption}
                                    onChange={(e) => setSelectedReasonOption(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm bg-white"
                                >
                                    {PREDEFINED_REASONS.map((reason, idx) => (
                                        <option key={idx} value={reason}>{reason}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Custom Reason Details */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                                    Additional Remarks / Details {selectedReasonOption === "Other (specify below)" ? "*" : "(Optional)"}
                                </label>
                                <textarea
                                    value={customReason}
                                    onChange={(e) => setCustomReason(e.target.value)}
                                    rows={3}
                                    placeholder="Explain why this receipt is being deleted..."
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
                                />
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setReceiptToCancel(null)}
                                disabled={isCancelling}
                                className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
                            >
                                Close / Keep Active
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmCancel}
                                disabled={isCancelling}
                                className="px-6 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md transition-all flex items-center gap-2"
                            >
                                {isCancelling ? (
                                    <>
                                        <RefreshIcon className="w-4 h-4 animate-spin" />
                                        Cancelling...
                                    </>
                                ) : (
                                    <>
                                        <TrashIcon className="w-4 h-4" />
                                        Confirm & Cancel Receipt
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Printable Receipt Modal */}
            {receiptDataForPrint && (
                <FeeReceipt
                    receiptData={receiptDataForPrint}
                    onClose={() => setReceiptDataForPrint(null)}
                />
            )}
        </div>
    );
};

export default DeleteFeeReceipt;
