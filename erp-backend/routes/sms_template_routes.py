"""
SMS Templates API  (SMS Center → Templates tab)

Every template belongs to an SmsEvent (created in the Events tab).
    target_branch_id = NULL → common for all branches
    target_branch_id = <id> → only that branch (WINS over common)

Permission: administration.sms.templates
    read   → list, history
    append → create
    write  → edit
    delete → activate / deactivate

Rules:
    - Only {variables} allowed by the event's type (+ its extra fields)
    - One default per (event, scope); a scope with active templates always has a default
    - Branch-only event → its templates are branch-only (same branch)
    - Event and "Applies to" are locked after creation
    - Common templates need access to ALL branches; branch templates need that branch

This module also holds shared helpers (ApiError, _transactional, _resolve_school,
_bool, _user_names) used by the account and event routes.
"""
import re
import logging
from functools import wraps

from flask import Blueprint, jsonify, request, g

from extensions import db
from helpers import token_required, permission_required, has_permission, get_user_allowed_schools, skip_scoping
from services.sms_service import RECIPIENT_FIELDS
from services.sms_event_types import EVENT_TYPES, event_variables

logger = logging.getLogger(__name__)

bp = Blueprint('sms_template_routes', __name__)

PERM_SMS_TEMPLATES = "administration.sms.templates"

BODY_MAX  = 1000
VAR_RE    = re.compile(r"\{(\w+)\}")
DLT_RE    = re.compile(r"^\d{1,50}$")
SENDER_RE = re.compile(r"^[A-Z0-9]{1,20}$")


# ─────────────────────────────────────────────────────────────────────────────
#  Shared helpers (also imported by sms_account_routes / sms_event_routes)
# ─────────────────────────────────────────────────────────────────────────────
class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def _transactional(func):
    """Roll back on any error and return a clean JSON message."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except ApiError as e:
            db.session.rollback()
            return jsonify({"error": e.message}), e.status
        except Exception:
            db.session.rollback()
            logger.exception("SMS: unexpected error")
            return jsonify({"error": "Something went wrong. Please try again."}), 500
    return wrapper


def _bool(value):
    return value in (True, 1, "1", "true", "True", "yes", "on")


def _resolve_school(current_user, requested=None):
    """Return the school_id this user may manage, or raise ApiError."""
    allowed = get_user_allowed_schools(current_user)
    try:
        requested = int(requested) if requested not in (None, "", "all", "All") else None
    except (TypeError, ValueError):
        raise ApiError("Invalid school_id")

    school_id = requested or getattr(g, "school_id", None)

    if allowed["is_unlimited"]:
        if not school_id:
            raise ApiError("Please select a school in the top bar (not 'All').")
        return school_id

    ids = allowed["ids"] or set()
    if not school_id and len(ids) == 1:
        school_id = next(iter(ids))
    if not school_id:
        raise ApiError("Please select a school in the top bar.")
    if school_id not in ids:
        raise ApiError("You can only manage your own school.", 403)
    return school_id


def _user_names(user_ids):
    from models import User
    ids = {i for i in user_ids if i}
    if not ids:
        return {}
    return {u.user_id: u.username for u in User.query.filter(User.user_id.in_(ids)).all()}


def _scope_helpers():
    """Imported lazily to avoid a circular import with sms_account_routes."""
    from routes.sms_account_routes import _resolve_scope, _can_access_branch, _can_access_whole_school
    return _resolve_scope, _can_access_branch, _can_access_whole_school


def _branch_names(ids):
    from models import Branch
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {b.id: b.branch_name for b in Branch.query.filter(Branch.id.in_(ids)).all()}


def _scope_filter(query, model, target_branch_id):
    if target_branch_id is None:
        return query.filter(model.target_branch_id.is_(None))
    return query.filter(model.target_branch_id == target_branch_id)


def _check_scope_access(current_user, school_id, target_branch_id):
    from models import Branch
    _, can_access_branch, can_access_whole_school = _scope_helpers()
    if target_branch_id is None:
        if not can_access_whole_school(current_user, school_id):
            raise ApiError("Only users with access to all branches of this school can manage common templates.", 403)
        return
    b = Branch.query.get(target_branch_id)
    if not b or b.school_id != school_id:
        raise ApiError("Branch does not belong to this school.")
    if not can_access_branch(current_user, target_branch_id):
        raise ApiError("You don't have access to this branch.", 403)


# ─────────────────────────────────────────────────────────────────────────────
#  Views
# ─────────────────────────────────────────────────────────────────────────────
def _event_view(ev, bnames):
    t = EVENT_TYPES.get(ev.event_type, {})
    return {
        "id":         ev.id,
        "name":       ev.name,
        "event_type": ev.event_type,
        "type_label": t.get("label", ev.event_type),
        "is_common":  ev.target_branch_id is None,
        "applies_to": "All branches" if ev.target_branch_id is None else bnames.get(ev.target_branch_id, "—"),
        "variables":  event_variables(ev.event_type, ev.custom_fields),
    }


def _template_view(t, events_by_id, names, bnames, in_use_ids):
    ev = events_by_id.get(t.event_id)
    return {
        "id":              t.id,
        "event_id":        t.event_id,
        "event_name":      ev.name if ev else "—",
        "event_type":      ev.event_type if ev else "",
        "event_active":    bool(ev and ev.is_active),
        "variables":       event_variables(ev.event_type, ev.custom_fields) if ev else [],
        "is_common":       t.target_branch_id is None,
        "applies_to":      "All branches" if t.target_branch_id is None else bnames.get(t.target_branch_id, "—"),
        "name":            t.name,
        "body":            t.body,
        "dlt_template_id": t.dlt_template_id,
        "sender_id":       t.sender_id,
        "recipient":       t.recipient,
        "is_default":      bool(t.is_default),
        "is_active":       bool(t.is_active),
        "in_use":          t.id in in_use_ids,
        "updated_at":      t.updated_at.strftime("%Y-%m-%d %H:%M") if t.updated_at else None,
        "updated_by":      names.get(t.updated_by),
    }


def _in_use_ids(templates, events_by_id, branch_id):
    """Per event: the branch's default template wins, else the common default."""
    chosen = {}
    for t in templates:
        ev = events_by_id.get(t.event_id)
        if not (ev and ev.is_active and t.is_active and t.is_default):
            continue
        if t.target_branch_id == branch_id:
            chosen[t.event_id] = t.id                      # branch wins
        elif t.target_branch_id is None and t.event_id not in chosen:
            chosen[t.event_id] = t.id                      # common, unless branch already set
    return set(chosen.values())


