from datetime import datetime, timedelta
import secrets
import hmac
import hashlib
import os

from zoneinfo import ZoneInfo
from sqlalchemy import or_

from flask import Blueprint, request, jsonify, redirect, session, current_app
import jwt
from extensions import db, get_now
from models import OnlineClass, ZoomCredentials, GoogleOAuthToken, StaffMaster, ClassMaster, ClassSection, SubjectMaster, Branch
from timetable_models import SubjectTeacherAssignment
from helpers import token_required, permission_required, resolve_user_scope, has_permission
from crypto_utils import encrypt_secret, decrypt_secret
from services.online_classes import zoom_client, google_meet_client

online_class_bp = Blueprint("online_class_bp", __name__)

VALID_RECURRENCE_DAYS = {"MO", "TU", "WE", "TH", "FR", "SA", "SU"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_datetime(value):
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S")
    except (ValueError, TypeError):
        raise ValueError(f"Invalid start_datetime format: {value!r}. Expected YYYY-MM-DDTHH:MM:SS")


def _validate_recurrence_days(days):
    if not days:
        return None
    if isinstance(days, str):
        days = [d.strip().upper() for d in days.split(",") if d.strip()]
    invalid = [d for d in days if d not in VALID_RECURRENCE_DAYS]
    if invalid:
        raise ValueError(f"Invalid recurrence day code(s): {invalid}. Must be one of {sorted(VALID_RECURRENCE_DAYS)}")
    return ",".join(days)


def _get_zoom_credentials_for(school_id, branch_id):
    """Branch-specific credentials take priority; falls back to school-wide (branch_id NULL)."""
    if branch_id:
        cred = ZoomCredentials.query.filter_by(school_id=school_id, branch_id=branch_id, is_active=True).first()
        if cred:
            return cred
    return ZoomCredentials.query.filter_by(school_id=school_id, branch_id=None, is_active=True).first()


def _get_valid_google_access_token(teacher_id):
    token_row = GoogleOAuthToken.query.filter_by(staff_id=teacher_id).first()
    if not token_row:
        return None, "This teacher has not connected a Google account yet."

    # token_expiry is a plain (timezone-naive) DB column, but get_now() returns
    # a timezone-aware UTC datetime — comparing the two directly raises
    # "can't compare offset-naive and offset-aware datetimes". Strip tzinfo
    # to match what's actually stored.
    now = get_now().replace(tzinfo=None)
    if token_row.access_token_encrypted and token_row.token_expiry and token_row.token_expiry > now + timedelta(minutes=2):
        return decrypt_secret(token_row.access_token_encrypted), None

    refresh_token = decrypt_secret(token_row.refresh_token_encrypted)
    try:
        refreshed = google_meet_client.refresh_access_token(refresh_token)
    except Exception as e:
        return None, f"Failed to refresh Google token: {e}"

    token_row.access_token_encrypted = encrypt_secret(refreshed["access_token"])
    token_row.token_expiry = now + timedelta(seconds=refreshed.get("expires_in", 3600))
    db.session.flush()
    return refreshed["access_token"], None


def _overlaps(start1, end1, start2, end2):
    return start1 < end2 and start2 < end1


def _find_teacher_conflicts(teacher_id, start_dt, end_dt, exclude_class_id=None):
    """Check whether the teacher already has another SCHEDULED online class overlapping this time (same day)."""
    query = OnlineClass.query.filter(
        OnlineClass.teacher_id == teacher_id,
        OnlineClass.status == OnlineClass.STATUS_SCHEDULED,
    )
    if exclude_class_id:
        query = query.filter(OnlineClass.id != exclude_class_id)

    same_day = query.filter(db.func.date(OnlineClass.start_datetime) == start_dt.date()).all()

    conflicts = []
    for existing in same_day:
        existing_end = existing.start_datetime + timedelta(minutes=existing.duration_minutes)
        if _overlaps(start_dt, end_dt, existing.start_datetime, existing_end):
            conflicts.append(
                f"Teacher already has '{existing.title}' scheduled "
                f"{existing.start_datetime.strftime('%H:%M')}-{existing_end.strftime('%H:%M')} on this day."
            )
    return conflicts


def _serialize(oc: OnlineClass, include_sensitive: bool = False):
    """
    include_sensitive: only True for the class's own teacher, or a user with
    write access to online classes. Controls whether the meeting password and
    host/start URL are exposed — everyone else only sees enough to join via
    the dedicated /join endpoint.
    """
    return {
        "id": oc.id,
        "title": oc.title,
        "description": oc.description,
        "subject_id": oc.subject_id,
        "subject_name": oc.subject.subject_name if oc.subject else None,
        "class_id": oc.class_id,
        "class_name": oc.class_obj.class_name if oc.class_obj else None,
        "section_id": oc.section_id,
        "section_name": oc.section.section_name if oc.section else None,
        "teacher_id": oc.teacher_id,
        "teacher_name": (oc.teacher.display_name or f"{oc.teacher.first_name} {oc.teacher.last_name or ''}".strip()) if oc.teacher else None,
        "branch_id": oc.branch_id,
        "platform": oc.platform,
        "join_url": oc.join_url,
        "start_url": oc.start_url if include_sensitive else None,
        "meeting_password": oc.meeting_password if include_sensitive else None,
        "timezone": oc.timezone,
        "start_datetime": oc.start_datetime.isoformat() if oc.start_datetime else None,
        "duration_minutes": oc.duration_minutes,
        "is_recurring": oc.is_recurring,
        "recurrence_days": oc.recurrence_days,
        "recurrence_end_date": oc.recurrence_end_date.isoformat() if oc.recurrence_end_date else None,
        "target_section_ids": oc.target_section_ids,
        "status": oc.status,
        "cancel_reason": oc.cancel_reason,
        "created_at": oc.created_at.isoformat() if oc.created_at else None,
        "created_by": oc.created_by,
    }


def _can_see_sensitive(current_user, oc):
    """The class's own teacher, or anyone with write access, can see the password/start URL."""
    if getattr(current_user, "staff_id", None) == oc.teacher_id:
        return True
    return has_permission(current_user, "academics.online-class.online-class", "write")


def _user_can_access_class(current_user, oc, scope):
    """Whether this user's branch/school access actually covers this specific class."""
    if scope["is_unlimited"]:
        return True
    if getattr(current_user, "staff_id", None) == oc.teacher_id:
        return True
    if scope["allowed_school_ids"] and oc.school_id not in scope["allowed_school_ids"]:
        return False
    if oc.branch_id is not None and scope["allowed_branch_ids"] and oc.branch_id not in scope["allowed_branch_ids"]:
        return False
    return True


def _auto_complete_expired(classes):
    """
    Nothing schedules a background job to flip a class to COMPLETED once its
    time has passed, so we do it lazily here instead: any SCHEDULED class
    whose end time (start + duration) is already in the past gets flipped to
    COMPLETED the next time it's listed or fetched. Cancelled classes are
    left untouched.

    start_datetime is stored as a plain (timezone-naive) wall-clock value
    representing the time in the class's own `timezone` field — it is NOT
    UTC. So "now" has to be computed in that same timezone and then stripped
    of its own tzinfo before comparing, otherwise Python raises
    "can't compare offset-naive and offset-aware datetimes".
    """
    changed = False
    for oc in classes:
        if oc.status == OnlineClass.STATUS_SCHEDULED:
            end_dt = oc.start_datetime + timedelta(minutes=oc.duration_minutes)
            try:
                tz = ZoneInfo(oc.timezone or "Asia/Kolkata")
            except Exception:
                tz = ZoneInfo("Asia/Kolkata")
            now_in_class_tz = datetime.now(tz).replace(tzinfo=None)
            if end_dt < now_in_class_tz:
                oc.status = OnlineClass.STATUS_COMPLETED
                changed = True
    if changed:
        db.session.commit()


# ---------------------------------------------------------------------------
# List / Get  (we start with the SAFE, READ-ONLY endpoints first)
# ---------------------------------------------------------------------------

@online_class_bp.route("/api/online-classes", methods=["GET"])
@token_required
@permission_required("academics.online-class.online-class", "read")
def list_classes(current_user):
    scope = resolve_user_scope(current_user)
    query = OnlineClass.query

    teacher_id = request.args.get("teacher_id", type=int)
    status = request.args.get("status")
    class_id = request.args.get("class_id", type=int)
    from_date = request.args.get("from_date")
    to_date = request.args.get("to_date")

    if teacher_id:
        query = query.filter_by(teacher_id=teacher_id)
    if status:
        query = query.filter_by(status=status)
    if class_id:
        query = query.filter_by(class_id=class_id)
    if from_date:
        query = query.filter(OnlineClass.start_datetime >= from_date)
    if to_date:
        # to_date arrives as a bare date (YYYY-MM-DD) and SQL treats that as
        # midnight — i.e. the very start of the day, not the end of it. Without
        # this, "to_date" would silently exclude every class after 00:00 on
        # that day, which is exactly what broke same-day ranges (calendar view).
        to_date_inclusive = to_date if len(to_date) > 10 else f"{to_date} 23:59:59"
        query = query.filter(OnlineClass.start_datetime <= to_date_inclusive)

    if scope["school_id"]:
        query = query.filter(OnlineClass.school_id == scope["school_id"])
    if scope["branch_id"]:
        query = query.filter(OnlineClass.branch_id == scope["branch_id"])
    elif not scope["is_unlimited"] and scope["allowed_branch_ids"]:
        query = query.filter(
            (OnlineClass.branch_id.in_(list(scope["allowed_branch_ids"]))) | (OnlineClass.branch_id.is_(None))
        )

    page = max(request.args.get("page", 1, type=int), 1)
    page_size = min(max(request.args.get("page_size", 50, type=int), 1), 200)

    query = query.order_by(OnlineClass.start_datetime.asc())
    total = query.count()
    classes = query.offset((page - 1) * page_size).limit(page_size).all()
    _auto_complete_expired(classes)

    return jsonify({
        "items": [_serialize(c, include_sensitive=_can_see_sensitive(current_user, c)) for c in classes],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size if total else 0,
    }), 200


@online_class_bp.route("/api/online-classes/<int:class_id>", methods=["GET"])
@token_required
@permission_required("academics.online-class.online-class", "read")
def get_class(current_user, class_id):
    oc = OnlineClass.query.get(class_id)
    if not oc:
        return jsonify({"error": "Online class not found"}), 404
    scope = resolve_user_scope(current_user)
    if not _user_can_access_class(current_user, oc, scope):
        return jsonify({"error": "Online class not found"}), 404
    _auto_complete_expired([oc])
    return jsonify(_serialize(oc, include_sensitive=_can_see_sensitive(current_user, oc))), 200


@online_class_bp.route("/api/online-classes/me-as-teacher", methods=["GET"])
@token_required
@permission_required("academics.online-class.online-class", "read")
def me_as_teacher(current_user):
    """
    Tells the Schedule Class form whether the logged-in user is themselves a
    teacher, and if so, who — used to lock non-admin teachers into scheduling
    only their own classes, without granting them any HR staff-master access.
    """
    staff_id = getattr(current_user, "staff_id", None)
    if not staff_id:
        return jsonify({"is_teacher": False, "staff_id": None, "name": None}), 200
    staff = StaffMaster.query.get(staff_id)
    if not staff:
        return jsonify({"is_teacher": False, "staff_id": None, "name": None}), 200
    return jsonify({
        "is_teacher": True,
        "staff_id": staff.id,
        "name": staff.display_name or f"{staff.first_name} {staff.last_name or ''}".strip(),
    }), 200


@online_class_bp.route("/api/online-classes/my-assignments", methods=["GET"])
@token_required
@permission_required("academics.online-class.online-class", "read")
def my_teaching_assignments(current_user):
    """
    Which class/section/subject combinations the logged-in teacher is
    actually assigned to teach, from Subject-Teacher Assignment — used to
    scope the Class/Section/Subject pickers in Schedule Class for
    teacher-locked users, so they can't pick a class they don't teach.
    """
    staff_id = getattr(current_user, "staff_id", None)
    if not staff_id:
        return jsonify([]), 200

    scope = resolve_user_scope(current_user)
    academic_year = request.headers.get("X-Academic-Year") or request.args.get("academic_year")

    query = SubjectTeacherAssignment.query.filter_by(teacher_id=staff_id, is_primary=True)
    if academic_year:
        query = query.filter_by(academic_year=academic_year)
    if scope["branch_id"]:
        query = query.filter_by(branch_id=scope["branch_id"])
    elif not scope["is_unlimited"] and scope["allowed_branch_ids"]:
        query = query.filter(SubjectTeacherAssignment.branch_id.in_(list(scope["allowed_branch_ids"])))

    rows = query.all()
    return jsonify([{
        "class_id": r.class_id,
        "class_name": r.class_obj.class_name if r.class_obj else None,
        "section_id": r.section_id,
        "section_name": r.section.section_name if r.section else None,
        "subject_id": r.subject_id,
        "subject_name": r.subject.subject_name if r.subject else None,
    } for r in rows]), 200


# ---------------------------------------------------------------------------
# Zoom credentials (branch-specific OR school-wide shared)
# ---------------------------------------------------------------------------

@online_class_bp.route("/api/online-classes/settings/zoom", methods=["POST"])
@token_required
@permission_required("academics.online-class.zoom-settings", "write")
def save_zoom_settings(current_user):
    data = request.json or {}
    required = ["account_id", "client_id", "client_secret", "default_host_email"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required field(s): {missing}"}), 400

    scope = resolve_user_scope(current_user)
    school_id = data.get("school_id") or scope["school_id"]
    branch_id = data.get("branch_id")  # omitted/null => shared school-wide credentials

    if not school_id:
        return jsonify({"error": "school_id is required"}), 400
    if not scope["is_unlimited"]:
        if branch_id and scope["allowed_branch_ids"] and branch_id not in scope["allowed_branch_ids"]:
            return jsonify({"error": "Unauthorized branch access"}), 403
        # "Shared, school-wide" credentials (branch_id omitted) are only allowed for users
        # whose own access already spans more than one branch. A single-branch admin has no
        # visibility into other branches, so they must not be able to set something that
        # would silently apply to branches they can't even see.
        if not branch_id and len(scope["allowed_branch_ids"] or []) <= 1:
            return jsonify({"error": "Your access is limited to a single branch. You can only configure branch-specific Zoom settings."}), 403
    existing = ZoomCredentials.query.filter_by(school_id=school_id, branch_id=branch_id).first()
    if existing:
        existing.account_id = data["account_id"]
        existing.client_id = data["client_id"]
        existing.client_secret_encrypted = encrypt_secret(data["client_secret"])
        existing.default_host_email = data["default_host_email"]
        existing.is_active = True
        cred = existing
    else:
        cred = ZoomCredentials(
            school_id=school_id,
            branch_id=branch_id,
            account_id=data["account_id"],
            client_id=data["client_id"],
            client_secret_encrypted=encrypt_secret(data["client_secret"]),
            default_host_email=data["default_host_email"],
        )
        db.session.add(cred)

    db.session.commit()
    return jsonify({
        "status": "saved",
        "scope": "branch-specific" if branch_id else "shared (school-wide)",
        "default_host_email": cred.default_host_email,
    }), 200


@online_class_bp.route("/api/online-classes/settings/zoom", methods=["GET"])
@token_required
@permission_required("academics.online-class.zoom-settings", "read")
def list_zoom_settings(current_user):
    scope = resolve_user_scope(current_user)
    query = ZoomCredentials.query.filter_by(is_active=True)
    if scope["school_id"]:
        query = query.filter_by(school_id=scope["school_id"])

    # Only return the shared (branch_id=None) credential plus the ONE
    # branch-specific credential for whichever branch the caller is
    # currently viewing — never another branch's, even within the same school.
    current_branch_id = request.args.get("branch_id", type=int)
    if current_branch_id:
        query = query.filter(or_(
            ZoomCredentials.branch_id.is_(None),
            ZoomCredentials.branch_id == current_branch_id
        ))

    rows = query.all()
    return jsonify([{
        "id": r.id,
        "school_id": r.school_id,
        "branch_id": r.branch_id,
        "scope": "branch-specific" if r.branch_id else "shared (school-wide)",
        "default_host_email": r.default_host_email,
    } for r in rows]), 200


def _zoom_cred_or_404(cred_id, current_user, scope):
    cred = ZoomCredentials.query.get(cred_id)
    if not cred or not cred.is_active:
        return None, (jsonify({"error": "Zoom configuration not found"}), 404)
    if not scope["is_unlimited"]:
        if cred.branch_id and scope["allowed_branch_ids"] and cred.branch_id not in scope["allowed_branch_ids"]:
            return None, (jsonify({"error": "Unauthorized branch access"}), 403)
        if not cred.branch_id and len(scope["allowed_branch_ids"] or []) <= 1:
            return None, (jsonify({"error": "Unauthorized access to shared (school-wide) configuration"}), 403)
    return cred, None


@online_class_bp.route("/api/online-classes/settings/zoom/<int:cred_id>", methods=["GET"])
@token_required
@permission_required("academics.online-class.zoom-settings", "read")
def get_zoom_setting(current_user, cred_id):
    scope = resolve_user_scope(current_user)
    cred, err = _zoom_cred_or_404(cred_id, current_user, scope)
    if err:
        return err
    return jsonify({
        "id": cred.id,
        "school_id": cred.school_id,
        "branch_id": cred.branch_id,
        "scope": "branch-specific" if cred.branch_id else "shared (school-wide)",
        "account_id": cred.account_id,
        "client_id": cred.client_id,
        "default_host_email": cred.default_host_email,
        # client_secret is intentionally never returned, even encrypted
    }), 200


@online_class_bp.route("/api/online-classes/settings/zoom/<int:cred_id>", methods=["PUT"])
@token_required
@permission_required("academics.online-class.zoom-settings", "write")
def update_zoom_setting(current_user, cred_id):
    scope = resolve_user_scope(current_user)
    cred, err = _zoom_cred_or_404(cred_id, current_user, scope)
    if err:
        return err

    data = request.json or {}
    if "account_id" in data and data["account_id"]:
        cred.account_id = data["account_id"]
    if "client_id" in data and data["client_id"]:
        cred.client_id = data["client_id"]
    if "default_host_email" in data and data["default_host_email"]:
        cred.default_host_email = data["default_host_email"]
    # secret only rotates if explicitly resubmitted — omitted/blank means "keep existing"
    if data.get("client_secret"):
        cred.client_secret_encrypted = encrypt_secret(data["client_secret"])

    db.session.commit()
    return jsonify({
        "status": "updated",
        "id": cred.id,
        "scope": "branch-specific" if cred.branch_id else "shared (school-wide)",
        "default_host_email": cred.default_host_email,
    }), 200


@online_class_bp.route("/api/online-classes/settings/zoom/<int:cred_id>", methods=["DELETE"])
@token_required
@permission_required("academics.online-class.zoom-settings", "write")
def delete_zoom_setting(current_user, cred_id):
    scope = resolve_user_scope(current_user)
    cred, err = _zoom_cred_or_404(cred_id, current_user, scope)
    if err:
        return err

    cred.is_active = False
    db.session.commit()
    return jsonify({"status": "deactivated", "id": cred.id}), 200


@online_class_bp.route("/api/online-classes/settings/zoom/coverage", methods=["GET"])
@token_required
@permission_required("academics.online-class.zoom-settings", "read")
def zoom_settings_coverage(current_user):
    scope = resolve_user_scope(current_user)
    school_id = scope["school_id"]
    if not school_id:
        return jsonify({"error": "school_id is required"}), 400

    branch_query = Branch.query.filter_by(school_id=school_id, is_active=True)
    if not scope["is_unlimited"] and scope["allowed_branch_ids"]:
        branch_query = branch_query.filter(Branch.id.in_(scope["allowed_branch_ids"]))
    branches = branch_query.all()

    shared = ZoomCredentials.query.filter_by(school_id=school_id, branch_id=None, is_active=True).first()
    own_creds = {
        c.branch_id: c
        for c in ZoomCredentials.query.filter_by(school_id=school_id, is_active=True).filter(ZoomCredentials.branch_id.isnot(None)).all()
    }

    coverage = []
    for b in branches:
        own = own_creds.get(b.id)
        if own:
            coverage.append({
                "branch_id": b.id,
                "branch_name": b.branch_name,
                "own_config": True,
                "effective_source": "own",
                "host_email": own.default_host_email,
                "credential_id": own.id,
            })
        elif shared:
            coverage.append({
                "branch_id": b.id,
                "branch_name": b.branch_name,
                "own_config": False,
                "effective_source": "shared",
                "host_email": shared.default_host_email,
                "credential_id": shared.id,
            })
        else:
            coverage.append({
                "branch_id": b.id,
                "branch_name": b.branch_name,
                "own_config": False,
                "effective_source": "none",
                "host_email": None,
                "credential_id": None,
            })

    return jsonify({
        "shared_configured": bool(shared),
        "shared_credential_id": shared.id if shared else None,
        "branches": coverage,
    }), 200


# ---------------------------------------------------------------------------
# Schedule / Reschedule / Cancel / Join
# ---------------------------------------------------------------------------

@online_class_bp.route("/api/online-classes", methods=["POST"])
@token_required
@permission_required("academics.online-class.online-class", "write")
def schedule_class(current_user):
    data = request.json or {}
    try:
        required = ["title", "teacher_id", "platform", "start_datetime"]
        missing = [f for f in required if not data.get(f)]
        if missing:
            return jsonify({"error": f"Missing required field(s): {missing}"}), 400

        platform = data["platform"]
        if platform not in (OnlineClass.PLATFORM_ZOOM, OnlineClass.PLATFORM_GOOGLE_MEET):
            return jsonify({"error": f"platform must be '{OnlineClass.PLATFORM_ZOOM}' or '{OnlineClass.PLATFORM_GOOGLE_MEET}'"}), 400

        start_dt = _parse_datetime(data["start_datetime"])
        duration_minutes = int(data.get("duration_minutes", 45))
        if duration_minutes <= 0:
            return jsonify({"error": "duration_minutes must be positive"}), 400
        end_dt = start_dt + timedelta(minutes=duration_minutes)

        recurrence_days = _validate_recurrence_days(data.get("recurrence_days")) if data.get("is_recurring") else None
        recurrence_end_date = None
        if data.get("is_recurring"):
            if not data.get("recurrence_end_date"):
                return jsonify({"error": "recurrence_end_date is required when is_recurring is true"}), 400
            recurrence_end_date = datetime.strptime(data["recurrence_end_date"], "%Y-%m-%d").date()
            if recurrence_end_date < start_dt.date():
                return jsonify({"error": "recurrence_end_date cannot be before start_datetime"}), 400

        scope = resolve_user_scope(current_user)
        school_id = data.get("school_id") or scope["school_id"]
        branch_id = data.get("branch_id") or scope["branch_id"]
        if not school_id:
            return jsonify({"error": "School is required to schedule a class."}), 400
        if not scope["is_unlimited"]:
            if branch_id and scope["allowed_branch_ids"] and branch_id not in scope["allowed_branch_ids"]:
                return jsonify({"error": "Unauthorized branch access"}), 403

        teacher_id = int(data["teacher_id"])
        teacher = StaffMaster.query.get(teacher_id)
        if not teacher:
            return jsonify({"error": "Teacher not found"}), 404

        class_id = data.get("class_id")
        section_id = data.get("section_id")
        subject_id = data.get("subject_id")
        if class_id and not ClassMaster.query.get(class_id):
            return jsonify({"error": f"Class {class_id} not found"}), 404
        if section_id and not ClassSection.query.get(section_id):
            return jsonify({"error": f"Section {section_id} not found"}), 404
        if subject_id and not SubjectMaster.query.get(subject_id):
            return jsonify({"error": f"Subject {subject_id} not found"}), 404

        target_section_ids = data.get("target_section_ids")
        target_section_ids_str = None
        if target_section_ids:
            for sid in target_section_ids:
                sec = ClassSection.query.get(sid)
                if not sec:
                    return jsonify({"error": f"target section {sid} not found"}), 404
                if branch_id and sec.branch_id != branch_id:
                    return jsonify({"error": f"target section {sid} does not belong to this branch"}), 400
            target_section_ids_str = ",".join(str(s) for s in target_section_ids)

        conflicts = _find_teacher_conflicts(teacher_id, start_dt, end_dt)
        if conflicts and not data.get("force"):
            return jsonify({"error": "Teacher scheduling conflict", "conflicts": conflicts}), 409

        meeting_info = {}
        if platform == OnlineClass.PLATFORM_ZOOM:
            cred = _get_zoom_credentials_for(school_id, branch_id)
            if not cred:
                return jsonify({"error": "Zoom is not configured for this branch or school. Ask an admin to configure it under Online Class Settings."}), 400
            host_email = data.get("host_email") or cred.default_host_email
            recurrence_payload = None
            if recurrence_days:
                weekly_days_map = {"MO": 2, "TU": 3, "WE": 4, "TH": 5, "FR": 6, "SA": 7, "SU": 1}
                recurrence_payload = {
                    "type": 2,
                    "weekly_days": ",".join(str(weekly_days_map[d]) for d in recurrence_days.split(",")),
                    "end_date_time": datetime.combine(recurrence_end_date, datetime.min.time()).strftime("%Y-%m-%dT%H:%M:%SZ"),
                }
            try:
                meeting_info = zoom_client.create_meeting(
                    account_id=cred.account_id,
                    client_id=cred.client_id,
                    client_secret=decrypt_secret(cred.client_secret_encrypted),
                    host_email=host_email,
                    topic=data["title"],
                    start_datetime=start_dt,
                    duration_minutes=duration_minutes,
                    timezone=data.get("timezone", "Asia/Kolkata"),
                    agenda=data.get("description"),
                    recurrence=recurrence_payload,
                )
            except Exception as e:
                return jsonify({"error": f"Failed to create Zoom meeting: {e}"}), 502
        else:
            access_token, err = _get_valid_google_access_token(teacher_id)
            if err:
                return jsonify({"error": err}), 400
            try:
                meeting_info = google_meet_client.create_meeting(
                    access_token=access_token,
                    topic=data["title"],
                    start_datetime=start_dt,
                    duration_minutes=duration_minutes,
                    timezone_str=data.get("timezone", "Asia/Kolkata"),
                    description=data.get("description"),
                )
            except Exception as e:
                return jsonify({"error": f"Failed to create Google Meet: {e}"}), 502

        online_class = OnlineClass(
            school_id=school_id,
            branch_id=branch_id,
            title=data["title"],
            description=data.get("description"),
            subject_id=subject_id,
            class_id=class_id,
            section_id=section_id,
            teacher_id=teacher_id,
            platform=platform,
            external_meeting_id=meeting_info.get("external_meeting_id"),
            join_url=meeting_info.get("join_url"),
            start_url=meeting_info.get("start_url"),
            meeting_password=meeting_info.get("password"),
            timezone=data.get("timezone", "Asia/Kolkata"),
            start_datetime=start_dt,
            duration_minutes=duration_minutes,
            is_recurring=bool(data.get("is_recurring", False)),
            recurrence_days=recurrence_days,
            recurrence_end_date=recurrence_end_date,
            academic_year=data.get("academic_year"),
            target_section_ids=target_section_ids_str,
            status=OnlineClass.STATUS_SCHEDULED,
        )
        db.session.add(online_class)
        db.session.commit()
        return jsonify(_serialize(online_class)), 201

    except ValueError as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@online_class_bp.route("/api/online-classes/<int:class_id>", methods=["PUT"])
@token_required
@permission_required("academics.online-class.online-class", "write")
def reschedule_class(current_user, class_id):
    oc = OnlineClass.query.get(class_id)
    if not oc:
        return jsonify({"error": "Online class not found"}), 404
    scope = resolve_user_scope(current_user)
    if not _user_can_access_class(current_user, oc, scope):
        return jsonify({"error": "Online class not found"}), 404
    if oc.status != OnlineClass.STATUS_SCHEDULED:
        return jsonify({"error": f"Cannot reschedule a class that is {oc.status}"}), 400

    data = request.json or {}
    try:
        new_start = _parse_datetime(data["start_datetime"]) if data.get("start_datetime") else oc.start_datetime
        new_duration = int(data["duration_minutes"]) if data.get("duration_minutes") else oc.duration_minutes
        new_end = new_start + timedelta(minutes=new_duration)

        conflicts = _find_teacher_conflicts(oc.teacher_id, new_start, new_end, exclude_class_id=oc.id)
        if conflicts and not data.get("force"):
            return jsonify({"error": "Teacher scheduling conflict", "conflicts": conflicts}), 409

        if oc.platform == OnlineClass.PLATFORM_ZOOM and oc.external_meeting_id:
            cred = _get_zoom_credentials_for(oc.school_id, oc.branch_id)
            if cred:
                try:
                    zoom_client.update_meeting(
                        account_id=cred.account_id,
                        client_id=cred.client_id,
                        client_secret=decrypt_secret(cred.client_secret_encrypted),
                        meeting_id=oc.external_meeting_id,
                        start_datetime=new_start,
                        duration_minutes=new_duration,
                        timezone=oc.timezone,
                    )
                except Exception as e:
                    zoom_detail = getattr(getattr(e, "response", None), "text", None)
                    return jsonify({
                        "error": f"Failed to update Zoom meeting: {e}",
                        "zoom_detail": zoom_detail,
                    }), 502
        elif oc.platform == OnlineClass.PLATFORM_GOOGLE_MEET and oc.external_meeting_id:
            access_token, token_err = _get_valid_google_access_token(oc.teacher_id)
            if access_token:
                try:
                    google_meet_client.update_meeting(
                        access_token=access_token,
                        event_id=oc.external_meeting_id,
                        start_datetime=new_start,
                        duration_minutes=new_duration,
                        timezone_str=oc.timezone,
                    )
                except Exception as e:
                    return jsonify({"error": f"Failed to update Google Meet event: {e}"}), 502

        oc.start_datetime = new_start
        oc.duration_minutes = new_duration
        db.session.commit()
        return jsonify(_serialize(oc, include_sensitive=_can_see_sensitive(current_user, oc))), 200
    except ValueError as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@online_class_bp.route("/api/online-classes/<int:class_id>/cancel", methods=["POST"])
@token_required
@permission_required("academics.online-class.online-class", "write")
def cancel_class(current_user, class_id):
    oc = OnlineClass.query.get(class_id)
    if not oc:
        return jsonify({"error": "Online class not found"}), 404
    scope = resolve_user_scope(current_user)
    if not _user_can_access_class(current_user, oc, scope):
        return jsonify({"error": "Online class not found"}), 404
    if oc.status != OnlineClass.STATUS_SCHEDULED:
        return jsonify({"error": f"Class is already {oc.status}"}), 400

    data = request.json or {}
    zoom_warning = None
    try:
        if oc.platform == OnlineClass.PLATFORM_ZOOM and oc.external_meeting_id:
            cred = _get_zoom_credentials_for(oc.school_id, oc.branch_id)
            if cred:
                try:
                    zoom_client.cancel_meeting(
                        account_id=cred.account_id,
                        client_id=cred.client_id,
                        client_secret=decrypt_secret(cred.client_secret_encrypted),
                        meeting_id=oc.external_meeting_id,
                    )
                except Exception as e:
                    zoom_detail = getattr(getattr(e, "response", None), "text", None)
                    zoom_warning = f"Cancelled in this app, but Zoom did not confirm the cancellation: {e}"
                    if zoom_detail:
                        zoom_warning += f" ({zoom_detail})"
        elif oc.platform == OnlineClass.PLATFORM_GOOGLE_MEET and oc.external_meeting_id:
            access_token, _err = _get_valid_google_access_token(oc.teacher_id)
            if access_token:
                try:
                    google_meet_client.cancel_meeting(access_token, oc.external_meeting_id)
                except Exception as e:
                    zoom_warning = f"Cancelled in this app, but Google Meet did not confirm the cancellation: {e}"

        oc.status = OnlineClass.STATUS_CANCELLED
        oc.cancel_reason = data.get("reason")
        db.session.commit()
        response = _serialize(oc, include_sensitive=_can_see_sensitive(current_user, oc))
        if zoom_warning:
            response["warning"] = zoom_warning
        return jsonify(response), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@online_class_bp.route("/api/online-classes/<int:class_id>/join", methods=["GET"])
@token_required
@permission_required("academics.online-class.online-class", "read")
def join_class(current_user, class_id):
    oc = OnlineClass.query.get(class_id)
    if not oc:
        return jsonify({"error": "Online class not found"}), 404
    scope = resolve_user_scope(current_user)
    if not _user_can_access_class(current_user, oc, scope):
        return jsonify({"error": "Online class not found"}), 404
    if oc.status != OnlineClass.STATUS_SCHEDULED:
        return jsonify({"error": f"This class is {oc.status}."}), 400
    return jsonify({"join_url": oc.join_url, "platform": oc.platform}), 200


# ---------------------------------------------------------------------------
# Zoom webhook (Event Subscriptions). Configure in Zoom Marketplace app,
# Feature > Event Subscriptions, URL: https://<domain>/api/online-classes/webhooks/zoom
# Subscribe to: Meeting Started, Meeting Ended, Meeting Deleted.
# Set ZOOM_WEBHOOK_SECRET_TOKEN in .env to the Secret Token shown on that page.
# ---------------------------------------------------------------------------

def _verify_zoom_webhook_signature(secret_token, timestamp, raw_body):
    message = f"v0:{timestamp}:{raw_body}"
    computed = "v0=" + hmac.new(secret_token.encode(), message.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed, request.headers.get("x-zm-signature", ""))


@online_class_bp.route("/api/online-classes/webhooks/zoom", methods=["POST"])
def zoom_webhook():
    secret_token = os.getenv("ZOOM_WEBHOOK_SECRET_TOKEN")
    if not secret_token:
        return jsonify({"error": "Webhook not configured on this server"}), 503

    body = request.get_json(silent=True) or {}

    if body.get("event") == "endpoint.url_validation":
        plain_token = body.get("payload", {}).get("plainToken", "")
        encrypted = hmac.new(secret_token.encode(), plain_token.encode(), hashlib.sha256).hexdigest()
        return jsonify({"plainToken": plain_token, "encryptedToken": encrypted}), 200

    timestamp = request.headers.get("x-zm-request-timestamp", "")
    raw_body = request.get_data(as_text=True)
    if not _verify_zoom_webhook_signature(secret_token, timestamp, raw_body):
        return jsonify({"error": "Invalid signature"}), 401

    event = body.get("event")
    obj = body.get("payload", {}).get("object", {})
    meeting_id = str(obj.get("id") or "")
    if not meeting_id:
        return jsonify({"status": "ignored, no meeting id"}), 200

    oc = OnlineClass.query.filter_by(external_meeting_id=meeting_id).first()
    if not oc:
        return jsonify({"status": "ignored, unknown meeting"}), 200

    now = get_now()
    oc.zoom_uuid = obj.get("uuid") or oc.zoom_uuid

    if event == "meeting.started":
        oc.actual_start_time = now
        oc.sync_source = "webhook"
    elif event == "meeting.ended":
        oc.actual_end_time = now
        oc.sync_source = "webhook"
        if oc.status == OnlineClass.STATUS_SCHEDULED:
            oc.status = OnlineClass.STATUS_COMPLETED
    elif event == "meeting.deleted":
        oc.sync_source = "webhook"
        if oc.status == OnlineClass.STATUS_SCHEDULED:
            oc.status = OnlineClass.STATUS_CANCELLED
            oc.cancel_reason = "Deleted directly in Zoom (detected via webhook)"

    db.session.commit()
    return jsonify({"status": "processed", "event": event}), 200


# ---------------------------------------------------------------------------
# Google Meet — per-teacher OAuth connect flow.
# Each teacher personally connects their own Google account, once. After
# that, classes scheduled with them as the teacher are created directly on
# their own Google Calendar — no shared account, no concurrency limit.
# ---------------------------------------------------------------------------

@online_class_bp.route("/api/online-classes/google/status", methods=["GET"])
@token_required
def google_connect_status(current_user):
    staff_id = getattr(current_user, "staff_id", None)
    if not staff_id:
        return jsonify({"connected": False, "reason": "Your login is not linked to a teacher record."}), 200
    token_row = GoogleOAuthToken.query.filter_by(staff_id=staff_id).first()
    return jsonify({
        "connected": bool(token_row),
        "google_email": token_row.google_email if token_row else None,
    }), 200


@online_class_bp.route("/api/online-classes/google/connect", methods=["GET"])
@token_required
def google_connect_start(current_user):
    staff_id = getattr(current_user, "staff_id", None)
    if not staff_id:
        return jsonify({"error": "Your login is not linked to a teacher record, so there's nothing to connect."}), 400

    # Signed, short-lived "claim ticket" so the callback (a plain browser
    # redirect from Google with no Authorization header) can still tell
    # which teacher initiated this.
    state = jwt.encode(
        {"staff_id": staff_id, "exp": datetime.utcnow() + timedelta(minutes=10)},
        current_app.config["SECRET_KEY"],
        algorithm="HS256",
    )
    try:
        auth_url = google_meet_client.get_authorization_url(state)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"authorization_url": auth_url}), 200


