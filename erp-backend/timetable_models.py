"""
Timetable Module — Models
--------------------------
New, self-contained models for the Timetable feature. Nothing here modifies
any existing table. Import this module once (done inside
routes/timetable_routes.py) so Flask-Migrate picks these tables up.

Entities:
  - SubjectTeacherAssignment : which teacher teaches which subject, per
    branch/class/section/academic-year. Powers the "auto-fill teacher when
    subject is picked" behaviour in the timetable builder.
  - TimetableDayStructure    : one row per branch/class/section/year/day —
    the container for that day's periods & breaks.
  - TimetableSlot            : the ordered rows (PERIOD / BREAK / LUNCH /
    ASSEMBLY) that make up a TimetableDayStructure. Each PERIOD slot can
    carry a subject_id + teacher_id.
"""

from extensions import db
from models import AuditMixin


DAY_OF_WEEK_VALUES = ("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")
SLOT_TYPE_VALUES = ("PERIOD", "BREAK", "LUNCH", "ASSEMBLY")


class SubjectTeacherAssignment(db.Model, AuditMixin):
    """Master mapping: Subject -> Teacher, scoped per branch/class/section/year."""
    __tablename__ = "timetable_subject_teacher"
    __audit_module__ = "ACADEMICS"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    school_id = db.Column(db.Integer, db.ForeignKey("schools.id", ondelete="SET NULL"), nullable=True)
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    class_id = db.Column(db.Integer, db.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False)
    section_id = db.Column(db.Integer, db.ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False)
    academic_year = db.Column(db.String(20), nullable=False)

    subject_id = db.Column(db.Integer, db.ForeignKey("subjectmaster.id", ondelete="CASCADE"), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey("staff_master.id", ondelete="SET NULL"), nullable=True)
    is_primary = db.Column(db.Boolean, default=True)

    branch = db.relationship("Branch", foreign_keys=[branch_id])
    class_obj = db.relationship("ClassMaster", foreign_keys=[class_id])
    section = db.relationship("ClassSection", foreign_keys=[section_id])
    subject = db.relationship("SubjectMaster", foreign_keys=[subject_id])
    teacher = db.relationship("StaffMaster", foreign_keys=[teacher_id])

    __table_args__ = (
        db.UniqueConstraint(
            "branch_id", "class_id", "section_id", "subject_id", "academic_year", "is_primary",
            name="uq_subject_teacher_context"
        ),
        db.Index("idx_subj_teacher_context", "branch_id", "class_id", "section_id", "academic_year"),
    )


class TimetableDayStructure(db.Model, AuditMixin):
    """Container for one day's timetable layout for a given class + section."""
    __tablename__ = "timetable_day_structure"
    __audit_module__ = "ACADEMICS"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    school_id = db.Column(db.Integer, db.ForeignKey("schools.id", ondelete="SET NULL"), nullable=True)
    branch_id = db.Column(db.Integer, db.ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    class_id = db.Column(db.Integer, db.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False)
    section_id = db.Column(db.Integer, db.ForeignKey("class_sections.id", ondelete="CASCADE"), nullable=False)
    academic_year = db.Column(db.String(20), nullable=False)

    day_of_week = db.Column(db.Enum(*DAY_OF_WEEK_VALUES, name="tt_day_of_week"), nullable=False)
    is_working_day = db.Column(db.Boolean, default=True)

    branch = db.relationship("Branch", foreign_keys=[branch_id])
    class_obj = db.relationship("ClassMaster", foreign_keys=[class_id])
    section = db.relationship("ClassSection", foreign_keys=[section_id])
    slots = db.relationship(
        "TimetableSlot",
        backref="day_structure",
        cascade="all, delete-orphan",
        order_by="TimetableSlot.slot_order",
    )

    __table_args__ = (
        db.UniqueConstraint(
            "branch_id", "class_id", "section_id", "academic_year", "day_of_week",
            name="uq_day_structure_context"
        ),
        db.Index("idx_day_structure_context", "branch_id", "class_id", "section_id", "academic_year"),
    )


class TimetableSlot(db.Model, AuditMixin):
    """A single row (period or break) within a day's structure."""
    __tablename__ = "timetable_slot"
    __audit_module__ = "ACADEMICS"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)

    day_structure_id = db.Column(
        db.Integer, db.ForeignKey("timetable_day_structure.id", ondelete="CASCADE"), nullable=False
    )

    slot_order = db.Column(db.Integer, nullable=False)
    slot_type = db.Column(db.Enum(*SLOT_TYPE_VALUES, name="tt_slot_type"), nullable=False, default="PERIOD")
    label = db.Column(db.String(100), nullable=True)

    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)

    subject_id = db.Column(db.Integer, db.ForeignKey("subjectmaster.id", ondelete="SET NULL"), nullable=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey("staff_master.id", ondelete="SET NULL"), nullable=True)
    room = db.Column(db.String(50), nullable=True)

    subject = db.relationship("SubjectMaster", foreign_keys=[subject_id])
    teacher = db.relationship("StaffMaster", foreign_keys=[teacher_id])

    __table_args__ = (
        db.Index("idx_slot_day_order", "day_structure_id", "slot_order"),
        db.Index("idx_slot_teacher", "teacher_id"),
    )
