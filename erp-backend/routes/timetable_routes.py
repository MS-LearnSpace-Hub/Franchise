"""
Timetable Module — Routes
--------------------------
Self-contained blueprint for the Timetable feature. Registered in app.py
with a single line:  app.register_blueprint(timetable_bp, url_prefix="/api/timetable")

Covers:
  - Lookups (sections / subjects / teachers) scoped to class+branch+year
  - Subject -> Teacher assignment (master that powers auto-fill)
  - Day structure builder (periods + breaks, per day, per class/section)
  - Weekly timetable grid (read)
  - Teacher's own schedule (read)
"""

from datetime import datetime
from flask import Blueprint, request, jsonify

from extensions import db
from models import (
    Branch, ClassMaster, ClassSection, SubjectMaster,
    ClassSubjectAssignment, StaffMaster, User,
)
from timetable_models import (
    SubjectTeacherAssignment, TimetableDayStructure, TimetableSlot,
    DAY_OF_WEEK_VALUES,
)
from helpers import token_required, permission_required, get_user_allowed_branches

timetable_bp = Blueprint("timetable_bp", __name__)


# -------------------------------------------------------------------------
# Shared helpers
# -------------------------------------------------------------------------

def _parse_time(value):
    """Accepts 'HH:MM' or 'HH:MM:SS' and returns a datetime.time."""
    if value is None or value == "":
        return None
    if isinstance(value, str):
        for fmt in ("%H:%M:%S", "%H:%M"):
            try:
                return datetime.strptime(value, fmt).time()
            except ValueError:
                continue
        raise ValueError(f"Invalid time format: {value}")
    return value


def _time_str(t):
    return t.strftime("%H:%M") if t else None


def _check_branch_access(current_user, branch_id):
    """Returns (ok: bool, error_response_or_None)."""
    if not branch_id:
        return False, (jsonify({"error": "branch_id is required"}), 400)
    allowed = get_user_allowed_branches(current_user)
    if not allowed["is_unlimited"] and int(branch_id) not in (allowed["ids"] or set()):
        return False, (jsonify({"error": "Unauthorized: no access to this branch"}), 403)
    return True, None


def _overlaps(start1, end1, start2, end2):
    return start1 < end2 and start2 < end1


def _find_teacher_conflicts(teacher_id, day_of_week, academic_year, incoming_slots, exclude_day_structure_id=None):
    """
    Checks whether any incoming PERIOD slot's teacher is already booked
    elsewhere at an overlapping time, same day + academic year.
    incoming_slots: list of dicts with start_time/end_time (time objects) and teacher_id
    Returns a list of human-readable conflict messages (empty if none).
    """
    conflicts = []
    if not teacher_id:
        return conflicts

    query = (
        db.session.query(TimetableSlot, TimetableDayStructure)
        .join(TimetableDayStructure, TimetableSlot.day_structure_id == TimetableDayStructure.id)
        .filter(
            TimetableSlot.teacher_id == teacher_id,
            TimetableDayStructure.day_of_week == day_of_week,
            TimetableDayStructure.academic_year == academic_year,
        )
    )
    if exclude_day_structure_id:
        query = query.filter(TimetableDayStructure.id != exclude_day_structure_id)

    existing = query.all()

    for slot in incoming_slots:
        for ex_slot, ex_day in existing:
            if _overlaps(slot["start_time"], slot["end_time"], ex_slot.start_time, ex_slot.end_time):
                conflicts.append(
                    f"Teacher already scheduled {_time_str(ex_slot.start_time)}-{_time_str(ex_slot.end_time)} "
                    f"on {day_of_week} (Class {ex_day.class_id}, Section {ex_day.section_id})"
                )
    return conflicts


# -------------------------------------------------------------------------
# Lookups
# -------------------------------------------------------------------------

