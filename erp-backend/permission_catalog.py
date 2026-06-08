ACTION_KEYS = ("read", "write", "append", "delete")


def permission(dashboard: str, module: str, component: str, code: str, description: str | None = None) -> dict[str, str]:
    """
    Create a permission metadata dictionary.
    
    Args:
        dashboard: Dashboard category name
        module: Module name
        component: Component name
        code: Unique permission code (dot-separated)
        description: Human-readable description (defaults to "Access {component}")
    
    Returns:
        Dictionary containing permission metadata
    """
    return {
        "dashboard": dashboard,
        "module": module,
        "component": component,
        "code": code,
        "description": description or f"Access {component}",
    }


PERMISSION_CATALOG = [
    permission("Home", "Dashboard", "Dashboard", "home.dashboard.dashboard", "View dashboard summary"),
    permission("Home", "Dashboard", "Profile", "home.dashboard.profile", "View and update own profile"),
    permission("Home", "Dashboard", "Report Card", "home.dashboard.report-card", "View report card dashboard"),
    permission("Home", "Dashboard", "Student Report Card", "home.dashboard.student-report-card", "View student report cards"),

    permission("Administration", "Student", "Student Administration", "administration.student.student-administration"),
    permission("Administration", "Student", "Search Student", "administration.student.search-student"),
    permission("Administration", "Student", "Create Student", "administration.student.create-student"),
    permission("Administration", "Student", "Update Student Details", "administration.student.update-student-details"),
    permission("Administration", "Student", "Change Section", "administration.student.change-section"),
    permission("Administration", "Student", "Promote Students", "administration.student.promote-students"),
    permission("Administration", "Student", "Demote Students", "administration.student.demote-students"),
    permission("Administration", "Student", "Make Student Inactive", "administration.student.make-student-inactive"),
    permission("Administration", "Student", "Import Student Data", "administration.student.import-student-data"),
    permission("Administration", "Student", "Student Concession", "administration.student.student-concession"),
    permission("Administration", "Student", "Student Document Management", "administration.student.student-document-management"),

    permission("Fees", "Fee", "Fee Dashboard", "fees.fee.fee-dashboard"),
    permission("Fees", "Fee", "Take Fee", "fees.fee.take-fee"),
    permission("Fees", "Fee", "Fee Receipt", "fees.fee.fee-receipt"),
    permission("Fees", "Fee", "Fee Type", "fees.fee.fee-type"),
    permission("Fees", "Fee", "Class Fee Structure", "fees.fee.class-fee-structure"),
    permission("Fees", "Fee", "Assign Special Fee", "fees.fee.assign-special-fee"),
    permission("Fees", "Fee", "Update Student Fee Structure", "fees.fee.update-student-fee-structure"),
    permission("Fees", "Fee", "Update Rebate Date", "fees.fee.update-rebate-date"),
    permission("Fees", "Fee", "Fee Installments", "fees.fee.fee-installments"),
    permission("Fees", "Fee", "Concession Master", "fees.fee.concession-master"),
    permission("Fees", "Fee", "Fee Reports", "fees.fee.fee-reports"),
    permission("Fees", "Fee", "Fee Report Components", "fees.fee.fee-report-components"),
    permission("Fees", "Fee", "Petty Cash", "fees.fee.petty-cash"),
    permission("Fees", "Fee", "Petty Cash Report", "fees.fee.petty-cash-report"),
    permission("Fees", "Fee", "Reports", "fees.fee.reports"),

    permission("Academics", "Academic", "Academic Management", "academics.academic.academic-management"),
    permission("Academics", "Academic", "Academics", "academics.academic.academics"),
    permission("Academics", "Academic", "Subject Master", "academics.academic.subject-master"),
    permission("Academics", "Academic", "Class Subject Assignment", "academics.academic.class-subject-assignment"),
    permission("Academics", "Academic", "Assign Student Subjects", "academics.academic.assign-student-subjects"),
    permission("Academics", "Academic", "Assign Subject Tests", "academics.academic.assign-subject-tests"),
    permission("Academics", "Academic", "Assign Student Tests", "academics.academic.assign-student-tests"),
    permission("Academics", "Academic", "Class Test Assignment", "academics.academic.class-test-assignment"),
    permission("Academics", "Academic", "Test Type Manager", "academics.academic.test-type-manager"),
    permission("Academics", "Academic", "Grade Scale Manager", "academics.academic.grade-scale-manager"),
    permission("Academics", "Academic", "Marks Entry", "academics.academic.marks-entry"),
    permission("Academics", "Academic", "Marks Entry All Subjects", "academics.academic.marks-entry-all-subjects"),
    permission("Academics", "Academic", "Marks Upload", "academics.academic.marks-upload"),

    permission("Attendance", "Attendance", "Student Attendance", "attendance.attendance.student-attendance"),
    permission("Attendance", "Attendance", "Set Exam Attendance", "attendance.attendance.set-exam-attendance"),

    permission("Setup", "School Setup", "Setup School", "setup.school-setup.setup-school"),
    permission("Setup", "School Setup", "Classes Management", "setup.school-setup.classes-management"),
    permission("Setup", "School Setup", "Class Summary", "setup.school-setup.class-summary"),
    permission("Setup", "School Setup", "Configuration", "setup.school-setup.configuration"),

    permission("Documents", "Documents", "Document Administration", "documents.documents.document-administration"),
    permission("Documents", "Documents", "Document Management", "documents.documents.document-management"),

    permission("System", "Users", "User Management", "system.users.user-management"),
    permission("System", "Roles", "Role Permissions", "system.roles.role-permissions"),
    permission("System", "Franchise", "Franchise Management", "system.franchise.franchise-management"),
    permission("System", "School", "School Management", "system.school.school-management"),
]

LEGACY_PERMISSION_ALIASES = {
    "system.school.management": "system.school.school-management",
    "home.dashboard.main": "home.dashboard.dashboard",
    "academics.academic.management": "academics.academic.academic-management",
    "academics.attendance.student": "attendance.attendance.student-attendance",
    "fees.setup.masters": "fees.fee.fee-type",
    "fees.collections.receipt-entry": "fees.fee.take-fee",
    "fees.reports.fee-reports": "fees.fee.fee-reports",
    "administration.students.management": "administration.student.student-administration",
    "administration.documents.management": "documents.documents.document-management",
    "setup.school.setup": "setup.school-setup.setup-school",
    "system.users.management": "system.users.user-management",
    "system.roles.permissions": "system.roles.role-permissions",
    "system.franchise.management": "system.franchise.franchise-management",
}


def full_action_permission():
    return {f"can_{action}": True for action in ACTION_KEYS}
