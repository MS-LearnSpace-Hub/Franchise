from flask import Blueprint, jsonify, request
import threading
from extensions import db
from helpers import token_required, get_user_permissions, has_permission
from models import Permission, Role, RolePermission
from permission_catalog import ACTION_KEYS, PERMISSION_CATALOG

bp = Blueprint("rbac_routes", __name__)

_sync_lock = threading.Lock()


def _require_admin(current_user):
    if not has_permission(current_user, "system.roles.role-permissions", "read"):
        return jsonify({"error": "Unauthorized"}), 403
    return None


def _require_role_listing_access(current_user):
    if (
        not has_permission(current_user, "system.roles.role-permissions", "read")
        and not has_permission(current_user, "system.users.user-management", "read")
        and not has_permission(current_user, "hr.hr.staff-master", "write")
    ):
        return jsonify({"error": "Unauthorized"}), 403
    return None


def _require_superadmin(current_user):
    if not has_permission(current_user, "system.roles.role-permissions", "write"):
        return jsonify({"error": "Unauthorized. Role management permission required."}), 403
    return None


def _role_to_dict(role, include_permissions=False):
    data = {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "is_active": bool(role.is_active),
        "is_system": bool(role.is_system),
    }
    if include_permissions:
        data["permissions"] = [_role_permission_to_dict(row) for row in role.permissions.all()]
    return data


def _permission_to_dict(permission):
    return {
        "id": permission.id,
        "dashboard": permission.dashboard,
        "module": permission.module,
        "component": permission.component,
        "code": permission.code,
        "description": permission.description,
        "is_active": bool(permission.is_active),
    }


def _role_permission_to_dict(row):
    return {
        "permission_id": row.permission_id,
        "permission_code": row.permission.code if row.permission else None,
        "can_read": bool(row.can_read),
        "can_write": bool(row.can_write),
        "can_append": bool(row.can_append),
        "can_delete": bool(row.can_delete),
    }


def _sync_permission_catalog():
    with _sync_lock:
        existing = {p.code: p for p in Permission.query.all()}
        existing_by_path = {
            (p.dashboard, p.module, p.component): p
            for p in Permission.query.all()
        }
        changed = False
        for item in PERMISSION_CATALOG:
            path = (item["dashboard"], item["module"], item["component"])
            permission = existing.get(item["code"]) or existing_by_path.get(path)
            if permission:
                for field in ("dashboard", "module", "component", "code", "description"):
                    if getattr(permission, field) != item.get(field):
                        setattr(permission, field, item.get(field))
                        changed = True
                if not permission.is_active:
                    permission.is_active = True
                    changed = True
                continue

            db.session.add(Permission(**item, is_active=True))
            changed = True

        if changed:
            db.session.commit()


def _upsert_role_permissions(role, permission_payload):
    permissions_by_id = {p.id: p for p in Permission.query.filter_by(is_active=True).all()}
    existing = {rp.permission_id: rp for rp in role.permissions.all()}

    for item in permission_payload:
        permission_id = item.get("permission_id")
        if permission_id not in permissions_by_id:
            continue

        row = existing.get(permission_id)
        if not row:
            row = RolePermission(role_id=role.id, permission_id=permission_id)
            db.session.add(row)

        for action in ACTION_KEYS:
            setattr(row, f"can_{action}", bool(item.get(f"can_{action}", False)))


@bp.route("/api/rbac/permissions", methods=["GET"])
@token_required
def list_permissions(current_user):
    error = _require_admin(current_user)
    if error:
        return error

    permissions = Permission.query.filter_by(is_active=True).order_by(
        Permission.dashboard.asc(),
        Permission.module.asc(),
        Permission.component.asc(),
    ).all()
    return jsonify({"permissions": [_permission_to_dict(p) for p in permissions]}), 200


@bp.route("/api/rbac/permissions/sync", methods=["POST"])
@token_required
def sync_permissions(current_user):
    error = _require_admin(current_user)
    if error:
        return error

    try:
        _sync_permission_catalog()
        return jsonify({"message": "Permissions synced successfully"}), 200
    except Exception as e:
        return jsonify({"error": "Failed to sync permissions"}), 500

@bp.route("/api/rbac/roles", methods=["GET"])
@token_required
def list_roles(current_user):
    error = _require_role_listing_access(current_user)
    if error:
        return error

    query = Role.query.order_by(Role.name.asc())
    if not has_permission(current_user, "system.roles.role-permissions", "write"):
        query = query.filter(Role.name != "SuperAdmin", Role.is_active == True)
    roles = query.all()
    return jsonify({"roles": [_role_to_dict(role) for role in roles]}), 200


@bp.route("/api/rbac/roles", methods=["POST"])
@token_required
def create_role(current_user):
    error = _require_superadmin(current_user)
    if error:
        return error

    data = request.json or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Role name is required"}), 400
    if Role.query.filter_by(name=name).first():
        return jsonify({"error": "Role name already exists"}), 400

    role = Role(
        name=name,
        description=data.get("description"),
        is_active=bool(data.get("is_active", True)),
        is_system=False,
        created_by=current_user.user_id,
        updated_by=current_user.user_id,
    )
    try:
        db.session.add(role)
        db.session.flush()
        _upsert_role_permissions(role, data.get("permissions", []))
        db.session.commit()
        return jsonify({"message": "Role created", "role": _role_to_dict(role, True)}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "An unexpected error occurred"}), 500


@bp.route("/api/rbac/roles/<int:role_id>", methods=["GET"])
@token_required
def get_role(current_user, role_id):
    error = _require_admin(current_user)
    if error:
        return error

    role = Role.query.get(role_id)
    if not role:
        return jsonify({"error": "Role not found"}), 404
    if not has_permission(current_user, "system.roles.role-permissions", "write") and role.name == "SuperAdmin":
        return jsonify({"error": "Unauthorized"}), 403
    return jsonify({"role": _role_to_dict(role, True)}), 200


@bp.route("/api/rbac/roles/<int:role_id>", methods=["PUT"])
@token_required
def update_role(current_user, role_id):
    error = _require_superadmin(current_user)
    if error:
        return error

    role = Role.query.get(role_id)
    if not role:
        return jsonify({"error": "Role not found"}), 404

    data = request.json or {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Role name is required"}), 400
        duplicate = Role.query.filter(Role.name == name, Role.id != role.id).first()
        if duplicate:
            return jsonify({"error": "Role name already exists"}), 400
        if role.is_system and name != role.name:
            return jsonify({"error": "System role names cannot be changed"}), 400
        role.name = name

    if "description" in data:
        role.description = data.get("description")
    if "is_active" in data:
        if role.name == "SuperAdmin" and not data["is_active"]:
            return jsonify({"error": "SuperAdmin role cannot be deactivated"}), 400
        role.is_active = bool(data["is_active"])
    role.updated_by = current_user.user_id

    try:
        if "permissions" in data:
            _upsert_role_permissions(role, data.get("permissions", []))
        db.session.commit()
        return jsonify({"message": "Role updated", "role": _role_to_dict(role, True)}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "An unexpected error occurred"}), 500


@bp.route("/api/rbac/me/permissions", methods=["GET"])
@token_required
def my_permissions(current_user):
    return jsonify({"permissions": get_user_permissions(current_user)}), 200
