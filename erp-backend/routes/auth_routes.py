# pyrefly: ignore [missing-import]
from flask import Blueprint, jsonify, request, current_app
from extensions import db
from extensions import limiter
from models import User, Branch, School, UserBranchAccess, UserSchoolAccess, PasswordResetOTP, Role
from datetime import date, datetime, timedelta
# pyrefly: ignore [missing-import]
import jwt
import secrets
import hashlib
from helpers import (
    token_required,
    hash_user_password,
    verify_user_password,
    send_otp_email,
    get_effective_role_name,
    get_user_permissions,
    has_permission,
    get_user_allowed_branches,
    get_user_allowed_schools,
)
 
bp = Blueprint('auth_routes', __name__)

MIN_PASSWORD_LENGTH = 8

VALID_ROLES = {'SuperAdmin', 'Admin', 'User'}


def _validate_password_strength(password):
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    return None


def _build_user_context(user):
    """Build the school + branch context dict for a user."""
    school_name = None
    school_logo = None
    school_theme = None
    school_id = getattr(user, 'default_school_id', None) or getattr(user, 'school_id', None)
    branch_name = None
    branch_id = getattr(user, 'default_branch_id', None) or getattr(user, 'branch_id', None)

    # Prefer resolving branch name/details from branch_id
    if branch_id:
        branch_obj = Branch.query.get(branch_id)
        if branch_obj:
            branch_id = branch_obj.id
            branch_name = branch_obj.branch_name
            # Resolve school from branch's school_id if not already set
            if not school_id and branch_obj.school_id:
                school_id = branch_obj.school_id

    if school_id:
        school_obj = School.query.get(school_id)
        if school_obj:
            school_id = school_obj.id
            school_name = school_obj.school_name
            school_logo = school_obj.logo_url
            school_theme = school_obj.theme_color

    return {
        "school_id": school_id,
        "school_name": school_name,
        "school_logo": school_logo,
        "school_theme": school_theme,
        "branch_id": branch_id,
        "branch_name": branch_name,
    }


def _role_payload(user):
    role_name = get_effective_role_name(user)
    return {
        "role_id": user.role_id,
        "role": role_name,
        "legacy_role": user.role,
        "role_name": role_name,
    }


def _resolve_role(role_id=None, role_name=None):
    if role_id:
        role_obj = Role.query.get(role_id)
        if not role_obj:
            return None, "Role not found"
        if not role_obj.is_active:
            return None, "Role is inactive"
        return role_obj, None

    if role_name:
        role_obj = Role.query.filter_by(name=role_name).first()
        if role_obj:
            if not role_obj.is_active:
                return None, "Role is inactive"
            return role_obj, None
        if role_name in VALID_ROLES:
            return None, None
        return None, "Invalid role"

    return None, None


def _can_manage_users(user, action="read"):
    return has_permission(user, "system.users.user-management", action)

