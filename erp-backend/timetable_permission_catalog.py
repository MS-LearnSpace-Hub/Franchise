"""
Timetable Module — Permission Catalog
--------------------------------------
Kept separate from permission_catalog.py so the Timetable module's access
rules live in one place. Merged into PERMISSION_CATALOG with a single line
in permission_catalog.py so your existing RBAC sync endpoint picks these up
automatically.
"""

from permission_catalog import permission

TIMETABLE_PERMISSIONS = [
    permission(
        "Academics", "Timetable", "Timetable Management",
        "academics.timetable.timetable-management",
        "Access to the Timetable module"
    ),
    permission(
        "Academics", "Timetable", "Period Structure Setup",
        "academics.timetable.period-structure",
        "Define day-wise periods and breaks for a class/section"
    ),
    permission(
        "Academics", "Timetable", "Subject Teacher Assignment",
        "academics.timetable.subject-teacher-assignment",
        "Assign teachers to subjects for a class/section"
    ),
    permission(
        "Academics", "Timetable", "Class Timetable Builder",
        "academics.timetable.class-timetable",
        "Build and edit the weekly timetable grid for a class/section"
    ),
    permission(
        "Academics", "Timetable", "View Timetable",
        "academics.timetable.view-timetable",
        "Read-only view of a class/section timetable"
    ),
    permission(
        "Academics", "Timetable", "My Timetable",
        "academics.timetable.teacher-timetable",
        "A teacher's own weekly schedule across classes/sections"
    ),
]
