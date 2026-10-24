"""
SMS Events API  (SMS Center → Events tab)

Permission: administration.sms.events
    read   → list, history
    append → create
    write  → edit
    delete → activate / deactivate

Scope:
    Common event (target_branch_id NULL) → needs access to ALL branches of the school
    Branch event                          → created for the branch selected in the top bar

Rules:
    - Type and scope can't change after creation (templates depend on them)
    - No delete, only deactivate
    - Can't deactivate an event used for automatic fee receipt
    - Can't remove an extra field that an active template still uses
    - No duplicate names within the same school + scope
"""
import logging

from flask import Blueprint, jsonify, request

from extensions import db
from helpers import token_required, permission_required, has_permission, skip_scoping
from routes.sms_routes import require_any_permission, PERM_SMS_SEND
from routes.sms_template_routes import ApiError, _transactional, _resolve_school, _bool, _user_names, PERM_SMS_TEMPLATES
from routes.sms_account_routes import _resolve_scope, _can_access_branch, _can_access_whole_school
from services.sms_event_types import (EVENT_TYPES, CUSTOM_FIELD_RE, MAX_CUSTOM_FIELDS,
                                      STUDENT_VARS, event_variables)

logger = logging.getLogger(__name__)

bp = Blueprint('sms_event_routes', __name__)

PERM_SMS_EVENTS = "administration.sms.events"


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _branch_names(ids):
    from models import Branch
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {b.id: b.branch_name for b in Branch.query.filter(Branch.id.in_(ids)).all()}


def _event_dict(e, names=None, bnames=None):
    names, bnames = names or {}, bnames or {}
    t = EVENT_TYPES.get(e.event_type, {})
    return {
        "id":            e.id,
        "name":          e.name,
        "event_type":    e.event_type,
        "type_label":    t.get("label", e.event_type),
        "is_common":     e.target_branch_id is None,
        "applies_to":    "All branches" if e.target_branch_id is None else bnames.get(e.target_branch_id, "—"),
        "custom_fields": e.custom_fields or [],
        "description":   e.description,
        "variables":     event_variables(e.event_type, e.custom_fields),
        "is_active":     bool(e.is_active),
        "updated_at":    e.updated_at.strftime("%Y-%m-%d %H:%M") if e.updated_at else None,
        "updated_by":    names.get(e.updated_by),
    }


def _validate(data, fixed_type=None):
    name = (data.get("name") or "").strip()
    if not name:
        raise ApiError("Event name is required.")
    if len(name) > 150:
        raise ApiError("Event name must be 150 characters or less.")

    event_type = (fixed_type or data.get("event_type") or "").strip().upper()
    if event_type not in EVENT_TYPES:
        raise ApiError("Please choose a valid event type.")

    description = (data.get("description") or "").strip() or None
    if description and len(description) > 255:
        raise ApiError("Description must be 255 characters or less.")

    raw = data.get("custom_fields") or []
    if not isinstance(raw, list):
        raise ApiError("Extra fields must be a list.")
    if raw and not EVENT_TYPES[event_type]["allows_custom_fields"]:
        raise ApiError("Extra fields are only allowed for General events.")

    fields = []
    for f in raw:
        f = str(f).strip().lower()
        if not CUSTOM_FIELD_RE.match(f):
            raise ApiError(f"'{f}' is not a valid field name. Use lowercase letters, numbers and _ "
                           "(start with a letter, 2–30 characters).")
        if f in STUDENT_VARS:
            raise ApiError(f"'{f}' is already a standard variable.")
        if f in fields:
            raise ApiError(f"'{f}' is listed twice.")
        fields.append(f)
    if len(fields) > MAX_CUSTOM_FIELDS:
        raise ApiError(f"Maximum {MAX_CUSTOM_FIELDS} extra fields.")

    return {"name": name, "event_type": event_type, "description": description,
            "custom_fields": fields or None}