@bp.route("/api/users/login", methods=["POST"])
@limiter.limit("10 per minute")
def login_user():
    try:
        data = request.json or {}
        username = data.get("username")
        password = data.get("password")

        user = User.query.filter_by(username=username).first()

        if not user or not verify_user_password(password, user.password):
            # Track failed attempts if user exists
            if user and hasattr(user, 'failed_login_count'):
                user.failed_login_count = (user.failed_login_count or 0) + 1
                db.session.commit()
            return jsonify({"error": "invalid credentials"}), 401

        if getattr(user, 'is_active', True) is False:
            return jsonify({"error": "Account is deactivated"}), 401

        # Upgrade legacy plaintext passwords in-place after a successful login.
        if user.password and not str(user.password).startswith(("pbkdf2:", "scrypt:")):
            user.password = hash_user_password(password)

        # Update login tracking fields
        if hasattr(user, 'last_login'):
            user.last_login = datetime.utcnow()
        if hasattr(user, 'failed_login_count'):
            user.failed_login_count = 0
        db.session.commit()

    except Exception as e:
        import traceback
        traceback.print_exc()

        return jsonify({
        "error": "Internal login error",
        "details": str(e),
        "type": type(e).__name__
    }), 500
    
    # Phase 4: Fetch Valid Branches
    valid_branches = []
    try:
        allowed = get_user_allowed_branches(user)
        if allowed['is_unlimited']:
            branches = Branch.query.filter_by(is_active=True).all()
        else:
            branches = Branch.query.filter(Branch.id.in_(allowed['ids']), Branch.is_active == True).all()
            
        for b in branches:
            valid_branches.append({
                "branch_id": b.id,
                "branch_code": b.branch_code,
                "branch_name": b.branch_name,
                "location_code": b.location_code,
                "school_id": b.school_id
            })
    except Exception as e:
        current_app.logger.warning("Error fetching branches for user %s: %s", username, e)

    # Fetch Valid Schools
    valid_schools = []
    try:
        allowed_s = get_user_allowed_schools(user)
        if allowed_s['is_unlimited']:
            schools = School.query.filter_by(is_active=True).all()
        else:
            schools = School.query.filter(School.id.in_(allowed_s['ids']), School.is_active == True).all()
            
        for s in schools:
            valid_schools.append({
                "school_id": s.id,
                "school_code": s.school_code,
                "school_name": s.school_name,
                "logo_url": s.logo_url
            })
    except Exception as e:
        current_app.logger.warning("Error fetching schools for user %s: %s", username, e)
    
    # Fetch current school/branch for this user (if set)
    current_school_id = getattr(user, 'school_id', None)
    current_branch_id = getattr(user, 'branch_id', None)

    # Build school/branch context
    ctx = _build_user_context(user)

    token_payload = {
        'user_id': user.user_id,
        'username': user.username,
        'role': get_effective_role_name(user),
        'branch': user.branch, 
        'location': user.location,
        'school_id': ctx["school_id"],
        'branch_id': ctx["branch_id"],
        'exp': datetime.utcnow() + timedelta(hours=24)
    }
    
    token = jwt.encode(token_payload, current_app.config['SECRET_KEY'], algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode('utf-8')
    
    return jsonify({
        "message": "login successful",
        "token": token,
        "is_first_login": bool(getattr(user, 'is_first_login', False)),
        "user": {
            "user_id": user.user_id,
            "username": user.username,
            **_role_payload(user),
            "branch": user.branch,
            "location": user.location,
            "permissions": get_user_permissions(user),
            "allowed_branches": valid_branches,
            "allowed_schools": valid_schools,
            # School + branch context
            "school_id": ctx["school_id"],
            "school_name": ctx["school_name"],
            "school_logo": ctx["school_logo"],
            "school_theme": ctx["school_theme"],
            "branch_id": ctx["branch_id"],
            "branch_name": ctx["branch_name"],
        }
    }), 200


@bp.route("/api/users/switch-context", methods=["POST"])
@token_required
def switch_context(current_user):
    data = request.json or {}
    
    if "school_id" not in data and "branch_id" not in data:
        return jsonify({"error": "school_id or branch_id required"}), 400
        
    try:
        if "school_id" in data:
            new_school_id = data["school_id"]
            if new_school_id is None:
                current_user.default_school_id = None
                current_user.default_branch_id = None  # Reset branch if school reset
            else:
                allowed_schools = get_user_allowed_schools(current_user)
                if not allowed_schools['is_unlimited'] and new_school_id not in allowed_schools['ids']:
                    return jsonify({"error": "Unauthorized school access"}), 403
                current_user.default_school_id = new_school_id

        if "branch_id" in data:
            new_branch_id = data["branch_id"]
            if new_branch_id is None:
                current_user.default_branch_id = None
            else:
                allowed_branches = get_user_allowed_branches(current_user)
                if not allowed_branches['is_unlimited'] and new_branch_id not in allowed_branches['ids']:
                    return jsonify({"error": "Unauthorized branch access"}), 403
                
                branch_obj = Branch.query.get(new_branch_id)
                if branch_obj:
                    current_user.default_branch_id = new_branch_id
                    # Auto-align school context if not explicitly set/reset
                    if ("school_id" not in data or data["school_id"] is None) and branch_obj.school_id:
                        current_user.default_school_id = branch_obj.school_id
                        
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.exception("Context switch database error")
        return jsonify({"error": str(e)}), 500
        
    # Re-build user context and token
    ctx = _build_user_context(current_user)
    
    # Fetch dynamic list of allowed branches & schools
    valid_branches = []
    try:
        allowed_b = get_user_allowed_branches(current_user)
        if allowed_b['is_unlimited']:
            branches = Branch.query.filter_by(is_active=True).all()
        else:
            branches = Branch.query.filter(Branch.id.in_(allowed_b['ids']), Branch.is_active == True).all()
        for b in branches:
            valid_branches.append({
                "branch_id": b.id,
                "branch_code": b.branch_code,
                "branch_name": b.branch_name,
                "location_code": b.location_code,
                "school_id": b.school_id
            })
    except Exception as e:
        current_app.logger.warning("Error fetching branches: %s", e)

    valid_schools = []
    try:
        allowed_s = get_user_allowed_schools(current_user)
        if allowed_s['is_unlimited']:
            schools = School.query.filter_by(is_active=True).all()
        else:
            schools = School.query.filter(School.id.in_(allowed_s['ids']), School.is_active == True).all()
        for s in schools:
            valid_schools.append({
                "school_id": s.id,
                "school_code": s.school_code,
                "school_name": s.school_name,
                "logo_url": s.logo_url
            })
    except Exception as e:
        current_app.logger.warning("Error fetching schools: %s", e)

    token_payload = {
        'user_id': current_user.user_id,
        'username': current_user.username,
        'role': get_effective_role_name(current_user),
        'branch': current_user.branch, 
        'location': current_user.location,
        'school_id': ctx["school_id"],
        'branch_id': ctx["branch_id"],
        'exp': datetime.utcnow() + timedelta(hours=24)
    }
    
    token = jwt.encode(token_payload, current_app.config['SECRET_KEY'], algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode('utf-8')
        
    return jsonify({
        "message": "Context switched successfully",
        "token": token,
        "user": {
            "user_id": current_user.user_id,
            "username": current_user.username,
            **_role_payload(current_user),
            "branch": current_user.branch,
            "location": current_user.location,
            "permissions": get_user_permissions(current_user),
            "allowed_branches": valid_branches,
            "allowed_schools": valid_schools,
            "school_id": ctx["school_id"],
            "school_name": ctx["school_name"],
            "school_logo": ctx["school_logo"],
            "school_theme": ctx["school_theme"],
            "branch_id": ctx["branch_id"],
            "branch_name": ctx["branch_name"],
        }
    }), 200


@bp.route("/api/verify-current-password", methods=["POST"])
@token_required
@limiter.limit("10 per minute")
def verify_current_password(current_user):
    data = request.json or {}
    password = data.get("password")
    
    if not password:
        return jsonify({"success": False, "message": "Password required"}), 400
        
    if verify_user_password(password, current_user.password):
        return jsonify({"success": True}), 200
    return jsonify({"success": False, "message": "Invalid password"}), 200


@bp.route("/api/debug-user/<string:username>", methods=["GET"])
@token_required
def debug_user(current_user, username):
    if not has_permission(current_user, "system.users.user-management", "read"):
        return jsonify({"error": "Unauthorized"}), 403
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({
        "user_id": user.user_id,
        "username": user.username,
        "role": user.role,
        "branch": user.branch if user.branch else "NULL_OR_EMPTY",
        "location": getattr(user, 'location', 'N/A')
    }), 200


# ──────────────────────────────────────────────────────────────
# USER CRUD  (SuperAdmin = all schools | Admin = own school)
# ──────────────────────────────────────────────────────────────

@bp.route("/api/users", methods=["GET"])
@token_required
def list_users(current_user):
    """List users. SuperAdmin sees all; Admin sees only their school."""
    query = User.query

    if not _can_manage_users(current_user, "read"):
        # Standard users can only see themselves
        query = query.filter_by(user_id=current_user.user_id)
    else:
        allowed_schools = get_user_allowed_schools(current_user)
        if not allowed_schools['is_unlimited']:
            # Non-SuperAdmin managers can only see users in their allowed schools
            if allowed_schools['ids']:
                query = query.filter(User.school_id.in_(allowed_schools['ids']))
            else:
                # Fallback: show only themselves if no school_id set
                query = query.filter_by(user_id=current_user.user_id)

    users = query.order_by(User.user_id.asc()).all()

    result = []
    for u in users:
        ctx = _build_user_context(u)
        access_records = UserBranchAccess.query.filter_by(user_id=u.user_id, is_active=True).all()
        branch_ids = [r.branch_id for r in access_records]
        school_access_records = UserSchoolAccess.query.filter_by(user_id=u.user_id, is_active=True).all()
        school_ids = [r.school_id for r in school_access_records]
        result.append({
            "user_id": u.user_id,
            "username": u.username,
            "useremail": u.useremail,
            **_role_payload(u),
            "is_active": getattr(u, 'is_active', True),
            "school_id": ctx["school_id"],
            "school_name": ctx["school_name"],
            "branch_id": ctx["branch_id"],
            "branch_name": ctx["branch_name"],
            "legacy_branch": u.branch,
            "branch_ids": branch_ids,
            "school_ids": school_ids,
        })

    return jsonify({"users": result}), 200


@bp.route("/api/users/add", methods=["POST"])
@token_required
def create_user(current_user):
    if not _can_manage_users(current_user, "write"):
        return jsonify({"error": "Unauthorized"}), 403

    try:
        data = request.json
        if not data:
            return jsonify({"error": "No input data provided"}), 400
            
        username = data.get("username")
        password = data.get("password")
        useremail = data.get("useremail")
        role = data.get("role", "User")
        role_id = data.get("role_id")
        location = data.get("location", "")
        new_branch_id = data.get("branch_id")          # NEW: FK-based
        new_school_id = data.get("school_id")          # NEW: FK-based
        # Legacy fields for backward compat
        branches = data.get("branches", [])
        legacy_branch = data.get("branch", "North")

        if not username or not password or not useremail:
            return jsonify({"error": "Username, Password, and Email are required"}), 400

        role_obj, role_error = _resolve_role(role_id=role_id, role_name=role)
        if role_error:
            return jsonify({"error": role_error}), 400
        role_name = role_obj.name if role_obj else role

        # Security Check: Creating SuperAdmin requires higher privileges
        if role_name == 'SuperAdmin' and not has_permission(current_user, "system.roles.role-permissions", "write"):
            return jsonify({"error": "Insufficient privileges to create SuperAdmin users"}), 403
            
        allowed_schools = get_user_allowed_schools(current_user)
        if not allowed_schools['is_unlimited']:
            if new_school_id and new_school_id not in (allowed_schools['ids'] or set()):
                return jsonify({"error": "Admins can only create users in their allowed schools"}), 403
            if not new_school_id and allowed_schools['ids']:
                new_school_id = next(iter(allowed_schools['ids']))

        password_error = _validate_password_strength(password)
        if password_error:
            return jsonify({"error": password_error}), 400

        if User.query.filter_by(username=username).first():
            return jsonify({"error": "Username already exists"}), 400
            
        if useremail and User.query.filter_by(useremail=useremail).first():
            return jsonify({"error": "Email address is already in use by another user"}), 400

        # Resolve legacy branch name
        final_branch_name = legacy_branch
        if legacy_branch and legacy_branch != 'All':
             b_obj = Branch.query.filter_by(branch_code=legacy_branch).first()
             if b_obj:
                 final_branch_name = b_obj.branch_name
             else:
                 b_obj_by_name = Branch.query.filter_by(branch_name=legacy_branch).first()
                 if b_obj_by_name:
                     final_branch_name = b_obj_by_name.branch_name

        # If new branch_id supplied, also auto-set school_id from branch
        if new_branch_id:
            branch_obj = Branch.query.get(new_branch_id)
            if branch_obj:
                final_branch_name = branch_obj.branch_name
                if not new_school_id and branch_obj.school_id:
                    new_school_id = branch_obj.school_id

        # Auto-assign context based on creator's context if not provided
        if not new_school_id and current_user.school_id:
            new_school_id = current_user.school_id
        if not new_branch_id and current_user.branch_id:
            new_branch_id = current_user.branch_id

        new_user = User(
            username=username,
            password=hash_user_password(password),
            useremail=useremail,
            role=role_name,
            role_id=role_obj.id if role_obj else None,
            location=location,
            branch=final_branch_name,
            school_id=new_school_id,
            branch_id=new_branch_id,
            default_school_id=new_school_id,
            default_branch_id=new_branch_id,
            is_active=True,
            created_by=current_user.user_id,
            updated_by=current_user.user_id
        )
        db.session.add(new_user)
        db.session.flush()

        # Handle School Access (UserSchoolAccess table)
        school_ids = data.get("school_ids", [])
        if school_ids:
            for sid in school_ids:
                db.session.add(UserSchoolAccess(
                    user_id=new_user.user_id,
                    school_id=sid,
                    start_date=date.today(),
                    is_active=True
                ))
            if not new_user.default_school_id:
                new_user.default_school_id = school_ids[0]
                new_user.school_id = school_ids[0]
        elif new_school_id:
            db.session.add(UserSchoolAccess(
                user_id=new_user.user_id,
                school_id=new_school_id,
                start_date=date.today(),
                is_active=True
            ))

        # Handle Branch Access (UserBranchAccess table)
        branch_ids = data.get("branch_ids", [])
        if branch_ids:
            for bid in branch_ids:
                br_obj = Branch.query.get(bid)
                sch_id = br_obj.school_id if br_obj else None
                access = UserBranchAccess(
                    user_id=new_user.user_id,
                    branch_id=bid,
                    school_id=sch_id,
                    start_date=date.today(),
                    is_active=True
                )
                db.session.add(access)

            # Set user primary branch and school context from first branch
            first_br = Branch.query.get(branch_ids[0])
            if first_br:
                new_user.branch_id = first_br.id
                new_user.default_branch_id = first_br.id
                new_user.branch = first_br.branch_name
                new_user.school_id = first_br.school_id
                new_user.default_school_id = first_br.school_id
        elif new_branch_id:
            br_obj = Branch.query.get(new_branch_id)
            sch_id = br_obj.school_id if br_obj else None
            access = UserBranchAccess(
                user_id=new_user.user_id,
                branch_id=new_branch_id,
                school_id=sch_id,
                start_date=date.today(),
                is_active=True
            )
            db.session.add(access)
        elif branches:
            if "All" in branches:
                all_branches = Branch.query.filter_by(is_active=True).all()
                for b in all_branches:
                    access = UserBranchAccess(
                        user_id=new_user.user_id,
                        branch_id=b.id,
                        school_id=b.school_id,
                        start_date=date.today(),
                        is_active=True
                    )
                    db.session.add(access)
            else:
                for b_code in branches:
                    branch_obj = Branch.query.filter_by(branch_code=b_code).first()
                    if not branch_obj:
                         branch_obj = Branch.query.filter_by(branch_name=b_code).first()
                    if branch_obj:
                        access = UserBranchAccess(
                            user_id=new_user.user_id,
                            branch_id=branch_obj.id,
                            school_id=branch_obj.school_id,
                            start_date=date.today(),
                            is_active=True
                        )
                        db.session.add(access)

        db.session.commit()
        return jsonify({"message": "User created successfully", "user_id": new_user.user_id}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/users/<int:user_id>", methods=["PUT"])
@token_required
def update_user(current_user, user_id):
    """Update user role, branch, school assignment."""
    if not _can_manage_users(current_user, "write"):
        return jsonify({"error": "Unauthorized"}), 403

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    allowed_schools = get_user_allowed_schools(current_user)
    if not allowed_schools['is_unlimited']:
        if user.school_id not in (allowed_schools['ids'] or set()):
            return jsonify({"error": "Unauthorized: user belongs to a different school"}), 403

    data = request.json or {}

    if 'role_id' in data or 'role' in data:
        new_role_id = data.get('role_id')
        new_role_name = data.get('role')
        
        # Skip role update if both are explicitly null/empty
        if new_role_id is None and not new_role_name:
            pass  # Preserve existing role
        else:
            role_obj, role_error = _resolve_role(role_id=new_role_id, role_name=new_role_name)
            if role_error:
                return jsonify({"error": role_error}), 400
            new_role = role_obj.name if role_obj else new_role_name
            if new_role == 'SuperAdmin' and not has_permission(current_user, "system.roles.role-permissions", "write"):
                return jsonify({"error": "Insufficient privileges to assign SuperAdmin role"}), 403
            user.role = new_role
            user.role_id = role_obj.id if role_obj else None

    if 'school_ids' in data and allowed_schools['is_unlimited']:
        school_ids = data['school_ids'] or []
        UserSchoolAccess.query.filter_by(user_id=user.user_id).delete()
        for sid in school_ids:
            db.session.add(UserSchoolAccess(
                user_id=user.user_id,
                school_id=sid,
                start_date=date.today(),
                is_active=True
            ))
        if school_ids and user.default_school_id not in school_ids:
            user.default_school_id = school_ids[0]
            user.school_id = school_ids[0]

    if 'branch_ids' in data:
        branch_ids = data['branch_ids'] or []
        # Clear existing branch access
        UserBranchAccess.query.filter_by(user_id=user.user_id).delete()

        if branch_ids:
            for bid in branch_ids:
                br_obj = Branch.query.get(bid)
                sch_id = br_obj.school_id if br_obj else None
                db.session.add(UserBranchAccess(
                    user_id=user.user_id,
                    branch_id=bid,
                    school_id=sch_id,
                    start_date=date.today(),
                    is_active=True
                ))

            # Set default branch to first assigned branch
            first_br = Branch.query.get(branch_ids[0])
            if first_br:
                user.default_branch_id = first_br.id
                user.branch_id = first_br.id
                user.branch = first_br.branch_name
                if first_br.school_id:
                    user.default_school_id = first_br.school_id
                    user.school_id = first_br.school_id
        else:
            user.default_branch_id = None
            user.branch_id = None
            user.branch = None

    elif 'branch_id' in data:
        new_branch_id = data['branch_id']
        if new_branch_id:
            branch_obj = Branch.query.get(new_branch_id)
            if not branch_obj:
                return jsonify({"error": "Branch not found"}), 404
            if not allowed_schools['is_unlimited'] and branch_obj.school_id not in (allowed_schools['ids'] or set()):
                return jsonify({"error": "Admins can only assign branches from their allowed schools"}), 403
            user.default_branch_id = new_branch_id
            user.branch_id = new_branch_id
            user.branch = branch_obj.branch_name
            if branch_obj.school_id:
                user.default_school_id = branch_obj.school_id
                user.school_id = branch_obj.school_id

            # Upsert UserBranchAccess
            existing = UserBranchAccess.query.filter_by(
                user_id=user.user_id, branch_id=new_branch_id
            ).first()
            if not existing:
                db.session.add(UserBranchAccess(
                    user_id=user.user_id,
                    branch_id=new_branch_id,
                    school_id=branch_obj.school_id,
                    start_date=date.today(),
                    is_active=True
                ))
        else:
            user.default_branch_id = None
            user.branch_id = None
            user.branch = None

    if 'school_id' in data and allowed_schools['is_unlimited']:
        user.default_school_id = data['school_id']
        user.school_id = data['school_id']
        if data['school_id']:
            existing = UserSchoolAccess.query.filter_by(user_id=user.user_id, school_id=data['school_id']).first()
            if not existing:
                db.session.add(UserSchoolAccess(
                    user_id=user.user_id,
                    school_id=data['school_id'],
                    start_date=date.today(),
                    is_active=True
                ))

    if 'useremail' in data:
        new_email = data['useremail']
        existing = User.query.filter(
            User.useremail == new_email, User.user_id != user_id
        ).first()
        if existing:
            return jsonify({"error": "Email already in use"}), 400
        user.useremail = new_email

    if 'is_active' in data:
        user.is_active = bool(data['is_active'])

    try:
        db.session.commit()
        return jsonify({"message": "User updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/users/<int:user_id>", methods=["DELETE"])
@token_required
def delete_user(current_user, user_id):
    """Soft-delete (deactivate) a user."""
    if not _can_manage_users(current_user, "delete"):
        return jsonify({"error": "Unauthorized"}), 403

    if user_id == current_user.user_id:
        return jsonify({"error": "Cannot delete your own account"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    allowed_schools = get_user_allowed_schools(current_user)
    if not allowed_schools['is_unlimited']:
        if user.school_id not in (allowed_schools['ids'] or set()):
            return jsonify({"error": "Unauthorized"}), 403

    user.is_active = False
    try:
        db.session.commit()
        return jsonify({"message": "User deactivated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/setup/migrate-users", methods=["POST"])
@token_required
def migrate_users_to_new_system(current_user):
    if not has_permission(current_user, "system.franchise.franchise-management", "write"):
        return jsonify({"error": "Unauthorized"}), 403
    try:
        users = User.query.all()
        count = 0
        for u in users:
            if u.branch:
                if u.branch in ["All", "AllBranches"]:
                     all_branches = Branch.query.filter_by(is_active=True).all()
                     for b in all_branches:
                         if not UserBranchAccess.query.filter_by(user_id=u.user_id, branch_id=b.id).first():
                             db.session.add(UserBranchAccess(user_id=u.user_id, branch_id=b.id, start_date=date.today()))
                             count += 1
                else:
                    b = Branch.query.filter_by(branch_code=u.branch).first()
                    if b:
                        if not UserBranchAccess.query.filter_by(user_id=u.user_id, branch_id=b.id).first():
                            db.session.add(UserBranchAccess(user_id=u.user_id, branch_id=b.id, start_date=date.today()))
                            count += 1
        
        db.session.commit()
        return jsonify({"message": f"Migrated {count} access records"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/users/forgot-password", methods=["POST"])
@limiter.limit("3 per minute")
def forgot_password():
    data = request.json or {}
    email = data.get("email")
    if not email:
        return jsonify({"error": "Email is required"}), 400
        
    user = User.query.filter_by(useremail=email).first()
    if not user:
        return jsonify({"message": "If an account with that email exists, an OTP has been sent."}), 200
        
    PasswordResetOTP.query.filter_by(user_id=user.user_id, used=False).update({"used": True})
        
    otp = ''.join(secrets.choice('0123456789') for _ in range(6))
    otp_hash = hashlib.sha256(otp.encode()).hexdigest()
    expires_at = datetime.utcnow() + timedelta(minutes=10)
    
    reset_otp = PasswordResetOTP(
        user_id=user.user_id,
        otp_hash=otp_hash,
        expires_at=expires_at,
        used=False
    )
    db.session.add(reset_otp)
    db.session.commit()
    
    send_otp_email(email, otp)
    
    return jsonify({"message": "If an account with that email exists, an OTP has been sent."}), 200


@bp.route("/api/users/verify-otp", methods=["POST"])
@limiter.limit("5 per minute")
def verify_otp():
    data = request.json or {}
    email = data.get("email")
    otp = data.get("otp")
    
    if not email or not otp:
        return jsonify({"error": "Email and OTP are required"}), 400
        
    user = User.query.filter_by(useremail=email).first()
    if not user:
        return jsonify({"error": "Invalid request"}), 400
        
    otp_record = PasswordResetOTP.query.filter_by(
        user_id=user.user_id,
        used=False
    ).order_by(PasswordResetOTP.id.desc()).first()
    
    if not otp_record:
        return jsonify({"error": "Invalid OTP"}), 400
        
    if (otp_record.attempts or 0) >= 5:
        return jsonify({"error": "Maximum OTP attempts exceeded. Please request a new OTP."}), 400
    
    submitted_hash = hashlib.sha256(otp.encode()).hexdigest()
    if not secrets.compare_digest(otp_record.otp_hash, submitted_hash):
        otp_record.attempts = (otp_record.attempts or 0) + 1
        db.session.commit()
        return jsonify({"error": "Invalid OTP"}), 400
        
    if otp_record.expires_at < datetime.utcnow():
        return jsonify({"error": "OTP has expired"}), 400
        
    return jsonify({"message": "OTP is valid"}), 200


@bp.route("/api/users/reset-password", methods=["POST"])
@limiter.limit("5 per minute")
def reset_password():
    data = request.json or {}
    email = data.get("email")
    otp = data.get("otp")
    new_password = data.get("new_password")
    
    if not email or not otp or not new_password:
        return jsonify({"error": "Email, OTP, and new password are required"}), 400

    password_error = _validate_password_strength(new_password)
    if password_error:
        return jsonify({"error": password_error}), 400
        
    user = User.query.filter_by(useremail=email).first()
    if not user:
        return jsonify({"error": "Invalid request"}), 400
        
    otp_record = PasswordResetOTP.query.filter_by(
        user_id=user.user_id,
        used=False
    ).order_by(PasswordResetOTP.id.desc()).first()
    
    if not otp_record:
        return jsonify({"error": "Invalid or expired OTP"}), 400
        
    if (otp_record.attempts or 0) >= 5:
        return jsonify({"error": "Maximum OTP attempts exceeded. Please request a new OTP."}), 400
    
    submitted_hash = hashlib.sha256(otp.encode()).hexdigest()
    if not secrets.compare_digest(otp_record.otp_hash, submitted_hash):
        otp_record.attempts = (otp_record.attempts or 0) + 1
        db.session.commit()
        return jsonify({"error": "Invalid OTP"}), 400
        
    if otp_record.expires_at < datetime.utcnow():
        return jsonify({"error": "Invalid or expired OTP"}), 400
        
    otp_record.used = True
    user.password = hash_user_password(new_password)
    db.session.commit()
    
    return jsonify({"message": "Password has been successfully reset."}), 200


@bp.route("/api/users/profile", methods=["GET"])
@token_required
def get_user_profile(current_user):
    try:
        ctx = _build_user_context(current_user)
        return jsonify({
            "user": {
                "user_id": current_user.user_id,
                "username": current_user.username,
                "useremail": getattr(current_user, 'useremail', ''),
                **_role_payload(current_user),
                "branch": current_user.branch,
                "location": getattr(current_user, 'location', ''),
                "permissions": get_user_permissions(current_user),
                "school_id": ctx["school_id"],
                "school_name": ctx["school_name"],
                "school_logo": ctx["school_logo"],
                "school_theme": ctx["school_theme"],
                "branch_id": ctx["branch_id"],
                "branch_name": ctx["branch_name"],
            }
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/users/update-username", methods=["PUT"])
@token_required
def update_username(current_user):
    try:
        data = request.json or {}
        new_username = data.get("username")
        
        if not new_username:
            return jsonify({"error": "New username is required"}), 400
            
        new_username = new_username.strip()
        
        if new_username == current_user.username:
            return jsonify({"error": "Username is the same as the current one"}), 400
            
        existing_user = User.query.filter_by(username=new_username).first()
        if existing_user:
            return jsonify({"error": "Username already taken"}), 400
            
        current_user.username = new_username
        db.session.commit()
        
        return jsonify({"message": "Username updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/users/update-password", methods=["PUT"])
@token_required
def update_password(current_user):
    try:
        data = request.json or {}
        current_password = data.get("currentPassword")
        new_password = data.get("newPassword")
        
        if not new_password:
            return jsonify({"error": "New password is required"}), 400

        password_error = _validate_password_strength(new_password)
        if password_error:
            return jsonify({"error": password_error}), 400

        if not current_password:
            return jsonify({"error": "Current password is required"}), 400

        if not verify_user_password(current_password, current_user.password):
            return jsonify({"error": "Current password is incorrect"}), 400
            
        current_user.password = hash_user_password(new_password)
        db.session.commit()
        
        return jsonify({"message": "Password updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
