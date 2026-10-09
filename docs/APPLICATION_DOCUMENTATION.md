# MS LearnSpace ERP — Complete Enterprise Application Documentation

> End-to-end documentation for End Users, Administrators, Super Administrators, Department Heads, Support Teams, Auditors, Developers, and Management.

---

## APPLICATION DETAILS

| Attribute | Value |
|-----------|-------|
| **Application Name** | MS LearnSpace ERP (repository: `MS-LearnSpace-Hub/Franchise`) |
| **Application Type** | Multi-tenant SaaS Web Application (School ERP / Franchise Management) |
| **Industry** | Education (K-12 schools, academies, and Hifz/Deeniyath institutions) |
| **Architecture** | React + TypeScript SPA frontend, Flask (Python) REST API backend, MySQL database, JWT auth, OCI Object Storage, biometric SyncAgent |
| **Deployment Model** | Single deployable Flask app serving a compiled React bundle; multi-tenant by `school_id` / `branch_id` scoping |

### Modules

1. **Home / Dashboard** — Dashboard summary, Profile, Report Card, Student Report Card
2. **Administration (Student)** — Search / Create / Update / Change Section / Promote / Demote / Make Inactive / Import / Concession / Document Management
3. **Fees** — Fee Dashboard, Take Fee, Fee Receipt, Fee Type, Class Fee Structure, Special Fee, Fee Structure/Rebate updates, Installments, Concession Master, Fee Reports, Deleted Receipts, Concession Report, Adjust Fee Report, **Petty Cash** (Vouchers, Fund Allocation, Monthly Expenses, Report, Approval)
4. **Academics** — Subject Master, Class Subject Assignment, Student Subject/Test assignment, Class Test Assignment, Test Type Manager, Grade Scale Manager, Marks Entry (single / all subjects / upload)
5. **Attendance** — Student Attendance, Set Exam Attendance
6. **Setup (School Setup)** — Setup School, Classes Management, Class Summary, Configuration (week-off, holidays)
7. **Documents** — Document Administration (document types), Document Management (student document upload)
8. **System** — User Management, Role Permissions (RBAC), Franchise Management, School Management
9. **HR & Staff** — Staff Master, Staff Directory, Staff Profile, Staff Categories, Staff Statuses, Departments, Designations, Shifts, Biometric Devices, Staff Biometric Mapping, Attendance Summary, Punch Log
10. **SMS** — SMS Center (attendance, fee receipt, fee due, announcements)

### User Roles

**System roles (hard-coded string roles on `users.role`):** `SuperAdmin`, `Admin`, `User`.

**RBAC roles (`roles` table, fully configurable per-permission):** e.g. `Academic Coordinator`, `Finance Manager`, `Class Teacher`, `Branch Administrator`, `HR`. Roles map to granular permissions via `role_permissions` with four action flags — `can_read`, `can_write`, `can_append`, `can_delete`.

### Brief Description

MS LearnSpace ERP is a multi-tenant School Management ERP used by educational franchises to run academic, financial, and HR operations across multiple schools (tenants) and branches (campuses). It manages the full student lifecycle (admission → promotion → grading → fee collection), staff HR and biometric attendance, fee billing and reconciliation, petty-cash workflows with approvals, and role-based access control. Every write is captured in a centralized audit trail, and all business data is automatically isolated by `school_id` and `branch_id`.

---

# TABLE OF CONTENTS

