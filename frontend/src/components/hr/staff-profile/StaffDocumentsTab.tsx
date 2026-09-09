import React, { useState, useEffect } from 'react';
import { StaffProfileData } from '../../StaffProfile';
import api from '../../../api';

interface Props {
    profile: StaffProfileData;
}

export const StaffDocumentsTab: React.FC<Props> = ({ profile }) => {
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchDocuments = async () => {
        try {
            const res = await api.get(`/hr/staff/${profile.id}/documents`);
            setDocuments(res.data);
        } catch (err) {
            console.error("Failed to fetch documents", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, [profile.id]);

    const handleDownload = async (docId: number, fileName: string) => {
        try {
            const response = await api.get(`/hr/staff/download/${docId}`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Error downloading document', error);
            alert('Failed to download document');
        }
    };

    if (loading) return <div>Loading...</div>;

    const verifiedCount = documents.filter(d => d.is_verified).length;
    const pendingCount = documents.length - verifiedCount;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                <div>
                    <h3 className="text-lg font-semibold text-slate-800">Documents</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        {documents.length} Documents • {verifiedCount} Verified • {pendingCount} Pending
                    </p>
                </div>
                <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-sm">
                    + Upload Document
                </button>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-3 font-semibold text-slate-500 uppercase">Document</th>
                            <th className="px-4 py-3 font-semibold text-slate-500 uppercase">Number</th>
                            <th className="px-4 py-3 font-semibold text-slate-500 uppercase">Uploaded</th>
                            <th className="px-4 py-3 font-semibold text-slate-500 uppercase">Status</th>
                            <th className="px-4 py-3 font-semibold text-slate-500 uppercase text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {documents.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                    No documents uploaded yet.
                                </td>
                            </tr>
                        ) : (
                            documents.map(doc => (
                                <tr key={doc.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-800">
                                        {doc.document_type_name}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {doc.document_no || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                        {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('en-GB') : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {doc.is_verified ? (
                                            <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full text-xs font-semibold">✓ Verified</span>
                                        ) : (
                                            <span className="text-orange-700 bg-orange-50 px-2 py-1 rounded-full text-xs font-semibold">⚠ Pending</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button 
                                            onClick={() => handleDownload(doc.id, doc.file_name)}
                                            className="text-blue-600 hover:text-blue-800 font-medium text-sm mr-3">
                                            Download
                                        </button>
                                        <button className="text-slate-400 hover:text-slate-600">⋮</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