# ─────────────────────────────────────────────────────────────────────────────
#  Validation & rules
# ─────────────────────────────────────────────────────────────────────────────
def _validate(data, ev):
    name = (data.get("name") or "").strip()
    if not name:
        raise ApiError("Template name is required.")
    if len(name) > 150:
        raise ApiError("Template name must be 150 characters or less.")

    body = (data.get("body") or "").strip()
    if not body:
        raise ApiError("Message text is required.")
    if len(body) > BODY_MAX:
        raise ApiError(f"Message text must be {BODY_MAX} characters or less.")

    allowed = set(event_variables(ev.event_type, ev.custom_fields))
    unknown = sorted(set(VAR_RE.findall(body)) - allowed)
    if unknown:
        raise ApiError(f"These variables can't be used for '{ev.name}': "
                       + ", ".join("{" + v + "}" for v in unknown))
    leftover = VAR_RE.sub("", body)
    if "{" in leftover or "}" in leftover:
        raise ApiError("Use variables like {student_name}. Please remove any stray { or } characters.")

    recipient = (data.get("recipient") or "FATHER").strip().upper()
    if recipient not in RECIPIENT_FIELDS:
        raise ApiError("Recipient must be one of: " + ", ".join(RECIPIENT_FIELDS))

    dlt = (data.get("dlt_template_id") or "").strip() or None
    if dlt and not DLT_RE.match(dlt):
        raise ApiError("DLT Template ID must contain digits only.")

    sender = (data.get("sender_id") or "").strip().upper() or None
    if sender and not SENDER_RE.match(sender):
        raise ApiError("Sender ID must be letters/numbers only (max 20).")

    return {"name": name, "body": body, "recipient": recipient,
            "dlt_template_id": dlt, "sender_id": sender}