@online_class_bp.route("/api/online-classes/google/callback", methods=["GET"])
def google_connect_callback():
    error = request.args.get("error")
    if error:
        return f"<h3>Google sign-in was cancelled or denied ({error}). You can close this tab and try again.</h3>", 400

    code = request.args.get("code")
    state = request.args.get("state")
    if not code or not state:
        return "<h3>Missing code or state from Google. You can close this tab and try again.</h3>", 400

    try:
        decoded = jwt.decode(state, current_app.config["SECRET_KEY"], algorithms=["HS256"])
        staff_id = decoded["staff_id"]
    except Exception:
        return "<h3>This connection link has expired or is invalid. Please go back to the ERP and click Connect again.</h3>", 400

    try:
        tokens = google_meet_client.exchange_code_for_tokens(code)
    except Exception as e:
        return f"<h3>Failed to connect Google account: {e}</h3>", 502

    refresh_token = tokens.get("refresh_token")
    access_token = tokens.get("access_token")
    if not refresh_token:
        return (
            "<h3>Google didn't return a long-lived connection. "
            "Please revoke this app's access at myaccount.google.com/permissions and try Connect again.</h3>"
        ), 400

    try:
        google_email = google_meet_client.get_user_email(access_token)
    except Exception:
        google_email = None

    now = get_now().replace(tzinfo=None)
    token_row = GoogleOAuthToken.query.filter_by(staff_id=staff_id).first()
    if not token_row:
        token_row = GoogleOAuthToken(staff_id=staff_id)
        db.session.add(token_row)

    token_row.refresh_token_encrypted = encrypt_secret(refresh_token)
    token_row.access_token_encrypted = encrypt_secret(access_token) if access_token else None
    token_row.token_expiry = now + timedelta(seconds=tokens.get("expires_in", 3600))
    token_row.scope = tokens.get("scope")
    token_row.google_email = google_email

    db.session.commit()

    display_email = google_email or "your Google account"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Connected — Learnspace</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background:
      radial-gradient(circle at 15% 20%, rgba(99,102,241,0.16), transparent 45%),
      radial-gradient(circle at 85% 15%, rgba(16,185,129,0.14), transparent 45%),
      radial-gradient(circle at 50% 90%, rgba(99,102,241,0.10), transparent 50%),
      #0b1120;
    overflow: hidden;
    position: relative;
  }}
  .glow {{
    position: absolute;
    width: 560px; height: 560px;
    border-radius: 50%;
    filter: blur(90px);
    opacity: 0.35;
    animation: drift 9s ease-in-out infinite alternate;
  }}
  .glow.a {{ background: #6366f1; top: -180px; left: -160px; }}
  .glow.b {{ background: #10b981; bottom: -200px; right: -160px; animation-delay: 1.5s; }}
  @keyframes drift {{
    from {{ transform: translate(0,0) scale(1); }}
    to   {{ transform: translate(30px,-20px) scale(1.08); }}
  }}
  .card {{
    position: relative;
    background: linear-gradient(180deg, rgba(255,255,255,0.99), rgba(250,251,255,0.99));
    border: 1px solid rgba(255,255,255,0.6);
    border-radius: 24px;
    padding: 52px 44px 36px;
    max-width: 440px;
    width: 90%;
    text-align: center;
    box-shadow:
      0 40px 80px -20px rgba(0,0,0,0.45),
      0 12px 32px -8px rgba(0,0,0,0.25),
      inset 0 1px 0 rgba(255,255,255,0.8);
    animation: rise 0.6s cubic-bezier(0.16,1,0.3,1);
  }}
  @keyframes rise {{
    from {{ opacity: 0; transform: translateY(24px) scale(0.96); }}
    to   {{ opacity: 1; transform: translateY(0) scale(1); }}
  }}
  .icon-outer {{
    width: 96px; height: 96px; margin: 0 auto 28px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle, rgba(16,185,129,0.22), rgba(16,185,129,0) 70%);
    animation: ringPulse 2.2s ease-out 0.6s infinite;
  }}
  @keyframes ringPulse {{
    0%   {{ box-shadow: 0 0 0 0 rgba(16,185,129,0.28); }}
    70%  {{ box-shadow: 0 0 0 18px rgba(16,185,129,0); }}
    100% {{ box-shadow: 0 0 0 0 rgba(16,185,129,0); }}
  }}
  .icon-wrap {{
    width: 72px; height: 72px;
    border-radius: 50%;
    background: linear-gradient(145deg, #34d399, #059669);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 10px 24px -6px rgba(5,150,105,0.55), inset 0 1px 1px rgba(255,255,255,0.4);
    animation: pop 0.5s 0.15s cubic-bezier(0.34,1.56,0.64,1) both;
  }}
  @keyframes pop {{ from {{ transform: scale(0.3); opacity: 0; }} to {{ transform: scale(1); opacity: 1; }} }}
  .icon-wrap svg {{ width: 34px; height: 34px; }}
  .icon-wrap path {{
    fill: none; stroke: #ffffff; stroke-width: 5;
    stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 60; stroke-dashoffset: 60;
    animation: draw 0.55s 0.45s ease-out forwards;
  }}
  @keyframes draw {{ to {{ stroke-dashoffset: 0; }} }}
  .eyebrow {{
    font-size: 11.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
    color: #10b981; margin: 0 0 10px;
    opacity: 0; animation: fadeUp 0.5s 0.55s ease-out forwards;
  }}
  h1 {{
    font-size: 25px; font-weight: 750; letter-spacing: -0.02em; color: #0f172a; margin: 0 0 12px;
    opacity: 0; animation: fadeUp 0.5s 0.65s ease-out forwards;
  }}
  p.message {{
    font-size: 14.5px; color: #64748b; line-height: 1.6; margin: 0;
    opacity: 0; animation: fadeUp 0.5s 0.75s ease-out forwards;
  }}
  @keyframes fadeUp {{
    from {{ opacity: 0; transform: translateY(8px); }}
    to   {{ opacity: 1; transform: translateY(0); }}
  }}
  .email-pill {{
    display: inline-flex; align-items: center; gap: 8px;
    margin-top: 20px; padding: 9px 18px 9px 12px;
    background: #f8fafc; border: 1px solid #eef2f7; border-radius: 999px;
    font-size: 13px; font-weight: 600; color: #1e293b;
    opacity: 0; animation: fadeUp 0.5s 0.85s ease-out forwards;
  }}
  .email-pill .dot {{
    width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
    background: conic-gradient(#4285F4 0deg 90deg, #34A853 90deg 180deg, #FBBC05 180deg 270deg, #EA4335 270deg 360deg);
  }}
  .divider {{
    height: 1px; margin: 32px 0 18px;
    background: linear-gradient(90deg, transparent, #e2e8f0, transparent);
    opacity: 0; animation: fadeUp 0.5s 0.95s ease-out forwards;
  }}
  .brand {{
    font-size: 11.5px; color: #94a3b8; letter-spacing: 0.04em; font-weight: 600;
    opacity: 0; animation: fadeUp 0.5s 1.05s ease-out forwards;
  }}
  .brand b {{ color: #64748b; }}
</style>
</head>
<body>
  <div class="glow a"></div>
  <div class="glow b"></div>
  <div class="card">
    <div class="icon-outer">
      <div class="icon-wrap">
        <svg viewBox="0 0 56 56"><path d="M14 27l8 8 16-16" /></svg>
      </div>
    </div>
    <p class="eyebrow">Google Meet Connected</p>
    <h1>You're all set</h1>
    <p class="message">This teacher's Google account is now linked. Classes scheduled for them will run on their own Google Meet.</p>
    <div class="email-pill"><span class="dot"></span>{display_email}</div>
    <div class="divider"></div>
    <div class="brand"><b>Learnspace</b> · Online Classes</div>
  </div>
</body>
</html>""", 200


@online_class_bp.route("/api/online-classes/google/disconnect", methods=["DELETE"])
@token_required
def google_disconnect(current_user):
    staff_id = getattr(current_user, "staff_id", None)
    if not staff_id:
        return jsonify({"error": "Your login is not linked to a teacher record."}), 400
    token_row = GoogleOAuthToken.query.filter_by(staff_id=staff_id).first()
    if not token_row:
        return jsonify({"status": "not connected"}), 200
    db.session.delete(token_row)
    db.session.commit()
    return jsonify({"status": "disconnected"}), 200