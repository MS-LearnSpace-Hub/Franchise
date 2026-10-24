"""
SMS Account API  (SMS Center → SMS Account tab)

Accounts (sms_provider_accounts):
    School account : target_branch_id IS NULL  (one per school)
    Branch account : target_branch_id = branch (one per branch)

Branch choice (sms_branch_settings.account_source):
    SCHOOL | OWN | NONE   — explicit only. No automatic fallback. No .env.

Permission: administration.sms.provider-settings
    read  → view (tokens are NEVER returned)
    write → save accounts / change the branch choice
Access:
    School account          → users with access to ALL active branches of the school (or SuperAdmin)
    Branch account + choice → users with access to that branch
"""
import re

from flask import Blueprint, jsonify, request, g

from extensions import db
from helpers import (token_required, permission_required, has_permission,
                     get_user_allowed_branches, skip_scoping)
from routes.sms_template_routes import ApiError, _transactional, _resolve_school, _bool, _user_names
from routes.sms_routes import require_any_permission

bp = Blueprint('sms_account_routes', __name__)

# Three separate keys (set in Role Permissions)
PERM_SCHOOL_ACCOUNT = "administration.sms.provider-settings"   # Key 1: school box
PERM_BRANCH_ACCOUNT = "administration.sms.branch-account"      # Key 2: branch box
PERM_ACCOUNT_CHOICE = "administration.sms.account-choice"      # Key 3: School / Own / Not set

# Providers shown in the dropdown. More are added in the provider plug-in step.
from services.sms_service import PROVIDERS as _ENGINE_PROVIDERS
PROVIDERS = {code: p.label for code, p in _ENGINE_PROVIDERS.items()}   # dropdown = engine plug-ins
ACCOUNT_SOURCES = ("SCHOOL", "OWN", "NONE")

AUTH_KEY_RE   = re.compile(r"^[A-Za-z0-9_\-\.]{1,120}$")
SENDER_RE     = re.compile(r"^[A-Z0-9]{1,20}$")
ROUTE_RE      = re.compile(r"^[A-Za-z0-9_\-]{1,20}$")
DLT_ENTITY_RE = re.compile(r"^\d{1,50}$")
TOKEN_MAX     = 500


# ─────────────────────────────────────────────────────────────────────────────
#  Lookups
# ─────────────────────────────────────────────────────────────────────────────
def _school_account(school_id):
    from models import SmsProviderAccount
    with skip_scoping():
        return SmsProviderAccount.query.filter_by(school_id=school_id, target_branch_id=None).first()


def _branch_account(branch_id):
    from models import SmsProviderAccount
    with skip_scoping():
        return SmsProviderAccount.query.filter_by(target_branch_id=branch_id).first()


def _branch_setting(branch_id):
    from models import SmsBranchSetting
    with skip_scoping():
        return SmsBranchSetting.query.filter_by(target_branch_id=branch_id).first()


def _school_branch_ids(school_id):
    from models import Branch
    return {b.id for b in Branch.query.filter_by(school_id=school_id, is_active=True).all()}


# ─────────────────────────────────────────────────────────────────────────────
#  Access
# ─────────────────────────────────────────────────────────────────────────────
def _can_access_branch(current_user, branch_id):
    allowed = get_user_allowed_branches(current_user)
    return allowed["is_unlimited"] or branch_id in (allowed["ids"] or set())


def _can_access_whole_school(current_user, school_id):
    allowed = get_user_allowed_branches(current_user)
    if allowed["is_unlimited"]:
        return True
    school_branches = _school_branch_ids(school_id)
    return bool(school_branches) and school_branches.issubset(allowed["ids"] or set())


def _resolve_scope(current_user):
    """School + (optional) branch from the top bar, validated."""
    from models import Branch
    school_id = _resolve_school(current_user, request.args.get("school_id"))
    branch = None
    branch_id = getattr(g, "branch_id", None)
    if branch_id:
        branch = Branch.query.get(branch_id)
        if not branch or branch.school_id != school_id:
            raise ApiError("The selected branch does not belong to the selected school.")
        if not _can_access_branch(current_user, branch.id):
            raise ApiError("You don't have access to this branch.", 403)
    return school_id, branch


# ─────────────────────────────────────────────────────────────────────────────
#  Views (tokens are never included)
# ─────────────────────────────────────────────────────────────────────────────
def _account_view(acc):
    if not acc:
        return None
    names = _user_names([acc.updated_by])
    return {
        "id":                acc.id,
        "provider":          acc.provider,
        "auth_key":          acc.auth_key,
        "default_sender_id": acc.default_sender_id,
        "route":             acc.route,
        "dlt_entity_id":     acc.dlt_entity_id,
        "is_active":         bool(acc.is_active),
        "has_token":         bool(acc.auth_token_encrypted),
        "updated_at":        acc.updated_at.strftime("%Y-%m-%d %H:%M") if acc.updated_at else None,
        "updated_by":        names.get(acc.updated_by),
    }