def _apply_default_rules(tpl):
    """Exactly one default per (event, scope) whenever that scope has active templates."""
    from models import SmsTemplate
    if not tpl.is_active:
        tpl.is_default = False
    with skip_scoping():
        base = _scope_filter(SmsTemplate.query.filter(SmsTemplate.event_id == tpl.event_id),
                             SmsTemplate, tpl.target_branch_id)
        if tpl.is_default:
            for other in base.filter(SmsTemplate.id != tpl.id, SmsTemplate.is_default == True).all():
                other.is_default = False
        if not base.filter(SmsTemplate.is_active == True, SmsTemplate.is_default == True).first():
            newest = base.filter(SmsTemplate.is_active == True) \
                         .order_by(SmsTemplate.updated_at.desc(), SmsTemplate.id.desc()).first()
            if newest:
                newest.is_default = True


def _get_event_for_new_template(school_id, branch, event_id):
    from models import SmsEvent
    with skip_scoping():
        ev = SmsEvent.query.get(event_id) if event_id else None
    if not ev or ev.school_id != school_id:
        raise ApiError("Please choose a valid event.")
    if not ev.is_active:
        raise ApiError("This event is inactive. Activate it in the Events tab first.")
    if ev.target_branch_id is not None and (not branch or branch.id != ev.target_branch_id):
        raise ApiError("This event belongs to another branch. Select that branch in the top bar.")
    return ev


def _get_owned_template(current_user, template_id):
    from models import SmsTemplate
    with skip_scoping():
        tpl = SmsTemplate.query.get(template_id)
    if not tpl or tpl.event_id is None:
        raise ApiError("Template not found", 404)
    _resolve_school(current_user, tpl.school_id)
    _check_scope_access(current_user, tpl.school_id, tpl.target_branch_id)
    return tpl


def _event_of(tpl):
    from models import SmsEvent
    with skip_scoping():
        ev = SmsEvent.query.get(tpl.event_id)
    if not ev:
        raise ApiError("The event of this template no longer exists.", 404)
    return ev


# ─────────────────────────────────────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────────────────────────────────────
@bp.route("/api/sms/templates", methods=["GET"])
@token_required
@permission_required(PERM_SMS_TEMPLATES, "read")
@_transactional
def list_sms_templates(current_user):
    from models import SmsTemplate, SmsEvent, School
    resolve_scope, can_access_branch, can_access_whole_school = _scope_helpers()

    school_id, branch = resolve_scope(current_user)
    status       = (request.args.get("status") or "active").strip().lower()
    event_filter = request.args.get("event_id", type=int)

    with skip_scoping():
        ev_q  = SmsEvent.query.filter(SmsEvent.school_id == school_id)
        tpl_q = SmsTemplate.query.filter(SmsTemplate.school_id == school_id, SmsTemplate.event_id.isnot(None))
        if branch:
            ev_q  = ev_q.filter((SmsEvent.target_branch_id.is_(None)) | (SmsEvent.target_branch_id == branch.id))
            tpl_q = tpl_q.filter((SmsTemplate.target_branch_id.is_(None)) | (SmsTemplate.target_branch_id == branch.id))
        all_events = ev_q.all()
        all_tpls   = tpl_q.all()

    if not branch:   # "All branches": hide branch items the user can't access
        all_events = [e for e in all_events if e.target_branch_id is None or can_access_branch(current_user, e.target_branch_id)]
        all_tpls   = [t for t in all_tpls if t.target_branch_id is None or can_access_branch(current_user, t.target_branch_id)]

    events_by_id = {e.id: e for e in all_events}
    in_use       = _in_use_ids(all_tpls, events_by_id, branch.id) if branch else set()

    rows = all_tpls
    if event_filter:
        rows = [t for t in rows if t.event_id == event_filter]
    if status == "active":
        rows = [t for t in rows if t.is_active]
    elif status == "inactive":
        rows = [t for t in rows if not t.is_active]
    rows.sort(key=lambda t: ((events_by_id.get(t.event_id).name if events_by_id.get(t.event_id) else ""),
                             t.target_branch_id is None, not t.is_default, t.name))

    bnames  = _branch_names([t.target_branch_id for t in rows] + [e.target_branch_id for e in all_events])
    names   = _user_names(t.updated_by for t in rows)
    school  = School.query.get(school_id)
    can_add = has_permission(current_user, PERM_SMS_TEMPLATES, "append")

    active_events = sorted([e for e in all_events if e.is_active], key=lambda e: e.name)
    return jsonify({
        "school_name":       school.school_name if school else "",
        "branch":            {"id": branch.id, "name": branch.branch_name} if branch else None,
        "can_create_common": can_add and can_access_whole_school(current_user, school_id),
        "can_create_branch": can_add and bool(branch),
        "events":            [_event_view(e, bnames) for e in active_events],
        "templates":         [_template_view(t, events_by_id, names, bnames, in_use) for t in rows],
    }), 200


