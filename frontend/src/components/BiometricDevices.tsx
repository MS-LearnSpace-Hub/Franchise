import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

interface BiometricDevice {
    id: number;
    device_code: string;
    device_name: string;
    device_model: string;
    manufacturer: string;
    serial_number: string;
    ip_address: string;
    port: number;
    communication_type: string;
    communication_password?: string;
    sync_mode: string;
    sync_interval_minutes: number;
    timezone: string;
    status: string;
    last_seen: string | null;
    last_punch: string | null;
    firmware_version: string | null;
    sync_status: string | null;
    last_successful_sync: string | null;
    pending_punches: number | null;
}

export const BiometricDevices: React.FC = () => {
    const [devices, setDevices] = useState<BiometricDevice[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const currentSchoolId = localStorage.getItem('currentSchoolId');
    const branchId = localStorage.getItem('currentBranchId');

    const [form, setForm] = useState({
        device_code: '',
        device_name: '',
        device_model: '',
        manufacturer: '',
        serial_number: '',
        ip_address: '',
        port: 5005,
        communication_type: 'TCP',
        communication_password: '',
        sync_mode: 'AUTO',
        sync_interval_minutes: 5,
        timezone: 'Asia/Kolkata',
        status: 'ACTIVE'
    });

    const fetchDevices = useCallback(async () => {
        if (!currentSchoolId || currentSchoolId === 'all') return;
        setLoading(true);
        try {
            const res = await api.get(`/biometric/devices?branch_id=${branchId || 'all'}`);
            setDevices(res.data || []);
        } catch (e: any) {
            console.error('Failed to load devices', e);
        } finally {
            setLoading(false);
        }
    }, [currentSchoolId, branchId]);

    useEffect(() => {
        fetchDevices();
    }, [fetchDevices]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingId) {
                await api.put(`/biometric/devices/${editingId}`, form);
                setMsg({ type: 'success', text: 'Device updated successfully' });
            } else {
                await api.post('/biometric/devices', { ...form, branch_id: branchId });
                setMsg({ type: 'success', text: 'Device created successfully' });
            }
            setForm({
                device_code: '', device_name: '', device_model: '', manufacturer: '', serial_number: '',
                ip_address: '', port: 5005, communication_type: 'TCP', communication_password: '',
                sync_mode: 'AUTO', sync_interval_minutes: 5, timezone: 'Asia/Kolkata', status: 'ACTIVE'
            });
            setEditingId(null);
            fetchDevices();
        } catch (e: any) {
            setMsg({ type: 'error', text: e.response?.data?.error || `Failed to ${editingId ? 'update' : 'create'} device` });
        }
    };

    const handleEdit = (d: BiometricDevice) => {
        setEditingId(d.id);
        setForm({
            device_code: d.device_code,
            device_name: d.device_name,
            device_model: d.device_model || '',
            manufacturer: d.manufacturer || '',
            serial_number: d.serial_number || '',
            ip_address: d.ip_address || '',
            port: d.port || 5005,
            communication_type: d.communication_type || 'TCP',
            communication_password: d.communication_password || '',
            sync_mode: d.sync_mode || 'AUTO',
            sync_interval_minutes: d.sync_interval_minutes || 5,
            timezone: d.timezone || 'Asia/Kolkata',
            status: d.status || 'ACTIVE'
        });
    };

    if (!currentSchoolId || currentSchoolId === 'all') {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
                <h2 className="text-lg font-bold text-slate-800 mb-2">Biometric Devices</h2>
                <p className="text-slate-500 text-sm">Please select a specific school from the top navigation to view and manage devices.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Biometric Devices</h2>
            
            {msg && (
                <div className={`mb-4 p-3 rounded text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {msg.text}
                </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Device Code *</label>
                    <input type="text" value={form.device_code} onChange={e => setForm({...form, device_code: e.target.value})} required className="w-full border border-slate-300 rounded px-3 py-2 text-sm" disabled={!!editingId} />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Device Name *</label>
                    <input type="text" value={form.device_name} onChange={e => setForm({...form, device_name: e.target.value})} required className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Serial Number</label>
                    <input type="text" value={form.serial_number} onChange={e => setForm({...form, serial_number: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Comm Type</label>
                    <select value={form.communication_type} onChange={e => setForm({...form, communication_type: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                        <option value="TCP">TCP/IP (Listener)</option>
                        <option value="HTTP">HTTP/API (Push)</option>
                        <option value="ADMS">ADMS</option>
                        <option value="SDK">SDK/Polling</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">IP Address</label>
                    <input type="text" value={form.ip_address} onChange={e => setForm({...form, ip_address: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Port</label>
                    <input type="number" value={form.port} onChange={e => setForm({...form, port: parseInt(e.target.value)})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Comm Password</label>
                    <input type="text" value={form.communication_password} onChange={e => setForm({...form, communication_password: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Sync Mode</label>
                    <select value={form.sync_mode} onChange={e => setForm({...form, sync_mode: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                        <option value="AUTO">Auto</option>
                        <option value="MANUAL">Manual</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Sync Interval (Mins)</label>
                    <input type="number" value={form.sync_interval_minutes} onChange={e => setForm({...form, sync_interval_minutes: parseInt(e.target.value)})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                    <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full border border-slate-300 rounded px-3 py-2 text-sm">
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                        <option value="MAINTENANCE">Maintenance</option>
                    </select>
                </div>
                <div className="md:col-span-4 flex justify-end items-end gap-2 mt-2">
                    {editingId && (
                        <button type="button" onClick={() => {
                            setEditingId(null);
                            setForm({
                                device_code: '', device_name: '', device_model: '', manufacturer: '', serial_number: '',
                                ip_address: '', port: 5005, communication_type: 'TCP', communication_password: '',
                                sync_mode: 'AUTO', sync_interval_minutes: 5, timezone: 'Asia/Kolkata', status: 'ACTIVE'
                            });
                        }} className="px-4 py-2 text-sm bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors">
                            Cancel
                        </button>
                    )}
                    <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                        {editingId ? 'Update Device' : 'Add Device'}
                    </button>
                </div>
            </form>

            {loading ? (
                <div className="text-center py-4 text-slate-500">Loading devices...</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-y border-slate-200">
                                <th className="py-3 px-4 text-xs font-semibold text-slate-600">Code / Name</th>
                                <th className="py-3 px-4 text-xs font-semibold text-slate-600">Network Info</th>
                                <th className="py-3 px-4 text-xs font-semibold text-slate-600">Sync Info</th>
                                <th className="py-3 px-4 text-xs font-semibold text-slate-600">Health</th>
                                <th className="py-3 px-4 text-xs font-semibold text-slate-600">Status</th>
                                <th className="py-3 px-4 text-xs font-semibold text-slate-600 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {devices.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-4 text-center text-slate-500 text-sm">No devices found</td>
                                </tr>
                            ) : (
                                devices.map(d => (
                                    <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-3 px-4">
                                            <div className="font-medium text-sm text-slate-800">{d.device_name}</div>
                                            <div className="text-xs text-slate-500">{d.device_code} {d.serial_number ? `| SN: ${d.serial_number}` : ''}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="text-sm text-slate-700">{d.ip_address}:{d.port}</div>
                                            <div className="text-xs text-slate-500">{d.communication_type}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="text-sm text-slate-700">{d.sync_mode} (Every {d.sync_interval_minutes}m)</div>
                                            <div className="text-xs text-slate-500">Last: {d.last_successful_sync || 'Never'}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="text-xs text-slate-700">Last Seen: {d.last_seen || '-'}</div>
                                            <div className="text-xs text-slate-700">Pending: {d.pending_punches || 0}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${d.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {d.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <button onClick={() => handleEdit(d)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
