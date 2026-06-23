import React, { useState, useEffect } from 'react';
import { Page } from '../App';
import api from '../api';

interface SmsCenterProps {
    navigateTo: (page: Page) => void;
}

type SmsTab = 'attendance' | 'fee-due' | 'reports';
const TAB_LABELS: { id: SmsTab; label: string; color: string }[] = [
    { id: 'attendance', label: '📋 Attendance SMS', color: 'bg-red-500' },
    { id: 'fee-due',    label: '💰 Fee Due SMS',    color: 'bg-amber-500' },
    { id: 'reports',    label: '📊 SMS Reports',    color: 'bg-teal-500' },
];

// ─── Shared helper ────────────────────────────────────────────────────────────
const ResultBar: React.FC<{ result: { sent: number; failed: number; skipped: number } | null }> = ({ result }) => {
    if (!result) return null;
    return (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex gap-4">
            <span>✅ Sent: <strong>{result.sent}</strong></span>
            <span>⏭ Skipped: <strong>{result.skipped}</strong></span>
            {result.failed > 0 && <span>❌ Failed: <strong>{result.failed}</strong></span>}
        </div>
    );
};

// ─── Tab 1: Attendance SMS ────────────────────────────────────────────────────
const AttendanceSmsTab: React.FC = () => {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [classOptions, setClassOptions] = useState<{ id: number; class_name: string }[]>([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [students, setStudents] = useState<any[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);

    useEffect(() => {
        api.get('/classes').then(r => setClassOptions(r.data.classes || []));
    }, []);

    const handleSearch = async () => {
        setLoading(true);
        setStudents([]);
        setSelected(new Set());
        setResult(null);
        try {
            const branch = localStorage.getItem('currentBranch') || 'All';
            const params: any = { date, branch };
            if (selectedClass) params.class = selectedClass;
            const res = await api.get('/attendance', { params });
            const allStudents = res.data.students || [];
            const attendance = res.data.attendance || {};
            const absent = allStudents
                .filter((s: any) => attendance[s.student_id] === 'Absent')
                .map((s: any) => ({ ...s, status: attendance[s.student_id] }));
            setStudents(absent);
            // Auto-select all
            setSelected(new Set(absent.map((s: any) => s.student_id)));
        } catch (e) {
            alert('Failed to fetch absent students');
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async () => {
        if (selected.size === 0) return;
        if (!window.confirm(`Send SMS to ${selected.size} parent(s)?`)) return;
        setSending(true);
        try {
            const res = await api.post('/attendance/send-sms', {
                date,
                student_ids: Array.from(selected)
            });
            setResult(res.data);
            setSelected(new Set());
        } catch (e: any) {
            alert(`Failed: ${e.response?.data?.error || e.message}`);
        } finally {
            setSending(false);
        }
    };

    const toggleAll = (checked: boolean) =>
        setSelected(checked ? new Set(students.map(s => s.student_id)) : new Set());

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                    <input type="date" value={date} max={new Date().toISOString().split('T')[0]}
                        onChange={e => setDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class (optional)</label>
                    <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option value="">All Classes</option>
                        {classOptions.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
                    </select>
                </div>
                <button onClick={handleSearch} disabled={loading}
                    className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-md text-sm disabled:bg-gray-400">
                    {loading ? 'Searching…' : 'Get Absent Students'}
                </button>
                <button onClick={handleSend} disabled={selected.size === 0 || sending}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md text-sm disabled:bg-gray-300 font-medium">
                    {sending ? 'Sending…' : `📱 Send SMS (${selected.size})`}
                </button>
            </div>

            {students.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                    <div className="p-2 bg-gray-50 border-b flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                            <input type="checkbox"
                                checked={selected.size === students.length}
                                ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < students.length; }}
                                onChange={e => toggleAll(e.target.checked)}
                                className="h-3.5 w-3.5 accent-violet-600" />
                            Select all ({students.length} absent)
                        </label>
                        {selected.size > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                {selected.size} selected
                            </span>
                        )}
                    </div>
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 py-2 w-8"></th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Class</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Roll No</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Name</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Father</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Phone</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {students.map(s => (
                                <tr key={s.student_id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">
                                        <input type="checkbox"
                                            checked={selected.has(s.student_id)}
                                            onChange={() => setSelected(prev => {
                                                const next = new Set(prev);
                                                next.has(s.student_id) ? next.delete(s.student_id) : next.add(s.student_id);
                                                return next;
                                            })}
                                            className="h-4 w-4 accent-violet-600 cursor-pointer" />
                                    </td>
                                    <td className="px-3 py-2">{s.class}</td>
                                    <td className="px-3 py-2">{s.rollNo}</td>
                                    <td className="px-3 py-2 font-medium">{s.name}</td>
                                    <td className="px-3 py-2 text-gray-500">{s.father}</td>
                                    <td className="px-3 py-2 text-gray-500">{s.smsNo || s.fatherMobile || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {students.length === 0 && !loading && (
                <p className="text-center text-gray-400 text-sm py-8">Search above to load absent students</p>
            )}

            <ResultBar result={result} />
        </div>
    );
};

// ─── Tab 2: Fee Due SMS ───────────────────────────────────────────────────────
const FeeDueSmsTab: React.FC = () => {
    const [students, setStudents] = useState<any[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);
    const [minDue, setMinDue] = useState('1');

    const handleSearch = async () => {
        setLoading(true);
        setStudents([]);
        setSelected(new Set());
        setResult(null);
        try {
            const branch = localStorage.getItem('currentBranch') || 'All';
            const res = await api.get('/reports/fees/due', {
                params: { branch }
            });
            const list = (res.data || []).filter((s: any) =>
                !minDue || s.due_amount >= Number(minDue)
            );
            setStudents(list);
            setSelected(new Set(list.map((s: any) => s.student_id)));
        } catch (e) {
            alert('Failed to fetch fee due list');
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async () => {
        if (selected.size === 0) return;
        if (!window.confirm(`Send fee due SMS to ${selected.size} parent(s)?`)) return;
        setSending(true);
        try {
            const res = await api.post('/sms/send-fee-due', {
                student_ids: Array.from(selected)
            });
            setResult(res.data);
            setSelected(new Set());
        } catch (e: any) {
            alert(`Failed: ${e.response?.data?.error || e.message}`);
        } finally {
            setSending(false);
        }
    };

    const toggleAll = (checked: boolean) =>
        setSelected(checked ? new Set(students.map(s => s.student_id)) : new Set());

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Due Amount (₹)</label>
                    <input type="number" value={minDue} min="1"
                        onChange={e => setMinDue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                </div>
                <button onClick={handleSearch} disabled={loading}
                    className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-md text-sm disabled:bg-gray-400">
                    {loading ? 'Searching…' : 'Get Students with Due'}
                </button>
                <button onClick={handleSend} disabled={selected.size === 0 || sending}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md text-sm disabled:bg-gray-300 font-medium">
                    {sending ? 'Sending…' : `📱 Send SMS (${selected.size})`}
                </button>
            </div>

            {students.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                    <div className="p-2 bg-gray-50 border-b flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                            <input type="checkbox"
                                checked={selected.size === students.length}
                                ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < students.length; }}
                                onChange={e => toggleAll(e.target.checked)}
                                className="h-3.5 w-3.5 accent-violet-600" />
                            Select all ({students.length} students)
                        </label>
                        {selected.size > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                {selected.size} selected
                            </span>
                        )}
                    </div>
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 py-2 w-8"></th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Name</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Adm No</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Class</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Father</th>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Phone</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">Due Amount</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {students.map(s => (
                                <tr key={s.student_id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">
                                        <input type="checkbox"
                                            checked={selected.has(s.student_id)}
                                            onChange={() => setSelected(prev => {
                                                const next = new Set(prev);
                                                next.has(s.student_id) ? next.delete(s.student_id) : next.add(s.student_id);
                                                return next;
                                            })}
                                            className="h-4 w-4 accent-violet-600 cursor-pointer" />
                                    </td>
                                    <td className="px-3 py-2 font-medium">{s.name}</td>
                                    <td className="px-3 py-2 text-blue-600">{s.admission_no}</td>
                                    <td className="px-3 py-2">{s.class} {s.section}</td>
                                    <td className="px-3 py-2 text-gray-500">{s.father_name || '—'}</td>
                                    <td className="px-3 py-2 text-gray-500">{s.father_mobile || '—'}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-red-600">
                                        ₹{s.due_amount?.toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {students.length === 0 && !loading && (
                <p className="text-center text-gray-400 text-sm py-8">Search above to load students with fee due</p>
            )}

            <ResultBar result={result} />
        </div>
    );
};

// ─── Tab 3: Announcement SMS ──────────────────────────────────────────────────
const AnnouncementSmsTab: React.FC = () => {
    const [message, setMessage] = useState('');
    const [classOptions, setClassOptions] = useState<{ id: number; class_name: string }[]>([]);
    const [selectedClass, setSelectedClass] = useState('');
    const [students, setStudents] = useState<any[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);

    useEffect(() => {
        api.get('/classes').then(r => setClassOptions(r.data.classes || []));
    }, []);

    const handleLoadStudents = async () => {
        setLoading(true);
        setStudents([]);
        setSelected(new Set());
        setResult(null);
        try {
            const branch = localStorage.getItem('currentBranch') || 'All';
            const params: any = { branch, status: 'Active' };
            if (selectedClass) params.class = selectedClass;
            const res = await api.get('/students', { params });
            const list = res.data.students || [];
            setStudents(list);
            setSelected(new Set(list.map((s: any) => s.student_id)));
        } catch (e) {
            alert('Failed to fetch students');
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async () => {
        if (!message.trim()) { alert('Please enter a message'); return; }
        if (selected.size === 0) { alert('Please select at least one student'); return; }
        if (!window.confirm(`Send announcement to ${selected.size} parent(s)?`)) return;
        setSending(true);
        try {
            const res = await api.post('/sms/send-announcement', {
                student_ids: Array.from(selected),
                message: message.trim()
            });
            setResult(res.data);
            setSelected(new Set());
        } catch (e: any) {
            alert(`Failed: ${e.response?.data?.error || e.message}`);
        } finally {
            setSending(false);
        }
    };

    const toggleAll = (checked: boolean) =>
        setSelected(checked ? new Set(students.map(s => s.student_id)) : new Set());

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message <span className="text-gray-400 font-normal">({message.length}/160 chars)</span>
                </label>
                <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    maxLength={160}
                    rows={3}
                    placeholder="Type your announcement message here…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-violet-500 focus:border-violet-500"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class (optional)</label>
                    <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option value="">All Classes</option>
                        {classOptions.map(c => <option key={c.id} value={c.class_name}>{c.class_name}</option>)}
                    </select>
                </div>
                <button onClick={handleLoadStudents} disabled={loading}
                    className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-md text-sm disabled:bg-gray-400">
                    {loading ? 'Loading…' : 'Load Students'}
                </button>
                <button onClick={handleSend} disabled={selected.size === 0 || sending || !message.trim()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm disabled:bg-gray-300 font-medium">
                    {sending ? 'Sending…' : `📢 Send to (${selected.size})`}
                </button>
            </div>

            {students.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                    <div className="p-2 bg-gray-50 border-b flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                            <input type="checkbox"
                                checked={selected.size === students.length}
                                ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < students.length; }}
                                onChange={e => toggleAll(e.target.checked)}
                                className="h-3.5 w-3.5 accent-violet-600" />
                            Select all ({students.length} students)
                        </label>
                        {selected.size > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                                {selected.size} selected
                            </span>
                        )}
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                        <table className="min-w-full text-sm divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 w-8"></th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-500">Name</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-500">Class</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-500">Phone</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {students.map(s => (
                                    <tr key={s.student_id} className="hover:bg-gray-50">
                                        <td className="px-3 py-2">
                                            <input type="checkbox"
                                                checked={selected.has(s.student_id)}
                                                onChange={() => setSelected(prev => {
                                                    const next = new Set(prev);
                                                    next.has(s.student_id) ? next.delete(s.student_id) : next.add(s.student_id);
                                                    return next;
                                                })}
                                                className="h-4 w-4 accent-violet-600 cursor-pointer" />
                                        </td>
                                        <td className="px-3 py-2 font-medium">{s.name || `${s.first_name} ${s.last_name}`}</td>
                                        <td className="px-3 py-2">{s.class}</td>
                                        <td className="px-3 py-2 text-gray-500">{s.smsNo || s.fatherMobile || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <ResultBar result={result} />
        </div>
    );
};

// ─── Tab 4: Custom SMS ────────────────────────────────────────────────────────
const CustomSmsTab: React.FC = () => {
    const [message, setMessage] = useState('');
    const [phone, setPhone] = useState('');
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);

    const handleSend = async () => {
        if (!message.trim()) { alert('Please enter a message'); return; }
        if (!phone.trim()) { alert('Please enter at least one phone number'); return; }
        const phones = phone.split(/[\n,]/).map(p => p.trim()).filter(Boolean);
        if (!window.confirm(`Send SMS to ${phones.length} number(s)?`)) return;
        setSending(true);
        try {
            const res = await api.post('/sms/send-custom', {
                phones,
                message: message.trim()
            });
            setResult(res.data);
            setPhone('');
            setMessage('');
        } catch (e: any) {
            alert(`Failed: ${e.response?.data?.error || e.message}`);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-4 max-w-2xl">
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Numbers <span className="text-gray-400 font-normal">(comma or newline separated)</span>
                </label>
                <textarea
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    rows={3}
                    placeholder="9876543210, 9123456789"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-violet-500 focus:border-violet-500"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message <span className="text-gray-400 font-normal">({message.length}/160)</span>
                </label>
                <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    maxLength={160}
                    rows={4}
                    placeholder="Type your message…"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-violet-500 focus:border-violet-500"
                />
            </div>
            <button onClick={handleSend} disabled={sending || !message.trim() || !phone.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2 rounded-md text-sm font-medium disabled:bg-gray-300">
                {sending ? 'Sending…' : '📱 Send SMS'}
            </button>
            <ResultBar result={result} />
        </div>
    );
};

// ─── Tab 3: SMS Reports ───────────────────────────────────────────────────────
const SMS_TYPE_LABELS: Record<string, string> = {
    ATTENDANCE:  '📋 Attendance',
    FEE_RECEIPT: '💰 Fee Receipt',
    FEE_DUE:     '🔔 Fee Due',
};

const exportToExcel = (records: SmsReportRow[], fromDate: string, toDate: string) => {
    const headers = ['Sent At', 'SMS Type', 'Student', 'Phone', 'Branch', 'Status', 'Reason'];
    const rows = records.map(r => [
        r.sent_at,
        SMS_TYPE_LABELS[r.sms_type] || r.sms_type,
        r.student_name || '—',
        r.phone,
        r.branch_name || '—',
        r.status,
        r.reason || '—',
    ]);

    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `sms_report_${fromDate}_to_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
};

const STATUS_COLORS: Record<string, string> = {
    sent:    'bg-emerald-100 text-emerald-700',
    failed:  'bg-red-100 text-red-700',
    skipped: 'bg-amber-100 text-amber-700',
};

interface SmsReportRow {
    id: number;
    sms_type: string;
    phone: string;
    status: string;
    reason: string | null;
    sent_at: string;
    student_id: number | null;
    student_name: string;
    school_id: number | null;
    branch_id: number | null;
    branch_name: string;
}

interface SmsGrand {
    total: number; sent: number; failed: number; skipped: number; delivery_rate: number;
}

interface SmsSummaryEntry {
    total: number; sent: number; failed: number; skipped: number;
}

const SmsReportsTab: React.FC = () => {
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = today.slice(0, 8) + '01';

    const [fromDate, setFromDate]         = useState(firstOfMonth);
    const [toDate, setToDate]             = useState(today);
    const [smsType, setSmsType]           = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [branchFilter, setBranchFilter] = useState('');
    const [branchOptions, setBranchOptions] = useState<{ id: number; branch_name: string }[]>([]);
    const [page, setPage]                 = useState(1);
    const [loading, setLoading]           = useState(false);

    const [grand, setGrand]     = useState<SmsGrand | null>(null);
    const [summary, setSummary] = useState<Record<string, SmsSummaryEntry>>({});
    const [daily, setDaily]     = useState<{ day: string; total: number; sent: number }[]>([]);
    const [records, setRecords] = useState<SmsReportRow[]>([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [totalPages, setTotalPages]     = useState(1);

    useEffect(() => {
        api.get('/branches').then(r => setBranchOptions(r.data.branches || []));
    }, []);

    const fetchReport = async (p = 1) => {
        setLoading(true);
        try {
            // Always send the currently active navbar branch so backend filters correctly
            const navBranchId = localStorage.getItem('currentBranchId') || '';
            const effectiveBranch = branchFilter || navBranchId;

            const params: any = { from_date: fromDate, to_date: toDate, page: p, per_page: 50 };
            if (smsType) params.sms_type = smsType;
            if (statusFilter) params.status = statusFilter;
            if (effectiveBranch) params.branch_id = effectiveBranch;
            const res = await api.get('/sms/reports', { params });
            const d = res.data;
            setGrand(d.grand);
            setSummary(d.summary || {});
            setDaily(d.daily || []);
            setRecords(d.records || []);
            setTotalRecords(d.total_records || 0);
            setTotalPages(d.total_pages || 1);
            setPage(p);
        } catch (e: any) {
            alert(`Failed to load report: ${e.response?.data?.error || e.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchReport(1); }, []); // eslint-disable-line

    // Mini bar chart using pure divs
    const maxDaily = Math.max(...daily.map(d => d.total), 1);

    return (
        <div className="space-y-5">
            {/* ── Filters ── */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
                    <input type="date" value={fromDate} max={toDate}
                        onChange={e => setFromDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
                    <input type="date" value={toDate} max={today} min={fromDate}
                        onChange={e => setToDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
                    <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option value="">All Branches</option>
                        {branchOptions.map(b => (
                            <option key={b.id} value={b.id}>{b.branch_name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">SMS Type</label>
                    <select value={smsType} onChange={e => setSmsType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option value="">All Types</option>
                        <option value="ATTENDANCE">Attendance</option>
                        <option value="FEE_RECEIPT">Fee Receipt</option>
                        <option value="FEE_DUE">Fee Due</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                        <option value="">All Statuses</option>
                        <option value="sent">Sent</option>
                        <option value="failed">Failed</option>
                        <option value="skipped">Skipped</option>
                    </select>
                </div>
                <button onClick={() => fetchReport(1)} disabled={loading}
                    className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:bg-gray-400">
                    {loading ? 'Loading…' : '🔍 Run Report'}
                </button>
            </div>

            {grand && (
                <>
                    {/* ── Grand KPI Cards ── */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {[
                            { label: 'Total Sent',      value: grand.total,         bg: 'bg-slate-800',   text: 'text-white' },
                            { label: '✅ Delivered',    value: grand.sent,          bg: 'bg-emerald-600', text: 'text-white' },
                            { label: '❌ Failed',       value: grand.failed,        bg: 'bg-red-500',     text: 'text-white' },
                            { label: '⏭ Skipped',      value: grand.skipped,       bg: 'bg-amber-400',   text: 'text-white' },
                            { label: '📈 Delivery Rate', value: `${grand.delivery_rate}%`, bg: 'bg-teal-600', text: 'text-white' },
                        ].map(c => (
                            <div key={c.label} className={`${c.bg} rounded-xl p-4 flex flex-col items-center justify-center shadow-sm`}>
                                <span className={`text-2xl font-bold ${c.text}`}>{c.value}</span>
                                <span className={`text-xs mt-1 opacity-80 ${c.text}`}>{c.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* ── Per-Type Breakdown ── */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {Object.entries(SMS_TYPE_LABELS).map(([type, label]) => {
                            const s = summary[type];
                            if (!s) return null;
                            const rate = s.total ? Math.round(s.sent / s.total * 100) : 0;
                            return (
                                <div key={type} className="border rounded-xl p-4 bg-white shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-semibold text-gray-700">{label}</span>
                                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">
                                            {s.total} msgs
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                                        <div className="bg-emerald-500 h-2 rounded-full transition-all"
                                             style={{ width: `${rate}%` }} />
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500">
                                        <span className="text-emerald-600 font-medium">✅ {s.sent}</span>
                                        <span className="text-red-500 font-medium">❌ {s.failed}</span>
                                        <span className="text-amber-500 font-medium">⏭ {s.skipped}</span>
                                        <span className="text-teal-600 font-bold">{rate}%</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Daily Activity Bar Chart ── */}
                    {daily.length > 0 && (
                        <div className="border rounded-xl p-4 bg-white shadow-sm">
                            <h4 className="text-sm font-semibold text-gray-700 mb-4">Daily SMS Activity</h4>
                            <div className="flex items-end gap-1 h-20 overflow-x-auto">
                                {daily.map(d => {
                                    const heightPct = Math.round((d.total / maxDaily) * 100);
                                    const sentPct   = d.total ? Math.round((d.sent  / d.total) * 100) : 0;
                                    return (
                                        <div key={d.day} className="flex flex-col items-center flex-shrink-0 group relative" style={{ minWidth: '28px' }}>
                                            <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                                                {d.day}<br />Total: {d.total} | Sent: {d.sent}
                                            </div>
                                            <div className="w-5 rounded-t overflow-hidden flex flex-col-reverse"
                                                 style={{ height: `${Math.max(heightPct, 4)}%`, minHeight: '4px' }}>
                                                <div className="bg-emerald-500" style={{ height: `${sentPct}%` }} />
                                                <div className="bg-slate-300 flex-1" />
                                            </div>
                                            <span className="text-gray-400 mt-1" style={{ fontSize: '9px' }}>
                                                {d.day.slice(8)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex gap-4 mt-2 text-xs text-gray-400">
                                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-emerald-500 inline-block rounded" /> Delivered</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-slate-300 inline-block rounded" /> Other</span>
                            </div>
                        </div>
                    )}

                    {/* ── Detail Table ── */}
                    <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                        <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">
                                SMS Log &nbsp;
                                <span className="text-gray-400 font-normal">({totalRecords.toLocaleString()} records)</span>
                            </span>
                            <div className="flex items-center gap-3">
                            <button
                                onClick={() => exportToExcel(records, fromDate, toDate)}
                                disabled={records.length === 0}
                                className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium disabled:opacity-40 flex items-center gap-1">
                                ⬇ Export Excel
                            </button>
                            <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
                        </div>
                        </div>
                        <div className="overflow-x-auto max-h-96">
                            <table className="min-w-full text-sm divide-y divide-gray-100">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        {['Sent At', 'Type', 'Student', 'Phone', 'Branch', 'Status', 'Reason'].map(h => (
                                            <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {records.map(r => (
                                        <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{r.sent_at}</td>
                                            <td className="px-3 py-2">
                                                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                                                    {SMS_TYPE_LABELS[r.sms_type] || r.sms_type}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-sm font-medium text-gray-800">
                                                {r.student_name || <span className="text-gray-300">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-xs font-mono text-gray-600">{r.phone}</td>
                                            <td className="px-3 py-2 text-xs text-gray-500">{r.branch_name || '—'}</td>
                                            <td className="px-3 py-2">
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                                                    {r.status}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-xs text-gray-400 max-w-xs truncate">
                                                {r.reason || <span className="text-gray-200">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                    {records.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-3 py-10 text-center text-gray-400 text-sm">
                                                No SMS records found for this period.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && (
                            <div className="px-4 py-3 border-t flex items-center justify-between bg-gray-50">
                                <button onClick={() => fetchReport(page - 1)} disabled={page <= 1 || loading}
                                    className="px-3 py-1.5 text-xs border rounded-md hover:bg-white disabled:opacity-40">
                                    ← Prev
                                </button>
                                <span className="text-xs text-gray-500">{page} / {totalPages}</span>
                                <button onClick={() => fetchReport(page + 1)} disabled={page >= totalPages || loading}
                                    className="px-3 py-1.5 text-xs border rounded-md hover:bg-white disabled:opacity-40">
                                    Next →
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {!grand && !loading && (
                <div className="text-center py-16 text-gray-400 text-sm">
                    Select a date range and click <strong>Run Report</strong>
                </div>
            )}
        </div>
    );
};

// ─── Main SMS Center ──────────────────────────────────────────────────────────
const SmsCenter: React.FC<SmsCenterProps> = ({ navigateTo }) => {
    const [activeTab, setActiveTab] = useState<SmsTab>('attendance');

    const renderTab = () => {
        switch (activeTab) {
            case 'attendance': return <AttendanceSmsTab />;
            case 'fee-due':    return <FeeDueSmsTab />;
            case 'reports':    return <SmsReportsTab />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">SMS Center</h1>
                    <p className="text-sm text-gray-500">Send attendance, fee, announcement and custom SMS</p>
                </div>
                <button onClick={() => navigateTo('administration')}
                    className="text-sm text-gray-500 hover:text-gray-700 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50">
                    ← Back
                </button>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b px-6">
                <div className="flex gap-1">
                    {TAB_LABELS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.id
                                    ? 'border-violet-600 text-violet-700'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="p-6">
                <div className="bg-white rounded-lg border shadow-sm p-6">
                    {renderTab()}
                </div>
            </div>
        </div>
    );
};

export default SmsCenter;