def _check_scope_access(current_user, school_id, target_branch_id):
    from models import Branch
    if target_branch_id is None:
        if not _can_access_whole_school(current_user, school_id):
            raise ApiError("Only users with access to all branches of this school can manage common events.", 403)
        return
    b = Branch.query.get(target_branch_id)
    if not b or b.school_id != school_id:
        raise ApiError("Branch does not belong to this school.")
    if not _can_access_branch(current_user, target_branch_id):
        raise ApiError("You don't have access to this branch.", 403)


def _check_duplicate(school_id, target_branch_id, name, exclude_id=None):
    from models import SmsEvent
    with skip_scoping():
        q = SmsEvent.query.filter(SmsEvent.school_id == school_id, SmsEvent.name == name)
        q = q.filter(SmsEvent.target_branch_id.is_(None)) if target_branch_id is None \
            else q.filter(SmsEvent.target_branch_id == target_branch_id)
        if exclude_id:
            q = q.filter(SmsEvent.id != exclude_id)
        if q.first():
            raise ApiError("An event with this name already exists here.")


def _get_owned_event(current_user, event_id):
    from models import SmsEvent
    with skip_scoping():
        ev = SmsEvent.query.get(event_id)
    if not ev:
        raise ApiError("Event not found", 404)
    _resolve_school(current_user, ev.school_id)            # 403 if another school
    _check_scope_access(current_user, ev.school_id, ev.target_branch_id)
    return ev


def _fee_receipt_users(event_id):
    """Branches / school common setting that auto-send fee receipts with this event."""
    from models import SmsBranchSetting
    with skip_scoping():
        rows = SmsBranchSetting.query.filter(
            SmsBranchSetting.fee_receipt_event_id == event_id,
            SmsBranchSetting.fee_receipt_mode == "ON",
        ).all()
    bnames = _branch_names(r.target_branch_id for r in rows)
    return [bnames.get(r.target_branch_id, "—") if r.target_branch_id else "School common setting"
            for r in rows]


def _fields_in_use(event_id, removed_fields):
    """Removed extra fields still used by an active template of this event."""
    from models import SmsTemplate
    if not removed_fields:
        return []
    with skip_scoping():
        bodies = [t.body for t in SmsTemplate.query.filter_by(event_id=event_id, is_active=True).all()]
    return sorted({f for f in removed_fields for b in bodies if "{" + f + "}" in (b or "")})


# ─────────────────────────────────────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────────────────────────────────────
@bp.route("/api/sms/event-types", methods=["GET"])
@token_required
@require_any_permission((PERM_SMS_EVENTS, "read"), (PERM_SMS_TEMPLATES, "read"), (PERM_SMS_SEND, "read"))
def list_event_types(current_user):
    return jsonify([
        {"code": c, "label": t["label"], "description": t["description"],
         "variables": t["variables"], "allows_custom_fields": t["allows_custom_fields"], "auto": t["auto"]}
        for c, t in EVENT_TYPES.items()
    ]), 200


@bp.route("/api/sms/events", methods=["GET"])
@token_required
@permission_required(PERM_SMS_EVENTS, "read")
@_transactional
def list_sms_events(current_user):
    from models import SmsEvent, School

    school_id, branch = _resolve_scope(current_user)
    status = (request.args.get("status") or "active").strip().lower()

    with skip_scoping():
        q = SmsEvent.query.filter(SmsEvent.school_id == school_id)
        if branch:
            q = q.filter((SmsEvent.target_branch_id.is_(None)) | (SmsEvent.target_branch_id == branch.id))
        if status == "active":
            q = q.filter(SmsEvent.is_active == True)
        elif status == "inactive":
            q = q.filter(SmsEvent.is_active == False)
        rows = q.order_by(SmsEvent.target_branch_id.isnot(None), SmsEvent.name).all()

    # With "All branches" selected, hide branch events the user can't access
    if not branch:
        rows = [r for r in rows if r.target_branch_id is None or _can_access_branch(current_user, r.target_branch_id)]

    school   = School.query.get(school_id)
    can_add  = has_permission(current_user, PERM_SMS_EVENTS, "append")
    names    = _user_names(r.updated_by for r in rows)
    bnames   = _branch_names(r.target_branch_id for r in rows)

    return jsonify({
        "school_name":       school.school_name if school else "",
        "branch":            {"id": branch.id, "name": branch.branch_name} if branch else None,
        "can_create_common": can_add and _can_access_whole_school(current_user, school_id),
        "can_create_branch": can_add and bool(branch),
        "events":            [_event_dict(r, names, bnames) for r in rows],
    }), 200


