import os
# pyrefly: ignore [missing-import]
from flask import Blueprint, jsonify, request, current_app, send_from_directory, send_file
from extensions import db
from models import Branch, School, OrgMaster, User, UserBranchAccess, ClassMaster, ClassSection
from services.sequence_service import SequenceService
from helpers import token_required, require_academic_year, get_branch_query_filter, get_user_allowed_branches, has_permission, validate_cross_branch_access
from datetime import date, datetime
from sqlalchemy import or_ 
# pyrefly: ignore [missing-import]
from werkzeug.utils import secure_filename

bp = Blueprint('org_routes', __name__)

ALLOWED_LOGO_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}

def get_logo_folder():
    return os.path.abspath(os.path.join(current_app.root_path, 'static', 'logos'))


def _allowed_logo(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_LOGO_EXTENSIONS


# ─────────────────────────────────────────────────────────────────────────────
# SCHOOL CRUD  (SuperAdmin only for create/update/delete)
# ─────────────────────────────────────────────────────────────────────────────

@bp.route("/api/schools", methods=["GET"])
@token_required
def get_all_schools(current_user):
    """List all schools with their branches. Filters dynamically based on allowed branches."""
    try:
        allowed = get_user_allowed_branches(current_user)

        if allowed['is_unlimited']:
            schools = School.query.filter_by(is_active=True).order_by(School.id).all()
        else:
            allowed_branch_ids = allowed['ids'] or set()
            if not allowed_branch_ids:
                schools = []
            else:
                schools = School.query.join(Branch).filter(
                    School.is_active == True,
                    Branch.id.in_(list(allowed_branch_ids)),
                    Branch.is_active == True
                ).distinct().order_by(School.id).all()

        result = []
        for s in schools:
            branches_query = Branch.query.filter_by(school_id=s.id, is_active=True)
            if not allowed['is_unlimited']:
                allowed_branch_ids = allowed['ids'] or set()
                branches_query = branches_query.filter(Branch.id.in_(list(allowed_branch_ids)))
            branches = branches_query.all()

            if branches or allowed['is_unlimited']:
                result.append({
                    "id": s.id,
                    "school_name": s.school_name,
                    "school_code": s.school_code,
                    "logo_url": s.logo_url,
                    "address": s.address,
                    "phone": s.phone,
                    "email": s.email,
                    "theme_color": s.theme_color,
                    "domain_name": s.domain_name,
                    "subscription_plan": s.subscription_plan,
                    "is_active": s.is_active,
                    "branch_count": len(branches),
                    "branches": [
                        {"id": b.id, "branch_name": b.branch_name, "branch_code": b.branch_code}
                        for b in branches
                    ]
                })

        return jsonify({"schools": result}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/schools", methods=["POST"])
@token_required
def create_school(current_user):
    """Create a new school."""
    if not has_permission(current_user, "setup.school-setup.setup-school", "write"):
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json or {}
    school_name = (data.get("school_name") or "").strip()
    if not school_name:
        return jsonify({"error": "school_name is required"}), 400

    # Optional uniqueness check on school_code
    school_code = (data.get("school_code") or "").strip() or None
    if school_code and School.query.filter_by(school_code=school_code).first():
        return jsonify({"error": "school_code already exists"}), 400

    school = School(
        school_name=school_name,
        school_code=school_code,
        address=data.get("address"),
        phone=data.get("phone"),
        email=data.get("email"),
        theme_color=data.get("theme_color"),
        domain_name=data.get("domain_name"),
        subscription_plan=data.get("subscription_plan"),
        is_active=True,
        created_by=current_user.user_id,
        updated_by=current_user.user_id,
    )
    try:
        db.session.add(school)
        db.session.commit()
        return jsonify({"message": "School created", "school_id": school.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/schools/<int:school_id>", methods=["PUT"])
@token_required
def update_school(current_user, school_id):
    """Update school details."""
    if not has_permission(current_user, "setup.school-setup.setup-school", "write"):
        return jsonify({"error": "Unauthorized"}), 403

    school = School.query.get(school_id)
    if not school or not school.is_active:
        return jsonify({"error": "School not found"}), 404

    # School Scope Validation
    is_valid, error = validate_cross_branch_access(current_user, target_school_ids=[school.id])
    if not is_valid:
        return jsonify({"error": error}), 403

    data = request.json or {}
    for field in ('school_name', 'school_code', 'address', 'phone', 'email',
                  'theme_color', 'domain_name', 'subscription_plan'):
        if field in data:
            setattr(school, field, data[field])
    school.updated_by = current_user.user_id
    

    try:
        db.session.commit()
        return jsonify({"message": "School updated"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/schools/<int:school_id>", methods=["DELETE"])
@token_required
def delete_school(current_user, school_id):
    """Soft-delete a school."""
    if not has_permission(current_user, "setup.school-setup.setup-school", "delete"):
        return jsonify({"error": "Unauthorized"}), 403

    school = School.query.get(school_id)
    if not school:
        return jsonify({"error": "School not found"}), 404

    school.is_active = False
    try:
        db.session.commit()
        return jsonify({"message": "School deactivated"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/schools/<int:school_id>/logo", methods=["POST"])
@token_required
def upload_school_logo(current_user, school_id):
    """Upload a logo image for a school."""
    if not has_permission(current_user, "setup.school-setup.setup-school", "write"):
        return jsonify({"error": "Unauthorized"}), 403

    school = School.query.get(school_id)
    if not school or not school.is_active:
        return jsonify({"error": "School not found"}), 404

    # School Scope Validation
    is_valid, error = validate_cross_branch_access(current_user, target_school_ids=[school.id])
    if not is_valid:
        return jsonify({"error": error}), 403

    if 'logo' not in request.files:
        return jsonify({"error": "No file provided. Use field name 'logo'"}), 400

    file = request.files['logo']
    if file.filename == '':
        return jsonify({"error": "Empty filename"}), 400

    if not _allowed_logo(file.filename):
        return jsonify({"error": f"File type not allowed. Use: {', '.join(ALLOWED_LOGO_EXTENSIONS)}"}), 400

    import traceback
    
    try:
        filename = secure_filename(file.filename)
        # Add timestamp to filename to prevent caching issues
        import time
        name, ext = os.path.splitext(filename)
        filename = f"{name}_{int(time.time())}{ext}"
        
        logos_folder = os.path.abspath(os.path.join(current_app.root_path, 'static', 'logos'))
        os.makedirs(logos_folder, exist_ok=True)
        
        file_path = os.path.join(logos_folder, filename)
        file.save(file_path)
        
        school.logo_url = f"/static/logos/{filename}"
        school.updated_by = current_user.user_id

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Failed to save logo locally: {str(e)}"}), 500

    try:
        db.session.commit()

        return jsonify({
            "message": "Logo uploaded successfully",
            "logo_url": school.logo_url
        }), 200

    except Exception as e:
        db.session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
# ─────────────────────────────────────────────────────────────────────────────
# SERVE SCHOOL LOGOS
# ─────────────────────────────────────────────────────────────────────────────

@bp.route("/schools/<int:school_id>/logo", methods=["GET"])
def get_school_logo(school_id):
    school = School.query.get(school_id)
    if not school or not school.logo_url:
        return jsonify({"message": "Logo not found"}), 404

    env = os.environ.get("FLASK_ENV", "development").lower()

    if env == "production":
        from services.storage_service import get_file_stream

        # In production, logo_url stores the object key
        object_key = school.logo_url
        stream = get_file_stream(object_key)

        if not stream:
            return jsonify({"message": "Logo not found"}), 404

        ext = object_key.rsplit(".", 1)[-1].lower()

        mimetype = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "webp": "image/webp"
        }.get(ext, "application/octet-stream")

        return send_file(stream, mimetype=mimetype)

    # In development, it's stored locally
    filename = school.logo_url.split("/")[-1]
    return send_from_directory(get_logo_folder(), filename)


# ─────────────────────────────────────────────────────────────────────────────
<<<<<<< HEAD
# SERVE SCHOOL LOGOS
# ─────────────────────────────────────────────────────────────────────────────

@bp.route("/schools/<int:school_id>/logo", methods=["GET"])
def get_school_logo(school_id):
    school = School.query.get(school_id)
    if not school or not school.logo_url:
        return jsonify({"message": "Logo not found"}), 404

    env = os.environ.get("FLASK_ENV", "development").lower()

    if env == "production":
        from services.storage_service import get_file_stream

        # In production, logo_url stores the object key
        object_key = school.logo_url
        stream = get_file_stream(object_key)

        if not stream:
            return jsonify({"message": "Logo not found"}), 404

        ext = object_key.rsplit(".", 1)[-1].lower()

        mimetype = {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "gif": "image/gif",
            "webp": "image/webp"
        }.get(ext, "application/octet-stream")

        return send_file(stream, mimetype=mimetype)

    # In development, it's stored locally
    filename = school.logo_url.split("/")[-1]
    return send_from_directory(get_logo_folder(), filename)


# ─────────────────────────────────────────────────────────────────────────────
=======
>>>>>>> develop
# BRANCH CRUD
# ─────────────────────────────────────────────────────────────────────────────

@bp.route("/api/branches", methods=["GET"])
@token_required
def get_all_branches(current_user):
    try:
        query = Branch.query.filter_by(is_active=True)

        allowed = get_user_allowed_branches(current_user)
        if not allowed['is_unlimited']:
            query = query.filter(Branch.id.in_(allowed['ids']))

        branches = query.all()
      
        locations = OrgMaster.query.filter_by(master_type='LOCATION').all()
        loc_map = {loc.code: loc.display_name for loc in locations}

        return jsonify({
            "branches": [{
                "id": b.id,
                "branch_code": b.branch_code,
                "branch_name": b.branch_name,
                "location_code": b.location_code,
                "location_name": loc_map.get(b.location_code, b.location_code) or "Unknown Location",
                "school_id": b.school_id,
                "school_name": b.school.school_name if b.school else None,
                "school_logo": b.school.logo_url if b.school else None,
            } for b in branches]
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/branches", methods=["POST"])
@token_required
def create_branch(current_user):
    """Create a branch and tie it to a school."""
    if not has_permission(current_user, "setup.school-setup.setup-school", "write"):
        return jsonify({"error": "Unauthorized"}), 403

    data = request.json or {}
    branch_code = (data.get("branch_code") or "").strip()
    branch_name = (data.get("branch_name") or "").strip()
    school_id = data.get("school_id")
    location_code = data.get("location_code", "")

    if not branch_code or not branch_name:
        return jsonify({"error": "branch_code and branch_name are required"}), 400

    if not school_id:
        # Fallback to current user's school if creating for themselves
        from helpers import resolve_user_scope
        scope = resolve_user_scope(current_user)
        school_id = scope['school_id']
        
        if not school_id:
             return jsonify({"error": "School ID is required to create a branch"}), 400

    # Ensure user has access to create branches under this school_id
    is_valid, error = validate_cross_branch_access(current_user, target_school_ids=[school_id])
    if not is_valid:
        return jsonify({"error": error}), 403

    if school_id:
        school = School.query.get(school_id)
        if not school or not school.is_active:
            return jsonify({"error": "School not found"}), 404

    if Branch.query.filter_by(branch_code=branch_code).first():
        return jsonify({"error": "branch_code already exists"}), 400

    branch = Branch(
        branch_code=branch_code,
        branch_name=branch_name,
        location_code=location_code,
        school_id=school_id,
        is_active=True,
        created_by=current_user.user_id,
        updated_by=current_user.user_id,
    )
    try:
        # Create branch and also initialize enrollment sequences for existing academic years
        db.session.add(branch)
        db.session.flush()  # ensure branch.id is available for sequence creation

        # For every active academic year, ensure an enrollment sequence exists for this branch
        active_years = OrgMaster.query.filter_by(master_type='ACADEMIC_YEAR', is_active=True).all()
        for ay in active_years:
            try:
                SequenceService.get_or_create_sequence(branch.id, ay.id, user_id=current_user.user_id)
            except Exception:
                # swallow per-year errors to avoid blocking branch creation; they'll be visible in DB if any
                pass

        db.session.commit()
        return jsonify({"message": "Branch created", "branch_id": branch.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/branches/<int:branch_id>", methods=["PUT"])
@token_required
def update_branch(current_user, branch_id):
    if not has_permission(current_user, "setup.school-setup.setup-school", "write"):
        return jsonify({"error": "Unauthorized"}), 403

    branch = Branch.query.get(branch_id)
    if not branch or not branch.is_active:
        return jsonify({"error": "Branch not found"}), 404

    # Validate they have access to the branch's school
    is_valid, error = validate_cross_branch_access(current_user, target_school_ids=[branch.school_id])
    if not is_valid:
        return jsonify({"error": error}), 403

    data = request.json or {}
    for field in ('branch_name', 'branch_code', 'location_code'):
        if field in data:
            setattr(branch, field, data[field])

    if 'school_id' in data:
        # User wants to reassign branch to another school. Verify access to NEW school too.
        is_valid, error = validate_cross_branch_access(current_user, target_school_ids=[data['school_id']])
        if not is_valid:
            return jsonify({"error": f"Cannot reassign to unauthorized school: {error}"}), 403
        branch.school_id = data['school_id']
    branch.updated_by = current_user.user_id
    branch.updated_at = datetime.now()

    try:
        db.session.commit()
        return jsonify({"message": "Branch updated"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/branches/<int:branch_id>", methods=["DELETE"])
@token_required
def delete_branch(current_user, branch_id):
    if not has_permission(current_user, "setup.school-setup.setup-school", "delete"):
        return jsonify({"error": "Unauthorized"}), 403

    branch = Branch.query.get(branch_id)
    if not branch:
        return jsonify({"error": "Branch not found"}), 404

    is_valid, error = validate_cross_branch_access(current_user, target_school_ids=[branch.school_id])
    if not is_valid:
        return jsonify({"error": error}), 403

    branch.is_active = False
    try:
        db.session.commit()
        return jsonify({"message": "Branch deactivated"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# ORG MASTER (Locations & Academic Years)
# ─────────────────────────────────────────────────────────────────────────────

@bp.route("/api/org/locations", methods=["GET"])
def get_all_locations():
    try:
        locations = OrgMaster.query.filter_by(master_type='LOCATION', is_active=True).all()
        return jsonify({
            "locations": [{"code": loc.code, "name": loc.display_name} for loc in locations]
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/org/locations", methods=["POST"])
@token_required
def create_location(current_user):
    if not has_permission(current_user, "system.franchise.franchise-management", "write"):
        return jsonify({"error": "Unauthorized"}), 403
    
    data = request.json or {}
    name = data.get("name")
    code = data.get("code")

    if not name or not code:
        return jsonify({"error": "Name and code are required"}), 400
    
    # Check if exists
    exists = OrgMaster.query.filter_by(master_type='LOCATION', code=code).first()
    if exists:
        return jsonify({"error": "Location code already exists"}), 400

    new_loc = OrgMaster(
        master_type='LOCATION',
        code=code.upper(),
        display_name=name,
        is_active=True
    )
    try:
        db.session.add(new_loc)
        db.session.commit()
        return jsonify({"message": "Location created","code":code.upper()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/org/academic-years", methods=["GET"])
def get_all_academic_years():
    try:
        years = OrgMaster.query.filter_by(master_type='ACADEMIC_YEAR', is_active=True).all()
        return jsonify({
            "academic_years": [{"id": y.id, "code": y.code, "name": y.display_name} for y in years]
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@bp.route("/api/setup/seed-branches", methods=["POST"])
@token_required
def seed_branches(current_user):
    if not has_permission(current_user, "system.franchise.franchise-management", "write"):
        return jsonify({"error":"Unauthorized"}), 403
    
    locations = ["Hyderabad", "Mumbai", "Bangalore", "Delhi", "Chennai"]
    seeded_info = []
    
    for loc in locations:
        code = loc[:3].upper()
        exists = OrgMaster.query.filter_by(master_type='LOCATION', code=code).first()
        if not exists:
            db.session.add(OrgMaster(master_type='LOCATION', code=code, display_name=loc))
            seeded_info.append(f"Added Location: {loc}")
            
    branches_data = [
        {"code": "HYD01", "name": "Main Branch", "loc": "HYD"},
        {"code": "MUM01", "name": "Mumbai Branch", "loc": "MUM"},
        {"code": "BLR01", "name": "Bangalore Branch", "loc": "BLR"}
    ]
    
    for b in branches_data:
        exists = Branch.query.filter_by(branch_code=b['code']).first()
        if not exists:
            db.session.add(Branch(branch_code=b['code'], branch_name=b['name'], location_code=b['loc']))
            seeded_info.append(f"Added Branch: {b['name']}")
    
    db.session.commit()
    
    admins = User.query.filter_by(role="Admin").all()
    all_branches = Branch.query.all()
    
    for admin in admins:
        for br in all_branches:
            access = UserBranchAccess.query.filter_by(user_id=admin.user_id, branch_id=br.id).first()
            if not access:
                new_access = UserBranchAccess(
                    user_id=admin.user_id,
                    branch_id=br.id,
                    start_date=date(2024, 1, 1),
                    end_date=None,
                    is_active=True
                )
                db.session.add(new_access)
                seeded_info.append(f"Assigned {br.branch_code} to Admin {admin.username}")
    
    db.session.commit()
    
    return jsonify({"message": "Seeding completed successfully", "details": seeded_info}), 201


@bp.route("/api/classes", methods=["GET"])
@token_required
def get_classes(current_user):
    from sqlalchemy import and_, or_
    
    h_branch = request.args.get("branch") or request.headers.get("X-Branch")
    academic_year = request.args.get("academic_year") or request.headers.get("X-Academic-Year")
    
    allowed = get_user_allowed_branches(current_user)
    
    query = ClassMaster.query
    query = query.join(ClassSection, ClassSection.class_id == ClassMaster.id)
    if academic_year:
        query = query.filter(ClassSection.academic_year == academic_year)
    
    # Resolve the requested branch if passed
    branch_obj = None
    if h_branch and h_branch != "All":
        if h_branch.isdigit():
            branch_obj = Branch.query.get(int(h_branch))
        else:
            branch_obj = Branch.query.filter_by(branch_name=h_branch).first()
            if not branch_obj:
                branch_obj = Branch.query.filter_by(branch_code=h_branch).first()
                
    # Security constraint:
    if not allowed['is_unlimited']:
        if branch_obj:
            if branch_obj.id not in allowed['ids']:
                branch_obj = None
                query = query.filter(ClassSection.branch_id.in_(allowed['ids']))
            else:
                query = query.filter(ClassSection.branch_id == branch_obj.id)
        else:
            query = query.filter(ClassSection.branch_id.in_(allowed['ids']))
    else:
        if branch_obj:
            query = query.filter(ClassSection.branch_id == branch_obj.id)
            
    # Apply branch/location-specific criteria for global vs specific classes
    if branch_obj:
        location_filter = "Global"
        loc_obj = OrgMaster.query.filter_by(master_type='LOCATION', code=branch_obj.location_code).first()
        if loc_obj:
            location_filter = loc_obj.display_name
            
        branch_specific_cond = or_(ClassMaster.branch == str(branch_obj.id), ClassMaster.branch == branch_obj.branch_name)
        
        query = query.filter(or_(
            ClassSection.branch_id == branch_obj.id,
            branch_specific_cond,
            and_(ClassMaster.branch == 'All', ClassMaster.location == location_filter),
            and_(ClassMaster.branch == 'All', ClassMaster.location == 'All')
        ))
    else:
        if not allowed['is_unlimited']:
            allowed_branches = Branch.query.filter(Branch.id.in_(allowed['ids'])).all()
            loc_codes = {b.location_code for b in allowed_branches if b.location_code}
            loc_names = set()
            if loc_codes:
                loc_objs = OrgMaster.query.filter(OrgMaster.master_type == 'LOCATION', OrgMaster.code.in_(list(loc_codes))).all()
                loc_names = {l.display_name for l in loc_objs}
            
            allowed_branch_names = allowed['names']
            allowed_branch_ids_str = {str(bid) for bid in allowed['ids']}
            
            branch_cond = or_(
                ClassSection.branch_id.in_(allowed['ids']),
                ClassMaster.branch.in_(list(allowed_branch_names)),
                ClassMaster.branch.in_(list(allowed_branch_ids_str)),
                and_(ClassMaster.branch == 'All', ClassMaster.location.in_(list(loc_names))),
                and_(ClassMaster.branch == 'All', ClassMaster.location == 'All')
            )
            query = query.filter(branch_cond)

    query = query.distinct(ClassMaster.id)
    classes = query.order_by(ClassMaster.id.asc()).all()
    
    return jsonify({
        "classes": [{"id": c.id, "class_name": c.class_name} for c in classes]
    }), 200