@bp.route("/api/sms/templates", methods=["POST"])
@token_required
@permission_required(PERM_SMS_TEMPLATES, "append")
@_transactional
def create_sms_template(current_user):
    from models import SmsTemplate
    resolve_scope, _, _ = _scope_helpers()

    data = request.json or {}
    school_id, branch = resolve_scope(current_user)

    try:
        event_id = int(data.get("event_id") or 0)
    except (TypeError, ValueError):
        raise ApiError("Please choose a valid event.")
    ev = _get_event_for_new_template(school_id, branch, event_id)

    if ev.target_branch_id is not None:
        target_branch_id = ev.target_branch_id             # branch-only event → branch-only template
    elif _bool(data.get("is_common", True)):
        target_branch_id = None
    else:
        if not branch:
            raise ApiError("Select a branch in the top bar to create a branch-only template.")
        target_branch_id = branch.id

    _check_scope_access(current_user, school_id, target_branch_id)
    fields = _validate(data, ev)

    tpl = SmsTemplate(
        school_id=school_id, event_id=ev.id, target_branch_id=target_branch_id,
        event_code=None,                                     # legacy column, unused for new templates
        is_active=_bool(data.get("is_active", True)),
        is_default=_bool(data.get("is_default", False)),
        **fields,
    )
    db.session.add(tpl)
    db.session.flush()
    _apply_default_rules(tpl)
    db.session.commit()
    return jsonify({"ok": True, "id": tpl.id}), 201


@bp.route("/api/sms/templates/<int:template_id>", methods=["PUT"])
@token_required
@permission_required(PERM_SMS_TEMPLATES, "write")
@_transactional
def update_sms_template(current_user, template_id):
    data = request.json or {}
    tpl  = _get_owned_template(current_user, template_id)
    ev   = _event_of(tpl)

    if "event_id" in data and int(data.get("event_id") or 0) != tpl.event_id:
        raise ApiError("The event of a template can't be changed. Please create a new template instead.")
    if "is_common" in data and _bool(data["is_common"]) != (tpl.target_branch_id is None):
        raise ApiError("'Applies to' can't be changed. Please create a new template instead.")

    fields = _validate(data, ev)
    for key, value in fields.items():
        setattr(tpl, key, value)
    if "is_active" in data:
        new_active = _bool(data["is_active"])
        if new_active and not ev.is_active:
            raise ApiError("The event is inactive. Activate it in the Events tab first.")
        tpl.is_active = new_active
    if "is_default" in data:
        tpl.is_default = _bool(data["is_default"])

    db.session.flush()
    _apply_default_rules(tpl)
    db.session.commit()
    return jsonify({"ok": True, "id": tpl.id}), 200


@bp.route("/api/sms/templates/<int:template_id>/active", methods=["PATCH"])
@token_required
@permission_required(PERM_SMS_TEMPLATES, "delete")
@_transactional
def toggle_sms_template(current_user, template_id):
    data = request.json or {}
    if "is_active" not in data:
        raise ApiError("is_active is required")

    tpl = _get_owned_template(current_user, template_id)
    new_active = _bool(data["is_active"])
    if new_active and not _event_of(tpl).is_active:
        raise ApiError("The event is inactive. Activate it in the Events tab first.")

    tpl.is_active = new_active
    db.session.flush()
    _apply_default_rules(tpl)
    db.session.commit()
    return jsonify({"ok": True, "id": tpl.id}), 200


@bp.route("/api/sms/templates/<int:template_id>/history", methods=["GET"])
@token_required
@permission_required(PERM_SMS_TEMPLATES, "read")
@_transactional
def sms_template_history(current_user, template_id):
    from models import AuditLog

    tpl  = _get_owned_template(current_user, template_id)
    logs = (AuditLog.query
            .filter(AuditLog.table_name == "sms_templates", AuditLog.record_id == str(tpl.id))
            .order_by(AuditLog.timestamp.desc()).limit(100).all())

    names  = _user_names([l.user_id for l in logs] + [tpl.created_by])
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
        "when":    tpl.created_at.strftime("%Y-%m-%d %H:%M") if tpl.created_at else "",
        "user":    names.get(tpl.created_by) or "—",
        "action":  "CREATE",
        "changes": {},
    })
    return jsonify(items), 200