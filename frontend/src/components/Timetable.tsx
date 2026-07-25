import React, { useEffect, useState, useCallback } from "react";
import { CalendarClock, ChevronDown, Trash2, Plus, Copy, Check, X, Printer } from "lucide-react";
import api from "../api";
import { useAuth } from "../contexts/AuthContext";

/* =========================================================================
   Timetable Module — single-file implementation
   Sub-views (all in this file, per request):
     - Subject Teacher Assignment  (master: subject -> teacher per section)
     - Timetable Builder           (day-wise periods/breaks per section)
     - View Timetable              (read-only weekly grid)
     - My Timetable                (teacher's own schedule)
   ========================================================================= */

const DAYS: { code: string; label: string }[] = [
  { code: "MON", label: "Monday" },
  { code: "TUE", label: "Tuesday" },
  { code: "WED", label: "Wednesday" },
  { code: "THU", label: "Thursday" },
  { code: "FRI", label: "Friday" },
  { code: "SAT", label: "Saturday" },
];

const SLOT_TYPES = ["PERIOD", "BREAK", "LUNCH", "ASSEMBLY"] as const;
type SlotType = typeof SLOT_TYPES[number];

function formatTime12h(t: string): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr || "00";
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

interface Option { id: number | string; name: string; }
interface BranchOption extends Option { branch_name: string; }
interface SubjectOption { id: number; subject_name: string; }
interface TeacherOption { id: number; name: string; designation?: string | null; }

interface SlotRow {
  id?: number;
  slot_order: number;
  slot_type: SlotType;
  label: string;
  start_time: string; // "HH:MM"
  end_time: string;
  subject_id: number | null;
  teacher_id: number | null;
  room: string;
}

/* -------------------------------------------------------------------------
   Small shared UI bits
   ------------------------------------------------------------------------- */