@bp.route("/api/sms/events", methods=["POST"])
@token_required
@permission_required(PERM_SMS_EVENTS, "append")
@_transactional
def create_sms_event(current_user):
    from models import SmsEvent

    data = request.json or {}
    school_id, branch = _resolve_scope(current_user)
    fields = _validate(data)

    if _bool(data.get("is_common", True)):
        target_branch_id = None
    else:
        if not branch:
            raise ApiError("Select a branch in the top bar to create a branch-only event.")
        target_branch_id = branch.id

    _check_scope_access(current_user, school_id, target_branch_id)
    _check_duplicate(school_id, target_branch_id, fields["name"])

    ev = SmsEvent(school_id=school_id, target_branch_id=target_branch_id,
                  is_active=_bool(data.get("is_active", True)), **fields)
    db.session.add(ev)
    db.session.commit()
    return jsonify(_event_dict(ev, _user_names([ev.updated_by]), _branch_names([target_branch_id]))), 201


@bp.route("/api/sms/events/<int:event_id>", methods=["PUT"])
@token_required
@permission_required(PERM_SMS_EVENTS, "write")
@_transactional
def update_sms_event(current_user, event_id):
    data = request.json or {}
    ev   = _get_owned_event(current_user, event_id)

    if (data.get("event_type") or ev.event_type).strip().upper() != ev.event_type:
        raise ApiError("The type of an event can't be changed. Please create a new event instead.")
    if "is_common" in data and _bool(data["is_common"]) != (ev.target_branch_id is None):
        raise ApiError("'Applies to' can't be changed. Please create a new event instead.")

    fields  = _validate(data, fixed_type=ev.event_type)
    removed = [f for f in (ev.custom_fields or []) if f not in (fields["custom_fields"] or [])]
    in_use  = _fields_in_use(ev.id, removed)
    if in_use:
        raise ApiError("These fields are used by active templates: "
                       + ", ".join("{" + f + "}" for f in in_use) + ". Update those templates first.")

    _check_duplicate(ev.school_id, ev.target_branch_id, fields["name"], exclude_id=ev.id)

    ev.name          = fields["name"]
    ev.description   = fields["description"]
    ev.custom_fields = fields["custom_fields"]
    if "is_active" in data and not _bool(data["is_active"]) and ev.is_active:
        users = _fee_receipt_users(ev.id)
        if users:
            raise ApiError("This event is used for automatic fee receipts by: " + ", ".join(users)
                           + ". Change that setting first.")
        ev.is_active = False
    elif "is_active" in data:
        ev.is_active = _bool(data["is_active"])

    db.session.commit()
    return jsonify(_event_dict(ev, _user_names([ev.updated_by]), _branch_names([ev.target_branch_id]))), 200


@bp.route("/api/sms/events/<int:event_id>/active", methods=["PATCH"])
@token_required
@permission_required(PERM_SMS_EVENTS, "delete")
@_transactional
def toggle_sms_event(current_user, event_id):
    data = request.json or {}
    if "is_active" not in data:
        raise ApiError("is_active is required")

    ev = _get_owned_event(current_user, event_id)
    new_state = _bool(data["is_active"])
    if not new_state:
        users = _fee_receipt_users(ev.id)
        if users:
            raise ApiError("This event is used for automatic fee receipts by: " + ", ".join(users)
                           + ". Change that setting first.")
    ev.is_active = new_state
    db.session.commit()
    return jsonify(_event_dict(ev, _user_names([ev.updated_by]), _branch_names([ev.target_branch_id]))), 200


