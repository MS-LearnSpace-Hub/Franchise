import React, { useState, useEffect, useRef } from 'react';
import api from '../../api';

interface DocumentType {
    id: number;
    code: string;
    name: string;
    is_required: boolean;
    allowed_extensions: string;
    max_file_size: number;
    requires_document_number: boolean;
    requires_expiry: boolean;
}

interface StaffDocument {
    id: number;
    document_type_id: number;
    document_type_name: string;
    document_no: string | null;
    issue_date: string | null;
    expiry_date: string | null;
    notes: string | null;
    file_name: string;
    uploaded_at: string;
    is_verified: boolean;
}

interface Props {
    staffId: number;
    mode: 'view' | 'edit';
}

export const StaffDocuments: React.FC<Props> = ({ staffId, mode }) => {
    const [types, setTypes] = useState<DocumentType[]>([]);
    const [documents, setDocuments] = useState<StaffDocument[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Upload state
    const [uploadingTypeId, setUploadingTypeId] = useState<number | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Meta state for the upload
    const [metaForm, setMetaForm] = useState({
        document_no: '',
        issue_date: '',
        expiry_date: '',
        notes: ''
    });

    const fetchDocuments = async () => {
        try {
            const typesRes = await api.get('/hr/staff-document-types');
            setTypes(typesRes.data || []);
            
            const docsRes = await api.get(`/hr/staff/${staffId}/documents`);
            setDocuments(docsRes.data || []);
        } catch (e) {
            console.error("Failed to fetch documents", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, [staffId]);

    const handleUploadClick = (typeId: number) => {
        setUploadingTypeId(typeId);
        setMetaForm({ document_no: '', issue_date: '', expiry_date: '', notes: '' });
        setUploadError(null);
        setTimeout(() => fileInputRef.current?.click(), 0);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files.length || !uploadingTypeId) return;
        
        const file = e.target.files[0];
        const docType = types.find(t => t.id === uploadingTypeId);
        
        if (!docType) return;
        
        if (file.size > docType.max_file_size) {
            setUploadError(`File size exceeds the limit of ${Math.round(docType.max_file_size / 1048576)}MB.`);
            return;
        }
        
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const allowedExts = docType.allowed_extensions.split(',').map(e => e.trim().toLowerCase().replace('.', ''));
        if (!allowedExts.includes(ext)) {
            setUploadError(`Invalid file type. Allowed: ${docType.allowed_extensions}`);
            return;
        }

        const formData = new FormData();
        formData.append('staff_id', staffId.toString());
        formData.append('document_type_id', uploadingTypeId.toString());
        formData.append('file', file);
        if (metaForm.document_no) formData.append('document_no', metaForm.document_no);
        if (metaForm.issue_date) formData.append('issue_date', metaForm.issue_date);
        if (metaForm.expiry_date) formData.append('expiry_date', metaForm.expiry_date);
        if (metaForm.notes) formData.append('notes', metaForm.notes);

        try {
            setLoading(true);
            await api.post('/hr/staff/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            await fetchDocuments();
        } catch (err: any) {
            setUploadError(err.response?.data?.message || 'Upload failed');
        } finally {
            setLoading(false);
            setUploadingTypeId(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (loading && types.length === 0) {
        return <div className="p-4 text-center text-slate-500">Loading documents...</div>;
    }

    return (
        <div className="space-y-6">
            {uploadError && (
                <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm mb-4">
                    {uploadError}
                </div>
            )}
            
            <input 
                type="file" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileSelect}
            />

            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Document Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Details</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {types.map(type => {
                            const existingDoc = documents.find(d => d.document_type_id === type.id);
                            return (
                                <tr key={type.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-slate-900">{type.name}</div>
                                        {type.is_required && <span className="text-xs text-red-500 font-semibold">Required</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                                        {existingDoc ? (
                                            <div>
                                                {existingDoc.document_no && <div>No: {existingDoc.document_no}</div>}
                                                {existingDoc.expiry_date && <div>Expires: {existingDoc.expiry_date}</div>}
                                            </div>
                                        ) : (
                                            <span className="text-slate-400">N/A</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {existingDoc ? (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                                Uploaded
                                            </span>
                                        ) : (
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-800">
                                                Missing
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        {existingDoc && (
                                            <button 
                                                onClick={async () => {
                                                    try {
                                                        const res = await api.get(`/hr/staff/download/${existingDoc.id}`, { responseType: 'blob' });
                                                        const blob = new Blob([res.data], { type: res.headers['content-type'] });
                                                        const url = URL.createObjectURL(blob);
                                                        window.open(url, '_blank');
                                                        setTimeout(() => URL.revokeObjectURL(url), 10000);
                                                    } catch (err) {
                                                        console.error("Failed to download document:", err);
                                                        alert("Failed to download document. Please try again.");
                                                    }
                                                }}
                                                className="text-indigo-600 hover:text-indigo-900 mr-4"
                                            >
                                                View
                                            </button>
                                        )}
                                        {mode === 'edit' && (
                                            <button 
                                                onClick={() => handleUploadClick(type.id)}
                                                className="text-emerald-600 hover:text-emerald-900"
                                            >
                                                {existingDoc ? 'Update' : 'Upload'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {types.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                                    No document types configured for this school.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