def _branch_status(setting, school_acc, branch_acc):
    source = setting.account_source if setting else "NONE"
    if source == "SCHOOL":
        acc, label = school_acc, "the school account"
    elif source == "OWN":
        acc, label = branch_acc, "its own account"
    else:
        return {"account_source": "NONE", "ready": False,
                "message": "No account chosen. SMS for this branch will NOT be sent."}

    if acc and acc.is_active:
        return {"account_source": source, "ready": True,
                "message": f"Uses {label} ({PROVIDERS.get(acc.provider, acc.provider)} · sender {acc.default_sender_id})."}
    return {"account_source": source, "ready": False,
            "message": f"Set to {label}, but it is not saved or not active. SMS for this branch will NOT be sent."}


def _payload(current_user, school_id, branch, warning=None):
    from models import School
    school = School.query.get(school_id)

    can_view_school = has_permission(current_user, PERM_SCHOOL_ACCOUNT, "read")
    can_view_branch = bool(branch) and has_permission(current_user, PERM_BRANCH_ACCOUNT, "read")

    school_acc = _school_account(school_id)
    branch_acc = _branch_account(branch.id) if branch else None
    setting    = _branch_setting(branch.id) if branch else None

    data = {
        "school_id":         school_id,
        "school_name":       school.school_name if school else "",
        "branch":            {"id": branch.id, "name": branch.branch_name} if branch else None,
        # Key 1: school box (also needs access to all branches of the school to edit)
        "can_view_school":   can_view_school,
        "can_edit_school":   can_view_school
                             and has_permission(current_user, PERM_SCHOOL_ACCOUNT, "write")
                             and _can_access_whole_school(current_user, school_id),
        # Key 2: branch box
        "can_view_branch":   can_view_branch,
        "can_edit_branch":   can_view_branch and has_permission(current_user, PERM_BRANCH_ACCOUNT, "write"),
        # Key 3: the School / Own / Not set choice
        "can_change_choice": bool(branch) and has_permission(current_user, PERM_ACCOUNT_CHOICE, "write"),
                "providers":         [{"code": c, "label": p.label, "key_label": p.key_label,
                               "token_label": p.token_label, "uses_route": p.uses_route}
                              for c, p in _ENGINE_PROVIDERS.items()],
        # Accounts are only sent to users who hold the matching key
        "school_account":    _account_view(school_acc) if can_view_school else None,
        "branch_account":    _account_view(branch_acc) if can_view_branch else None,
        "branch_status":     _branch_status(setting, school_acc, branch_acc) if branch else None,
    }
    if warning:
        data["warning"] = warning
    return data


# ─────────────────────────────────────────────────────────────────────────────
#  Save helper (shared by school + branch account)
# ─────────────────────────────────────────────────────────────────────────────
def _save_account(acc, school_id, target_branch_id, data):
    from models import SmsProviderAccount
    from crypto_utils import encrypt_secret

    provider  = (data.get("provider") or "SMSCOUNTRY").strip().upper()
    auth_key  = (data.get("auth_key") or "").strip()
    token     = (data.get("auth_token") or "").strip()
    sender    = (data.get("default_sender_id") or "").strip().upper()
    route     = (data.get("route") or "Trans").strip()
    dlt       = (data.get("dlt_entity_id") or "").strip() or None
    is_active = _bool(data.get("is_active", True))

    if provider not in PROVIDERS:
        raise ApiError("Please choose a supported provider.")
    if not AUTH_KEY_RE.match(auth_key):
        raise ApiError("Auth key / account ID is required (letters, numbers, - _ . only).")
    if len(token) > TOKEN_MAX:
        raise ApiError("Auth token is too long.")
    if not SENDER_RE.match(sender):
        raise ApiError("Sender ID is required (letters/numbers only, max 20).")
    if not ROUTE_RE.match(route):
        raise ApiError("Route must be letters/numbers only (e.g. Trans).")
    if dlt and not DLT_ENTITY_RE.match(dlt):
        raise ApiError("DLT Entity ID must contain digits only.")
    if acc is not None and acc.provider != provider and not token:
        raise ApiError("You changed the provider. Please enter the new provider's API key / token.")
    if acc is None and not token:
        raise ApiError("Auth token / password is required when setting up an account.")

    encrypted = None
    if token:
        try:
            encrypted = encrypt_secret(token)
        except RuntimeError:
            raise ApiError("Server encryption key (FERNET_KEY) is not configured. Contact your administrator.", 500)

    if acc is None:
        acc = SmsProviderAccount(
            school_id=school_id, target_branch_id=target_branch_id,
            provider=provider, auth_key=auth_key, auth_token_encrypted=encrypted,
            default_sender_id=sender, route=route, dlt_entity_id=dlt, is_active=is_active,
        )
        db.session.add(acc)
    else:
        acc.provider          = provider
        acc.auth_key          = auth_key
        acc.default_sender_id = sender
        acc.route             = route
        acc.dlt_entity_id     = dlt
        acc.is_active         = is_active
        if encrypted:                       # blank token = keep the saved one
            acc.auth_token_encrypted = encrypted
    return acc