1. [Document Control](#1-document-control)
2. [Application Overview](#2-application-overview)
3. [Business Process Overview](#3-business-process-overview)
4. [Role-Based Access Matrix](#4-role-based-access-matrix)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [User Management](#6-user-management)
7. [Admin Guide](#7-admin-guide)
8. [End User Guide](#8-end-user-guide)
9. [Module-Wise Documentation](#9-module-wise-documentation)
10. [Screen-Wise Documentation](#10-screen-wise-documentation)
11. [Master Data Documentation](#11-master-data-documentation)
12. [Workflow Documentation](#12-workflow-documentation)
13. [Approval Matrix](#13-approval-matrix)
14. [Reports Documentation](#14-reports-documentation)
15. [Dashboard Documentation](#15-dashboard-documentation)
16. [Notification Documentation](#16-notification-documentation)
17. [Audit Trail](#17-audit-trail)
18. [Security Documentation](#18-security-documentation)
19. [API Documentation](#19-api-documentation)
20. [Database Overview](#20-database-overview)
21. [Error Handling Guide](#21-error-handling-guide)
22. [Troubleshooting Guide](#22-troubleshooting-guide)
23. [FAQ](#23-faq)
24. [Training Guide](#24-training-guide)
25. [Go-Live Checklist](#25-go-live-checklist)
26. [Support Guide](#26-support-guide)
27. [Appendices](#27-appendices)

---

# 1. DOCUMENT CONTROL

| Field | Value |
|-------|-------|
| **Document Title** | MS LearnSpace ERP — Complete Enterprise Application Documentation |
| **Document Version** | 1.0 |
| **Release Date** | 2026-01-18 |
| **Status** | Baseline / Released |
| **Classification** | Internal — Confidential |
| **Author** | Product & Engineering (Business Analyst / Solution Architect / Technical Writer) |
| **Reviewer** | QA Lead, Security Consultant |
| **Approver** | Product Manager / Management |
| **Owner** | MS LearnSpace Product Team |

### 1.1 Revision History

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 0.1 | 2026-01-05 | Technical Writer | Initial skeleton and section outline |
| 0.5 | 2026-01-12 | BA + Architect | Module, RBAC, and API content drafted |
| 1.0 | 2026-01-18 | Product Team | Full baseline covering all 27 sections; reviewed and approved |

### 1.2 Change Log

| Change ID | Area | Change Summary | Version |
|-----------|------|----------------|---------|
| CL-001 | RBAC | Documented four-action permission model (`read/write/append/delete`) and permission catalog | 1.0 |
| CL-002 | Multi-tenancy | Documented automatic `school_id` / `branch_id` query scoping | 1.0 |
| CL-003 | HR | Documented staff code / employee id sequence generation and biometric sync | 1.0 |
| CL-004 | Fees | Documented petty-cash approval workflow and fee receipt lifecycle | 1.0 |

### 1.3 Distribution List

| Audience | Purpose |
|----------|---------|
| End Users | Day-to-day operational usage |
| Administrators / Super Administrators | Configuration and governance |
| Department Heads | Process ownership and approvals |
| Support (L1/L2/L3) | Incident resolution |
| Auditors | Compliance and audit trail verification |
| Developers | Integration, maintenance, extension |
| Management | Business benefit and adoption tracking |

---

# 2. APPLICATION OVERVIEW

### 2.1 Purpose

MS LearnSpace ERP provides a single, secure, multi-tenant platform to run all administrative, academic, financial, and HR operations of one or more schools operating under a franchise brand. It replaces fragmented spreadsheets and standalone tools with an integrated system that enforces data isolation per school/branch, records a complete audit trail, and applies fine-grained role-based access control.

### 2.2 Scope

**In scope:**
- Organization setup: Schools (tenants), Branches (campuses), Locations, Academic Years
- Student lifecycle: admission, enrollment, section change, promotion/demotion, inactivation, documents
- Academics: subjects, class-subject assignment, test types, class tests, grade scales, marks entry, report cards
- Fees: fee types, class fee structures, installments, concessions, fee collection, receipts, reversals, fee reports
- Petty cash: vouchers, fund allocation, approvals, reports
- HR: staff masters, departments, designations, shifts, categories, statuses
- Attendance: student attendance and staff biometric attendance (device sync, punch logs, summaries)
- Security & governance: users, roles, RBAC permissions, audit logs
- Notifications: SMS (attendance, fee receipt, fee due), email OTP for password reset

**Out of scope (current baseline):** full payroll processing, timetable/scheduling engine, LMS/e-learning content delivery, parent/student self-service portal, native mobile app (attendance source enum reserves `MOBILE`/`WEB` for future use).

### 2.3 Objectives

1. Centralize school operations under strict multi-tenant isolation.
2. Enforce least-privilege access with configurable RBAC.
3. Provide a defensible, immutable audit trail for every data change.
4. Standardize fee collection with reconciliation and approval controls.
5. Automate staff attendance capture from biometric devices.
6. Deliver accurate, exportable operational and financial reports.

### 2.4 Target Audience

End Users (front-office/accounts/teachers), Administrators, Super Administrators, Department Heads, Support Teams, Auditors, Developers, and Management. See Section 1.3.

### 2.5 Key Features

- Multi-tenant (School → Branch → Academic Year) data segregation, enforced automatically at the query layer.
- Granular RBAC: dashboard → module → component permission codes with four action flags.
- Centralized audit logging of every create/update/delete on business tables.
- Full student information system with parent/guardian and previous-school details.
- Fee engine: fee types, class structures, installments, concessions, special fees, receipts, reversals.
- Petty cash management with multi-level approval workflow.
- HR masters with auto-generated staff codes and employee IDs.
- Biometric attendance ingestion via on-premise SyncAgent + staging → attendance engine.
- SMS and email notifications.
- Reports with Excel/PDF export.

### 2.6 Business Benefits

| Benefit | Description |
|---------|-------------|
| Operational efficiency | One system for admissions, fees, academics, HR, attendance |
| Financial control | Structured billing, concession governance, petty-cash approvals, reversal audit |
| Compliance & auditability | Immutable audit logs with old/new values, user, IP, timestamp |
| Security | JWT sessions, hashed passwords, rate limiting, least-privilege RBAC |
| Scalability | Add schools/branches without code changes (master-data driven) |
| Data integrity | Automatic tenant scoping prevents cross-branch data leakage |

### 2.7 Application Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                       CLIENT (Browser)                             │
│   React 18 + TypeScript + Vite + Tailwind (SPA)                   │
│   axios client → sends JWT + X-School-ID / X-Branch-ID /          │
│   X-Academic-Year headers                                         │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTPS (REST/JSON)
┌───────────────▼──────────────────────────────────────────────────┐
│                    APPLICATION (Flask API)                        │
│  create_app() factory │ Blueprints per module                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Middleware / Cross-cutting                                  │ │
│  │  • token_required  (JWT decode, sets g.user_id/school/branch)│ │
│  │  • permission_required (RBAC check)                          │ │
│  │  • Flask-Limiter (rate limiting)                            │ │
│  │  • SQLAlchemy before_compile → automatic tenant scoping     │ │
│  │  • SQLAlchemy before_flush → automatic AuditLog writes      │ │
│  └────────────────────────────────────────────────────────────┘ │
│  Blueprints: auth, students, fees(master/txn), academics,        │
│  classes, attendance, reports, org, rbac, hr, biometric,         │
│  petty-cash, sms, documents, config, grade-scale, marks…         │
└───────────────┬───────────────────────────┬──────────────────────┘
                │ SQLAlchemy ORM             │ OCI SDK / SMTP / HTTP
┌───────────────▼────────────┐   ┌──────────▼──────────────────────┐
│    MySQL Database          │   │ External: OCI Object Storage     │
│  (multi-tenant, audited)   │   │ (docs/photos), SMTP (OTP email), │
│                            │   │ SMS gateway, Biometric SyncAgent │
└────────────────────────────┘   └──────────────────────────────────┘
```

**Technology stack**

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS 3, axios, recharts, jsPDF, xlsx, react-hook-form, yup |
| Backend | Python 3.12, Flask 3.1, Flask-SQLAlchemy 3.1, Flask-Migrate (Alembic), Flask-Limiter, Flask-Caching, PyJWT, Werkzeug security |
| Database | MySQL (PyMySQL / mysql-connector); SQLite fallback for local dev |
| Storage | OCI Object Storage (Instance Principals) for documents/photos |
| Biometric | `pyzk` + on-prem `SyncAgent` (Python service) pushing punches to the API |
| Notifications | SMTP (OTP email), HTTP SMS gateway |

### 2.8 System Flow Overview

```
Setup (School → Branch → Academic Year → Classes/Sections)
   → Masters (Fee Types, Subjects, Grade Scales, Test Types, HR masters)
      → Students (admission / import)
         → Fee assignment & collection  ┐
         → Academics (assign subjects/tests → marks → report cards) ├→ Reports & Dashboards
         → Attendance (student + staff biometric) ┘
   All actions ⇒ RBAC-checked ⇒ Tenant-scoped ⇒ Audit-logged
```

---

# 3. BUSINESS PROCESS OVERVIEW

### 3.1 Current (Legacy / Pre-System) Process

- Student records maintained in spreadsheets per branch; no cross-branch consolidation.
- Fees collected on paper receipts; reconciliation manual and error-prone.
- Concessions granted informally without an approval trail.
- Staff attendance recorded manually from register/biometric exports.
- No centralized audit; limited access control (shared logins).

### 3.2 Future (System-Enabled) Process

- Central multi-tenant database; every record tagged to school/branch/academic year.
- Digital fee receipts with automatic due calculation and reversal audit.
- Concession master with governance and reporting.
- Biometric punches auto-ingested and converted to daily attendance.
- RBAC + audit trail on every action.

### 3.3 Process Flow (High Level)

```
[Onboard School] → [Create Branches] → [Define Academic Year]
      → [Create Classes & Sections] → [Configure Masters]
      → [Admit/Import Students] → [Assign Fees & Subjects]
      → [Daily Ops: Collect Fees / Mark Attendance / Enter Marks]
      → [Approvals: Petty Cash / Concessions] → [Reports & Report Cards]
```

### 3.4 Key Workflow Diagrams (described)

**Student Admission**
```
Front office → Create Student (validate mandatory fields)
  → System generates admission_no via BranchYearSequence
  → Student scoped to school/branch/academic_year
  → Auto-create StudentAcademicRecord (class/section snapshot)
  → Assign class fee structure → student fee rows generated
```

**Fee Collection**
```
Cashier → Search student → Load outstanding installments/fee types
  → Apply concession (if configured) → Enter amount & mode
  → System writes fee_payments rows under one receipt_no
  → Updates studentfees paid/due/status → Print receipt → (optional SMS)
```

**Petty Cash Voucher**
```
Branch user → Create voucher (Payment/Received) → status=Pending
  → Approver reviews → Approve/Reject → status updated + approved_by
  → Approved vouchers roll into petty-cash reports and ledger balance
```

### 3.5 Representative Use Cases

| ID | Actor | Use Case | Outcome |
|----|-------|----------|---------|
| UC-01 | Admin | Onboard a new school + branches | Tenant available for operations |
| UC-02 | Front office | Admit a student | Student created with admission number |
| UC-03 | Academic Coordinator | Configure subjects, tests, grade scale | Grading enabled |
| UC-04 | Teacher | Enter marks | Grades auto-computed via grade scale |
| UC-05 | Cashier | Collect fee | Receipt generated, dues updated |
| UC-06 | Finance Manager | Approve petty cash / review concessions | Controlled spend |
| UC-07 | HR | Create staff, map biometric | Attendance auto-captured |
| UC-08 | Auditor | Review audit trail | Full change history retrievable |

### 3.6 Sample User Stories

- *As a cashier,* I want to collect partial fees so that parents can pay in installments.
- *As an academic coordinator,* I want to define a grade scale so that marks convert to grades automatically.
- *As an admin,* I want to restrict users to their branch so that data stays isolated.
- *As an HR officer,* I want staff codes generated automatically so that IDs are consistent.
- *As an auditor,* I want to see who changed a fee record and when so that I can verify compliance.

### 3.7 Core Business Rules

1. **Tenant isolation:** Non-SuperAdmin users only see data for schools/branches they are granted (`UserSchoolAccess` / `UserBranchAccess`); enforced automatically at the query layer.
2. **SuperAdmin bypass:** SuperAdmin has unlimited cross-tenant access and all permissions.
3. **Uniqueness:** `admission_no` unique globally; fee types unique per `(feetype, branch, academic_year, school_id)`; staff code unique per `(school_id, staff_code)`.
4. **Grade scales** must have continuous, non-overlapping mark ranges; min < max.
5. **Soft-deactivation** preferred over hard delete to preserve audit (students, staff, receipts use active/status flags).
6. **Every write** to an audited table produces an `audit_logs` row with old/new data, user, IP, and timestamp.
7. **Password policy:** minimum 8 characters; stored hashed; legacy plaintext auto-upgraded on next login.

---

# 4. ROLE-BASED ACCESS MATRIX

### 4.1 Permission Model

Access control has two layers:

1. **System role** on `users.role` — one of `SuperAdmin`, `Admin`, `User`. Drives data-scope defaults and legacy behavior.
2. **RBAC role** on `users.role_id` → `roles` → `role_permissions` → `permissions`. Each permission is identified by a dot-notation **code** (`dashboard.module.component`) and grants up to four actions:

| Action flag | Meaning (mapped to UI) |
|-------------|------------------------|
| `can_read` | View / list / open a screen |
| `can_write` | Create AND edit records (create/update) |
| `can_append` | Add-only / import / bulk-append operations |
| `can_delete` | Delete / deactivate / reverse |

> **Approve / Reject / Export / Import / Print / Audit** are not separate DB flags. They are enforced as follows:
> - **Approve/Reject** → require `can_write` (or `can_delete` for reject in some flows) on the relevant component (e.g. `fees.fee.petty-cash-approval`).
> - **Import** → `can_append` / `can_write` on the import component (e.g. `administration.student.import-student-data`).
> - **Export/Print** → available to any role with `can_read` on the reporting/report-card component.
> - **Audit** → gated by system RBAC permissions (`system.roles.role-permissions`) and admin-level access.

**SuperAdmin** short-circuits all checks: `has_permission()` returns `True` for every code/action.

### 4.2 Authorization Matrix (representative)

Legend: **V**=View(read) · **C**=Create · **E**=Edit · **D**=Delete · **A**=Approve · **R**=Reject · **X**=Export · **I**=Import · **P**=Print · **Au**=Audit · ✓=granted by default · ⚙=configurable per role · —=not applicable/none

| Role | Module | Representative Screen | V | C | E | D | A | R | X | I | P | Au |
|------|--------|-----------------------|---|---|---|---|---|---|---|---|---|----|
| **Super Admin** | All | All screens | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Admin** | All (own school) | All within school | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Manager** (e.g. Finance Manager) | Fees | Take Fee, Fee Reports, Petty Cash Approval | ✓ | ✓ | ✓ | ⚙ | ✓ | ✓ | ✓ | ⚙ | ✓ | — |
| **Academic Coordinator** | Academics | Subject/Test/Grade config, Marks | ✓ | ✓ | ✓ | ⚙ | — | — | ✓ | ⚙ | ✓ | — |
| **Class Teacher** (Employee) | Academics/Attendance | Marks Entry, Student Attendance | ✓ | ⚙ | ✓ | — | — | — | ⚙ | — | ✓ | — |
| **HR** | HR & Staff | Staff Master, Attendance Summary | ✓ | ✓ | ✓ | ⚙ | — | — | ✓ | ⚙ | ✓ | — |
| **User** (basic) | Home | Dashboard, Profile, Report Card | ✓ | — | — | — | — | — | ⚙ | — | ✓ | — |
| **Guest** | — | No authenticated access (login required) | — | — | — | — | — | — | — | — | — | — |

> The exact matrix per custom role is defined by an administrator in **Role Permissions** (System → Roles). The table above shows typical grants; every non-SuperAdmin cell marked ⚙ is set per deployment.

### 4.3 Permission Catalog (component codes)

| Dashboard | Module | Component | Permission Code |
|-----------|--------|-----------|-----------------|
| Home | Dashboard | Dashboard | `home.dashboard.dashboard` |
| Home | Dashboard | Profile | `home.dashboard.profile` |
| Home | Dashboard | Report Card | `home.dashboard.report-card` |
| Home | Dashboard | Student Report Card | `home.dashboard.student-report-card` |
| Administration | SMS | SMS Center | `administration.sms.sms-center` |
| Administration | Student | Student Administration | `administration.student.student-administration` |
| Administration | Student | Search Student | `administration.student.search-student` |
| Administration | Student | Create Student | `administration.student.create-student` |
| Administration | Student | Update Student Details | `administration.student.update-student-details` |
| Administration | Student | Change Section | `administration.student.change-section` |
| Administration | Student | Promote Students | `administration.student.promote-students` |
| Administration | Student | Demote Students | `administration.student.demote-students` |
| Administration | Student | Make Student Inactive | `administration.student.make-student-inactive` |
| Administration | Student | Import Student Data | `administration.student.import-student-data` |
| Administration | Student | Student Concession | `administration.student.student-concession` |
| Administration | Student | Student Document Management | `administration.student.student-document-management` |
| Fees | Fee | Fee Dashboard | `fees.fee.fee-dashboard` |
| Fees | Fee | Take Fee | `fees.fee.take-fee` |
| Fees | Fee | Fee Receipt | `fees.fee.fee-receipt` |
| Fees | Fee | Fee Type | `fees.fee.fee-type` |
| Fees | Fee | Class Fee Structure | `fees.fee.class-fee-structure` |
| Fees | Fee | Assign Special Fee | `fees.fee.assign-special-fee` |
| Fees | Fee | Update Student Fee Structure | `fees.fee.update-student-fee-structure` |
| Fees | Fee | Update Rebate Date | `fees.fee.update-rebate-date` |
| Fees | Fee | Fee Installments | `fees.fee.fee-installments` |
| Fees | Fee | Concession Master | `fees.fee.concession-master` |
| Fees | Fee | Fee Reports | `fees.fee.fee-reports` |
| Fees | Fee | Deleted Receipts | `fees.fee.deleted-receipts` |
| Fees | Fee | Fee Concession Report | `fees.fee.fee-concession-report` |
| Fees | Fee | Adjust Fee Report | `fees.fee.adjust-fee-report` |
| Fees | Fee | Petty Cash | `fees.fee.petty-cash` |
| Fees | Fee | Petty Cash Fund Allocation | `fees.fee.petty-cash-fund-allocation` |
| Fees | Fee | Petty Cash Monthly Expenses | `fees.fee.petty-cash-monthly-expenses` |
| Fees | Fee | Petty Cash Report | `fees.fee.petty-cash-report` |
| Fees | Fee | Petty Cash Approval | `fees.fee.petty-cash-approval` |
| Academics | Academic | Academic Management | `academics.academic.academic-management` |
| Academics | Academic | Subject Master | `academics.academic.subject-master` |
| Academics | Academic | Class Subject Assignment | `academics.academic.class-subject-assignment` |
| Academics | Academic | Assign Student Subjects | `academics.academic.assign-student-subjects` |
| Academics | Academic | Assign Subject Tests | `academics.academic.assign-subject-tests` |
| Academics | Academic | Assign Student Tests | `academics.academic.assign-student-tests` |
| Academics | Academic | Class Test Assignment | `academics.academic.class-test-assignment` |
| Academics | Academic | Test Type Manager | `academics.academic.test-type-manager` |
| Academics | Academic | Grade Scale Manager | `academics.academic.grade-scale-manager` |
| Academics | Academic | Marks Entry | `academics.academic.marks-entry` |
| Academics | Academic | Marks Entry All Subjects | `academics.academic.marks-entry-all-subjects` |
| Academics | Academic | Marks Upload | `academics.academic.marks-upload` |
| Attendance | Attendance | Student Attendance | `attendance.attendance.student-attendance` |
| Attendance | Attendance | Set Exam Attendance | `attendance.attendance.set-exam-attendance` |
| Setup | School Setup | Setup School | `setup.school-setup.setup-school` |
| Setup | School Setup | Classes Management | `setup.school-setup.classes-management` |
| Setup | School Setup | Class Summary | `setup.school-setup.class-summary` |
| Setup | School Setup | Configuration | `setup.school-setup.configuration` |
| Documents | Documents | Document Administration | `documents.documents.document-administration` |
| Documents | Documents | Document Management | `documents.documents.document-management` |
| System | Users | User Management | `system.users.user-management` |
| System | Roles | Role Permissions | `system.roles.role-permissions` |
| System | Franchise | Franchise Management | `system.franchise.franchise-management` |
| System | School | School Management | `system.school.school-management` |
| HR | HR | HR Management | `hr.hr.hr-management` |
| HR | HR | Staff Master | `hr.hr.staff-master` |
| HR | HR | Staff Directory | `hr.hr.staff-directory` |
| HR | HR | Staff Profile | `hr.hr.staff-profile` |
| HR | HR | Staff Categories | `hr.hr.staff-categories` |
| HR | HR | Staff Statuses | `hr.hr.staff-statuses` |
| HR | HR | Departments | `hr.hr.departments` |
| HR | HR | Designations | `hr.hr.designations` |
| HR | HR | Shifts | `hr.hr.shifts` |
| HR | Biometrics | Biometric Devices | `hr.biometrics.devices` |
| HR | Biometrics | Staff Biometric Mapping | `hr.biometrics.mapping` |
| HR | Attendance | Attendance Summary | `hr.attendance.summary` |
| HR | Attendance | Punch Log | `hr.attendance.punch-log` |

> Legacy permission codes (e.g. `system.school.management`, `academics.academic.management`) are automatically aliased to current codes for backward compatibility.

### 4.4 Role Permission Explanations

- **SuperAdmin** — Platform owner. Unlimited access to all schools/branches; bypasses tenant scoping and all permission checks; only role that can create other SuperAdmins and manage roles.
- **Admin** — School-level administrator. Full access within their school (all branches of that school by default); can manage users, students, fees, academics, HR for their tenant.
- **Manager / Finance Manager** — Operational lead for finance; collects fees, runs reports, approves petty cash. Delete/import gated per configuration.
- **Academic Coordinator** — Configures academics (subjects, tests, grade scales) and oversees marks/report cards.
- **Class Teacher / Employee** — Enters marks and student attendance for assigned scope; typically read-heavy elsewhere.
- **HR** — Manages staff masters and views staff attendance; can create staff and (optionally) their login accounts.
- **User** — Basic authenticated user; dashboard/profile/report card.
- **Guest** — Not supported as an authenticated role; all API access requires a valid token.

---

# 5. AUTHENTICATION & AUTHORIZATION

### 5.1 Login Process

**Endpoint:** `POST /api/users/login` (rate-limited: 10/min)

1. User submits `username` + `password` on the Login screen.
2. Server loads the user by username. If not found or password mismatch → `401 invalid credentials` (and `failed_login_count` incremented if user exists).
3. If `is_active` is false → `401 Account is deactivated`.
4. On success: legacy plaintext passwords are auto-upgraded to a hash; `last_login` set; `failed_login_count` reset to 0.
5. Server fetches allowed branches/schools, builds school/branch context, and issues a **JWT** (HS256) with 24-hour expiry containing `user_id, username, role, branch, location, school_id, branch_id`.
6. Response returns `token`, `is_first_login`, and a `user` object including `permissions`, `allowed_branches`, `allowed_schools`, and active school/branch context.
7. Frontend stores the token (session/local storage) and sends it as `Authorization: Bearer <token>` on all subsequent requests.

### 5.2 Logout Process

- Client-side: clears stored token and user context (`clearUser()`), returning to the Login screen.
- Tokens are stateless (JWT); there is no server-side session to invalidate. Expiry (24h) and deactivation (`is_active=false`, checked on every request) are the invalidation mechanisms.

### 5.3 Password Policy

| Rule | Value |
|------|-------|
| Minimum length | 8 characters (`MIN_PASSWORD_LENGTH`) |
| Storage | Hashed with Werkzeug (`pbkdf2:` / `scrypt:`) |
| Legacy migration | Plaintext passwords upgraded to hash on next successful login |
| Reset | Self-service via email OTP (10-minute expiry, limited attempts) |
| First login | `is_first_login` flag returned to prompt a password change |

### 5.4 MFA Process

- The baseline does not enforce TOTP/authenticator MFA for login.
- **OTP is used for password reset** (email-delivered 6-digit code, 10-minute validity, attempt-limited). This provides step-up verification for the reset flow.
- Roadmap: pluggable MFA at login (see Section 27 Future Enhancements).

### 5.5 SSO Integration

- No SSO (SAML/OIDC) in the current baseline; authentication is username/password + JWT.
- Architecture allows adding an OIDC provider in front of `/api/users/login` in future.

### 5.6 Role Assignment

- Assigned at user creation/update via `role` (system) and `role_id` (RBAC) fields.
- Creating a SuperAdmin requires `system.roles.role-permissions:write`.
- Admins can only create users within their allowed schools.

### 5.7 Role Hierarchy

```
SuperAdmin  (platform-wide, unlimited)
   └── Admin  (school-wide)
         └── Manager / Coordinator / HR  (module-scoped, branch-scoped)
               └── Teacher / User  (task-scoped)
```
Effective role name is resolved from the active `role_obj` (RBAC) if present and active, else the legacy `role` string.

### 5.8 Access Approval Process

- Branch/School access is granted by administrators via `UserBranchAccess` / `UserSchoolAccess` records with `start_date`/`end_date` (NULL end = permanent).
- Access is evaluated live on each request; expired or inactive grants are ignored.

### 5.9 Security Controls

- JWT bearer tokens (HS256), 24-hour expiry; `SECRET_KEY` must be ≥32 chars in production.
- `token_required` decorator validates token, user existence, and active status on every protected route.
- `permission_required(code, action)` enforces RBAC per endpoint.
- Flask-Limiter rate limiting (e.g. login and password endpoints at 10/min).
- CORS allowlist (strict in production via `CORS_ALLOWED_ORIGINS`).
- Automatic tenant scoping prevents cross-branch data access.

### 5.10 Session Management

- Stateless JWT stored client-side; sent per request.
- Active school/branch context can be switched via `POST /api/users/switch-context` or per-request `X-School-ID` / `X-Branch-ID` headers (validated against allowed access).
- No idle-timeout beyond token expiry in the baseline.

### 5.11 Account Lock Policy

- `failed_login_count` is tracked and incremented on failed logins, reset on success.
- The baseline records failures for monitoring; automatic hard-lock threshold is a configurable/roadmap control. Accounts can be disabled manually via `is_active=false`.

### 5.12 Permission Management

- Permissions are seeded/synced from `permission_catalog.py` on every server start (`_sync_permission_catalog`) and via `POST /api/rbac/permissions/sync`.
- Role→permission mappings managed in **Role Permissions** UI or `PUT /api/rbac/roles/<id>`.

---

# 6. USER MANAGEMENT

**Access:** `system.users.user-management` (read to view, write to create/edit, delete to remove).

### 6.1 User Creation

**Endpoint:** `POST /api/users/add`
1. Requires `system.users.user-management:write`.
2. Mandatory: `username`, `password`, `useremail`. Optional: `role`/`role_id`, `school_id`, `branch_id`, legacy `branch`.
3. Validations: unique username, unique email, password ≥8 chars, valid role; Admins can only create in allowed schools; creating SuperAdmin needs role-management write.
4. School/branch context auto-derived from branch if not supplied; `is_first_login=true` by default.

### 6.2 User Update

**Endpoint:** `PUT /api/users/<user_id>` — update role, email, active status, school/branch context and access grants. Audited.

### 6.3 User Deactivation

- Set `is_active=false`. Deactivated users are blocked at login and on every authenticated request (`401 Account is deactivated`). Data is preserved (soft approach).

### 6.4 User Reactivation

- Set `is_active=true` via user update. Access grants resume subject to `UserBranchAccess`/`UserSchoolAccess` validity.

### 6.5 User Deletion

**Endpoint:** `DELETE /api/users/<user_id>` — hard delete (requires manage-users delete). Prefer deactivation to preserve audit history; deletion is audited.

### 6.6 Password Reset

- **Self-service:** `POST /api/users/forgot-password` → OTP email → `POST /api/users/verify-otp` → `POST /api/users/reset-password`.
- **In-app change:** `PUT /api/users/update-password` (with current password verification via `POST /api/verify-current-password`).

### 6.7 Role Assignment

- Via create/update (`role`, `role_id`). Effective permissions recomputed on next token issue / `GET /api/rbac/me/permissions`.

### 6.8 User Groups (Access Scoping)

- There is no free-form "user group" object; grouping is achieved via **roles** (behavioral grouping) and **branch/school access** records (data grouping).

### 6.9 Bulk User Import

- No dedicated bulk user importer in the baseline; users are created individually or via `POST /api/setup/migrate-users` for migrations. (Bulk import exists for **students**, see 6-adjacent modules.)

### 6.10 User Audit History

- All user create/update/delete/role changes are recorded in `audit_logs` (`module=SYSTEM`, `table_name=users`) with old/new values, actor, IP, timestamp.

---

# 7. ADMIN GUIDE

Step-by-step procedures for Administrators and Super Administrators.

### 7.1 System Configuration

1. Ensure environment (`.env`) has `SECRET_KEY` (≥32 chars in prod), DB connection, CORS origins, SMTP, SMS, and OCI storage settings.
2. Verify permission catalog synced (automatic on start; or `POST /api/rbac/permissions/sync`).

### 7.2 Master Data Setup (order matters)

1. **School** (tenant): System → School Management → create school (name, code, logo, theme).
2. **Branches:** create branches under the school (code, name, location code). Optionally `POST /api/setup/seed-branches`.
3. **Locations & Academic Years:** Org masters (`/api/org/locations`, `/api/org/academic-years`).
4. **Classes & Sections:** Setup → Classes Management → `create_with_sections`.
5. **HR masters:** Departments → Designations → Shifts → Staff Categories → Staff Statuses.
6. **Fee masters:** Fee Types → Class Fee Structure → Installment Schedule → Concession Master.
7. **Academic masters:** Subject Master → Grade Scale → Test Types.

### 7.3 Module Configuration

- Enable modules per role by granting the appropriate permission codes in Role Permissions.

### 7.4 Workflow Configuration

- Petty cash approval: assign `fees.fee.petty-cash-approval:write` to approver roles.
- Concession governance: control `fees.fee.concession-master` and `administration.student.student-concession`.

### 7.5 Notification Setup

- SMS: set `SMS_AUTH_KEY`, `SMS_AUTH_TOKEN`, `SMS_SENDER_ID`, `SMS_FEE_SENDER_ID`, `SMS_FEE_TEMPLATE_ID`, `SMS_DUE_TEMPLATE_ID`, `SMS_ROUTE`.
- Grant `administration.sms.sms-center` to SMS operators.

### 7.6 Email Configuration

- Set `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` (used for password-reset OTP over STARTTLS).

### 7.7 Approval Matrix Setup

- Define approver roles and grant approval permissions (see Section 13). Petty cash and fund allocation use a single-level `approved_by` model in the baseline.

### 7.8 Security Configuration

- Enforce production `SECRET_KEY` and `CORS_ALLOWED_ORIGINS`.
- Grant least privilege; restrict SuperAdmin creation.
- Review audit logs regularly.

### 7.9 Integration Configuration

- **OCI Object Storage:** `OCI_NAMESPACE`, `OCI_BUCKET_NAME` (Instance Principals for auth) for documents/photos.
- **Biometric SyncAgent:** configure `SyncAgent/config.json` (device IPs, API endpoint) to push punches to `POST /api/v1/attendance/sync`.

### 7.10 Backup Configuration

- Database: schedule regular MySQL backups (dumps/snapshots) per ops policy.
- Object storage: rely on OCI bucket durability + versioning.
- Migrations: Alembic scripts under `erp-backend/migrations/versions` are the schema source of truth.

---

# 8. END USER GUIDE

The application is a single-page app: after login you land on a role-appropriate page and navigate via the left **Sidebar** (Dashboard, Academic, Financial, Administration, HR & Staff, Setup) plus Control Panel/Support/Profile. Menu items appear only if you have `read` on the corresponding permission.

For **each module**, the guide below follows a consistent template. Screens share common patterns:

- **How to open:** Sidebar → category → sub-screen.
- **How to search:** use the search box / filters (academic year, location, branch, class, section) at the top of list screens.
- **How to filter:** select context filters; lists auto-scope to your allowed branches.
- **How to create:** click **Create/Add**, complete the form, **Save**.
- **How to edit:** open a row → **Edit** → change → **Save/Update**.
- **How to delete:** open a row → **Delete/Deactivate** → confirm.
- **How to export:** click **Export** (Excel/PDF) on report screens.
- **How to print:** click **Print** (receipts, report cards).

### 8.1 Dashboard
- **Purpose:** at-a-glance operational summary.
- **Pre-requisites:** logged in with `home.dashboard.dashboard:read`.
- **Navigation:** Sidebar → Dashboard.
- **Steps:** review widgets/KPIs; use branch selector in the header to switch context.
- **Expected result:** metrics for the active branch/academic year.
- **Success/Errors:** "Session expired" → re-login.

### 8.2 Student Administration
- **Purpose:** manage students (search, create, update, section change, promote/demote, inactivate, import, documents, concessions).
- **Pre-requisites:** relevant `administration.student.*` permissions.
- **Navigation:** Sidebar → Administration.
- **Create student:** Create Student → fill mandatory fields (name, gender, class, section, admission date) → Save → admission number auto-generated. Success: "Student created".
- **Import:** Import Student Data → download template → upload `.xlsx` → review validation results.
- **Search/Edit/Change section/Promote/Demote/Inactivate:** open the respective screen, select context, act, confirm.
- **Errors:** "Duplicate admission no", "Mandatory field missing", "Unauthorized branch".

### 8.3 Fee Management
- **Purpose:** collect fees, manage structures/concessions, print receipts, run reports, petty cash.
- **Navigation:** Sidebar → Financial.
- **Take Fee:** search student → select installments/fee types → apply concession → enter amount + mode → **Collect** → **Print** receipt. Optional: send SMS receipt.
- **Reversal:** open receipt → cancel/delete (records reason; moves to Deleted Receipts). Requires delete permission.
- **Errors:** "Amount exceeds due", "No fee structure assigned", "Receipt not found".

### 8.4 Academics
- **Purpose:** subjects, tests, grade scales, marks, report cards.
- **Navigation:** Sidebar → Academic.
- **Marks Entry:** select year/branch/class/test/subject → enter marks → Save → grade auto-computed. Report Card: generate/print per student.
- **Errors:** "Grade scale not configured", "Test not assigned to student".

### 8.5 Attendance
- **Purpose:** student attendance and exam attendance; staff attendance via HR.
- **Navigation:** Sidebar → Academic/Attendance (student) and HR & Staff (staff).
- **Steps:** select date/class → mark → Save; or upload attendance template.

### 8.6 HR & Staff
- **Purpose:** staff records, masters, biometric devices, staff attendance.
- **Navigation:** Sidebar → HR & Staff.
- **Create staff:** Staff Master → fill personal/employment fields → Save → staff code & employee id auto-generated.
- **Attendance Summary / Punch Log:** view processed attendance and raw punches.

### 8.7 Setup Your School
- **Purpose:** configure school, classes/sections, week-offs, holidays.
- **Navigation:** Sidebar → Setup Your School.

### 8.8 Documents
- **Purpose:** define document types (admin) and upload/download student documents.
- **Navigation:** Administration → Document Management / Document Administration.

### 8.9 SMS Center
- **Purpose:** send attendance, fee receipt, fee due, and announcement SMS; view SMS reports.
- **Navigation:** Administration → SMS Center.

### 8.10 Control Panel (Admin)
- **Purpose:** User Management, Role Permissions, School/Franchise Management.
- **Navigation:** Sidebar → Control Panel (visible to admins).

*(Screenshot placeholders: insert UI captures for each screen at go-live — Login, Dashboard, Take Fee, Marks Entry, Staff Master, Role Permissions.)*

---

# 9. MODULE-WISE DOCUMENTATION

For each module: overview, functionality, business purpose, navigation, key fields, validation, workflow, approvals, dependencies, reports, notifications, permissions.

### 9.1 Home / Dashboard
- **Overview:** landing area with summary, profile, and report-card access.
- **Functionality:** KPI widgets, quick links, profile update, report card view.
- **Business purpose:** operational awareness.
- **Navigation:** Sidebar → Dashboard / Profile.
- **Dependencies:** students, fees, attendance data.
- **Reports:** dashboard widgets; student report cards.
- **Notifications:** none direct.
- **Permissions:** `home.dashboard.*`.

### 9.2 Administration (Student)
- **Overview:** complete student information system.
- **Functionality:** CRUD, section change, promotion/demotion, inactivation, bulk import (CSV/XLSX), history, documents, concessions.
- **Fields:** admission/enrollment no, personal, parent/guardian, previous school, category, class/section, academic year, branch. (See Section 10 field tables.)
- **Validation:** mandatory identity/class fields; unique admission no; branch authorization.
- **Workflow:** admission → academic record snapshot → fee assignment.
- **Dependencies:** classes/sections, fee structures, academic year.
- **Reports:** student summary, history.
- **Permissions:** `administration.student.*`.

### 9.3 Fees
- **Overview:** billing and collection engine + petty cash.
- **Functionality:** fee types, class fee structures, installment schedules, concessions, special/standard fee assignment, payment collection (multi-line receipts), reversals, deleted-receipt tracking, reports; petty-cash vouchers, fund allocation, approvals.
- **Fields:** fee type, category, amount, installments; payment: receipt_no, gross/concession/net/paid/due, mode, cheque details, collected_by.
- **Validation:** amount ≤ due; unique fee type per branch/year/school; approval status for petty cash.
- **Workflow:** assign structure → collect → reconcile → report. Petty cash: create → approve/reject.
- **Approvals:** petty cash & fund allocation (Section 13).
- **Dependencies:** students, classes, academic year, branches.
- **Reports:** today/daily/monthly/class-wise/installment-wise/due/late-due/deleted/concession (Section 14).
- **Notifications:** SMS receipt & due reminders.
- **Permissions:** `fees.fee.*`.

### 9.4 Academics
- **Overview:** subjects, assessments, grading.
- **Functionality:** subject master, class-subject assignment, student subject/test assignment, class tests, test types, grade scales, marks entry (single/all/upload), report cards.
- **Fields:** subject name/type (Academic/Deeniyath), test name/max marks/order, grade min/max/label, marks value.
- **Validation:** continuous non-overlapping grade ranges; min<max; unique scale per location/year; test-student assignment required before marks.
- **Workflow:** setup → assign → grade → finalize (see Section 12).
- **Dependencies:** classes/sections, students, academic year.
- **Reports:** report cards, student marks history.
- **Permissions:** `academics.academic.*`.

### 9.5 Attendance (Student)
- **Overview:** daily and exam attendance for students.
- **Functionality:** mark attendance, upload template, exam attendance months.
- **Validation:** date within academic year; class/section context.
- **Dependencies:** students, classes, holiday/week-off config.
- **Permissions:** `attendance.attendance.*`.

### 9.6 Setup (School Setup)
- **Overview:** organization and calendar configuration.
- **Functionality:** setup school, classes/sections, class summary, week-off rules, holiday calendar, date/month checks.
- **Permissions:** `setup.school-setup.*`.

### 9.7 Documents
- **Overview:** student document management with cloud storage.
- **Functionality:** document types (admin), upload/download student docs (OCI storage), profile photos.
- **Validation:** allowed file types; size ≤16 MB.
- **Permissions:** `documents.documents.*`, `administration.student.student-document-management`.

### 9.8 System (Users / Roles / School / Franchise)
- **Overview:** governance and tenant management.
- **Functionality:** user CRUD, RBAC roles & permissions, school (tenant) CRUD + logo, branches, franchise management.
- **Permissions:** `system.users.*`, `system.roles.*`, `system.school.*`, `system.franchise.*`.

### 9.9 HR & Staff
- **Overview:** staff lifecycle and org structure.
- **Functionality:** staff master (auto staff code/employee id), directory, profile, departments, designations, shifts, categories, statuses, biometric devices & mapping, attendance summary, punch log.
- **Fields:** staff code, employee id, names, gender, joining date, employment type/status, department/designation/shift, biometric id.
- **Validation:** unique staff code/employee id per school; mandatory joining date, gender, employment type.
- **Dependencies:** departments/designations/shifts, biometric devices, branches.
- **Reports:** staff attendance summary, punch log.
- **Permissions:** `hr.hr.*`, `hr.biometrics.*`, `hr.attendance.*`.

### 9.10 SMS
- **Overview:** outbound messaging.
- **Functionality:** attendance SMS, fee receipt SMS, fee due SMS, announcements; SMS logs/reports.
- **Dependencies:** SMS gateway config, students (phone numbers).
- **Permissions:** `administration.sms.sms-center`.

---

# 10. SCREEN-WISE DOCUMENTATION

Representative screens (each SPA "page"). URLs are logical SPA routes; the app is served from a single base URL (`/`) and navigates by page state.

### 10.1 Login
| Attribute | Detail |
|-----------|--------|
| Screen Name | Login |
| Purpose | Authenticate user |
| URL / Route | `/` (unauthenticated) → `POST /api/users/login` |
| Access Roles | Public |
| Buttons | Sign In, Forgot Password |
| Actions | Submit credentials; start OTP reset |
| System Messages | "login successful" |
| Error Messages | "invalid credentials", "Account is deactivated" |

**Field definitions**

| Field | Data Type | Mandatory | Default | Validation | Description |
|-------|-----------|-----------|---------|-----------|-------------|
| Username | String(50) | Yes | — | exists | Login id |
| Password | String | Yes | — | ≥8 chars | Secret |

### 10.2 Create Student
| Attribute | Detail |
|-----------|--------|
| Screen Name | Create Student |
| Purpose | Admit a new student |
| Route / API | `POST /api/students` |
| Access Roles | `administration.student.create-student:write` |
| Buttons | Save, Reset |
| Actions | Create; auto-generate admission no |
| Messages | "Student created successfully" |
| Errors | "Duplicate admission no", "Mandatory field missing" |

**Field definitions (selected)**

| Field | Data Type | Mandatory | Default | Validation | Description |
|-------|-----------|-----------|---------|-----------|-------------|
| first_name | String(100) | Yes | — | non-empty | Student first name |
| last_name | String(100) | No | — | — | Surname |
| gender | String(10) | Yes | — | Male/Female/Other | Gender |
| dob | Date | No | — | valid date | Date of birth |
| clazz (class) | String(20) | Yes | — | existing class | Class |
| section | String(20) | Yes | — | existing section | Section |
| admission_date | Date | Yes | today | valid date | Admission date |
| admission_no | String(50) | Auto | seq | unique | Generated per branch/year |
| FatherPhone / SmsNo | String(20) | No | — | phone format | SMS contact |
| academic_year | String(20) | Yes | active | — | Year scope |
| status | Enum | No | Active | Active/Inactive | Lifecycle |

### 10.3 Take Fee (Fee Collection)
| Attribute | Detail |
|-----------|--------|
| Purpose | Collect student fee, issue receipt |
| API | `POST /api/fees/payment` |
| Access Roles | `fees.fee.take-fee:write` |
| Buttons | Add Payment, Apply Concession, Collect, Print |
| Actions | Create fee_payments rows under one receipt_no; update dues |
| Messages | "Payment recorded", receipt generated |
| Errors | "Amount exceeds due", "No fee assigned" |

**Field definitions (selected)**

| Field | Data Type | Mandatory | Default | Validation | Description |
|-------|-----------|-----------|---------|-----------|-------------|
| student_id | Integer | Yes | — | exists | Payer |
| fee_type / installment | String | Yes | — | assigned | What is paid |
| gross_amount | Numeric(10,2) | Yes | — | ≥0 | Item fee |
| concession_amount | Numeric(10,2) | No | 0 | ≤gross | Discount |
| amount_paid | Numeric(10,2) | Yes | — | ≤ net due | Paid now |
| payment_mode | String(50) | Yes | Cash | enum-like | Cash/UPI/Cheque/etc. |
| cheque_no/bank/date | String/Date | Cond. | — | if cheque | Cheque details |

### 10.4 Marks Entry
| Attribute | Detail |
|-----------|--------|
| Purpose | Enter subject marks per test |
| API | `GET/POST /api/marks/entry/subject` |
| Access Roles | `academics.academic.marks-entry:write` |
| Actions | Save marks → grade auto-derived |
| Errors | "Grade scale missing", "Marks exceed max" |

### 10.5 Staff Master
| Attribute | Detail |
|-----------|--------|
| Purpose | Create/manage staff |
| API | `POST /api/hr/staff`, `PUT /api/hr/staff/<id>` |
| Access Roles | `hr.hr.staff-master:write` |
| Actions | Create staff (auto staff_code/employee_id) |
| Errors | "Duplicate staff code", "Missing joining date" |

**Field definitions (selected)**

| Field | Data Type | Mandatory | Default | Validation | Description |
|-------|-----------|-----------|---------|-----------|-------------|
| first_name | String(100) | Yes | — | non-empty | Given name |
| gender | Enum | Yes | — | MALE/FEMALE/OTHER | Gender |
| joining_date | Date | Yes | — | valid | DOJ |
| employment_type | Enum | Yes | — | PERMANENT/CONTRACT/… | Type |
| department_id | FK | No | — | exists | Department |
| designation_id | FK | No | — | exists | Designation |
| default_shift_id | FK | No | — | exists | Shift |
| staff_code | String(50) | Auto | seq | unique/school | `{branch}{dept}{seq}` |
| employee_id | String(50) | Auto | seq | unique/school | Employee identifier |

### 10.6 Role Permissions (RBAC)
| Attribute | Detail |
|-----------|--------|
| Purpose | Manage roles and per-component permissions |
| API | `GET/POST/PUT /api/rbac/roles`, `GET /api/rbac/permissions` |
| Access Roles | `system.roles.role-permissions` (write to modify) |
| Actions | Create role, toggle read/write/append/delete per permission |
| Errors | "Role name exists", "System role names cannot be changed" |

### 10.7 School Management
| Attribute | Detail |
|-----------|--------|
| Purpose | Manage tenant schools |
| API | `GET/POST/PUT/DELETE /api/schools`, `POST /api/schools/<id>/logo` |
| Access Roles | `system.school.school-management` |
| Fields | school_name, school_code, logo_url, theme_color, address, phone, email, subscription_plan, is_active |

### 10.8 Petty Cash Approval
| Attribute | Detail |
|-----------|--------|
| Purpose | Approve/reject petty-cash vouchers & allocations |
| API | `PUT /api/petty-cash/<id>/approve`, `PUT /api/petty-cash/fund-allocation/<id>/approve` |
| Access Roles | `fees.fee.petty-cash-approval:write` |
| Actions | Approve/Reject; sets approval_status + approved_by |

*(Additional screens follow the same template: Fee Type, Class Fee Structure, Concession Master, Grade Scale Manager, Test Type Manager, Classes Management, Configuration, SMS Center, Attendance, Biometric Devices, User Management, Franchise Management.)*

---

# 11. MASTER DATA DOCUMENTATION

### 11.1 Master List

| Master | Table | Scope | Purpose |
|--------|-------|-------|---------|
| School (tenant) | `schools` | Platform | Top-level client/franchise brand |
| Branch (campus) | `branches` | School | Physical location |
| Org master (Location / Academic Year) | `org_master` | Platform/School | Locations & years |
| Class | `classes` | Location | Grade level |
| Class Section | `class_sections` | Branch/Year | Sections within class |
| Fee Type | `feetypes` | Branch/Year/School | Fee heads |
| Class Fee Structure | `classfeestructure` | Branch/Year | Fee per class |
| Fee Installment | `fee_installments` | Branch/Year | Payment schedule |
| Concession | `concessions` | Branch/Year/FeeType | Discounts |
| Subject | `subjectmaster` | Year | Academic/Deeniyath subjects |
| Test Type | `testtype` | Year | Assessment types |
| Grade Scale + Details | `grade_scales`, `grade_scale_details` | Location/Year | Mark→grade mapping |
| Department | `department_master` | School | HR org unit |
| Designation | `designation_master` | School/Dept | Job titles |
| Shift | `shift_master` | School | Work shifts |
| Staff Category | `staff_category_master` | School | Teaching/Non-teaching/etc. |
| Staff Status | `staff_status_master` | School | Employment statuses |
| Document Type | `document_types` | School | Student document categories |
| Petty Cash Ledger | `petty_cash_ledger` | — | Ledger heads (Direct/Indirect) |
| Biometric Device | `biometric_device_master` | Branch | Attendance hardware |
| Roles / Permissions | `roles`, `permissions`, `role_permissions` | Platform | RBAC |

### 11.2 Setup Process (dependency order)

```
School → Branch → Location/Academic Year → Classes → Sections
      → HR: Department → Designation → Shift → Category → Status
      → Fees: Fee Type → Class Fee Structure → Installments → Concessions
      → Academics: Subject → Grade Scale → Test Type
      → Documents: Document Types   → Biometric Devices
```

### 11.3 Configuration Rules

- Codes are unique within their tenant scope (see unique constraints in Section 20).
- Deactivate (is_active/status) rather than delete where possible.
- Grade scale ranges must be continuous and non-overlapping.

### 11.4 Dependencies & Relationships

- Sections depend on Classes and Branches; Designations depend on Departments; Staff depends on Department/Designation/Shift; Fee Structure depends on Fee Type + Class; Concessions depend on Fee Type.

---

# 12. WORKFLOW DOCUMENTATION

### 12.1 Student Admission Workflow
- **Trigger:** front office creates a student.
- **Steps:** validate → generate admission no (BranchYearSequence) → persist (scoped) → create academic record → assign fee structure.
- **Approvers:** none (operational).
- **Conditions:** mandatory fields, unique admission no, branch authorization.
- **Completion:** student active with dues generated.

### 12.2 Fee Collection Workflow
- **Trigger:** cashier collects payment.
- **Steps:** select dues → apply concession → record payment rows under receipt_no → update `studentfees` → print → optional SMS.
- **Escalation:** disputes handled via reversal (Deleted Receipts) requiring delete permission.
- **Completion:** dues reduced; receipt issued.

### 12.3 Academic Grading Workflow
- **Trigger:** assessment cycle.
- **Steps:** create subjects → assign to class → create test types → create class tests + subjects → assign tests to students → enter marks → auto-grade via grade scale → generate report cards.
- **Completion:** results published/printed.

### 12.4 Petty Cash Approval Workflow
- **Trigger:** branch creates voucher/allocation (status=Pending).
- **Steps:** approver reviews → Approve (status=Approved, approved_by/at set) or Reject (status=Rejected).
- **Escalation:** rejected items revised and resubmitted.
- **Completion:** approved entries appear in reports/ledger balances.

### 12.5 Staff Onboarding & Attendance Workflow
- **Trigger:** HR creates staff.
- **Steps:** generate staff_code/employee_id → map biometric_id → SyncAgent pushes punches → staging → attendance engine builds `attendance_head` (present/late/overtime) → summaries.
- **Completion:** daily attendance available; can be locked for payroll.

### 12.6 Flowchart Descriptions

```
Petty Cash:  [Create Pending] → {Approver decision}
                                   ├─ Approve → [Approved] → Reports/Ledger
                                   └─ Reject  → [Rejected] → Revise → Create Pending
```
```
Biometric Attendance: [Device punch] → [SyncAgent] → POST /api/v1/attendance/sync
   → [attendance_staging] → [attendance_engine] → [attendance_head + detail] → [Summary]
```

---

# 13. APPROVAL MATRIX

The baseline implements **single-level** approval for financial control points (petty cash voucher and fund allocation) via `approval_status` + `approved_by`. Multi-level approval is a configurable/roadmap extension; the matrix below documents both the implemented level and recommended enterprise levels.

| Process | Level 1 Approver | Level 2 Approver | Level 3 Approver | Approval Condition | Rejection Flow | Escalation Flow |
|---------|------------------|------------------|------------------|--------------------|----------------|-----------------|
| Petty Cash Voucher | Branch Finance/Manager (`petty-cash-approval:write`) | *(recommended)* Finance Head | *(recommended)* Management | Valid amount & ledger; within allocation | status=Rejected; creator revises & resubmits | Aging pending items escalate to Finance Head |
| Petty Cash Fund Allocation | Finance Manager | *(recommended)* Finance Head | — | Justified allocation & budget | Rejected → revise | Escalate to Management |
| Student Concession | Finance Manager / Admin | *(recommended)* Principal | — | Policy-compliant concession | Not granted / reversed | Head of Department |
| Fee Reversal (Deleted Receipt) | Finance Manager (`take-fee:delete`) | *(recommended)* Admin | — | Valid reason recorded | Reversal denied | Admin review |
| Role / SuperAdmin Creation | SuperAdmin (`role-permissions:write`) | — | — | Governance approval | Request denied | Platform owner |

**Implemented approval endpoints:** `PUT /api/petty-cash/<id>/approve`, `PUT /api/petty-cash/fund-allocation/<id>/approve`. Approval writes `approved_by` (user) and (for allocations) `approved_at`, and is audit-logged.

---

# 14. REPORTS DOCUMENTATION

| Report | Purpose | Filters | Key Columns | Export | Roles | Business Usage |
|--------|---------|---------|-------------|--------|-------|----------------|
| Today's Fees (`/api/reports/fees/today`) | Same-day collections | branch, year, date | receipt, student, amount, mode | Excel/PDF | Fees | Daily cash-up |
| Daily Fees (`/api/reports/fees/daily`) | Collections by day | date range, branch | date, totals | Excel/PDF | Fees | Reconciliation |
| Monthly Fees (`/api/reports/fees/monthly`) | Month-wise collection | month/year, branch | month, totals | Excel/PDF | Management | Trend analysis |
| Class-wise Fees (`/api/reports/fees/class-wise`) | Collection by class | class, year | class, collected, due | Excel | Fees | Class performance |
| Installment-wise (`/api/reports/fees/installment-wise`) | By installment | installment, class | installment, collected | Excel | Fees | Schedule tracking |
| Due / Late Due (`/api/reports/fees/due`, `/late-due`) | Outstanding dues | cutoff date, class | student, due amount | Excel | Fees | Collection drive |
| Deleted Receipts (`/api/reports/fees/deleted-receipts`) | Reversed receipts | date range | receipt, reason, by | Excel | Admin/Audit | Reversal audit |
| Concession Report (`/api/reports/fees/concession-report`) | Concessions granted | class, year | student, concession | Excel | Finance/Audit | Discount governance |
| Petty Cash (branch/ledger/month-wise) | Spend analysis | branch, ledger, month | date, ledger, amount, status | Excel | Finance | Expense control |
| SMS Reports (`/api/sms/reports`) | Messaging log | type, date | type, phone, status | — | Admin | Delivery audit |
| Student Report Card (`/api/report/student`) | Academic results | student, test, year | subject, marks, grade | PDF/Print | Academics | Results |
| Staff Attendance Summary (`/api/attendance/staff/summary`) | Staff presence | branch, month | staff, present, late, OT | Excel | HR | Payroll input |

---

# 15. DASHBOARD DOCUMENTATION

- **Widgets/KPIs:** total students (active), today's/period fee collection, outstanding dues, staff attendance snapshot, recent activity.
- **Charts:** collection trends and class-wise breakdowns rendered with `recharts` (bar/line/pie).
- **Drill-down:** clicking a KPI navigates to the underlying list/report (e.g. dues → Due report).
- **Refresh logic:** data fetched on load and on branch/academic-year context change; server responses are cached briefly (SimpleCache, 300s default) for performance.
- **Access rights:** `home.dashboard.dashboard:read`; data auto-scoped to the user's active branch/school.

---

# 16. NOTIFICATION DOCUMENTATION

| Channel | Types | Trigger Event | Recipients | Template | Frequency |
|---------|-------|---------------|------------|----------|-----------|
| **SMS** | Attendance | Attendance marked / absentee flagged (`/api/attendance/send-sms`) | Parent (`SmsNo`/`FatherPhone`) | Attendance template | On demand / daily |
| **SMS** | Fee Receipt | Fee collected (`/api/sms/send-fee-receipt`) | Parent | `SMS_FEE_TEMPLATE_ID` | On payment |
| **SMS** | Fee Due | Due reminder (`/api/sms/send-fee-due`) | Parent | `SMS_DUE_TEMPLATE_ID` | On demand |
| **SMS** | Announcement | Manual broadcast (SMS Center) | Selected students/parents | Free text | On demand |
| **Email** | Password OTP | Forgot password (`/api/users/forgot-password`) | User email | OTP email (10-min expiry) | On request |
| **System** | In-app messages | Validation/success/error toasts | Current user | UI messages | Real-time |

- **Config:** SMS gateway via `SMS_AUTH_KEY/TOKEN`, sender/template/route env vars; email via SMTP env vars.
- **Logging:** every SMS attempt recorded in `sms_logs` (type, phone, status, reason, sent_by, timestamps).

---

# 17. AUDIT TRAIL

### 17.1 What Is Logged

- Every INSERT/UPDATE/DELETE on tables that use `AuditMixin` is captured automatically via a SQLAlchemy `before_flush` listener into `audit_logs`.
- Captured fields: `table_name`, `record_id`, `module` (e.g. FEES, HR, STUDENT, SYSTEM, ATTENDANCE, PETTY_CASH, SMS), `action` (CREATE/UPDATE/DELETE), `old_data` (JSON), `new_data` (JSON), `user_id`, `ip_address`, `school_id`, `branch_id`, `timestamp`.
- Additionally, `created_by`/`updated_by`/`created_at`/`updated_at` are auto-stamped on every audited record.

### 17.2 Who Can View

- Audit access is administrative — gated behind system RBAC (`system.roles.role-permissions`) and admin-level roles; SuperAdmin sees all tenants; Admins see their school/branch scope.

### 17.3 Audit Reports

- Filterable by table, record id, module, user, and timestamp (indexed: `idx_audit_table_record`, `idx_audit_user`, `idx_audit_timestamp`).
- Use cases: reconstruct a record's change history, prove who altered a fee/receipt, detect unauthorized changes.

### 17.4 Compliance Requirements

- Immutable append-only logging (the audit writer never audits itself).
- Old/new value capture supports data-integrity and financial audits.
- Retention: keep audit logs per regulatory/financial policy (recommend ≥ 7 years for financial records).

---

# 18. SECURITY DOCUMENTATION

| Area | Control |
|------|---------|
| **Authentication** | JWT (HS256), 24h expiry; deactivated users blocked per request |
| **Password storage** | Werkzeug hashing (pbkdf2/scrypt); plaintext auto-upgraded; min 8 chars |
| **Authorization** | Two-tier: system role + RBAC per-component (read/write/append/delete); `permission_required` on endpoints |
| **Multi-tenant isolation** | Automatic `school_id`/`branch_id` scoping at ORM query-compile time; explicit cross-branch validation for bulk ops |
| **Transport / CORS** | HTTPS expected; strict CORS allowlist in production (`CORS_ALLOWED_ORIGINS`) |
| **Rate limiting** | Flask-Limiter (login/password endpoints ~10/min) |
| **Secrets** | `SECRET_KEY` ≥32 chars in prod; DB/SMS/SMTP/OCI creds via env, never in code |
| **File uploads** | 16 MB max; restricted served media paths; OCI storage with Instance Principals |
| **Audit** | Immutable audit trail (Section 17) |
| **Input handling** | Server-side validation; parameterized ORM queries (SQL-injection safe) |

### 18.1 Data Protection & Encryption
- In transit: TLS/HTTPS (deployment-level).
- At rest: DB/host encryption per infrastructure; object storage server-side encryption (OCI).
- Passwords irreversibly hashed; OTPs stored hashed (`otp_hash`).

### 18.2 Data Retention
- Operational data retained per academic-year archival policy.
- Soft-deactivation preserves student/staff/receipt history.
- Audit and financial records retained long-term for compliance.

### 18.3 Security Best Practices
- Enforce least privilege; review roles quarterly.
- Rotate secrets; restrict SuperAdmin accounts.
- Monitor failed logins and audit anomalies.
- Keep dependencies patched.

### 18.4 Compliance Requirements
- Support data-subject handling for student/guardian PII (education-sector privacy norms).
- Financial audit readiness via receipts + audit trail.

---

# 19. API DOCUMENTATION

**Base URL:** deployment origin (frontend calls `API_URL`). **Auth:** `Authorization: Bearer <JWT>` on all protected endpoints. **Tenant headers:** `X-School-ID`, `X-Branch-ID` (`all` or integer), `X-Academic-Year`. **Content-Type:** `application/json` (multipart for uploads).

### 19.1 Common Response & Error Codes

| Code | Meaning |
|------|---------|
| 200 / 201 | Success / Created |
| 400 | Bad request / validation error |
| 401 | Missing/invalid/expired token, invalid credentials, deactivated |
| 403 | Forbidden (missing permission / unauthorized branch/school) |
| 404 | Not found |
| 413 | Payload too large (>16 MB) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

### 19.2 Authentication APIs

**`POST /api/users/login`** — Rate limit 10/min.
```
Request:  { "username": "admin01", "password": "••••••••" }
Response: { "message":"login successful", "token":"<JWT>", "is_first_login":false,
            "user": { "user_id":101, "username":"admin01", "role":"Admin",
                      "permissions": { ... }, "allowed_branches":[...], "allowed_schools":[...],
                      "school_id":1, "branch_id":1, ... } }
Errors:   401 invalid credentials | 401 Account is deactivated
```

**`POST /api/users/switch-context`** — switch active school/branch. Body: `{ "school_id":1, "branch_id":2 }` → new token. Errors: 403 unauthorized school/branch.

**`POST /api/users/forgot-password`** → OTP email · **`POST /api/users/verify-otp`** · **`POST /api/users/reset-password`** · **`PUT /api/users/update-password`** · **`POST /api/verify-current-password`**.

### 19.3 Endpoint Catalog (selected, by module)

| Module | Method & Path | Purpose | Auth (permission) |
|--------|---------------|---------|-------------------|
| Users | `GET /api/users` | List users (scoped) | user-management:read |
| Users | `POST /api/users/add` | Create user | user-management:write |
| Users | `PUT /api/users/<id>` | Update user | user-management:write |
| Users | `DELETE /api/users/<id>` | Delete user | user-management:delete |
| RBAC | `GET /api/rbac/permissions` | List permissions | roles:read |
| RBAC | `GET/POST /api/rbac/roles` | List/create roles | roles:read/write |
| RBAC | `PUT /api/rbac/roles/<id>` | Update role & perms | roles:write |
| RBAC | `GET /api/rbac/me/permissions` | My effective perms | token |
| Org | `GET/POST /api/schools` | Schools | school-management |
| Org | `PUT/DELETE /api/schools/<id>` | Update/delete school | school-management |
| Org | `GET/POST /api/branches` | Branches | franchise/school mgmt |
| Org | `GET/POST /api/org/locations` | Locations | setup |
| Org | `GET/POST /api/org/academic-years` | Academic years | setup |
| Students | `GET /api/students` | List/search | student-administration:read |
| Students | `POST /api/students` | Create | create-student:write |
| Students | `PUT /api/students/<id>` | Update | update-student-details:write |
| Students | `DELETE /api/students/<id>` | Delete | student:delete |
| Students | `POST /api/students/upload_csv` | Bulk import | import-student-data:append |
| Students | `POST /api/students/promote-bulk` | Promote | promote-students:write |
| Students | `POST /api/students/demote-bulk` | Demote | demote-students:write |
| Students | `POST /api/students/change-section-bulk` | Change section | change-section:write |
| Students | `GET /api/students/<id>/history` | History | read |
| Fees | `GET /api/fee-types` `POST /api/fee-types` | Fee types | fee-type |
| Fees | `GET/POST /api/class-fee-structure` | Class fees | class-fee-structure |
| Fees | `GET/POST /api/concessions` | Concessions | concession-master |
| Fees | `GET/POST /api/installment-schedule` | Installments | fee-installments |
| Fees | `POST /api/fees/payment` | Collect fee | take-fee:write |
| Fees | `GET /api/fees/payments/<student_id>` | Payment history | fee-receipt:read |
| Fees | `DELETE /api/fees/payment/<id>` | Reverse payment | take-fee:delete |
| Fees | `POST /api/fees/assign-special` | Special fee | assign-special-fee:write |
| Petty Cash | `GET/POST /api/petty-cash` | Vouchers | petty-cash |
| Petty Cash | `PUT /api/petty-cash/<id>/approve` | Approve voucher | petty-cash-approval:write |
| Petty Cash | `GET/POST /api/petty-cash/allocations` | Fund allocation | petty-cash-fund-allocation |
| Petty Cash | `PUT /api/petty-cash/fund-allocation/<id>/approve` | Approve allocation | petty-cash-approval:write |
| Academics | `GET/POST /api/academic/subjects` | Subjects | subject-master |
| Academics | `POST /api/academic/assign-subjects` | Class-subject | class-subject-assignment |
| Academics | `GET/POST /api/test-types/` | Test types | test-type-manager |
| Academics | `GET/POST /api/class-tests/...` | Class tests | class-test-assignment |
| Academics | `GET/POST /api/grade-scales` | Grade scales | grade-scale-manager |
| Academics | `GET/POST /api/marks/entry/subject` | Marks | marks-entry |
| Academics | `GET /api/report/student` | Report card | report-card:read |
| Attendance | `GET/POST /api/attendance` | Student attendance | student-attendance |
| Attendance | `POST /api/attendance/upload` | Upload | student-attendance:append |
| HR | `GET/POST /api/hr/staff` | Staff | staff-master |
| HR | `GET /api/hr/staff/<id>/profile` | Staff profile | staff-profile:read |
| HR | `GET/POST /api/hr/departments|designations|shifts` | HR masters | departments/designations/shifts |
| HR | `GET/POST /api/hr/staff-categories|staff-statuses` | HR masters | staff-categories/statuses |
| Biometric | `GET/POST /api/biometric/devices` | Devices | biometrics.devices |
| Attendance Sync | `POST /api/v1/attendance/sync` | Ingest punches (SyncAgent) | agent token |
| Documents | `POST /api/documents/upload` | Upload doc | document-management:write |
| Documents | `GET /api/documents/student/<id>` | List docs | document-management:read |
| SMS | `POST /api/sms/send-fee-receipt` | Fee SMS | sms-center:write |
| Reports | `GET /api/reports/fees/*` | Fee reports | fee-reports:read |

### 19.4 Example — Create Student
```
POST /api/students
Headers: Authorization: Bearer <JWT>; X-School-ID: 1; X-Branch-ID: 1; X-Academic-Year: 2025-2026
Body: { "first_name":"Arjun", "last_name":"Rao", "gender":"Male",
        "class":"Class 10", "section":"A", "admission_date":"2025-06-01" }
201: { "message":"Student created successfully", "student_id":501, "admission_no":"HYD25-0001" }
400: { "error":"Mandatory field missing: gender" }
403: { "error":"Forbidden: missing permission" }
```

### 19.5 Rate Limits
- Login and password endpoints: ~10 requests/minute per client (Flask-Limiter). Exceeding → 429. Other endpoints follow default limiter config; tune per deployment.

---

# 20. DATABASE OVERVIEW

**Engine:** MySQL (SQLite for local dev). **Migrations:** Alembic (`erp-backend/migrations`). All business tables carry audit columns and (mostly) `school_id`/`branch_id` for tenancy.

### 20.1 Table List (by domain)

| Domain | Tables |
|--------|--------|
| Security/System | `users`, `roles`, `permissions`, `role_permissions`, `password_reset_otps`, `audit_logs` |
| Org/Tenant | `schools`, `branches`, `org_master`, `user_branch_access`, `user_school_access`, `enrollment_sequences` |
| Students | `students`, `student_academic_records` |
| Classes | `classes`, `class_sections` |
| Fees | `feetypes`, `studentfees`, `classfeestructure`, `concessions`, `fee_installments`, `fee_payments` |
| Petty Cash | `petty_cash_ledger`, `petty_cash`, `petty_cash_voucher_items`, `petty_cash_fund_allocation` |
| Academics | `subjectmaster`, `classsubjectassignment`, `studentsubjectassignment`, `testtype`, `class_test`, `class_test_subjects`, `student_test_assignments`, `test_attendance_months`, `grade_scales`, `grade_scale_details`, `student_marks` |
| Attendance (student) | `attendance`, `weekly_off_rule`, `holiday_calendar` |
| HR | `department_master`, `designation_master`, `shift_master`, `staff_category_master`, `staff_status_master`, `staff_master`, `staff_code_sequences`, `employee_id_sequences` |
| Attendance (staff/biometric) | `biometric_device_master`, `biometric_punch_log`, `attendance_head`, `attendance_detail`, `attendance_staging`, `sync_log` |
| Documents | `document_types`, `student_documents` |
| SMS | `sms_logs` |

### 20.2 Primary & Foreign Keys (selected)

| Table | PK | Key FKs |
|-------|----|---------|
| `users` | user_id | school_id→schools, branch_id→branches, role_id→roles, staff_id→staff_master |
| `students` | student_id | school_id, branch_id |
| `fee_payments` | payment_id | student_id→students, branch_id, school_id |
| `studentfees` | id | student_id→students, fee_type_id→feetypes |
| `role_permissions` | id | role_id→roles, permission_id→permissions |
| `user_branch_access` | id | user_id→users, branch_id→branches |
| `staff_master` | id | school_id→schools, branch_id, department_id, designation_id, default_shift_id, reporting_manager_id→staff_master |
| `attendance_head` | id | staff_id→staff_master, shift_id→shift_master |
| `petty_cash` | id | branch_id→branches, ledger_id→petty_cash_ledger, approved_by→users |
| `audit_logs` | id | user_id→users, school_id→schools, branch_id→branches |

### 20.3 Key Uniqueness Constraints

- `students.admission_no` unique (global); `users.username`, `users.useremail` unique.
- `permissions(dashboard,module,component)` and `permissions.code` unique; `role_permissions(role_id,permission_id)` unique.
- `feetypes(feetype,branch,academic_year,school_id)` unique.
- `class_sections(class_id,branch_id,academic_year,section_name)` unique.
- `staff_master(school_id,staff_code)` and `(school_id,employee_id)` unique.
- `attendance_head(staff_id,attendance_date)` unique; `biometric_punch_log(device_id,biometric_id,punch_datetime,verification_mode)` unique.
- `enrollment_sequences(branch_id,academic_year_id)` unique (admission/receipt counters).

### 20.4 Entity Relationship Overview

```
School (1)───(N) Branch (1)───(N) ClassSection ───(N) Students
   │                │                                   │
   │                └──(N) Fee masters / Petty Cash / Staff
   │
User (N)──access──(N) Branch/School   Role (1)──(N) RolePermission (N)──(1) Permission
Student (1)──(N) StudentFee/FeePayment/StudentMarks/StudentDocument
Staff (1)──(N) AttendanceHead (1)──(N) AttendanceDetail   BiometricDevice (1)──(N) PunchLog
Every audited row ⇒ (N) AuditLog entries
```

### 20.5 Identifier Generation

- **Admission / Receipt numbers:** `enrollment_sequences` per branch+year with prefixes, row-locked for concurrency.
- **Staff code:** `{branch_code}{department_numeric_code}{sequence:04d}` via `staff_code_sequences`.
- **Employee id:** per school+department via `employee_id_sequences`.

---

# 21. ERROR HANDLING GUIDE

| Error Code / Message | Description | Root Cause | Solution | Preventive Action |
|----------------------|-------------|-----------|----------|-------------------|
| `401 Token is missing!` | No auth header | Not logged in / header stripped | Re-login; ensure `Authorization` sent | Keep token in storage; refresh before expiry |
| `401 Token has expired!` | JWT past 24h | Long idle session | Re-login | Re-authenticate proactively |
| `401 invalid credentials` | Wrong username/password | Typo / unknown user | Verify credentials / reset password | Password policy + reset flow |
| `401 Account is deactivated` | User inactive | Admin disabled account | Contact admin to reactivate | Governance of active flag |
| `403 Forbidden: missing permission` | RBAC denies action | Role lacks permission | Grant permission in Role Permissions | Correct role design |
| `403 Unauthorized branch/school` | Cross-tenant access | No access grant | Add `UserBranchAccess`/`UserSchoolAccess` | Provision access on onboarding |
| `400 Invalid X-School-ID header` | Bad tenant header | Non-integer/`all` value | Send integer or `all` | Frontend validation |
| `400 Username already exists` | Duplicate user | Reused username | Choose unique username | Pre-check availability |
| `400 Email already in use` | Duplicate email | Reused email | Use unique email | Validate before submit |
| `400 Password must be at least 8 characters` | Weak password | Policy violation | Use ≥8 chars | UI hint |
| `400 Role name already exists` | Duplicate role | Reused name | Rename role | List existing roles |
| `400 System role names cannot be changed` | Editing system role | Attempt to rename system role | Create a new custom role | Lock system roles in UI |
| `400 SuperAdmin role cannot be deactivated` | Disabling SuperAdmin | Safety rule | Keep active | — |
| `404 Not found` | Missing record | Wrong id / deleted | Verify id | Refresh lists |
| `413 File too large` | Upload >16 MB | Oversized file | Compress/split | Client-side size check |
| `429 Too Many Requests` | Rate limit | Rapid retries | Wait and retry | Debounce requests |
| `500 Internal server error` | Unhandled error | Bug / DB issue | Check `global_500_error.log`; contact L3 | Monitoring & tests |
| "Grade scale not configured" | No matching scale | Missing/incomplete scale | Create scale for location/year | Setup checklist |
| "Amount exceeds due" | Overpayment | Paid > outstanding | Correct amount | Show due prominently |

---

# 22. TROUBLESHOOTING GUIDE

| Symptom | Root Cause | Resolution Steps |
|---------|-----------|------------------|
| Cannot log in | Wrong creds / deactivated / rate-limited | Verify credentials; check active flag; wait 60s if 429; reset password |
| Menu items missing | Missing RBAC permissions | Admin grants read on required permission codes |
| "No data" on lists | Wrong branch/academic-year context | Switch branch/year in header; confirm access grants |
| Fee shows no dues | Fee structure not assigned | Assign class fee structure / standard fee |
| Grade not computed | Grade scale missing/incomplete | Configure continuous grade ranges |
| Marks screen empty | Test not assigned to students | Assign class test → students first |
| Student import fails | Bad template / duplicate admission no | Use latest template; fix duplicates; re-upload |
| Biometric attendance not appearing | SyncAgent down / mapping missing | Check SyncAgent + `config.json`; verify `biometric_id` mapping; inspect Punch Log |
| SMS not delivered | Gateway creds/template missing | Set SMS env vars & template ids; check `sms_logs` reason |
| OTP email not received | SMTP not configured | Set MAIL_* env; check spam; retry (10-min expiry) |
| Document upload fails | OCI not configured / file too large | Set `OCI_NAMESPACE`/`OCI_BUCKET_NAME`; keep ≤16 MB |
| 500 errors | Server exception | Review `global_500_error.log`; escalate to L3 with request details |

---

# 23. FAQ

1. **What is MS LearnSpace ERP?** A multi-tenant school ERP for academics, fees, HR, and attendance.
2. **How do I log in?** Enter your username and password on the Login screen.
3. **I forgot my password. What now?** Use Forgot Password → OTP emailed → verify → set new password.
4. **How long does a session last?** 24 hours (JWT expiry); then re-login.
5. **Why can't I see a menu item?** Your role lacks the required permission; ask an admin.
6. **What is a "branch"?** A physical campus under a school (tenant).
7. **What is an "academic year"?** The session (e.g. 2025-2026) that scopes data.
8. **Can I access another branch's data?** Only if granted branch/school access; SuperAdmin sees all.
9. **How do I switch branches?** Use the branch selector in the header (switch-context).
10. **How is a student admission number generated?** Automatically per branch and year with a prefix.
11. **Can I import students in bulk?** Yes, via Import Student Data (Excel template).
12. **How do I collect a fee?** Take Fee → search student → select dues → enter amount → collect → print.
13. **Can parents pay partially?** Yes; partial payments update paid/due and mark status Partial.
14. **How do I apply a concession?** Configure it in Concession Master, then select at collection or via student concession.
15. **Can I reverse a fee receipt?** Yes, with delete permission; it moves to Deleted Receipts with a reason.
16. **Where do I see reversed receipts?** Deleted Receipts report.
17. **How are grades calculated?** Marks are mapped to grades using the configured grade scale.
18. **What are grade scale rules?** Continuous, non-overlapping ranges; min < max; unique per location/year.
19. **How do I enter marks?** Marks Entry → select context/test/subject → enter → save.
20. **What are Deeniyath/Hifz subjects?** Islamic/Quranic subjects supported alongside academic subjects.
21. **How do I create a user?** Control Panel → User Management → Add (needs user-management write).
22. **How do I create a custom role?** Role Permissions → create role → toggle permissions.
23. **What actions can a permission grant?** Read, Write (create/edit), Append (import/add), Delete.
24. **Who can create a SuperAdmin?** Only someone with role-management write (a SuperAdmin).
25. **How do I deactivate a user?** Set the user inactive in User Management (preferred over delete).
26. **Is data deleted permanently?** Prefer deactivation; hard delete exists but is audited.
27. **What is logged in the audit trail?** Every create/update/delete with old/new values, user, IP, time.
28. **Who can view audit logs?** Admins/SuperAdmin per RBAC.
29. **How do I add a new school (tenant)?** School Management → create school.
30. **How do I add a branch?** Branches under a school (or seed-branches).
31. **How do I set up classes?** Setup → Classes Management (create with sections).
32. **How do I configure fees?** Fee Type → Class Fee Structure → Installments → Concessions.
33. **How do I set holidays/week-offs?** Setup → Configuration.
34. **How do I onboard staff?** HR → Staff Master (staff code/employee id auto-generated).
35. **How is staff attendance captured?** Biometric devices → SyncAgent → attendance engine.
36. **What if a staff punch is missing?** Check device/SyncAgent status and biometric mapping; view Punch Log.
37. **Can I edit staff attendance manually?** Yes, source `MANUAL` is supported (subject to permissions).
38. **How do I send SMS?** SMS Center (attendance/fee receipt/due/announcement).
39. **Where are SMS results?** SMS Reports / `sms_logs`.
40. **How do I upload student documents?** Document Management → upload (stored in OCI).
41. **What file size is allowed?** Up to 16 MB per upload.
42. **How do I print a report card?** Report Card screen → generate → print/PDF.
43. **How do I export a report?** Use Export (Excel) on report screens.
44. **Why is a report empty?** Check filters (branch/year/date) and permissions.
45. **How do I approve petty cash?** Petty Cash Approval → Approve/Reject.
46. **Can I allocate petty-cash funds?** Yes, Fund Allocation (with approval).
47. **What browsers are supported?** Modern evergreen browsers (Chrome/Edge/Firefox/Safari).
48. **Is there a mobile app?** Not in the baseline; the web app is responsive.
49. **How do I change my own password?** Profile → change password (verifies current password).
50. **Who do I contact for help?** Support (L1) via the StaffSupport link; escalation per Section 26.
51. **Is MFA available at login?** OTP is used for password reset; login MFA is on the roadmap.
52. **How are secrets protected?** Stored in environment variables; never in code; strong `SECRET_KEY` in production.

---

# 24. TRAINING GUIDE

### 24.1 Training Plan

| Audience | Duration | Focus |
|----------|----------|-------|
| Front office / Admissions | 2h | Create/import students, section/promotion, documents |
| Accounts / Cashier | 3h | Fee structures, collection, receipts, reversals, reports, petty cash |
| Teachers / Coordinators | 2h | Subjects, tests, grade scales, marks, report cards |
| HR | 2h | Staff masters, biometric mapping, attendance summary |
| Administrators | 3h | Users, roles/RBAC, schools/branches, configuration, audit |
| Support | 2h | Troubleshooting, error handling, escalation |

### 24.2 Training Material

- This documentation, quick-reference cards per role, sandbox tenant with sample data, recorded walkthroughs.

### 24.3 Walkthrough Scenarios

1. Onboard a school → branch → academic year → classes/sections.
2. Admit a student and assign fees; collect a partial payment and print the receipt.
3. Configure a grade scale, assign a class test, enter marks, print a report card.
4. Create a custom role and grant scoped permissions; create a user with that role.
5. Onboard staff, map biometric, verify attendance summary.
6. Raise and approve a petty-cash voucher.

### 24.4 User Exercises

- Import 10 sample students from the template.
- Reverse a test receipt and locate it in Deleted Receipts.
- Grant a user access to a second branch and verify data visibility.
- Generate a monthly fee collection report and export to Excel.

---

# 25. GO-LIVE CHECKLIST

### 25.1 Pre-Go-Live

- [ ] Production `SECRET_KEY` (≥32 chars) and `CORS_ALLOWED_ORIGINS` set.
- [ ] Database provisioned; migrations applied (`flask db upgrade`); single migration head.
- [ ] SMTP, SMS, and OCI storage configured and tested.
- [ ] Permission catalog synced; roles defined; least-privilege verified.
- [ ] Master data loaded (schools, branches, classes, fee types, grade scales, HR masters).
- [ ] Initial admin/SuperAdmin accounts created; test logins for each role.
- [ ] Student and staff data migrated/imported and validated.
- [ ] Biometric devices configured; SyncAgent connectivity verified.
- [ ] Backups scheduled; audit logging verified.
- [ ] UAT sign-off from finance, academics, HR, admin.

### 25.2 Go-Live

- [ ] Freeze legacy system writes; final data sync.
- [ ] Enable production access; monitor logs (`global_500_error.log`), rate limits, DB.
- [ ] Smoke test: login, student create, fee collect, marks entry, report export.
- [ ] Support (L1/L2/L3) on standby.

### 25.3 Post-Go-Live

- [ ] Daily fee reconciliation for first week.
- [ ] Monitor audit logs and failed logins.
- [ ] Collect user feedback; triage issues.
- [ ] Verify scheduled backups and SMS/email delivery.
- [ ] Retrospective and documentation updates.

---

# 26. SUPPORT GUIDE

### 26.1 Support Tiers

| Tier | Scope | Examples | Resolution |
|------|-------|----------|------------|
| **L1** | First contact / usage | Login help, navigation, "menu missing", how-to | Guide user; check permissions/context; reset password |
| **L2** | Configuration / data | Fee structure issues, role setup, import errors, SMS/email config | Adjust config/masters; reprocess imports; verify env vars |
| **L3** | Engineering | 500 errors, data corruption, integration/biometric failures, bugs | Inspect logs/DB; code fix; migration; deploy |

### 26.2 Processes

- **L1:** capture issue, reproduce, apply known fixes (Section 22), document; escalate to L2 if config/data.
- **L2:** validate config/master data, correct grants/settings, reprocess; escalate to L3 for defects.
- **L3:** root-cause via logs (`global_500_error.log`), audit trail, DB; patch and release; write regression test.

### 26.3 Escalation Matrix

| Priority | Definition | First Response | Escalation Path |
|----------|-----------|----------------|-----------------|
| P1 Critical | System down / can't collect fees | 15 min | L1→L3 + Management |
| P2 High | Module unusable for many | 1 h | L1→L2→L3 |
| P3 Medium | Single-user / workaround exists | 4 h | L1→L2 |
| P4 Low | Cosmetic / query | 1 business day | L1 |

---

# 27. APPENDICES

### 27.1 Glossary

| Term | Definition |
|------|-----------|
| Tenant / School | Top-level client (franchise brand) isolating all data |
| Branch | Physical campus under a school |
| Academic Year | Session scope (e.g. 2025-2026) |
| Query Scoping | Automatic filtering of queries by `school_id`/`branch_id` |
| AuditMixin | Base that adds created/updated by/at and triggers audit logging |
| Permission Code | Dot-notation `dashboard.module.component` access key |
| RBAC | Role-Based Access Control (roles → permissions → actions) |
| Staff Code | Auto id `{branch}{dept}{seq}` |
| Concession | Fee discount (percentage or flat) |
| Petty Cash | Small branch expenses tracked with approval |
| Punch Log | Raw biometric entry/exit records |
| Staging | Buffer for raw biometric data before processing |
| Report Card | Consolidated academic result document |

### 27.2 Abbreviations

| Abbr | Meaning |
|------|---------|
| ERP | Enterprise Resource Planning |
| RBAC | Role-Based Access Control |
| JWT | JSON Web Token |
| OTP | One-Time Password |
| MFA | Multi-Factor Authentication |
| SSO | Single Sign-On |
| API | Application Programming Interface |
| OCI | Oracle Cloud Infrastructure |
| PII | Personally Identifiable Information |
| SPA | Single-Page Application |
| CRUD | Create, Read, Update, Delete |
| KPI | Key Performance Indicator |

### 27.3 References

- Repository: `MS-LearnSpace-Hub/Franchise`
- `erp-backend/permission_catalog.py` — permission catalog & action keys
- `erp-backend/models.py` — data model, audit & scoping listeners
- `erp-backend/helpers.py` — auth, scoping, permission helpers
- `erp-backend/routes/*` — API blueprints
- `erp-backend/migrations/` — Alembic schema history
- `frontend/src/` — React SPA (App.tsx, Sidebar.tsx, components)
- `Readme.md` — end-user workflow guide

### 27.4 Version History

See Section 1.1 (Revision History) and 1.2 (Change Log).

### 27.5 Known Limitations

- No login-time MFA (OTP is reset-only); no SSO in baseline.
- Single-level approval for petty cash/fund allocation.
- No full payroll, timetable, LMS, or parent self-service portal.
- No native mobile app (responsive web only).
- Bulk import is available for students, not for users.
- Account auto-lock threshold not enforced (failed attempts tracked only).

### 27.6 Future Enhancements

- Pluggable MFA/SSO (OIDC/SAML) at login.
- Multi-level, configurable approval workflows with delegation & escalation timers.
- Payroll module leveraging locked attendance.
- Parent/student self-service portal and mobile apps.
- Timetable/scheduling and LMS integration.
- Configurable account lockout policy and password rotation.
- In-app audit-log viewer with advanced filtering and exports.

---

*End of document.*