@timetable_bp.route("/lookups/sections", methods=["GET"])
@token_required
def lookup_sections(current_user):
    class_id = request.args.get("class_id")
    branch_id = request.args.get("branch_id")
    academic_year = request.args.get("academic_year")

    if not all([class_id, branch_id, academic_year]):
        return jsonify({"error": "class_id, branch_id and academic_year are required"}), 400

    ok, err = _check_branch_access(current_user, branch_id)
    if not ok:
        return err

    sections = ClassSection.query.filter_by(
        class_id=class_id, branch_id=branch_id, academic_year=academic_year, is_active=True
    ).order_by(ClassSection.section_name).all()

    return jsonify({
        "sections": [{"id": s.id, "section_name": s.section_name} for s in sections]
    }), 200


@timetable_bp.route("/lookups/subjects", methods=["GET"])
@token_required
def lookup_subjects(current_user):
    class_id = request.args.get("class_id")
    branch_id = request.args.get("branch_id")
    academic_year = request.args.get("academic_year")

    if not all([class_id, branch_id, academic_year]):
        return jsonify({"error": "class_id, branch_id and academic_year are required"}), 400

    ok, err = _check_branch_access(current_user, branch_id)
    if not ok:
        return err

    branch = Branch.query.get(int(branch_id))
    if not branch:
        return jsonify({"error": "Branch not found"}), 404

    rows = (
        db.session.query(SubjectMaster)
        .join(ClassSubjectAssignment, ClassSubjectAssignment.subject_id == SubjectMaster.id)
        .filter(
            ClassSubjectAssignment.class_id == class_id,
            ClassSubjectAssignment.academic_year == academic_year,
            ClassSubjectAssignment.branch == branch.branch_name,
            SubjectMaster.is_active == True,
        )
        .order_by(SubjectMaster.subject_name)
        .all()
    )

    return jsonify({
        "subjects": [{"id": s.id, "subject_name": s.subject_name, "subject_type": s.subject_type} for s in rows]
    }), 200


@timetable_bp.route("/lookups/teachers", methods=["GET"])
@token_required
def lookup_teachers(current_user):
    branch_id = request.args.get("branch_id")

    query = StaffMaster.query.filter(StaffMaster.employment_status == "ACTIVE")

    if branch_id:
        ok, err = _check_branch_access(current_user, branch_id)
        if not ok:
            return err
        query = query.filter(StaffMaster.branch_id == branch_id)
    else:
        allowed = get_user_allowed_branches(current_user)
        if not allowed["is_unlimited"]:
            query = query.filter(StaffMaster.branch_id.in_(allowed["ids"] or set()))

    staff = query.order_by(StaffMaster.first_name).all()

    return jsonify({
        "teachers": [{
            "id": s.id,
            "name": s.display_name or f"{s.first_name} {s.last_name or ''}".strip(),
            "designation": s.designation.designation_name if s.designation else None,
        } for s in staff]
    }), 200


# -------------------------------------------------------------------------
# Subject -> Teacher Assignment
# -------------------------------------------------------------------------

@timetable_bp.route("/subject-teacher", methods=["GET"])
@token_required
@permission_required("academics.timetable.subject-teacher-assignment", "read")
def get_subject_teacher(current_user):
    class_id = request.args.get("class_id")
    section_id = request.args.get("section_id")
    branch_id = request.args.get("branch_id")
    academic_year = request.args.get("academic_year")

    if not all([class_id, section_id, branch_id, academic_year]):
        return jsonify({"error": "class_id, section_id, branch_id and academic_year are required"}), 400

    ok, err = _check_branch_access(current_user, branch_id)
    if not ok:
        return err

    branch = Branch.query.get(int(branch_id))
    if not branch:
        return jsonify({"error": "Branch not found"}), 404

    subjects = (
        db.session.query(SubjectMaster)
        .join(ClassSubjectAssignment, ClassSubjectAssignment.subject_id == SubjectMaster.id)
        .filter(
            ClassSubjectAssignment.class_id == class_id,
            ClassSubjectAssignment.academic_year == academic_year,
            ClassSubjectAssignment.branch == branch.branch_name,
            SubjectMaster.is_active == True,
        )
        .order_by(SubjectMaster.subject_name)
        .all()
    )

    existing = SubjectTeacherAssignment.query.filter_by(
        class_id=class_id, section_id=section_id, branch_id=branch_id, academic_year=academic_year, is_primary=True
    ).all()
    existing_map = {e.subject_id: e for e in existing}

    result = []
    for subj in subjects:
        assignment = existing_map.get(subj.id)
        teacher = assignment.teacher if assignment else None
        result.append({
            "subject_id": subj.id,
            "subject_name": subj.subject_name,
            "teacher_id": assignment.teacher_id if assignment else None,
            "teacher_name": (teacher.display_name or f"{teacher.first_name} {teacher.last_name or ''}".strip()) if teacher else None,
        })

    return jsonify({"assignments": result}), 200


