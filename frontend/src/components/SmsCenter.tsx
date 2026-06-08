import React, { useState, useEffect } from 'react';
import { Page } from '../App';
import api from '../api';

interface SmsCenterProps {
    navigateTo: (page: Page) => void;
}

type SmsTab = 'attendance' | 'fee-due' | 'announcement' | 'custom';

const TAB_LABELS: { id: SmsTab; label: string; color: string }[] = [
    { id: 'attendance', label: '📋 Attendance SMS',   color: 'bg-red-500' },
    { id: 'fee-due',    label: '💰 Fee Due SMS',       color: 'bg-amber-500' },
    { id: 'announcement', label: '📢 Announcement',   color: 'bg-blue-500' },
    { id: 'custom',     label: '✏️ Custom SMS',        color: 'bg-violet-500' },
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
            const res = await api.get('/fee-transactions/due-list', {
                params: { branch, min_due: minDue }
            });
            const list = res.data.students || [];
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
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Class</th>
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
                                    <td className="px-3 py-2">{s.class}</td>
                                    <td className="px-3 py-2 text-gray-500">{s.smsNo || s.fatherMobile || '—'}</td>
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

// ─── Main SMS Center ──────────────────────────────────────────────────────────
const SmsCenter: React.FC<SmsCenterProps> = ({ navigateTo }) => {
    const [activeTab, setActiveTab] = useState<SmsTab>('attendance');

    const renderTab = () => {
        switch (activeTab) {
            case 'attendance':   return <AttendanceSmsTab />;
            case 'fee-due':      return <FeeDueSmsTab />;
            case 'announcement': return <AnnouncementSmsTab />;
            case 'custom':       return <CustomSmsTab />;
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