def _branches_using_school_account(school_id):
    from models import SmsBranchSetting, Branch
    with skip_scoping():
        rows = SmsBranchSetting.query.filter(
            SmsBranchSetting.school_id == school_id,
            SmsBranchSetting.target_branch_id.isnot(None),
            SmsBranchSetting.account_source == "SCHOOL",
        ).all()
    names = []
    for r in rows:
        b = Branch.query.get(r.target_branch_id)
        if b:
            names.append(b.branch_name)
    return names


# ─────────────────────────────────────────────────────────────────────────────
#  Routes
# ─────────────────────────────────────────────────────────────────────────────
@bp.route("/api/sms/account", methods=["GET"])
@token_required
@require_any_permission(
    (PERM_SCHOOL_ACCOUNT, "read"),
    (PERM_BRANCH_ACCOUNT, "read"),
    (PERM_ACCOUNT_CHOICE, "read"),
)
@_transactional
def get_sms_account(current_user):
    school_id, branch = _resolve_scope(current_user)
    return jsonify(_payload(current_user, school_id, branch)), 200


@bp.route("/api/sms/account/school", methods=["PUT"])
@token_required
@permission_required(PERM_SCHOOL_ACCOUNT, "write")
@_transactional
def save_school_account(current_user):
    school_id, branch = _resolve_scope(current_user)
    if not _can_access_whole_school(current_user, school_id):
        raise ApiError("Only users with access to all branches of this school can change the school account.", 403)

    acc = _save_account(_school_account(school_id), school_id, None, request.json or {})
    db.session.commit()

    warning = None
    if not acc.is_active:
        names = _branches_using_school_account(school_id)
        if names:
            warning = (f"{len(names)} branch(es) use the school account and will NOT send SMS now: "
                       + ", ".join(names))
    return jsonify(_payload(current_user, school_id, branch, warning)), 200


@bp.route("/api/sms/account/branch", methods=["PUT"])
@token_required
@permission_required(PERM_BRANCH_ACCOUNT, "write")
@_transactional
def save_branch_account(current_user):
    school_id, branch = _resolve_scope(current_user)
    if not branch:
        raise ApiError("Please select a branch in the top bar first.")

    acc = _save_account(_branch_account(branch.id), school_id, branch.id, request.json or {})
    db.session.commit()

    warning = None
    setting = _branch_setting(branch.id)
    if not acc.is_active and setting and setting.account_source == "OWN":
        warning = "This branch is set to use its own account, which is now inactive. SMS will NOT be sent."
    return jsonify(_payload(current_user, school_id, branch, warning)), 200


@bp.route("/api/sms/account/source", methods=["PUT"])
@token_required
@permission_required(PERM_ACCOUNT_CHOICE, "write")
@_transactional
def set_account_source(current_user):
    from models import SmsBranchSetting

    school_id, branch = _resolve_scope(current_user)
    if not branch:
        raise ApiError("Please select a branch in the top bar first.")

    source = ((request.json or {}).get("account_source") or "").strip().upper()
    if source not in ACCOUNT_SOURCES:
        raise ApiError("Choose School account, Own account or Not set.")

    if source == "SCHOOL":
        acc = _school_account(school_id)
        if not (acc and acc.is_active):
            raise ApiError("The school has no active SMS account yet. Save and activate it first.")
    if source == "OWN":
        acc = _branch_account(branch.id)
        if not (acc and acc.is_active):
            raise ApiError("This branch has no active own account yet. Save and activate it first.")

    setting = _branch_setting(branch.id)
    if setting is None:
        setting = SmsBranchSetting(
            school_id=school_id, target_branch_id=branch.id,
            account_source=source, fee_receipt_mode="OFF",
        )
        db.session.add(setting)
    else:
        setting.account_source = source

    db.session.commit()
    return jsonify(_payload(current_user, school_id, branch)), 200