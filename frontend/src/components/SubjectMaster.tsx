import React, { useEffect, useState, useRef } from "react";
import api from "../api";

interface Subject {
    id: number;
    subject_name: string;
    subject_type: "Academic" | "Deeniyath";
    academic_year: string;
    is_active: boolean;
}

interface BranchOption {
    id: number | string;
    name: string;
    location_name: string;
}

const SubjectMaster: React.FC = () => {
    // Context from Storage (Shared Header State)
    const academicYear = localStorage.getItem("academicYear") || "2024-2025";
    const currentBranch = localStorage.getItem('currentBranch');
    const isSpecificBranch = currentBranch && currentBranch !== 'All' && currentBranch !== 'All Branches';

    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [name, setName] = useState("");
    const [group, setGroup] = useState<"Academic" | "Deeniyath">("Academic");

    // Editing states
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [editGroup, setEditGroup] = useState<"Academic" | "Deeniyath">("Academic");

    // Copy Feature State
    const [allBranches, setAllBranches] = useState<BranchOption[]>([]);
    const [sourceBranchId, setSourceBranchId] = useState<string | number>('');
    const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
    const [isCopyDropdownOpen, setIsCopyDropdownOpen] = useState(false);
    const [copying, setCopying] = useState(false);
    const copyDropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (copyDropdownRef.current && !copyDropdownRef.current.contains(event.target as Node)) {
                setIsCopyDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const loadSubjects = async () => {
        try {
            const res = await api.get("/academic/subjects", {
                params: { academic_year: academicYear }
            });

            const sortedSubjects = [...res.data].sort(
                (a, b) => a.subject_name.localeCompare(b.subject_name)
            );

            setSubjects(sortedSubjects);
        } catch (error) {
            console.error("Failed to load subjects:", error);
        }
    };


    const addSubject = async () => {
        if (!name.trim()) return;

        try {
            await api.post("/academic/subjects", {
                subject_name: name,
                subject_type: group,
                academic_year: academicYear,
                is_active: true
            });
            setName("");
            setGroup("Academic"); // Reset to default
            loadSubjects();
        } catch (error: any) {
            console.error("Failed to add subject:", error);
            const errorMsg = error.response?.data?.error || error.message || "Failed to add subject. Please try again.";
            alert(errorMsg);
        }
    };

    const updateSubject = async (id: number) => {
        if (!editName.trim()) return;

        try {
            await api.put(`/academic/subjects/${id}`, {
                subject_name: editName,
                subject_type: editGroup
            });
            setEditingId(null);
            loadSubjects();
        } catch (error) {
            console.error("Failed to update subject:", error);
            alert("Failed to update subject. Please try again.");
        }
    };

    const toggleStatus = async (id: number, currentStatus: boolean) => {
        try {
            await api.put(`/academic/subjects/${id}`, {
                is_active: !currentStatus
            });
            loadSubjects();
        } catch (error) {
            console.error("Failed to update status:", error);
            alert("Failed to update status.");
        }
    };

    const deleteSubject = async (id: number) => {
        if (!window.confirm("Are you sure you want to delete this subject?")) return;

        try {
            await api.delete(`/academic/subjects/${id}`);
            loadSubjects();
        } catch (error: any) {
            console.error("Failed to delete subject:", error);
            const errorMsg = error.response?.data?.error || error.message || "Failed to delete subject. Please try again.";
            alert(errorMsg);
        }
    };

    // Fetch Branches for Copy Logic
    useEffect(() => {
        if (currentBranch && currentBranch !== 'All' && currentBranch !== 'All Branches') {
            api.get('/branches').then(res => {
                const branchList = res.data.branches || res.data || [];
                const mappedBranches = branchList.map((b: any) => ({
                    id: b.id,
                    name: b.branch_name,
                    location_name: b.location_name || 'Unknown Location'
                }));
                setAllBranches(mappedBranches);

                const b = branchList.find((br: any) => br.branch_name.toLowerCase() === currentBranch.toLowerCase());
                if (b) {
                    setSourceBranchId(b.id);
                }
            }).catch(err => console.error("Error fetching branches:", err));
        }
    }, [currentBranch]);

    useEffect(() => {
        loadSubjects();
    }, [academicYear]); // Reload if context changes (though unlikely without page reload)

    const toggleCopyTarget = (id: string) => {
        setCopyTargets(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleCopySubjects = async () => {
        if (copyTargets.size === 0) {
            alert("Please select at least one branch to copy to.");
            return;
        }

        if (!confirm(`Are you sure you want to copy subjects to ${copyTargets.size} branches?`)) return;

        setCopying(true);
        try {
            await api.post('/academic/copy-subjects', {
                source_branch_id: sourceBranchId,
                target_branch_ids: Array.from(copyTargets),
                academic_year: academicYear
            });
            alert("Subjects copied successfully!");
            setCopyTargets(new Set());
            setIsCopyDropdownOpen(false);
        } catch (error: any) {
            console.error('Copy failed', error);
            alert(error.response?.data?.error || "Failed to copy subjects.");
        } finally {
            setCopying(false);
        }
    };

    // Prepare Grouped Branches for Copy
    const availableBranches = allBranches.filter(b => String(b.id) !== String(sourceBranchId) && b.name !== 'All Branches' && b.name !== 'All');
    const branchesByLocation: { [key: string]: BranchOption[] } = {};
    availableBranches.forEach(b => {
        if (!branchesByLocation[b.location_name]) {
            branchesByLocation[b.location_name] = [];
        }
        branchesByLocation[b.location_name].push(b);
    });

    return (
        <div className="bg-white border rounded-md p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-[#337ab7] flex items-center gap-3">
                    <span>Subject Master</span>
                    <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        Scope: {academicYear}
                    </span>
                </h2>
                
                {isSpecificBranch && (
                    <div className="relative" ref={copyDropdownRef}>
                        <button
                            className="px-3 py-1.5 bg-green-50 text-green-700 font-medium rounded border border-green-200 hover:bg-green-100 transition-colors flex items-center gap-2"
                            onClick={() => setIsCopyDropdownOpen(!isCopyDropdownOpen)}
                        >
                            <span>Copy to Branches</span>
                            <span className="text-xs">▼</span>
                        </button>
                        {isCopyDropdownOpen && (
                            <div className="absolute top-10 right-0 w-80 bg-white border shadow-xl rounded z-50 p-2 max-h-96 overflow-y-auto">
                                <div className="mb-2 text-sm font-semibold text-gray-700 pb-2 border-b">
                                    Select Target Branches
                                </div>
                                {Object.keys(branchesByLocation).length === 0 ? (
                                    <div className="text-gray-500 text-sm p-4 text-center">No other branches available</div>
                                ) : (
                                    Object.keys(branchesByLocation).map(loc => (
                                        <div key={loc} className="mb-1">
                                            <div className="text-sm font-bold text-gray-900 px-3 py-2 bg-gray-50 border-b border-gray-100">
                                                {loc}
                                            </div>
                                            <div className="py-1">
                                                {branchesByLocation[loc].map(b => (
                                                    <label key={b.id} className="flex items-center gap-3 px-4 py-2 hover:bg-blue-50 cursor-pointer transition-colors pl-6">
                                                        <input
                                                            type="checkbox"
                                                            checked={copyTargets.has(String(b.id))}
                                                            onChange={() => toggleCopyTarget(String(b.id))}
                                                            className="w-4 h-4 accent-blue-600 rounded border-gray-300"
                                                        />
                                                        <span className="text-sm text-gray-800 select-none font-medium">{b.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                                <div className="mt-3 border-t pt-3 flex justify-end gap-2 sticky bottom-0 bg-white pb-1">
                                    <button
                                        className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
                                        onClick={() => setIsCopyDropdownOpen(false)}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
                                        onClick={handleCopySubjects}
                                        disabled={copyTargets.size === 0 || copying}
                                    >
                                        {copying ? 'Copying...' : `Copy to ${copyTargets.size} branch${copyTargets.size !== 1 ? 'es' : ''}`}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Add Subject */}
            <div className="flex gap-3 mb-6 items-end">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject Name</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="border px-3 py-2 rounded w-64"
                        placeholder="Enter subject name"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
                    <select
                        value={group}
                        onChange={(e) => setGroup(e.target.value as "Academic" | "Deeniyath")}
                        className="border px-3 py-2 rounded w-40"
                    >
                        <option value="Academic">Academic</option>
                        <option value="Deeniyath">Deeniyath</option>
                    </select>
                </div>

                <button
                    onClick={addSubject}
                    className="px-4 py-2 bg-[#337ab7] text-white rounded hover:bg-[#286090] mb-[1px]"
                >
                    Add Subject
                </button>
            </div>

            {/* Subject Table */}
            <table className="w-full text-sm border">
                <thead className="bg-gray-100">
                    <tr>
                        <th className="border px-3 py-2 text-left">Subject Name</th>
                        <th className="border px-3 py-2 text-left">Group</th>
                        <th className="border px-3 py-2 text-center w-24">Status</th>
                        <th className="border px-3 py-2 text-left">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {subjects.map((s) => (
                        <tr key={s.id} className={`border-t ${!s.is_active ? 'bg-gray-50' : ''}`}>
                            <td className="border px-3 py-2">
                                {editingId === s.id ? (
                                    <input
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="border px-2 py-1 rounded w-full"
                                    />
                                ) : (
                                    <span className={!s.is_active ? 'text-gray-400' : ''}>{s.subject_name}</span>
                                )}
                            </td>

                            <td className="border px-3 py-2">
                                {editingId === s.id ? (
                                    <select
                                        value={editGroup}
                                        onChange={(e) => setEditGroup(e.target.value as "Academic" | "Deeniyath")}
                                        className="border px-2 py-1 rounded w-full"
                                    >
                                        <option value="Academic">Academic</option>
                                        <option value="Deeniyath">Deeniyath</option>
                                    </select>
                                ) : (
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${s.subject_type === 'Deeniyath' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                                        }`}>
                                        {s.subject_type || 'Academic'}
                                    </span>
                                )}
                            </td>

                            {/* Status Toggle */}
                            <td className="border px-3 py-2 text-center">
                                <button
                                    onClick={() => toggleStatus(s.id, s.is_active)}
                                    className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${s.is_active ? 'bg-green-500' : 'bg-gray-300'
                                        }`}
                                    title={s.is_active ? "Click to Deactivate" : "Click to Activate"}
                                >
                                    <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${s.is_active ? 'translate-x-5' : 'translate-x-0'
                                        }`} />
                                </button>
                            </td>

                            <td className="border px-3 py-2 flex gap-3">
                                {editingId === s.id ? (
                                    <>
                                        <button
                                            className="text-green-600 hover:text-green-800"
                                            onClick={() => updateSubject(s.id)}
                                        >
                                            Save
                                        </button>
                                        <button
                                            className="text-gray-500 hover:text-gray-700"
                                            onClick={() => setEditingId(null)}
                                        >
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            className="text-blue-600 hover:text-blue-800"
                                            onClick={() => {
                                                setEditingId(s.id);
                                                setEditName(s.subject_name);
                                                setEditGroup(s.subject_type || "Academic");
                                            }}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="text-red-600 hover:text-red-800"
                                            onClick={() => deleteSubject(s.id)}
                                        >
                                            Delete
                                        </button>
                                    </>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default SubjectMaster;
