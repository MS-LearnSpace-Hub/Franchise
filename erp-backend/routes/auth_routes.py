# pyrefly: ignore [missing-import]
from flask import Blueprint, jsonify, request, current_app
from extensions import db
from extensions import limiter
from models import User, Branch, School, UserBranchAccess, PasswordResetOTP, Role
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
    school_id = None
    branch_name = None
    branch_id = None

    # Prefer the new FK-based approach
    if user.branch_id:
        branch_obj = Branch.query.get(user.branch_id)
        if branch_obj:
            branch_id = branch_obj.id
            branch_name = branch_obj.branch_name
            # Resolve school from branch's school_id
            if branch_obj.school_id:
                school_obj = School.query.get(branch_obj.school_id)
                if school_obj:
                    school_id = school_obj.id
                    school_name = school_obj.school_name
                    school_logo = school_obj.logo_url
                    school_theme = school_obj.theme_color

    # Fall back to user.school_id if branch didn't give us school info
    if not school_id and user.school_id:
        school_obj = School.query.get(user.school_id)
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
    effective_role = get_effective_role_name(user)
    return effective_role in ("SuperAdmin", "Admin") or has_permission(user, "system.users.management", action)

@bp.route("/api/users/login", methods=["POST"])
@limiter.limit("10 per minute")
def login_user():
    try:
        data = request.json or {}
        username = data.get("username")
        password = data.get("password")
        
        user = User.query.filter_by(username=username).first()
        
        if not user or not verify_user_password(password, user.password):
            return jsonify({"error": "invalid credentials"}), 401

        if getattr(user, 'is_active', True) is False:
            return jsonify({"error": "Account is deactivated"}), 401

        # Upgrade legacy plaintext passwords in-place after a successful login.
        if user.password and not str(user.password).startswith(("pbkdf2:", "scrypt:")):
            user.password = hash_user_password(password)
            db.session.commit()
    except Exception as e:
        current_app.logger.exception("Login error")
        return jsonify({"error": "Internal login error"}), 500
    
    # Phase 4: Fetch Valid Branches
    valid_branches = []
    try:
        today = date.today()
        access_records = UserBranchAccess.query.filter(
            UserBranchAccess.user_id == user.user_id,
            UserBranchAccess.is_active == True,
            UserBranchAccess.start_date <= today,
            (UserBranchAccess.end_date.is_(None)) | (UserBranchAccess.end_date >= today)
        ).join(Branch).all()
        
        for record in access_records:
            valid_branches.append({
                "branch_id": record.branch_id,
                "branch_code": record.branch.branch_code,
                "branch_name": record.branch.branch_name,
                "location_code": record.branch.location_code
            })
    except Exception as e:
        current_app.logger.warning("Error fetching branches for user %s: %s", username, e)

    # Build school/branch context
    ctx = _build_user_context(user)

    token_payload = {
        'user_id': user.user_id,
        'username': user.username,
        'role': get_effective_role_name(user),
        'branch': user.branch, 
        'location': user.location,
        'exp': datetime.utcnow() + timedelta(hours=24)
    }
    
    token = jwt.encode(token_payload, current_app.config['SECRET_KEY'], algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode('utf-8')
    
    return jsonify({
        "message": "login successful",
        "token": token,
        "user": {
            "user_id": user.user_id,
            "username": user.username,
            **_role_payload(user),
            "branch": user.branch,
            "location": user.location,
            "permissions": get_user_permissions(user),
            "allowed_branches": valid_branches,
            # New school + branch context
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
    if current_user.role not in ('Admin', 'SuperAdmin'):
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
    if not _can_manage_users(current_user, "read"):
        return jsonify({"error": "Unauthorized"}), 403

    query = User.query

    if current_user.role == 'Admin':
        # Admin can only see users in their own school
        if current_user.school_id:
            query = query.filter_by(school_id=current_user.school_id)
        else:
            # Fallback: show only themselves if no school_id set
            query = query.filter_by(user_id=current_user.user_id)

    users = query.order_by(User.user_id.asc()).all()

    result = []
    for u in users:
        ctx = _build_user_context(u)
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

        # Admins can only create non-SuperAdmin users in their own school
        if current_user.role == 'Admin':
            if role_name == 'SuperAdmin':
                return jsonify({"error": "Admins cannot create SuperAdmin users"}), 403
            if new_school_id and new_school_id != current_user.school_id:
                return jsonify({"error": "Admins can only create users in their own school"}), 403
            new_school_id = current_user.school_id

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
            is_active=True,
            created_by=current_user.user_id,
            updated_by=current_user.user_id
        )
        db.session.add(new_user)
        db.session.flush()

        # Handle Branch Access (UserBranchAccess table)
        if new_branch_id:
            access = UserBranchAccess(
                user_id=new_user.user_id,
                branch_id=new_branch_id,
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

    # Admins can only manage users within their own school
    if current_user.role == 'Admin':
        # Admins must have a school_id to manage other users
        if not current_user.school_id:
            if user.user_id != current_user.user_id:
                return jsonify({"error": "Unauthorized: Admin has no school assignment"}), 403
        if user.school_id != current_user.school_id:
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
            if current_user.role == 'Admin' and new_role == 'SuperAdmin':
                return jsonify({"error": "Admins cannot assign SuperAdmin role"}), 403
            user.role = new_role
            user.role_id = role_obj.id if role_obj else None

    if 'branch_id' in data:
        new_branch_id = data['branch_id']
        if new_branch_id:
            branch_obj = Branch.query.get(new_branch_id)
            if not branch_obj:
                return jsonify({"error": "Branch not found"}), 404
            if current_user.role == 'Admin' and branch_obj.school_id != current_user.school_id:
                return jsonify({"error": "Admins can only assign branches from their own school"}), 403
            user.branch_id = new_branch_id
            user.branch = branch_obj.branch_name
            if branch_obj.school_id:
                user.school_id = branch_obj.school_id

            # Upsert UserBranchAccess
            existing = UserBranchAccess.query.filter_by(
                user_id=user.user_id, branch_id=new_branch_id
            ).first()
            if not existing:
                db.session.add(UserBranchAccess(
                    user_id=user.user_id,
                    branch_id=new_branch_id,
                    start_date=date.today(),
                    is_active=True
                ))
        else:
            user.branch_id = None

    if 'school_id' in data and current_user.role == 'SuperAdmin':
        user.school_id = data['school_id']

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

    if current_user.role == 'Admin':
        if not current_user.school_id:
            return jsonify({"error": "Unauthorized: Admin has no school assignment"}), 403
        if user.school_id != current_user.school_id:
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
    if current_user.role not in ('Admin', 'SuperAdmin'):
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