@bp.route("/api/sms/events/<int:event_id>/history", methods=["GET"])
@token_required
@permission_required(PERM_SMS_EVENTS, "read")
@_transactional
def sms_event_history(current_user, event_id):
    from models import AuditLog

    ev   = _get_owned_event(current_user, event_id)
    logs = (AuditLog.query
            .filter(AuditLog.table_name == "sms_events", AuditLog.record_id == str(ev.id))
            .order_by(AuditLog.timestamp.desc()).limit(100).all())

    names  = _user_names([l.user_id for l in logs] + [ev.created_by])
    ignore = {"updated_at", "updated_by"}
    items  = []
    for log in logs:
        new, old = log.new_data or {}, log.old_data or {}
        changes = {k: {"from": old.get(k), "to": new.get(k)} for k in new if k not in ignore}
        if changes:
            items.append({
                "when":    log.timestamp.strftime("%Y-%m-%d %H:%M") if log.timestamp else "",
                "user":    names.get(log.user_id) or "—",
                "action":  log.action,
                "changes": changes,
            })
    items.append({
        "when":    ev.created_at.strftime("%Y-%m-%d %H:%M") if ev.created_at else "",
        "user":    names.get(ev.created_by) or "—",
        "action":  "CREATE",
        "changes": {},
    })
    return jsonify(items), 200


# ─────────────────────────────────────────────────────────────────────────────
#  Automatic fee receipt settings (shown as a card in the Events tab)
#
#  School common row : sms_branch_settings.target_branch_id IS NULL → mode ON / OFF
#  Branch row        : target_branch_id = branch → mode COMMON / ON / OFF
#  Common setting needs access to ALL branches; branch setting needs that branch.
# ─────────────────────────────────────────────────────────────────────────────
FEE_COMMON_MODES = ("ON", "OFF")
FEE_BRANCH_MODES = ("COMMON", "ON", "OFF")


def _fee_rows(school_id, branch):
    from models import SmsBranchSetting
    with skip_scoping():
        common_row = SmsBranchSetting.query.filter_by(school_id=school_id, target_branch_id=None).first()
        branch_row = SmsBranchSetting.query.filter_by(target_branch_id=branch.id).first() if branch else None
    return common_row, branch_row


def _fee_events(school_id):
    from models import SmsEvent
    with skip_scoping():
        return SmsEvent.query.filter(
            SmsEvent.school_id == school_id,
            SmsEvent.event_type == "FEE_RECEIPT",
            SmsEvent.is_active == True,
        ).order_by(SmsEvent.name).all()


def _fee_payload(current_user, school_id, branch):
    from models import School
    from services.sms_service import SmsSender

    common_row, branch_row = _fee_rows(school_id, branch)
    events    = _fee_events(school_id)
    can_write = has_permission(current_user, PERM_SMS_EVENTS, "write")
    school    = School.query.get(school_id)

    status = None
    if branch:
        sender = SmsSender()
        ev, reason = sender.fee_receipt_event(branch.id)
        if reason:
            status = {"on": False, "ready": False, "message": reason}
        else:
            reasons = sender.readiness(ev, branch.id)
            status = ({"on": True, "ready": True,
                       "message": f"{branch.branch_name} sends fee receipts using '{ev.name}'."}
                      if not reasons else
                      {"on": True, "ready": False,
                       "message": f"Switched on, but SMS will NOT be sent: {reasons[0]}"})

    return {
        "school_name":    school.school_name if school else "",
        "branch":         {"id": branch.id, "name": branch.branch_name} if branch else None,
        "common":         {"mode": common_row.fee_receipt_mode if common_row else "OFF",
                           "event_id": common_row.fee_receipt_event_id if common_row else None},
        "branch_setting": ({"mode": branch_row.fee_receipt_mode if branch_row else "OFF",
                            "event_id": branch_row.fee_receipt_event_id if branch_row else None}
                           if branch else None),
        "common_events":  [{"id": e.id, "name": e.name} for e in events if e.target_branch_id is None],
        "branch_events":  ([{"id": e.id, "name": e.name, "is_common": e.target_branch_id is None}
                            for e in events if e.target_branch_id in (None, branch.id)] if branch else []),
        "can_edit_common": can_write and _can_access_whole_school(current_user, school_id),
        "can_edit_branch": can_write and bool(branch),
        "status":          status,
    }