const NavDropdown: React.FC<{ title: string; items: { label: string; onClick: () => void }[] }> = ({ title, items }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-[#337ab7] hover:bg-[#286090] rounded">
        {title} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 w-64 bg-white border shadow rounded-b py-2">
          {items.map((item, idx) => (
            <button
              key={idx}
              onClick={item.onClick}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-[#337ab7]"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Branch / Class / Section / Academic Year selector shared across sub-views */
const ContextBar: React.FC<{
  branches: BranchOption[]; classes: Option[]; sections: Option[]; academicYears: Option[];
  branchId: string; classId: string; sectionId: string; yearId: string;
  onBranch: (v: string) => void; onClass: (v: string) => void; onSection: (v: string) => void; onYear: (v: string) => void;
  showSection?: boolean;
}> = ({ branches, classes, sections, academicYears, branchId, classId, sectionId, yearId, onBranch, onClass, onSection, onYear, showSection = true }) => {
  const cls = "border rounded px-3 py-2 text-sm w-full";
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${showSection ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-3 mb-4`}>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
        <select className={cls} value={branchId} onChange={(e) => onBranch(e.target.value)}>
          <option value="">Select Branch</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.branch_name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Class</label>
        <select className={cls} value={classId} onChange={(e) => onClass(e.target.value)}>
          <option value="">Select Class</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {showSection && (
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Section</label>
          <select className={cls} value={sectionId} onChange={(e) => onSection(e.target.value)} disabled={!classId}>
            <option value="">Select Section</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
        <select className={cls} value={yearId} onChange={(e) => onYear(e.target.value)}>
          <option value="">Select Year</option>
          {academicYears.map((y) => <option key={y.id} value={y.name}>{y.name}</option>)}
        </select>
      </div>
    </div>
  );
};

/** Shared hook: loads Branches / Classes / Academic Years, and Sections/Subjects/Teachers dependently */
function useTimetableContext() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [classes, setClasses] = useState<Option[]>([]);
  const [academicYears, setAcademicYears] = useState<Option[]>([]);
  const [sections, setSections] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);

  const [branchId, setBranchId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [yearName, setYearName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const storedBranch = localStorage.getItem("currentBranchId") || "";
        const storedYear = localStorage.getItem("academicYear") || "";

        const [resBranches, resClasses, resYears] = await Promise.all([
          api.get("/branches"),
          api.get("/classes"),
          api.get("/org/academic-years"),
        ]);

        const branchList = (resBranches.data.branches || []).map((b: any) => ({
          id: b.id, name: b.branch_name, branch_name: b.branch_name,
        }));
        setBranches(branchList);

        const classList = resClasses.data.classes || resClasses.data || [];
        setClasses(classList.map((c: any) => ({ id: c.id, name: c.class_name })));

        const yearList = resYears.data.academic_years || resYears.data || [];
        setAcademicYears(yearList.map((y: any) => ({ id: y.id, name: y.name })));

        if (storedBranch && branchList.some((b: any) => String(b.id) === String(storedBranch))) {
          setBranchId(String(storedBranch));
        } else if (branchList.length) {
          setBranchId(String(branchList[0].id));
        }

        if (storedYear && yearList.some((y: any) => y.name === storedYear)) {
          setYearName(storedYear);
        } else if (yearList.length) {
          setYearName(yearList[0].name);
        }
      } catch (e) {
        console.error("Timetable: failed to load base context", e);
      }
    })();
  }, []);

  // Sections depend on class + branch + year
  useEffect(() => {
    setSectionId("");
    setSections([]);
    if (!classId || !branchId || !yearName) return;
    api.get("/timetable/lookups/sections", { params: { class_id: classId, branch_id: branchId, academic_year: yearName } })
      .then((res) => setSections((res.data.sections || []).map((s: any) => ({ id: s.id, name: s.section_name }))))
      .catch((e) => console.error(e));
  }, [classId, branchId, yearName]);

  // Subjects depend on class + branch + year
  useEffect(() => {
    setSubjects([]);
    if (!classId || !branchId || !yearName) return;
    api.get("/timetable/lookups/subjects", { params: { class_id: classId, branch_id: branchId, academic_year: yearName } })
      .then((res) => setSubjects(res.data.subjects || []))
      .catch((e) => console.error(e));
  }, [classId, branchId, yearName]);

  // Teachers depend on branch only
  useEffect(() => {
    setTeachers([]);
    if (!branchId) return;
    api.get("/timetable/lookups/teachers", { params: { branch_id: branchId } })
      .then((res) => setTeachers(res.data.teachers || []))
      .catch((e) => console.error(e));
  }, [branchId]);

  return {
    branches, classes, academicYears, sections, subjects, teachers,
    branchId, setBranchId, classId, setClassId, sectionId, setSectionId, yearName, setYearName,
  };
}

/* -------------------------------------------------------------------------
   Sub-view: Subject -> Teacher Assignment
   ------------------------------------------------------------------------- */

const SubjectTeacherAssignmentView: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const ctx = useTimetableContext();
  const [rows, setRows] = useState<{ subject_id: number; subject_name: string; teacher_id: number | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const ready = ctx.branchId && ctx.classId && ctx.sectionId && ctx.yearName;

  const load = useCallback(async () => {
    if (!ready) { setRows([]); return; }
    setLoading(true);
    try {
      const res = await api.get("/timetable/subject-teacher", {
        params: { class_id: ctx.classId, section_id: ctx.sectionId, branch_id: ctx.branchId, academic_year: ctx.yearName },
      });
      setRows(res.data.assignments || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [ready, ctx.classId, ctx.sectionId, ctx.branchId, ctx.yearName]);

  useEffect(() => { load(); }, [load]);

  const updateTeacher = (subjectId: number, teacherId: number | null) => {
    setRows((prev) => prev.map((r) => (r.subject_id === subjectId ? { ...r, teacher_id: teacherId } : r)));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.post("/timetable/subject-teacher", {
        class_id: ctx.classId, section_id: ctx.sectionId, branch_id: ctx.branchId, academic_year: ctx.yearName,
        assignments: rows.map((r) => ({ subject_id: r.subject_id, teacher_id: r.teacher_id })),
      });
      setMessage("Saved.");
      load();
    } catch (e: any) {
      setMessage(e?.response?.data?.error || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <ContextBar
        branches={ctx.branches} classes={ctx.classes} sections={ctx.sections} academicYears={ctx.academicYears}
        branchId={ctx.branchId} classId={ctx.classId} sectionId={ctx.sectionId} yearId={ctx.yearName}
        onBranch={ctx.setBranchId} onClass={ctx.setClassId} onSection={ctx.setSectionId} onYear={ctx.setYearName}
      />

      {!ready && <div className="text-gray-400 text-sm py-10 text-center">Select Branch, Class, Section and Academic Year to continue.</div>}

      {ready && (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left px-4 py-2">Subject</th>
                <th className="text-left px-4 py-2">Teacher</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">No subjects assigned to this class yet.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.subject_id} className="border-t">
                  <td className="px-4 py-2 font-medium">{r.subject_name}</td>
                  <td className="px-4 py-2">
                    <select
                      className="border rounded px-2 py-1 text-sm w-full max-w-xs"
                      value={r.teacher_id ?? ""}
                      disabled={!canWrite}
                      onChange={(e) => updateTeacher(r.subject_id, e.target.value ? Number(e.target.value) : null)}
                    >
                      <option value="">-- Unassigned --</option>
                      {ctx.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.designation ? ` (${t.designation})` : ""}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {canWrite && rows.length > 0 && (
            <div className="p-3 bg-gray-50 flex items-center gap-3">
              <button onClick={save} disabled={saving} className="px-4 py-2 bg-[#337ab7] hover:bg-[#286090] text-white text-sm rounded disabled:opacity-50">
                {saving ? "Saving..." : "Save Assignments"}
              </button>
              {message && <span className="text-sm text-gray-600">{message}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------
   Sub-view: Timetable Builder (day-wise periods & breaks)
   ------------------------------------------------------------------------- */

const emptySlot = (order: number): SlotRow => ({
  slot_order: order, slot_type: "PERIOD", label: "", start_time: "", end_time: "",
  subject_id: null, teacher_id: null, room: "",
});

const TimetableBuilderView: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const ctx = useTimetableContext();
  const [day, setDay] = useState("MON");
  const [isWorkingDay, setIsWorkingDay] = useState(true);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [subjectTeacherMap, setSubjectTeacherMap] = useState<Record<number, number | null>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
  const [coverage, setCoverage] = useState<{class_id:number; class_name:string; section_id:number; section_name:string; has_structure:boolean}[]>([]);
  const [copySectionTargets, setCopySectionTargets] = useState<Set<string>>(new Set());
  const [showDaysPanel, setShowDaysPanel] = useState(false);
  const [showSectionsPanel, setShowSectionsPanel] = useState(false);

  const ready = ctx.branchId && ctx.classId && ctx.sectionId && ctx.yearName;

  const loadDay = useCallback(async () => {
    if (!ready) { setSlots([]); return; }
    setLoading(true);
    setConflicts([]);
    try {
      const res = await api.get("/timetable/day-structure", {
        params: { class_id: ctx.classId, section_id: ctx.sectionId, branch_id: ctx.branchId, academic_year: ctx.yearName, day_of_week: day },
      });
      setIsWorkingDay(res.data.is_working_day ?? true);
      setSlots((res.data.slots || []).map((s: any) => ({
        id: s.id, slot_order: s.slot_order, slot_type: s.slot_type, label: s.label || "",
        start_time: s.start_time || "", end_time: s.end_time || "",
        subject_id: s.subject_id, teacher_id: s.teacher_id, room: s.room || "",
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [ready, ctx.classId, ctx.sectionId, ctx.branchId, ctx.yearName, day]);

  useEffect(() => { loadDay(); }, [loadDay]);

  // Load the subject->teacher master so period rows can auto-fill the teacher
  useEffect(() => {
    if (!ready) { setSubjectTeacherMap({}); return; }
    api.get("/timetable/subject-teacher", {
      params: { class_id: ctx.classId, section_id: ctx.sectionId, branch_id: ctx.branchId, academic_year: ctx.yearName },
    }).then((res) => {
      const map: Record<number, number | null> = {};
      (res.data.assignments || []).forEach((a: any) => { map[a.subject_id] = a.teacher_id; });
      setSubjectTeacherMap(map);
    }).catch((e) => console.error(e));
  }, [ready, ctx.classId, ctx.sectionId, ctx.branchId, ctx.yearName]);

  const addSlot = () => setSlots((prev) => [...prev, emptySlot(prev.length + 1)]);

  const removeSlot = (idx: number) =>
    setSlots((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, slot_order: i + 1 })));

  const updateSlot = (idx: number, patch: Partial<SlotRow>) =>
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const onSubjectChange = (idx: number, subjectId: number | null) => {
    const autoTeacher = subjectId ? (subjectTeacherMap[subjectId] ?? null) : null;
    updateSlot(idx, { subject_id: subjectId, teacher_id: autoTeacher });
  };

  const save = async (force = false) => {
    setSaving(true);
    setMessage(null);
    setConflicts([]);
    try {
      await api.post("/timetable/day-structure", {
        class_id: ctx.classId, section_id: ctx.sectionId, branch_id: ctx.branchId, academic_year: ctx.yearName,
        day_of_week: day, is_working_day: isWorkingDay, force,
        slots: slots.map((s) => ({
          slot_order: s.slot_order, slot_type: s.slot_type, label: s.label,
          start_time: s.start_time, end_time: s.end_time,
          subject_id: s.slot_type === "PERIOD" ? s.subject_id : null,
          teacher_id: s.slot_type === "PERIOD" ? s.teacher_id : null,
          room: s.room,
        })),
      });
      setMessage("Day saved.");
      loadDay();
    } catch (e: any) {
      if (e?.response?.status === 409) {
        setConflicts(e.response.data.conflicts || ["Scheduling conflict detected."]);
      } else {
        setMessage(e?.response?.data?.error || "Failed to save.");
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleCopyTarget = (dow: string) => {
    setCopyTargets((prev) => {
      const next = new Set(prev);
      next.has(dow) ? next.delete(dow) : next.add(dow);
      return next;
    });
  };

  const loadCoverage = async () => {
  try {
    const res = await api.get("/timetable/day-structure/coverage", {
      params: { branch_id: ctx.branchId, academic_year: ctx.yearName },
    });
    setCoverage(res.data.items || []);
  } catch {
    setCoverage([]);
  }
};

  const openDaysPanel = () => {
    setShowSectionsPanel(false);
    setShowDaysPanel((v) => !v);
  };

  const openSectionsPanel = () => {
    setShowDaysPanel(false);
    setShowSectionsPanel((v) => {
      const next = !v;
      if (next) loadCoverage();
      return next;
    });
  };

  const copyToOtherDays = async () => {
    if (copyTargets.size === 0) return;
    try {
      await api.post("/timetable/day-structure/copy", {
        source: { class_id: ctx.classId, section_id: ctx.sectionId, branch_id: ctx.branchId, academic_year: ctx.yearName, day_of_week: day },
        targets: Array.from(copyTargets).map((dow) => ({ day_of_week: dow })),
        overwrite: false,
      });
      setMessage(`Copied to ${copyTargets.size} day(s).`);
      setCopyTargets(new Set());
      setShowDaysPanel(false);
      loadDay();
    } catch (e: any) {
      setMessage(e?.response?.data?.error || "Copy failed.");
    }
  };

  const copyToOtherSections = async () => {
    if (copySectionTargets.size === 0) return;
    const targets = Array.from(copySectionTargets).map((key) => {
      const [classId, sectionId] = key.split(":");
      return { class_id: Number(classId), section_id: Number(sectionId) };
    });
    try {
      const res = await api.post("/timetable/day-structure/copy-week", {
        source: { class_id: ctx.classId, section_id: ctx.sectionId, branch_id: ctx.branchId, academic_year: ctx.yearName },
        targets,
      });
      const { copied, skipped } = res.data;
      setMessage(`Copied full week to ${copied.length} class/section(s).${skipped.length ? ` Skipped ${skipped.length} (already had data).` : ""}`);
      setCopySectionTargets(new Set());
      setShowSectionsPanel(false);
    } catch (e: any) {
      setMessage(e?.response?.data?.error || "Copy failed.");
    }
  };

  return (
    <div>
      <ContextBar
        branches={ctx.branches} classes={ctx.classes} sections={ctx.sections} academicYears={ctx.academicYears}
        branchId={ctx.branchId} classId={ctx.classId} sectionId={ctx.sectionId} yearId={ctx.yearName}
        onBranch={ctx.setBranchId} onClass={ctx.setClassId} onSection={ctx.setSectionId} onYear={ctx.setYearName}
      />

      {!ready && <div className="text-gray-400 text-sm py-10 text-center">Select Branch, Class, Section and Academic Year to continue.</div>}

      {ready && (
        <>
          {/* Day tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            {DAYS.map((d) => (
              <button
                key={d.code}
                onClick={() => setDay(d.code)}
                className={`px-3 py-1.5 text-sm rounded-full border ${day === d.code ? "bg-[#337ab7] text-white border-[#337ab7]" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isWorkingDay} disabled={!canWrite}
                onChange={(e) => setIsWorkingDay(e.target.checked)} />
              This is a working day
            </label>

            {canWrite && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button onClick={openDaysPanel} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded text-gray-600 hover:bg-gray-100">
                    <Copy size={13} /> Copy to Other Days
                  </button>
                  {showDaysPanel && (
                    <div className="absolute right-0 z-40 bg-white border shadow rounded p-3 w-56">
                      <div className="text-xs font-semibold text-gray-500 mb-1">Select days ({day} stays as source)</div>
                      {DAYS.filter((d) => d.code !== day).map((d) => (
                        <label key={d.code} className="flex items-center gap-2 text-xs py-1">
                          <input type="checkbox" checked={copyTargets.has(d.code)} onChange={() => toggleCopyTarget(d.code)} />
                          {d.label}
                        </label>
                      ))}
                      <button onClick={copyToOtherDays} className="mt-2 w-full text-xs bg-[#337ab7] text-white rounded py-1">Copy</button>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button onClick={openSectionsPanel} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded text-gray-600 hover:bg-gray-100">
                    <Copy size={13} /> Copy to Classes/Sections
                  </button>
                  {showSectionsPanel && (
                    <div className="absolute right-0 z-40 bg-white border shadow rounded p-3 w-64 max-h-96 overflow-y-auto">
                      <div className="text-xs font-semibold text-gray-500 mb-1">Copies the full week (all days built so far). Times &amp; periods only — subject/teacher not included.</div>
                      {coverage.filter((c) => !c.has_structure).length === 0 && (
                        <div className="text-xs text-gray-400 py-1">All sections already have a timetable.</div>
                      )}
                      {coverage.filter((c) => !c.has_structure).map((c) => {
                        const key = `${c.class_id}:${c.section_id}`;
                        return (
                          <label key={key} className="flex items-center gap-2 text-xs py-1">
                            <input type="checkbox" checked={copySectionTargets.has(key)}
                              onChange={() => setCopySectionTargets((prev) => {
                                const next = new Set(prev);
                                next.has(key) ? next.delete(key) : next.add(key);
                                return next;
                              })} />
                            {c.class_name} - {c.section_name}
                          </label>
                        );
                      })}
                      <button onClick={copyToOtherSections} className="mt-2 w-full text-xs bg-[#337ab7] text-white rounded py-1">Copy</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {isWorkingDay && (
            <div className="border rounded overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-2 text-left w-12">#</th>
                    <th className="px-2 py-2 text-left w-28">Type</th>
                    <th className="px-2 py-2 text-left w-32">Label</th>
                    <th className="px-2 py-2 text-left w-24">Start</th>
                    <th className="px-2 py-2 text-left w-24">End</th>
                    <th className="px-2 py-2 text-left">Subject</th>
                    <th className="px-2 py-2 text-left">Teacher</th>
                    <th className="px-2 py-2 text-left w-24">Room</th>
                    {canWrite && <th className="px-2 py-2 w-10"></th>}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>}
                  {!loading && slots.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">No slots defined for {DAYS.find(d => d.code === day)?.label} yet.</td></tr>
                  )}
                  {slots.map((s, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-2 py-1">{s.slot_order}</td>
                      <td className="px-2 py-1">
                        <select className="border rounded px-1 py-1 text-xs w-full" value={s.slot_type} disabled={!canWrite}
                          onChange={(e) => updateSlot(idx, { slot_type: e.target.value as SlotType, subject_id: null, teacher_id: null })}>
                          {SLOT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input className="border rounded px-1 py-1 text-xs w-full" value={s.label} disabled={!canWrite}
                          placeholder={s.slot_type === "PERIOD" ? `Period ${s.slot_order}` : s.slot_type}
                          onChange={(e) => updateSlot(idx, { label: e.target.value })} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="time" lang="en-GB" className="border rounded px-1 py-1 text-xs w-full" value={s.start_time} disabled={!canWrite}
                          onChange={(e) => updateSlot(idx, { start_time: e.target.value })} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="time" lang="en-GB" className="border rounded px-1 py-1 text-xs w-full" value={s.end_time} disabled={!canWrite}
                          onChange={(e) => updateSlot(idx, { end_time: e.target.value })} />
                      </td>
                      <td className="px-2 py-1">
                        {s.slot_type === "PERIOD" ? (
                          <select className="border rounded px-1 py-1 text-xs w-full" value={s.subject_id ?? ""} disabled={!canWrite}
                            onChange={(e) => onSubjectChange(idx, e.target.value ? Number(e.target.value) : null)}>
                            <option value="">-- Subject --</option>
                            {ctx.subjects.map((sub) => <option key={sub.id} value={sub.id}>{sub.subject_name}</option>)}
                          </select>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-2 py-1">
  {s.slot_type === "PERIOD" ? (
    <span className="text-xs text-gray-700">
      {s.teacher_id
        ? (ctx.teachers.find((t) => t.id === s.teacher_id)?.name ?? "Unassigned")
        : <span className="text-amber-600">No teacher assigned</span>}
    </span>
  ) : <span className="text-gray-300 text-xs">—</span>}
</td>
                      <td className="px-2 py-1">
                        <input className="border rounded px-1 py-1 text-xs w-full" value={s.room} disabled={!canWrite}
                          onChange={(e) => updateSlot(idx, { room: e.target.value })} />
                      </td>
                      {canWrite && (
                        <td className="px-2 py-1 text-center">
                          <button onClick={() => removeSlot(idx)} className="text-red-500 hover:text-red-700">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {canWrite && (
                <div className="p-3 bg-gray-50 flex flex-wrap items-center gap-3">
                  <button onClick={addSlot} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded text-gray-600 hover:bg-gray-100">
                    <Plus size={13} /> Add Slot
                  </button>
                  <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 bg-[#337ab7] hover:bg-[#286090] text-white text-sm rounded disabled:opacity-50">
                    {saving ? "Saving..." : "Save Day"}
                  </button>
                  {message && <span className="text-sm text-gray-600 flex items-center gap-1"><Check size={14} className="text-green-600" />{message}</span>}
                </div>
              )}

              {conflicts.length > 0 && (
                <div className="m-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  <div className="font-medium mb-1 flex items-center gap-1"><X size={14} /> Teacher scheduling conflict:</div>
                  <ul className="list-disc pl-5">
                    {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                  <button onClick={() => save(true)} className="mt-2 text-xs underline text-red-700">Save anyway</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------
   Sub-view: View Timetable (read-only weekly grid)
   ------------------------------------------------------------------------- */

const ViewTimetableView: React.FC = () => {
  const ctx = useTimetableContext();
  const [days, setDays] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  const ready = ctx.branchId && ctx.classId && ctx.sectionId && ctx.yearName;

  useEffect(() => {
    if (!ready) { setDays({}); return; }
    setLoading(true);
    api.get("/timetable/class-timetable", {
      params: { class_id: ctx.classId, section_id: ctx.sectionId, branch_id: ctx.branchId, academic_year: ctx.yearName },
    }).then((res) => setDays(res.data.days || {}))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [ready, ctx.classId, ctx.sectionId, ctx.branchId, ctx.yearName]);

  const maxRows = Math.max(0, ...DAYS.map((d) => days[d.code]?.slots?.length || 0));
  const rowIndexes = Array.from({ length: maxRows }, (_, i) => i);

  const className = ctx.classes.find((c) => String(c.id) === String(ctx.classId))?.name || "";
  const sectionName = ctx.sections.find((s) => String(s.id) === String(ctx.sectionId))?.name || "";
  const branchName = ctx.branches.find((b) => String(b.id) === String(ctx.branchId))?.branch_name || "";

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #timetable-print-area, #timetable-print-area * { visibility: visible; }
          #timetable-print-area { position: absolute; top: 0; left: 0; width: 100%; }
          @page { size: landscape; margin: 10mm; }
        }
      `}</style>

      <ContextBar
        branches={ctx.branches} classes={ctx.classes} sections={ctx.sections} academicYears={ctx.academicYears}
        branchId={ctx.branchId} classId={ctx.classId} sectionId={ctx.sectionId} yearId={ctx.yearName}
        onBranch={ctx.setBranchId} onClass={ctx.setClassId} onSection={ctx.setSectionId} onYear={ctx.setYearName}
      />

      {!ready && <div className="text-gray-400 text-sm py-10 text-center">Select Branch, Class, Section and Academic Year to continue.</div>}
      {loading && <div className="text-gray-400 text-sm py-10 text-center">Loading timetable...</div>}

      {ready && !loading && maxRows === 0 && (
        <div className="text-gray-400 text-sm py-10 text-center">No timetable built for this class/section yet.</div>
      )}

      {ready && !loading && maxRows > 0 && (
        <div id="timetable-print-area">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-600">
              <span className="font-semibold">{branchName}</span> · Class {className} - {sectionName} · {ctx.yearName}
            </div>
            <button onClick={() => window.print()} className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded text-gray-600 hover:bg-gray-100 print:hidden">
              <Printer size={13} /> Print
            </button>
          </div>

          <div className="border rounded overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-2 py-2 text-left w-10 border">#</th>
                  {DAYS.map((d) => (
                    <th key={d.code} className="px-2 py-2 text-left border">
                      {d.label}
                      {days[d.code] && !days[d.code].is_working_day && (
                        <span className="block text-[10px] font-normal text-gray-400">Non-working</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowIndexes.map((rowIdx) => (
                  <tr key={rowIdx} className="border-t">
                    <td className="px-2 py-1 border text-center text-gray-400">{rowIdx + 1}</td>
                    {DAYS.map((d) => {
                      const dayData = days[d.code];
                      const s = dayData?.is_working_day ? dayData?.slots?.[rowIdx] : null;
                      if (!s) {
                        return <td key={d.code} className="px-2 py-1 border text-gray-300">—</td>;
                      }
                      return (
                        <td key={d.code} className={`px-2 py-1 border align-top ${s.slot_type !== "PERIOD" ? "bg-yellow-50" : ""}`}>
                          <div className="text-[10px] text-gray-400">{formatTime12h(s.start_time)} - {formatTime12h(s.end_time)}</div>
                          {s.slot_type === "PERIOD" ? (
                            <>
                              <div className="font-medium">{s.subject_name || "—"}</div>
                              <div className="text-gray-500">{s.teacher_name || "No teacher"}{s.room ? ` · ${s.room}` : ""}</div>
                            </>
                          ) : (
                            <div className="font-medium">{s.slot_type}{s.label ? ` · ${s.label}` : ""}</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------
   Sub-view: My Timetable (teacher's own schedule)
   ------------------------------------------------------------------------- */

const MyTimetableView: React.FC = () => {
  const [academicYears, setAcademicYears] = useState<Option[]>([]);
  const [yearName, setYearName] = useState("");
  const [schedule, setSchedule] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const storedYear = localStorage.getItem("academicYear") || "";
      const res = await api.get("/org/academic-years");
      const list = res.data.academic_years || res.data || [];
      setAcademicYears(list.map((y: any) => ({ id: y.id, name: y.name })));
      setYearName(storedYear || (list[0]?.name ?? ""));
    })();
  }, []);

  useEffect(() => {
    if (!yearName) return;
    setLoading(true);
    setError(null);
    api.get("/timetable/teacher-timetable/me", { params: { academic_year: yearName } })
      .then((res) => setSchedule(res.data.schedule || {}))
      .catch((e) => setError(e?.response?.data?.error || "Could not load your timetable."))
      .finally(() => setLoading(false));
  }, [yearName]);

  return (
    <div>
      <div className="mb-4 max-w-xs">
        <label className="block text-xs font-medium text-gray-500 mb-1">Academic Year</label>
        <select className="border rounded px-3 py-2 text-sm w-full" value={yearName} onChange={(e) => setYearName(e.target.value)}>
          {academicYears.map((y) => <option key={y.id} value={y.name}>{y.name}</option>)}
        </select>
      </div>

      {loading && <div className="text-gray-400 text-sm py-10 text-center">Loading...</div>}
      {error && <div className="text-red-500 text-sm py-10 text-center">{error}</div>}

      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {DAYS.map((d) => (
            <div key={d.code} className="border rounded">
              <div className="bg-gray-100 px-3 py-2 font-medium text-sm">{d.label}</div>
              {(!schedule[d.code] || schedule[d.code].length === 0) && (
                <div className="px-3 py-4 text-xs text-gray-400">No periods scheduled.</div>
              )}
              {schedule[d.code]?.map((p, i) => (
                <div key={i} className="px-3 py-2 text-xs border-t">
                  <div className="flex justify-between text-gray-500">
                    <span>{formatTime12h(p.start_time)} - {formatTime12h(p.end_time)}</span>
                    <span>{p.class_name} {p.section_name}</span>
                  </div>
                  <div className="font-medium mt-0.5">{p.subject_name}{p.room ? ` · ${p.room}` : ""}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------
   Main entry: Timetable
   ------------------------------------------------------------------------- */

type TimetableView = "HOME" | "SUBJECT_TEACHER" | "BUILDER" | "VIEW" | "MY_TIMETABLE";

const Timetable: React.FC = () => {
  const { hasPermission } = useAuth();
  const [view, setView] = useState<TimetableView>("HOME");

  const canSubjectTeacher = hasPermission("academics.timetable.subject-teacher-assignment", "read");
  const canSubjectTeacherWrite = hasPermission("academics.timetable.subject-teacher-assignment", "write");
  const canBuilder = hasPermission("academics.timetable.class-timetable", "read") || hasPermission("academics.timetable.period-structure", "read");
  const canBuilderWrite = hasPermission("academics.timetable.period-structure", "write");
  const canView = hasPermission("academics.timetable.view-timetable", "read");
  const canMyTimetable = hasPermission("academics.timetable.teacher-timetable", "read");

  const items = [
    ...(canSubjectTeacher ? [{ label: "Subject – Teacher Assignment", onClick: () => setView("SUBJECT_TEACHER") }] : []),
    ...(canBuilder ? [{ label: "Timetable Builder", onClick: () => setView("BUILDER") }] : []),
    ...(canView ? [{ label: "View Timetable", onClick: () => setView("VIEW") }] : []),
    ...(canMyTimetable ? [{ label: "My Timetable", onClick: () => setView("MY_TIMETABLE") }] : []),
  ];

  const titleFor = (v: TimetableView) => ({
    HOME: "TIMETABLE", SUBJECT_TEACHER: "Subject – Teacher Assignment", BUILDER: "Timetable Builder",
    VIEW: "View Timetable", MY_TIMETABLE: "My Timetable",
  }[v]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="flex-1 flex flex-col">
        <div className="bg-white flex-1 flex flex-col">
          {view === "HOME" && (
            <div className="p-4 flex flex-wrap justify-between border-b">
              <h1 className="flex items-center gap-2 text-[#337ab7] font-semibold">
                <CalendarClock className="text-gray-400" />
                TIMETABLE
              </h1>
              <div className="flex gap-2 flex-wrap">
                {items.length > 0 && <NavDropdown title="Timetable Actions" items={items} />}
              </div>
            </div>
          )}

          <div className="flex-1 bg-slate-50 p-6">
            {view !== "HOME" && (
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setView("HOME")} className="text-sm text-gray-600 hover:text-[#337ab7] flex items-center gap-1">
                  ← Back to Menu
                </button>
                <h2 className="text-sm font-semibold text-gray-700">{titleFor(view)}</h2>
              </div>
            )}

            {view === "HOME" && (
              <div className="flex flex-col items-center justify-center text-gray-400 h-full py-20">
                <CalendarClock size={48} className="mb-2 opacity-20" />
                <p>Select an action from the menu above to manage timetables.</p>
              </div>
            )}

            {view === "SUBJECT_TEACHER" && <SubjectTeacherAssignmentView canWrite={canSubjectTeacherWrite} />}
            {view === "BUILDER" && <TimetableBuilderView canWrite={canBuilderWrite} />}
            {view === "VIEW" && <ViewTimetableView />}
            {view === "MY_TIMETABLE" && <MyTimetableView />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Timetable;