@timetable_bp.route("/subject-teacher", methods=["POST"])
@token_required
@permission_required("academics.timetable.subject-teacher-assignment", "write")
def save_subject_teacher(current_user):
    data = request.json or {}
    class_id = data.get("class_id")
    section_id = data.get("section_id")
    branch_id = data.get("branch_id")
    school_id = data.get("school_id")
    academic_year = data.get("academic_year")
    assignments = data.get("assignments", [])

    if not all([class_id, section_id, branch_id, academic_year]):
        return jsonify({"error": "class_id, section_id, branch_id and academic_year are required"}), 400

    ok, err = _check_branch_access(current_user, branch_id)
    if not ok:
        return err

    try:
        SubjectTeacherAssignment.query.filter_by(
            class_id=class_id, section_id=section_id, branch_id=branch_id,
            academic_year=academic_year, is_primary=True
        ).delete()

        for a in assignments:
            if not a.get("teacher_id"):
                continue  # allow leaving a subject unassigned
            db.session.add(SubjectTeacherAssignment(
                school_id=school_id,
                branch_id=branch_id,
                class_id=class_id,
                section_id=section_id,
                academic_year=academic_year,
                subject_id=a["subject_id"],
                teacher_id=a["teacher_id"],
                is_primary=True,
            ))

        db.session.commit()
        return jsonify({"message": "Subject-Teacher assignments saved"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# -------------------------------------------------------------------------
# Day Structure Builder
# -------------------------------------------------------------------------

def _serialize_day(day_structure):
    return {
        "day_structure_id": day_structure.id,
        "day_of_week": day_structure.day_of_week,
        "is_working_day": day_structure.is_working_day,
        "slots": [{
            "id": s.id,
            "slot_order": s.slot_order,
            "slot_type": s.slot_type,
            "label": s.label,
            "start_time": _time_str(s.start_time),
            "end_time": _time_str(s.end_time),
            "subject_id": s.subject_id,
            "subject_name": s.subject.subject_name if s.subject else None,
            "teacher_id": s.teacher_id,
            "teacher_name": (s.teacher.display_name or f"{s.teacher.first_name} {s.teacher.last_name or ''}".strip()) if s.teacher else None,
            "room": s.room,
        } for s in day_structure.slots],
    }


@timetable_bp.route("/day-structure", methods=["GET"])
@token_required
@permission_required("academics.timetable.view-timetable", "read")
def get_day_structure(current_user):
    class_id = request.args.get("class_id")
    section_id = request.args.get("section_id")
    branch_id = request.args.get("branch_id")
    academic_year = request.args.get("academic_year")
    day_of_week = request.args.get("day_of_week")

    if not all([class_id, section_id, branch_id, academic_year]):
        return jsonify({"error": "class_id, section_id, branch_id and academic_year are required"}), 400

    ok, err = _check_branch_access(current_user, branch_id)
    if not ok:
        return err

    query = TimetableDayStructure.query.filter_by(
        class_id=class_id, section_id=section_id, branch_id=branch_id, academic_year=academic_year
    )

    if day_of_week:
        day = query.filter_by(day_of_week=day_of_week).first()
        return jsonify(_serialize_day(day) if day else {
            "day_structure_id": None, "day_of_week": day_of_week, "is_working_day": True, "slots": []
        }), 200

    days = {d.day_of_week: _serialize_day(d) for d in query.all()}
    for dow in DAY_OF_WEEK_VALUES:
        if dow not in days:
            days[dow] = {"day_structure_id": None, "day_of_week": dow, "is_working_day": True, "slots": []}
    return jsonify({"days": days}), 200


@timetable_bp.route("/day-structure", methods=["POST"])
@token_required
@permission_required("academics.timetable.period-structure", "write")
def save_day_structure(current_user):
    data = request.json or {}
    class_id = data.get("class_id")
    section_id = data.get("section_id")
    branch_id = data.get("branch_id")
    school_id = data.get("school_id")
    academic_year = data.get("academic_year")
    day_of_week = data.get("day_of_week")
    is_working_day = data.get("is_working_day", True)
    slots_in = data.get("slots", [])
    force = bool(data.get("force", False))

    if not all([class_id, section_id, branch_id, academic_year, day_of_week]):
        return jsonify({"error": "class_id, section_id, branch_id, academic_year and day_of_week are required"}), 400
    if day_of_week not in DAY_OF_WEEK_VALUES:
        return jsonify({"error": f"day_of_week must be one of {DAY_OF_WEEK_VALUES}"}), 400

    ok, err = _check_branch_access(current_user, branch_id)
    if not ok:
        return err

    try:
        # Parse + validate incoming slots
        parsed_slots = []
        assigned_class_subject_ids = None
        for s in slots_in:
            start_t = _parse_time(s.get("start_time"))
            end_t = _parse_time(s.get("end_time"))
            if not start_t or not end_t:
                return jsonify({"error": f"Slot {s.get('slot_order')} is missing start_time/end_time"}), 400
            if start_t >= end_t:
                return jsonify({"error": f"Slot {s.get('slot_order')} has start_time >= end_time"}), 400

            subject_id = s.get("subject_id")
            slot_type = s.get("slot_type", "PERIOD")

            if slot_type == "PERIOD" and subject_id:
                if assigned_class_subject_ids is None:
                    branch = Branch.query.get(int(branch_id))
                    assigned_class_subject_ids = {
                        row.subject_id for row in ClassSubjectAssignment.query.filter_by(
                            class_id=class_id, academic_year=academic_year,
                            branch=branch.branch_name if branch else None
                        ).all()
                    }
                if subject_id not in assigned_class_subject_ids:
                    return jsonify({"error": f"Subject {subject_id} is not assigned to this class"}), 400

            parsed_slots.append({
                "slot_order": s.get("slot_order"),
                "slot_type": slot_type,
                "label": s.get("label"),
                "start_time": start_t,
                "end_time": end_t,
                "subject_id": subject_id if slot_type == "PERIOD" else None,
                "teacher_id": s.get("teacher_id") if slot_type == "PERIOD" else None,
                "room": s.get("room"),
            })

        # Find-or-create the day structure
        day = TimetableDayStructure.query.filter_by(
            class_id=class_id, section_id=section_id, branch_id=branch_id,
            academic_year=academic_year, day_of_week=day_of_week
        ).first()

        # Conflict check (per distinct teacher in the incoming payload)
        if not force:
            conflicts = []
            teachers_in_payload = {s["teacher_id"] for s in parsed_slots if s["teacher_id"]}
            for t_id in teachers_in_payload:
                t_slots = [s for s in parsed_slots if s["teacher_id"] == t_id]
                conflicts.extend(_find_teacher_conflicts(
                    t_id, day_of_week, academic_year, t_slots,
                    exclude_day_structure_id=day.id if day else None
                ))
            if conflicts:
                return jsonify({"error": "Teacher scheduling conflict", "conflicts": conflicts}), 409

        if not day:
            day = TimetableDayStructure(
                school_id=school_id, branch_id=branch_id, class_id=class_id, section_id=section_id,
                academic_year=academic_year, day_of_week=day_of_week, is_working_day=is_working_day,
            )
            db.session.add(day)
            db.session.flush()
        else:
            day.is_working_day = is_working_day
            TimetableSlot.query.filter_by(day_structure_id=day.id).delete()

        for s in parsed_slots:
            db.session.add(TimetableSlot(day_structure_id=day.id, **s))

        db.session.commit()
        return jsonify({"message": "Day structure saved", "day_structure_id": day.id}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@timetable_bp.route("/day-structure/copy", methods=["POST"])
@token_required
@permission_required("academics.timetable.period-structure", "write")
def copy_day_structure(current_user):
    data = request.json or {}
    source = data.get("source", {})
    targets = data.get("targets", [])
    overwrite = bool(data.get("overwrite", False))

    required = ["class_id", "section_id", "branch_id", "academic_year", "day_of_week"]
    if not all(source.get(k) for k in required):
        return jsonify({"error": f"source requires {required}"}), 400
    if not targets:
        return jsonify({"error": "targets list is required"}), 400

    ok, err = _check_branch_access(current_user, source["branch_id"])
    if not ok:
        return err

    src_day = TimetableDayStructure.query.filter_by(
        class_id=source["class_id"], section_id=source["section_id"], branch_id=source["branch_id"],
        academic_year=source["academic_year"], day_of_week=source["day_of_week"]
    ).first()
    if not src_day or not src_day.slots:
        return jsonify({"error": "Source day structure has no slots to copy"}), 400

    src_slots_full = [{
        "slot_order": s.slot_order, "slot_type": s.slot_type, "label": s.label,
        "start_time": s.start_time, "end_time": s.end_time,
        "subject_id": s.subject_id, "teacher_id": s.teacher_id, "room": s.room,
    } for s in src_day.slots]

    # Structure-only copy: strip subject/teacher/room so cross-class/section
    # copies never carry over another class's subject or teacher assignment.
    src_slots_structure_only = [{
        "slot_order": s["slot_order"], "slot_type": s["slot_type"], "label": s["label"],
        "start_time": s["start_time"], "end_time": s["end_time"],
        "subject_id": None, "teacher_id": None, "room": None,
    } for s in src_slots_full]

    copied, skipped = 0, 0
    try:
        for t in targets:
            t_branch_id = t.get("branch_id", source["branch_id"])
            ok, err = _check_branch_access(current_user, t_branch_id)
            if not ok:
                skipped += 1
                continue

            t_class_id = t.get("class_id", source["class_id"])
            t_section_id = t.get("section_id", source["section_id"])
            t_day = t.get("day_of_week", source["day_of_week"])
            t_year = t.get("academic_year", source["academic_year"])

            existing = TimetableDayStructure.query.filter_by(
                class_id=t_class_id, section_id=t_section_id, branch_id=t_branch_id,
                academic_year=t_year, day_of_week=t_day
            ).first()

            if existing and existing.slots and not overwrite:
                skipped += 1
                continue

            if not existing:
                existing = TimetableDayStructure(
                    school_id=src_day.school_id, branch_id=t_branch_id, class_id=t_class_id,
                    section_id=t_section_id, academic_year=t_year, day_of_week=t_day,
                    is_working_day=src_day.is_working_day,
                )
                db.session.add(existing)
                db.session.flush()
            else:
                TimetableSlot.query.filter_by(day_structure_id=existing.id).delete()

            same_class_section = (t_class_id == source["class_id"] and t_section_id == source["section_id"])
            slots_to_copy = src_slots_full if same_class_section else src_slots_structure_only
            for s in slots_to_copy:
                db.session.add(TimetableSlot(day_structure_id=existing.id, **s))

            copied += 1

        db.session.commit()
        msg = f"Copied to {copied} target(s)."
        if skipped:
            msg += f" Skipped {skipped} (already had data or no access)."
        return jsonify({"message": msg}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@timetable_bp.route("/day-structure/coverage", methods=["GET"])
@token_required
@permission_required("academics.timetable.period-structure", "read")
def day_structure_coverage(current_user):
    branch_id = request.args.get("branch_id")
    academic_year = request.args.get("academic_year")

    if not all([branch_id, academic_year]):
        return jsonify({"error": "branch_id and academic_year are required"}), 400

    ok, err = _check_branch_access(current_user, branch_id)
    if not ok:
        return err

    sections = ClassSection.query.filter(
        ClassSection.branch_id == branch_id,
        ClassSection.academic_year == academic_year,
        ClassSection.is_active == True,
    ).order_by(ClassSection.section_name).all()

    class_ids = list({s.class_id for s in sections})
    classes = ClassMaster.query.filter(ClassMaster.id.in_(class_ids)).all() if class_ids else []
    class_map = {c.id: c.class_name for c in classes}

    existing_days = TimetableDayStructure.query.filter_by(
        branch_id=branch_id, academic_year=academic_year
    ).all()
    covered = {(d.class_id, d.section_id) for d in existing_days if d.slots}

    result = []
    for s in sections:
        result.append({
            "class_id": s.class_id,
            "class_name": class_map.get(s.class_id, ""),
            "section_id": s.id,
            "section_name": s.section_name,
            "has_structure": (s.class_id, s.id) in covered,
        })

    return jsonify({"items": result}), 200
@timetable_bp.route("/day-structure/copy-week", methods=["POST"])
@token_required
@permission_required("academics.timetable.period-structure", "write")
def copy_week_structure(current_user):
    data = request.get_json() or {}
    source = data.get("source") or {}
    target_sections = data.get("targets") or []

    src_branch_id = source.get("branch_id")
    src_class_id = source.get("class_id")
    src_section_id = source.get("section_id")
    academic_year = source.get("academic_year")

    if not all([src_branch_id, src_class_id, src_section_id, academic_year]):
        return jsonify({"error": "source class_id, section_id, branch_id, academic_year are required"}), 400
    if not target_sections:
        return jsonify({"error": "targets is required"}), 400

    ok, err = _check_branch_access(current_user, src_branch_id)
    if not ok:
        return err

    src_days = TimetableDayStructure.query.filter_by(
        branch_id=src_branch_id, class_id=src_class_id, section_id=src_section_id, academic_year=academic_year
    ).all()
    if not src_days:
        return jsonify({"error": "Source class/section has no timetable structure to copy"}), 400

    copied, skipped = [], []

    try:
        for tgt in target_sections:
            t_class_id = tgt.get("class_id")
            t_section_id = tgt.get("section_id")
            t_branch_id = tgt.get("branch_id", src_branch_id)

            existing = TimetableDayStructure.query.filter_by(
                branch_id=t_branch_id, class_id=t_class_id, section_id=t_section_id, academic_year=academic_year
            ).first()
            if existing:
                skipped.append({"class_id": t_class_id, "section_id": t_section_id, "reason": "already has structure"})
                continue

            for src_day in src_days:
                new_day = TimetableDayStructure(
                    school_id=src_day.school_id,
                    branch_id=t_branch_id,
                    class_id=t_class_id,
                    section_id=t_section_id,
                    academic_year=academic_year,
                    day_of_week=src_day.day_of_week,
                    is_working_day=src_day.is_working_day,
                    created_by=current_user.user_id,
                    updated_by=current_user.user_id,
                )
                db.session.add(new_day)
                db.session.flush()

                for s in src_day.slots:
                    db.session.add(TimetableSlot(
                        day_structure_id=new_day.id,
                        slot_order=s.slot_order,
                        slot_type=s.slot_type,
                        label=s.label,
                        start_time=s.start_time,
                        end_time=s.end_time,
                        subject_id=None,
                        teacher_id=None,
                        room=None,
                        created_by=current_user.user_id,
                        updated_by=current_user.user_id,
                    ))

            copied.append({"class_id": t_class_id, "section_id": t_section_id})

        db.session.commit()
        return jsonify({"copied": copied, "skipped": skipped}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# -------------------------------------------------------------------------
# Weekly grid (read-only view)
# -------------------------------------------------------------------------

@timetable_bp.route("/class-timetable", methods=["GET"])
@token_required
@permission_required("academics.timetable.view-timetable", "read")
def get_class_timetable(current_user):
    class_id = request.args.get("class_id")
    section_id = request.args.get("section_id")
    branch_id = request.args.get("branch_id")
    academic_year = request.args.get("academic_year")

    if not all([class_id, section_id, branch_id, academic_year]):
        return jsonify({"error": "class_id, section_id, branch_id and academic_year are required"}), 400

    ok, err = _check_branch_access(current_user, branch_id)
    if not ok:
        return err

    days = TimetableDayStructure.query.filter_by(
        class_id=class_id, section_id=section_id, branch_id=branch_id, academic_year=academic_year
    ).all()
    days_map = {d.day_of_week: _serialize_day(d) for d in days}
    for dow in DAY_OF_WEEK_VALUES:
        if dow not in days_map:
            days_map[dow] = {"day_structure_id": None, "day_of_week": dow, "is_working_day": True, "slots": []}

    return jsonify({"days": days_map}), 200


# -------------------------------------------------------------------------
# Teacher's own schedule
# -------------------------------------------------------------------------

def _teacher_schedule(staff_id, academic_year):
    rows = (
        db.session.query(TimetableSlot, TimetableDayStructure)
        .join(TimetableDayStructure, TimetableSlot.day_structure_id == TimetableDayStructure.id)
        .filter(
            TimetableSlot.teacher_id == staff_id,
            TimetableDayStructure.academic_year == academic_year,
            TimetableSlot.slot_type == "PERIOD",
        )
        .all()
    )
    schedule = {dow: [] for dow in DAY_OF_WEEK_VALUES}
    for slot, day in rows:
        schedule[day.day_of_week].append({
            "start_time": _time_str(slot.start_time),
            "end_time": _time_str(slot.end_time),
            "subject_name": slot.subject.subject_name if slot.subject else None,
            "class_id": day.class_id,
            "class_name": day.class_obj.class_name if day.class_obj else None,
            "section_id": day.section_id,
            "section_name": day.section.section_name if day.section else None,
            "room": slot.room,
        })
    for dow in schedule:
        schedule[dow].sort(key=lambda x: x["start_time"] or "")
    return schedule


@timetable_bp.route("/teacher-timetable/me", methods=["GET"])
@token_required
@permission_required("academics.timetable.teacher-timetable", "read")
def get_my_timetable(current_user):
    academic_year = request.args.get("academic_year")
    if not academic_year:
        return jsonify({"error": "academic_year is required"}), 400
    if not getattr(current_user, "staff_id", None):
        return jsonify({"error": "This user is not linked to a staff profile"}), 400

    return jsonify({"staff_id": current_user.staff_id, "schedule": _teacher_schedule(current_user.staff_id, academic_year)}), 200


@timetable_bp.route("/teacher-timetable/<int:staff_id>", methods=["GET"])
@token_required
@permission_required("academics.timetable.view-timetable", "read")
def get_teacher_timetable(current_user, staff_id):
    academic_year = request.args.get("academic_year")
    if not academic_year:
        return jsonify({"error": "academic_year is required"}), 400

    staff = StaffMaster.query.get(staff_id)
    if not staff:
        return jsonify({"error": "Teacher not found"}), 404

    ok, err = _check_branch_access(current_user, staff.branch_id)
    if not ok:
        return err

    return jsonify({"staff_id": staff_id, "schedule": _teacher_schedule(staff_id, academic_year)}), 200