def _valid_fee_event(school_id, event_id, branch_id=None, common_only=False):
    from models import SmsEvent
    try:
        event_id = int(event_id or 0)
    except (TypeError, ValueError):
        event_id = 0
    with skip_scoping():
        ev = SmsEvent.query.get(event_id) if event_id else None
    if not ev or ev.school_id != school_id or ev.event_type != "FEE_RECEIPT":
        raise ApiError("Please choose a Fee receipt event.")
    if not ev.is_active:
        raise ApiError("This event is inactive. Activate it first.")
    if common_only and ev.target_branch_id is not None:
        raise ApiError("The common setting can only use a common event.")
    if not common_only and ev.target_branch_id not in (None, branch_id):
        raise ApiError("This event is not available for this branch.")
    return ev


@bp.route("/api/sms/fee-receipt-settings", methods=["GET"])
@token_required
@permission_required(PERM_SMS_EVENTS, "read")
@_transactional
def get_fee_receipt_settings(current_user):
    school_id, branch = _resolve_scope(current_user)
    return jsonify(_fee_payload(current_user, school_id, branch)), 200


@bp.route("/api/sms/fee-receipt-settings/common", methods=["PUT"])
@token_required
@permission_required(PERM_SMS_EVENTS, "write")
@_transactional
def save_fee_receipt_common(current_user):
    from models import SmsBranchSetting

    data = request.json or {}
    school_id, branch = _resolve_scope(current_user)
    if not _can_access_whole_school(current_user, school_id):
        raise ApiError("Only users with access to all branches can change the common setting.", 403)

    mode = (data.get("mode") or "").strip().upper()
    if mode not in FEE_COMMON_MODES:
        raise ApiError("Choose On or Off.")

    ev = None
    if mode == "ON" or data.get("event_id"):
        ev = _valid_fee_event(school_id, data.get("event_id"), common_only=True)

    row, _ = _fee_rows(school_id, None)
    if row is None:
        row = SmsBranchSetting(school_id=school_id, target_branch_id=None,
                               account_source="NONE", fee_receipt_mode="OFF")
        db.session.add(row)
    row.fee_receipt_mode = mode
    if ev:
        row.fee_receipt_event_id = ev.id        # kept when switched off, for easy re-enable

    db.session.commit()
    return jsonify(_fee_payload(current_user, school_id, branch)), 200


@bp.route("/api/sms/fee-receipt-settings/branch", methods=["PUT"])
@token_required
@permission_required(PERM_SMS_EVENTS, "write")
@_transactional
def save_fee_receipt_branch(current_user):
    from models import SmsBranchSetting

    data = request.json or {}
    school_id, branch = _resolve_scope(current_user)
    if not branch:
        raise ApiError("Select a branch in the top bar first.")

    mode = (data.get("mode") or "").strip().upper()
    if mode not in FEE_BRANCH_MODES:
        raise ApiError("Choose Use common, On or Off.")

    ev = None
    if mode == "ON" or data.get("event_id"):
        ev = _valid_fee_event(school_id, data.get("event_id"), branch_id=branch.id)

    _, row = _fee_rows(school_id, branch)
    if row is None:
        row = SmsBranchSetting(school_id=school_id, target_branch_id=branch.id,
                               account_source="NONE", fee_receipt_mode="OFF")
        db.session.add(row)
    row.fee_receipt_mode = mode
    if ev:
        row.fee_receipt_event_id = ev.id

    db.session.commit()
    return jsonify(_fee_payload(current_user, school_id, branch)), 200