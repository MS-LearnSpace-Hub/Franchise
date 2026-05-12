import React, { useState } from "react";
import { GraduationCap, ChevronDown } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import SubjectMaster from "./SubjectMaster";
import ClassSubjectAssignment from "./ClassSubjectAssignment";
import ClassTestAssignment from "./ClassTestAssignment";
import AssignStudentSubjects from "./AssignStudentSubjects";
import TestTypeManager from "./TestTypeManager";
import AssignSubjectTests from "./AssignSubjectTests";
import AssignStudentTests from "./AssignStudentTests";
import GradeScaleManager from "./GradeScaleManager";
import MarksEntry from "./MarksEntry";
import MarksUpload from "./MarksUpload";
import StudentReportCard from "./StudentReportCard";
import SetExamAttendance from "./SetExamAttendance";
import MarksEntryAllSubjects from "./MarksEntryAllSubjects";


// --- Types ---
type AcademicView =
    | "HOME"
    | "SUBJECTS"
    | "ASSIGN_STUDENT_SUBJECTS"
    | "ASSIGN_SUBJECTS"
    | "SUBJECTWISE_MARKS"
    | "CREATE_TEST"
    | "ASSIGN_SUBJECT_TESTS"
    | "ASSIGN_STUDENT_TESTS"
    | "GRADING"
    | "ADD_EXAM"
    | "MARKS_ENTRY_SUBJECT"
    | "MARKS_ENTRY_UPLOAD"
    | "MARKS_ENTRY_ALL_SUBJECTS"
    | "ACADEMIC_SETTING"
    | "STUDENT_REPORT_CARD"
    | "SET_EXAM_ATTENDANCE";

interface DropdownItem {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
}

interface DropdownProps {
    title: string;
    items: DropdownItem[];
}

// --- Reusable Dropdown ---
const NavDropdown: React.FC<DropdownProps> = ({ title, items }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div
            className="relative"
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
        >
            <button className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-[#337ab7] hover:bg-[#286090] rounded">
                {title} <ChevronDown size={14} />
            </button>

            {isOpen && (
                <div className="absolute right-0 z-50 w-64 bg-white border shadow rounded-b py-2">
                    {items.map((item, idx) => (
                        <button
                            key={idx}
                            onClick={item.disabled ? undefined : item.onClick}
                            disabled={item.disabled}
                            className={`block w-full text-left px-4 py-2 text-sm
                ${item.disabled
                                    ? "text-gray-400 cursor-not-allowed"
                                    : "text-gray-700 hover:bg-gray-100 hover:text-[#337ab7]"
                                }
              `}
                        >
                            {item.label}
                            {item.disabled && (
                                <span className="ml-2 text-xs">(Coming soon)</span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- Main ERP Component ---
const Academics: React.FC = () => {
    const [view, setView] = useState<AcademicView>("HOME");
    const { hasPermission } = useAuth();

    const canSubjectMaster = hasPermission('academics.academic.subject-master', 'read');
    const canClassSubjects = hasPermission('academics.academic.class-subject-assignment', 'read');
    const canStudentSubjects = hasPermission('academics.academic.assign-student-subjects', 'read');
    const canSubjectTests = hasPermission('academics.academic.assign-subject-tests', 'read');
    const canStudentTests = hasPermission('academics.academic.assign-student-tests', 'read');
    const canTestType = hasPermission('academics.academic.test-type-manager', 'read');
    const canClassTest = hasPermission('academics.academic.class-test-assignment', 'read');
    const canGrading = hasPermission('academics.academic.grade-scale-manager', 'read');
    const canMarksEntry = hasPermission('academics.academic.marks-entry', 'read');
    const canMarksEntryAll = hasPermission('academics.academic.marks-entry-all-subjects', 'read');
    const canMarksUpload = hasPermission('academics.academic.marks-upload', 'read');
    const canExamAttendance = hasPermission('attendance.attendance.set-exam-attendance', 'read');
    const canReportCard = hasPermission('home.dashboard.student-report-card', 'read');

    const enterMarksItems = [
        ...(canMarksEntry ? [{ label: "Subject Wise", onClick: () => setView("MARKS_ENTRY_SUBJECT") }] : []),
        ...(canMarksEntryAll ? [{ label: "Enter All Subject Marks", onClick: () => setView("MARKS_ENTRY_ALL_SUBJECTS") }] : []),
        ...(canMarksUpload ? [{ label: "Upload Exam Marks", onClick: () => setView("MARKS_ENTRY_UPLOAD") }] : []),
    ];

    const academicActionItems = [
        ...(canClassSubjects ? [{ label: "Assign Class Subjects", onClick: () => setView("ASSIGN_SUBJECTS") }] : []),
        ...(canStudentSubjects ? [{ label: "Assign Student Subjects", onClick: () => setView("ASSIGN_STUDENT_SUBJECTS") }] : []),
        ...(canSubjectTests ? [{ label: "Assign Subject Tests", onClick: () => setView("ASSIGN_SUBJECT_TESTS") }] : []),
        ...(canStudentTests ? [{ label: "Assign Test to Students", onClick: () => setView("ASSIGN_STUDENT_TESTS") }] : []),
        ...(canExamAttendance ? [{ label: "Set Exam Attendance", onClick: () => setView("SET_EXAM_ATTENDANCE") }] : []),
    ];

    const mastersItems = [
        ...(canSubjectMaster ? [{ label: "Subjects", onClick: () => setView("SUBJECTS") }] : []),
        ...(canTestType ? [{ label: "Create Test", onClick: () => setView("CREATE_TEST") }] : []),
        ...(canClassTest ? [{ label: "Add Exam", onClick: () => setView("ADD_EXAM") }] : []),
        ...(canGrading ? [{ label: "Grading", onClick: () => setView("GRADING") }] : []),
    ];

    const reportsItems = [
        ...(canReportCard ? [{ label: "Student Report Card", onClick: () => setView("STUDENT_REPORT_CARD") }] : []),
    ];

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <div className="flex-1 flex flex-col">
                <div className="bg-white flex-1 flex flex-col">

                    {/* Header - Only show if NO sub-view is selected (HOME) */}
                    {view === "HOME" && (
                        <div className="p-4 flex flex-wrap justify-between border-b">
                            <h1 className="flex items-center gap-2 text-[#337ab7] font-semibold">
                                <GraduationCap className="text-gray-400" />
                                ACADEMICS MANAGEMENT
                            </h1>

                            <div className="flex gap-2 flex-wrap">
                                {enterMarksItems.length > 0 && (
                                    <NavDropdown title="Enter Marks" items={enterMarksItems} />
                                )}
                                {academicActionItems.length > 0 && (
                                    <NavDropdown title="Academic Actions" items={academicActionItems} />
                                )}
                                {mastersItems.length > 0 && (
                                    <NavDropdown title="Masters" items={mastersItems} />
                                )}
                                {reportsItems.length > 0 && (
                                    <NavDropdown title="Reports" items={reportsItems} />
                                )}
                            </div>
                        </div>
                    )}

                    {/* Content Area */}
                    <div className={`flex-1 bg-slate-50 ${view === 'ADD_EXAM' ? 'p-2' : 'p-6'}`}>

                        {view !== "HOME" && (
                            <button
                                onClick={() => setView("HOME")}
                                className="no-print mb-4 text-sm text-gray-600 hover:text-[#337ab7] flex items-center gap-1"
                            >
                                ← Back to Menu
                            </button>
                        )}

                        {view === "HOME" && (
                            <div className="flex flex-col items-center justify-center text-gray-400 h-full py-20">
                                <GraduationCap size={48} className="mb-2 opacity-20" />
                                <p>Select an action from the menu above to manage academic data.</p>
                            </div>
                        )}

                        {view === "SUBJECTS" && <SubjectMaster />}
                        {view === "ASSIGN_SUBJECTS" && <ClassSubjectAssignment />}
                        {view === "ASSIGN_STUDENT_SUBJECTS" && <AssignStudentSubjects />}
                        {view === "ASSIGN_SUBJECT_TESTS" && <AssignSubjectTests />}
                        {view === "ASSIGN_STUDENT_TESTS" && <AssignStudentTests />}
                        {view === "CREATE_TEST" && <TestTypeManager />}
                        {view === "ADD_EXAM" && <ClassTestAssignment />}
                        {view === "GRADING" && <GradeScaleManager />}
                        {view === "MARKS_ENTRY_SUBJECT" && <MarksEntry />}
                        {view === "MARKS_ENTRY_UPLOAD" && <MarksUpload />}
                        {view === "STUDENT_REPORT_CARD" && <StudentReportCard />}
                        {view === "SET_EXAM_ATTENDANCE" && <SetExamAttendance />}
                        {view === "MARKS_ENTRY_ALL_SUBJECTS" && <MarksEntryAllSubjects />}




                        {!["HOME", "SUBJECTS", "ASSIGN_SUBJECTS", "ASSIGN_STUDENT_SUBJECTS"].includes(view) && (
                            <div className="text-gray-500">
                                {/*This module will be enabled soon.*/}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};

export default Academics;
