import logging
from flask import Blueprint, request, jsonify, g
from extensions import db
from models import (
    DepartmentMaster, DesignationMaster, ShiftMaster, StaffMaster,
    StaffCategoryMaster, StaffStatusMaster, User, Role, Branch,
    StaffCodeSequence, EmployeeIdSequence
)
from helpers import permission_required, token_required, get_now, hash_user_password, get_user_allowed_schools, get_target_school_id, scope_query

bp = Blueprint('hr_bp', __name__)
logger = logging.getLogger(__name__)


from sqlalchemy import or_
# ==========================================
# STAFF CATEGORY MASTER ROUTES
# ==========================================

@bp.route('/staff-categories', methods=['GET'])
@token_required
@permission_required("hr.hr.staff-master", "read")
def get_staff_categories(current_user):
    target_school_id = get_target_school_id(current_user)
    if not target_school_id and current_user.role == 'SuperAdmin':
        categories = StaffCategoryMaster.query.order_by(StaffCategoryMaster.display_order).all()
    else:
        categories = StaffCategoryMaster.query.filter(
            or_(StaffCategoryMaster.school_id == target_school_id, StaffCategoryMaster.school_id.is_(None))
        ).order_by(StaffCategoryMaster.display_order).all()
        
        # Deduplicate, preferring school-specific over global
        deduped = {}
        for c in categories:
            if c.category_name not in deduped or c.school_id is not None:
                deduped[c.category_name] = c
        categories = list(deduped.values())
        categories.sort(key=lambda x: x.display_order)

    result = [{
        "id": c.id,
        "category_code": c.category_code,
        "category_name": c.category_name,
        "description": c.description,
        "display_order": c.display_order,
        "is_active": c.is_active
    } for c in categories]
    return jsonify(result), 200


@bp.route('/staff-categories', methods=['POST'])
@token_required
@permission_required("hr.hr.staff-master", "write")
def create_staff_category(current_user):
    data = request.json
    target_school_id = get_target_school_id(current_user) or {}
    if not data.get('category_code') or not data.get('category_name'):
        return jsonify({"error": "category_code and category_name are required"}), 400

    if StaffCategoryMaster.query.filter_by(category_code=data['category_code'].upper(), school_id=target_school_id).first():
        return jsonify({"error": "Category code already exists in your school"}), 400

    category = StaffCategoryMaster(
        school_id=target_school_id,
        category_code=data['category_code'].upper(),
        category_name=data['category_name'],
        description=data.get('description'),
        display_order=data.get('display_order', 0),
        is_active=data.get('is_active', True)
    )
    db.session.add(category)
    db.session.commit()
    return jsonify({"message": "Staff category created", "id": category.id}), 201


# ==========================================
# STAFF STATUS MASTER ROUTES
# ==========================================

@bp.route('/staff-statuses', methods=['GET'])
@token_required
@permission_required("hr.hr.staff-master", "read")
def get_staff_statuses(current_user):
    """List all HR employment statuses (Active, Probation, Resigned, etc.)"""
    target_school_id = get_target_school_id(current_user)
    if not target_school_id and current_user.role == 'SuperAdmin':
        statuses = StaffStatusMaster.query.filter_by(is_active=True).order_by(StaffStatusMaster.display_order).all()
    else:
        statuses = StaffStatusMaster.query.filter(
            or_(StaffStatusMaster.school_id == target_school_id, StaffStatusMaster.school_id.is_(None))
        ).filter_by(is_active=True).order_by(StaffStatusMaster.display_order).all()
    result = [{
        "id": s.id,
        "status_code": s.status_code,
        "status_name": s.status_name,
        "description": s.description,
        "display_order": s.display_order,
        "is_active": s.is_active,
        "status_type": s.status_type.name if hasattr(s.status_type, 'name') else s.status_type
    } for s in statuses]
    return jsonify(result), 200


@bp.route('/staff-statuses', methods=['POST'])
@token_required
@permission_required("hr.hr.staff-master", "write")
def create_staff_status(current_user):
    data = request.json
    target_school_id = get_target_school_id(current_user) or {}
    if not data.get('status_code') or not data.get('status_name'):
        return jsonify({"error": "status_code and status_name are required"}), 400

    if StaffStatusMaster.query.filter_by(status_code=data['status_code'].upper(), school_id=target_school_id).first():
        return jsonify({"error": "Status code already exists in your school"}), 400

    status = StaffStatusMaster(
        school_id=target_school_id,
        status_code=data['status_code'].upper(),
        status_name=data['status_name'],
        description=data.get('description'),
        display_order=data.get('display_order', 0),
        is_active=data.get('is_active', True),
        status_type=data.get('status_type', 'ACTIVE')
    )
    db.session.add(status)
    db.session.commit()
    return jsonify({"message": "Staff status created", "id": status.id}), 201


# ==========================================
# DEPARTMENT ROUTES
# ==========================================

@bp.route('/departments', methods=['GET'])
@token_required
@permission_required("hr.hr.departments", "read")
def get_departments(current_user):
    target_school_id = get_target_school_id(current_user)
    if not target_school_id and current_user.role == 'SuperAdmin':
        departments = DepartmentMaster.query.order_by(DepartmentMaster.display_order).all()
    else:
        departments = DepartmentMaster.query.filter(
            or_(DepartmentMaster.school_id == target_school_id, DepartmentMaster.school_id.is_(None))
        ).order_by(DepartmentMaster.display_order).all()
    result = [{
        "id": d.id,
        "department_code": d.department_code,
        "department_name": d.department_name,
        "description": d.description,
        "display_order": d.display_order,
        "department_short_code": d.department_short_code,
        "department_numeric_code": d.department_numeric_code,
        "status": d.status
    } for d in departments]
    return jsonify(result), 200


@bp.route('/departments', methods=['POST'])
@token_required
@permission_required("hr.hr.departments", "write")
def create_department(current_user):
    data = request.json
    target_school_id = get_target_school_id(current_user)
    if not data or not data.get('department_code') or not data.get('department_name'):
        return jsonify({"error": "Department code and name are required"}), 400

    if DepartmentMaster.query.filter_by(department_code=data['department_code'], school_id=target_school_id).first():
        return jsonify({"error": "Department code already exists in your school"}), 400

    dept = DepartmentMaster(
        school_id=target_school_id,
        department_code=data['department_code'],
        department_name=data['department_name'],
        description=data.get('description'),
        display_order=data.get('display_order', 0),
        department_short_code=data.get('department_short_code'),
        department_numeric_code=data.get('department_numeric_code'),
        status=data.get('status', 'ACTIVE')
    )
    db.session.add(dept)
    db.session.commit()
    return jsonify({"message": "Department created successfully", "id": dept.id}), 201


@bp.route('/departments/<int:dept_id>', methods=['PUT'])
@token_required
@permission_required("hr.hr.departments", "write")
def update_department(current_user, dept_id):
    dept = DepartmentMaster.query.get_or_404(dept_id)
    data = request.json or {}
    if 'department_name' in data:
        dept.department_name = data['department_name']
    if 'description' in data:
        dept.description = data['description']
    if 'display_order' in data:
        dept.display_order = data['display_order']
    if 'department_short_code' in data:
        dept.department_short_code = data['department_short_code']
    if 'department_numeric_code' in data:
        dept.department_numeric_code = data['department_numeric_code']
    if 'status' in data:
        dept.status = data['status']
    db.session.commit()
    return jsonify({"message": "Department updated", "id": dept.id}), 200


# ==========================================
# DESIGNATION ROUTES
# ==========================================

@bp.route('/designations', methods=['GET'])
@token_required
@permission_required("hr.hr.designations", "read")
def get_designations(current_user):
    target_school_id = get_target_school_id(current_user)
    if not target_school_id and current_user.role == 'SuperAdmin':
        designations = DesignationMaster.query.order_by(DesignationMaster.display_order).all()
    else:
        designations = DesignationMaster.query.filter(
            or_(DesignationMaster.school_id == target_school_id, DesignationMaster.school_id.is_(None))
        ).order_by(DesignationMaster.display_order).all()
    result = [{
        "id": d.id,
        "department_id": d.department_id,
        "department_name": d.department.department_name if d.department else None,
        "designation_code": d.designation_code,
        "designation_name": d.designation_name,
        "description": d.description,
        "display_order": d.display_order,
        "status": d.status
    } for d in designations]
    return jsonify(result), 200


@bp.route('/designations', methods=['POST'])
@token_required
@permission_required("hr.hr.designations", "write")
def create_designation(current_user):
    data = request.json
    target_school_id = get_target_school_id(current_user)
    if not data or not data.get('designation_code') or not data.get('designation_name') or not data.get('department_id'):
        return jsonify({"error": "Designation code, name, and department_id are required"}), 400

    if DesignationMaster.query.filter_by(designation_code=data['designation_code'], school_id=target_school_id).first():
        return jsonify({"error": "Designation code already exists in your school"}), 400

    desig = DesignationMaster(
        school_id=target_school_id,
        department_id=data['department_id'],
        designation_code=data['designation_code'],
        designation_name=data['designation_name'],
        description=data.get('description'),
        display_order=data.get('display_order', 0),
        status=data.get('status', 'ACTIVE')
    )
    db.session.add(desig)
    db.session.commit()
    return jsonify({"message": "Designation created successfully", "id": desig.id}), 201


# ==========================================
# SHIFT ROUTES
# ==========================================

@bp.route('/shifts', methods=['GET'])
@token_required
@permission_required("hr.hr.shifts", "read")
def get_shifts(current_user):
    target_school_id = get_target_school_id(current_user)
    if not target_school_id and current_user.role == 'SuperAdmin':
        shifts = ShiftMaster.query.all()
    else:
        shifts = ShiftMaster.query.filter(
            or_(ShiftMaster.school_id == target_school_id, ShiftMaster.school_id.is_(None))
        ).all()
    result = [{
        "id": s.id,
        "shift_code": s.shift_code,
        "shift_name": s.shift_name,
        "start_time": str(s.start_time),
        "end_time": str(s.end_time),
        "grace_in_minutes": s.grace_in_minutes,
        "grace_out_minutes": s.grace_out_minutes,
        "minimum_working_minutes": s.minimum_working_minutes,
        "break_minutes": s.break_minutes,
        "is_night_shift": s.is_night_shift,
        "allow_overtime": s.allow_overtime,
        "late_after_grace": s.late_after_grace,
        "status": s.status
    } for s in shifts]
    return jsonify(result), 200


@bp.route('/shifts', methods=['POST'])
@token_required
@permission_required("hr.hr.shifts", "write")
def create_shift(current_user):
    data = request.json
    target_school_id = get_target_school_id(current_user)
    if not data or not data.get('shift_code') or not data.get('shift_name') or not data.get('start_time') or not data.get('end_time'):
        return jsonify({"error": "Shift code, name, start time, and end time are required"}), 400

    if ShiftMaster.query.filter_by(shift_code=data['shift_code'], school_id=target_school_id).first():
        return jsonify({"error": "Shift code already exists in your school"}), 400

    shift = ShiftMaster(
        school_id=target_school_id,
        shift_code=data['shift_code'],
        shift_name=data['shift_name'],
        start_time=data['start_time'],
        end_time=data['end_time'],
        grace_in_minutes=data.get('grace_in_minutes', 0),
        grace_out_minutes=data.get('grace_out_minutes', 0),
        minimum_working_minutes=data.get('minimum_working_minutes', 0),
        break_minutes=data.get('break_minutes', 0),
        is_night_shift=data.get('is_night_shift', False),
        allow_overtime=data.get('allow_overtime', False),
        late_after_grace=data.get('late_after_grace', False),
        status=data.get('status', 'ACTIVE')
    )
    db.session.add(shift)
    db.session.commit()
    return jsonify({"message": "Shift created successfully", "id": shift.id}), 201


# ==========================================
# EMPLOYEE CODE GENERATION HELPERS
# ==========================================

def _generate_staff_ids(branch_id, department_id, school_id):
    """
    Generate structured staff code and employee ID using two independent sequence tables.

    Staff Code  → StaffCodeSequence (per school + branch + department)
      Format : {branch_code}{dept_numeric_code}{seq:04d}
      Example: MSMN510001  (branch=MSMN, dept_numeric=51, seq=0001)

    Employee ID → EmployeeIdSequence (per school + department, branch-independent)
      Format : {school_id}{dept_numeric_code}{seq:04d}
      Example: 4510001     (school=4, dept_numeric=51, seq=0001)

    The employee ID is also used as the biometric device ID.
    Both counters use SELECT ... FOR UPDATE to be race-condition safe.
    """
    branch_code = ""
    dept_numeric = ""

    if branch_id:
        branch = Branch.query.get(branch_id)
        if branch and branch.branch_code:
            branch_code = branch.branch_code.strip()

    if department_id:
        dept = DepartmentMaster.query.get(department_id)
        if dept:
            # Use numeric code for both staff code and employee ID
            dept_numeric = (
                dept.department_numeric_code
                or dept.department_short_code
                or dept.department_code
                or ""
            ).strip()

    # ── Staff Code Sequence (per school + branch + department) ────────────────
    if school_id and branch_id and department_id:
        sc_seq = StaffCodeSequence.query.filter_by(
            school_id=school_id,
            branch_id=branch_id,
            department_id=department_id
        ).with_for_update().first()

        if not sc_seq:
            sc_seq = StaffCodeSequence(
                school_id=school_id,
                branch_id=branch_id,
                department_id=department_id,
                last_sequence=0
            )
            db.session.add(sc_seq)

        sc_seq.last_sequence += 1
        staff_sequence = sc_seq.last_sequence
    else:
        # Fallback when branch or dept is unknown
        last = StaffMaster.query.order_by(StaffMaster.id.desc()).first()
        staff_sequence = (last.id + 1) if last else 1

    # ── Employee ID Sequence (per school + department, branch-independent) ────
    if school_id and department_id:
        emp_seq = EmployeeIdSequence.query.filter_by(
            school_id=school_id,
            department_id=department_id
        ).with_for_update().first()

        if not emp_seq:
            emp_seq = EmployeeIdSequence(
                school_id=school_id,
                department_id=department_id,
                last_sequence=0
            )
            db.session.add(emp_seq)

        emp_seq.last_sequence += 1
        emp_sequence = emp_seq.last_sequence
    else:
        emp_sequence = staff_sequence  # fallback mirrors staff sequence

    # ── Build code strings ────────────────────────────────────────────────────
    staff_code = f"{branch_code}{dept_numeric}{staff_sequence:04d}"
    employee_id = f"{school_id or ''}{dept_numeric}{emp_sequence:04d}"

    return staff_code, employee_id, staff_sequence



# ==========================================
# STAFF ROUTES
# ==========================================

@bp.route('/staff', methods=['GET'])
@token_required
@permission_required("hr.hr.staff-master", "read")
def get_staff(current_user):
    try:
        target_school_id = get_target_school_id(current_user)
        branch_id_str = request.headers.get('X-Branch-ID')
        
        # Additional filters
        department_id = request.args.get('department_id')
        designation_id = request.args.get('designation_id')
        status_type = request.args.get('status') # 'ACTIVE' or 'INACTIVE'
        search_by = request.args.get('search_by')
        search_query = request.args.get('search_query')
        
        query = StaffMaster.query
        query = scope_query(query, StaffMaster)
        
        if target_school_id:
            query = query.filter_by(school_id=target_school_id)
            
        if branch_id_str and branch_id_str.lower() != 'all':
            query = query.filter_by(branch_id=int(branch_id_str))
            
        if department_id:
            query = query.filter_by(department_id=int(department_id))
            
        if designation_id:
            query = query.filter_by(designation_id=int(designation_id))
            
        if status_type:
            # We need to join with StaffStatusMaster to filter by status_type
            query = query.join(StaffStatusMaster, StaffMaster.staff_status_id == StaffStatusMaster.id).filter(StaffStatusMaster.status_type == status_type)
            
        if search_by and search_query:
            sq = f"%{search_query}%"
            if search_by == 'staff_code':
                query = query.filter(StaffMaster.staff_code.ilike(sq))
            elif search_by == 'employee_id':
                query = query.filter(StaffMaster.employee_id.ilike(sq))
            elif search_by == 'biometric_id':
                query = query.filter(StaffMaster.biometric_id.ilike(sq))
            elif search_by == 'first_name':
                query = query.filter(db.or_(StaffMaster.first_name.ilike(sq), StaffMaster.last_name.ilike(sq), StaffMaster.display_name.ilike(sq)))
            elif search_by == 'mobile':
                query = query.filter(StaffMaster.mobile.ilike(sq))
            elif search_by == 'email':
                query = query.filter(StaffMaster.email.ilike(sq))
            
        staff_list = query.order_by(StaffMaster.id.desc()).all()
        
        result = [{
            "id": s.id,
            "staff_code": s.staff_code,
            "employee_id": s.employee_id,
            "biometric_id": s.biometric_id,
            "first_name": s.first_name,
            "last_name": s.last_name,
            "display_name": s.display_name,
            "department_id": s.department_id,
            "department_name": s.department.department_name if s.department else None,
            "designation_id": s.designation_id,
            "designation_name": s.designation.designation_name if s.designation else None,
            "staff_category_id": s.staff_category_id,
            "staff_category_name": s.staff_category.category_name if s.staff_category else None,
            "staff_status_id": s.staff_status_id,
            "staff_status_name": s.staff_status.status_name if s.staff_status else None,
            "employment_type": s.employment_type.value if hasattr(s.employment_type, 'value') else s.employment_type,
            "mobile": s.mobile,
            "email": s.email,
            "joining_date": str(s.joining_date) if s.joining_date else None,
            "employment_status": s.employment_status.value if hasattr(s.employment_status, 'value') else s.employment_status
        } for s in staff_list]
        return jsonify(result), 200
    except Exception as e:
        import traceback
        trace = traceback.format_exc()
        logger.exception("Error in get_staff")
        with open('staff_500_error.log', 'w') as f:
            f.write(trace)
        return jsonify({"error": "Failed to fetch staff"}), 500


@bp.route('/staff/profile', methods=['GET'])
@token_required
@permission_required("hr.hr.staff-profile", "read")
def get_staff_profile(current_user):
    try:
        if not current_user.staff_id:
            return jsonify({"error": "User is not linked to any staff profile"}), 404
            
        s = StaffMaster.query.get(current_user.staff_id)
        if not s:
            return jsonify({"error": "Staff profile not found"}), 404
            
        from models import AttendanceHead
        from datetime import date
        today = date.today()
        today_att = AttendanceHead.query.filter_by(staff_id=s.id, attendance_date=today).first()
        today_attendance_data = None
        if today_att:
            today_attendance_data = {
                "first_in": str(today_att.first_in.strftime('%H:%M')) if today_att.first_in else None,
                "last_out": str(today_att.last_out.strftime('%H:%M')) if today_att.last_out else None,
                "status": today_att.attendance_status
            }
            
        result = {
            "id": s.id,
            "staff_code": s.staff_code,
            "employee_id": s.employee_id,
            "biometric_id": s.biometric_id,
            "first_name": s.first_name,
            "last_name": s.last_name,
            "display_name": s.display_name,
            "department_name": s.department.department_name if s.department else None,
            "designation_name": s.designation.designation_name if s.designation else None,
            "staff_category_name": s.staff_category.category_name if s.staff_category else None,
            "staff_status_name": s.staff_status.status_name if s.staff_status else None,
            "employment_type": s.employment_type.value if hasattr(s.employment_type, 'value') else s.employment_type,
            "employment_status": s.employment_status.value if hasattr(s.employment_status, 'value') else s.employment_status,
            "mobile": s.mobile,
            "email": s.email,
            "gender": s.gender,
            "date_of_birth": str(s.date_of_birth) if s.date_of_birth else None,
            "joining_date": str(s.joining_date) if s.joining_date else None,
            "blood_group": s.blood_group if hasattr(s, 'blood_group') else "-", # fallback
            "nationality": "Indian", # fallback
            "qualification": "-", # fallback
            "uan_no": "-", # fallback
            "branch_id": s.branch_id,
            "today_attendance": today_attendance_data
        }
        return jsonify(result), 200
    except Exception as e:
        import traceback
        trace = traceback.format_exc()
        logger.exception("Error in get_staff_profile")
        return jsonify({"error": "Failed to fetch staff profile"}), 500

@bp.route('/staff/<int:staff_id>/profile', methods=['GET'])
@token_required
@permission_required("hr.hr.staff-master", "read")
def get_staff_profile_by_id(current_user, staff_id):
    try:
        s = StaffMaster.query.get(staff_id)
        if not s:
            return jsonify({"error": "Staff profile not found"}), 404
            
        result = {
            "id": s.id,
            "staff_code": s.staff_code,
            "employee_id": s.employee_id,
            "biometric_id": s.biometric_id,
            "first_name": s.first_name,
            "last_name": s.last_name,
            "display_name": s.display_name,
            "department_name": s.department.department_name if s.department else None,
            "designation_name": s.designation.designation_name if s.designation else None,
            "staff_category_name": s.staff_category.category_name if s.staff_category else None,
            "staff_status_name": s.staff_status.status_name if s.staff_status else None,
            "employment_type": s.employment_type.value if hasattr(s.employment_type, 'value') else s.employment_type,
            "employment_status": s.employment_status.value if hasattr(s.employment_status, 'value') else s.employment_status,
            "mobile": s.mobile,
            "email": s.email,
            "gender": s.gender,
            "date_of_birth": str(s.date_of_birth) if s.date_of_birth else None,
            "joining_date": str(s.joining_date) if s.joining_date else None,
            "blood_group": s.blood_group if hasattr(s, 'blood_group') else "-", # fallback
            "nationality": "Indian", # fallback
            "qualification": "-", # fallback
            "uan_no": "-", # fallback
            "branch_id": s.branch_id
        }
        return jsonify(result), 200
    except Exception as e:
        import traceback
        trace = traceback.format_exc()
        logger.exception("Error in get_staff_profile_by_id")
        return jsonify({"error": "Failed to fetch staff profile"}), 500



@bp.route('/staff', methods=['POST'])
@token_required
@permission_required("hr.hr.staff-master", "write")
def create_staff(current_user):
    """
    Create a new staff member in a single atomic transaction.

    Staff code format : {branch_code}{dept_numeric_code}{seq:04d}  e.g. MSMN510001
    Employee ID format: {school_id}{dept_numeric_code}{seq:04d}    e.g. 4510001
    Biometric ID      : same as employee_id

    Login is always created automatically:
    - Username : staff_code  (e.g. MSMN510001)
    - Password : hash(staff_code)  — temporary, forced change on first login
    """
    data = request.json
    if not data or not data.get('first_name') or not data.get('joining_date') or not data.get('employment_type'):
        return jsonify({"error": "first_name, joining_date, and employment_type are required"}), 400

    branch_id   = data.get('branch_id') or None
    department_id = data.get('department_id') or None

    # ── Security: validate branch belongs to the current user's school ────────
    school_id = None
    if branch_id:
        branch = Branch.query.get(branch_id)
        if not branch:
            return jsonify({"error": f"Branch ID {branch_id} not found"}), 400

        allowed_schools = get_user_allowed_schools(current_user)
        if not allowed_schools['is_unlimited']:
            if not allowed_schools['ids'] or branch.school_id not in allowed_schools['ids']:
                return jsonify({
                    "error": "You cannot create staff for a branch outside your permitted schools"
                }), 403

        school_id = branch.school_id
    else:
        # No branch provided — fall back to target school context
        school_id = get_target_school_id(current_user)

    # Resolve staff_status_id — default to ACTIVE status if not provided
    staff_status_id = data.get('staff_status_id')
    if not staff_status_id:
        active_status = StaffStatusMaster.query.filter_by(
            status_code='ACTIVE', school_id=school_id
        ).first()
        if not active_status:
            # Try global (null school) fallback
            active_status = StaffStatusMaster.query.filter_by(status_code='ACTIVE').first()
        if active_status:
            staff_status_id = active_status.id

    # Validate role if provided, else fallback to 'stafflogin'
    role_id = data.get('role_id') or None
    role = None
    if role_id:
        role = Role.query.get(role_id)
        if not role:
            return jsonify({"error": f"Role ID {role_id} not found"}), 400
        if not role.is_active:
            return jsonify({"error": "Selected role is inactive"}), 400
    else:
        role = Role.query.filter(Role.name.ilike('stafflogin')).first()
        if not role:
            role = Role(name='stafflogin', description='Default staff login role', is_active=True, is_system=True)
            db.session.add(role)
            db.session.flush()
        elif not role.is_active:
            return jsonify({"error": "Configuration Error: Default 'stafflogin' role is inactive."}), 500

    try:
        # Generate staff code and employee ID via new independent sequence tables
        staff_code, employee_id, sequence = _generate_staff_ids(
            branch_id, department_id, school_id
        )

        # Guard against race conditions
        if StaffMaster.query.filter_by(staff_code=staff_code).first():
            return jsonify({"error": f"Staff code {staff_code} already exists. Please retry."}), 409

        first_name   = data['first_name']
        last_name    = data.get('last_name', '')
        display_name = data.get('display_name', f"{first_name} {last_name}".strip())

        staff = StaffMaster(
            school_id=school_id,          # ← NEW: denormalized from branch
            staff_code=staff_code,
            employee_id=employee_id,
            biometric_id=employee_id,
            employee_sequence=sequence,
            first_name=first_name,
            middle_name=data.get('middle_name'),
            last_name=last_name,
            display_name=display_name,
            gender=data.get('gender', 'OTHER'),
            date_of_birth=data.get('date_of_birth') or None,
            joining_date=data['joining_date'],
            employment_type=data['employment_type'],
            employment_status=data.get('employment_status', 'ACTIVE'),  # legacy compat
            staff_category_id=data.get('staff_category_id') or None,
            staff_status_id=staff_status_id,
            email=data.get('email'),
            mobile=data.get('mobile'),
            address=data.get('address'),
            city=data.get('city'),
            state=data.get('state'),
            country=data.get('country'),
            pincode=data.get('pincode'),
            confirmation_date=data.get('confirmation_date') or None,
            relieving_date=data.get('relieving_date') or None,
            branch_id=branch_id,
            department_id=department_id,
            designation_id=data.get('designation_id') or None,
            default_shift_id=data.get('default_shift_id') or None,
            reporting_manager_id=data.get('reporting_manager_id') or None,
            attendance_source=data.get('attendance_source', 'MANUAL'),
            weekly_off=data.get('weekly_off', 'Sunday'),
            joining_branch=data.get('joining_branch'),
            attendance_required=data.get('attendance_required', True),
            payroll_enabled=data.get('payroll_enabled', True)
        )
        db.session.add(staff)
        db.session.flush()  # get staff.id before creating user

        # Auto-create login — always, in the same transaction
        if User.query.filter_by(username=staff_code).first():
            db.session.rollback()
            return jsonify({"error": f"Username {staff_code} already exists"}), 409

        user = User(
            username=staff_code,
            password=hash_user_password(staff_code),   # temporary password = staff code
            role=role.name,
            role_id=role.id,
            staff_id=staff.id,
            school_id=school_id,
            branch_id=staff.branch_id,
            useremail=staff.email,
            is_active=True,
            is_first_login=True,             # force password change on first login
            failed_login_count=0
        )
        db.session.add(user)
        db.session.commit()

        logger.info(
            "Staff created: %s (id=%s) school_id=%s branch_id=%s, user login created with is_first_login=True",
            staff_code, staff.id, school_id, branch_id
        )

        return jsonify({
            "message": "Staff created successfully",
            "staff_id": staff.id,
            "staff_code": staff_code,
            "employee_id": employee_id,
            "biometric_id": employee_id,
            "username": staff_code,
            "temporary_password_generated": True,
            "note": "Employee must change password on first login"
        }), 201

    except Exception as e:
        import traceback
        trace = traceback.format_exc()
        db.session.rollback()
        logger.exception("Error creating staff")
        with open('staff_create_500_error.log', 'w') as f:
            f.write(trace)
        return jsonify({"error": "Failed to create staff. Please try again.", "details": str(e)}), 500



@bp.route('/staff/<int:staff_id>', methods=['GET'])
@token_required
@permission_required("hr.hr.staff-master", "read")
def get_staff_detail(current_user, staff_id):
    s = StaffMaster.query.get_or_404(staff_id)
    return jsonify({
        "id": s.id,
        "staff_code": s.staff_code,
        "employee_id": s.employee_id,
        "biometric_id": s.biometric_id,
        "employee_sequence": s.employee_sequence,
        "school_id": s.school_id,
        "first_name": s.first_name,
        "middle_name": s.middle_name,
        "last_name": s.last_name,
        "display_name": s.display_name,
        "gender": s.gender,
        "date_of_birth": str(s.date_of_birth) if s.date_of_birth else None,
        "joining_date": str(s.joining_date) if s.joining_date else None,
        "confirmation_date": str(s.confirmation_date) if s.confirmation_date else None,
        "relieving_date": str(s.relieving_date) if s.relieving_date else None,
        "employment_type": s.employment_type,
        "employment_status": s.employment_status,
        "staff_category_id": s.staff_category_id,
        "staff_category_name": s.staff_category.category_name if s.staff_category else None,
        "staff_status_id": s.staff_status_id,
        "staff_status_name": s.staff_status.status_name if s.staff_status else None,
        "branch_id": s.branch_id,
        "department_id": s.department_id,
        "department_name": s.department.department_name if s.department else None,
        "department_numeric_code": s.department.department_numeric_code if s.department else None,
        "designation_id": s.designation_id,
        "designation_name": s.designation.designation_name if s.designation else None,
        "default_shift_id": s.default_shift_id,
        "reporting_manager_id": s.reporting_manager_id,
        "reporting_manager_name": (
            s.reporting_manager.display_name
            or f"{s.reporting_manager.first_name} {s.reporting_manager.last_name or ''}".strip()
        ) if s.reporting_manager else None,
        "email": s.email,
        "mobile": s.mobile,
        "address": s.address,
        "city": s.city,
        "state": s.state,
        "country": s.country,
        "pincode": s.pincode,
        "attendance_source": s.attendance_source,
        "weekly_off": s.weekly_off,
        "attendance_required": s.attendance_required,
        "payroll_enabled": s.payroll_enabled
    }), 200


@bp.route('/staff/managers', methods=['GET'])
@token_required
@permission_required("hr.hr.staff-master", "read")
def get_managers(current_user):
    """
    Return a compact list of staff from the current user's school (or branch)
    to populate the Reporting Manager dropdown.
    Scoped by school_id; filtered by branch_id if branch_id query param is passed.
    """
    from sqlalchemy import or_
    branch_id = request.args.get('branch_id', type=int)

    q = StaffMaster.query

    if current_user.role == 'SuperAdmin':
        if branch_id:
            q = q.filter(StaffMaster.branch_id == branch_id)
    else:
        q = q.filter(StaffMaster.school_id == current_user.school_id)
        if branch_id:
            q = q.filter(StaffMaster.branch_id == branch_id)

    managers = q.order_by(StaffMaster.display_name).all()
    result = [{
        "id": m.id,
        "display_name": m.display_name or f"{m.first_name} {m.last_name or ''}".strip(),
        "staff_code": m.staff_code,
        "designation_name": m.designation.designation_name if m.designation else None,
        "department_id": m.department_id,
        "department_name": m.department.department_name if m.department else None,
    } for m in managers]
    return jsonify(result), 200



@bp.route('/staff/<int:staff_id>', methods=['PUT'])
@token_required
@permission_required("hr.hr.staff-master", "write")
def update_staff(current_user, staff_id):
    s = StaffMaster.query.get_or_404(staff_id)
    data = request.json or {}

    allowed_schools = get_user_allowed_schools(current_user)
    if not allowed_schools['is_unlimited']:
        if not allowed_schools['ids'] or s.school_id not in allowed_schools['ids']:
            return jsonify({"error": "Forbidden: Cannot update staff outside your permitted schools"}), 403

    if 'branch_id' in data and data['branch_id']:
        branch = Branch.query.get(data['branch_id'])
        if not branch:
            return jsonify({"error": f"Branch ID {data['branch_id']} not found"}), 400
        if not allowed_schools['is_unlimited']:
            if not allowed_schools['ids'] or branch.school_id not in allowed_schools['ids']:
                return jsonify({"error": "You cannot move staff to a branch outside your permitted schools"}), 403
        s.school_id = branch.school_id
        s.branch_id = branch.id

    updatable_fields = [
        'staff_code', 'employee_id', 'biometric_id',
        'first_name', 'middle_name', 'last_name', 'display_name', 'gender',
        'date_of_birth', 'joining_date', 'confirmation_date', 'relieving_date',
        'employment_type', 'employment_status', 'staff_category_id', 'staff_status_id',
        'department_id', 'designation_id', 'default_shift_id', 'reporting_manager_id',
        'email', 'mobile', 'address', 'city', 'state', 'country', 'pincode',
        'attendance_source', 'weekly_off', 'attendance_required', 'payroll_enabled'
    ]
    for field in updatable_fields:
        if field in data:
            setattr(s, field, data[field] or None if data[field] == '' else data[field])

    # Update associated user credentials if staff status or code changed
    user = User.query.filter_by(staff_id=s.id).first()
    if user:
        if 'staff_code' in data and data['staff_code']:
            if User.query.filter(User.username == data['staff_code'], User.user_id != user.user_id).first():
                return jsonify({'error': 'Staff code is already assigned to another user.'}), 409
            user.username = data['staff_code']
        if 'staff_status_id' in data and data['staff_status_id']:
            status_master = StaffStatusMaster.query.get(data['staff_status_id'])
            if status_master:
                status_type_val = status_master.status_type.name if hasattr(status_master.status_type, 'name') else status_master.status_type
                user.is_active = (status_type_val == 'ACTIVE')

    db.session.commit()
    return jsonify({"message": "Staff updated successfully", "staff_code": s.staff_code}), 200

# ==========================================
# PUT ENDPOINTS FOR HR MASTERS
# ==========================================

@bp.route('/designations/<int:desig_id>', methods=['PUT'])
@token_required
@permission_required("hr.hr.designations", "write")
def update_designation(current_user, desig_id):
    desig = DesignationMaster.query.get_or_404(desig_id)
    data = request.json or {}
    if 'designation_name' in data:
        desig.designation_name = data['designation_name']
    if 'description' in data:
        desig.description = data['description']
    if 'display_order' in data:
        desig.display_order = data['display_order']
    if 'status' in data:
        desig.status = data['status']
    db.session.commit()
    return jsonify({"message": "Designation updated"}), 200

@bp.route('/shifts/<int:shift_id>', methods=['PUT'])
@token_required
@permission_required("hr.hr.shifts", "write")
def update_shift(current_user, shift_id):
    shift = ShiftMaster.query.get_or_404(shift_id)
    data = request.json or {}
    if 'shift_name' in data:
        shift.shift_name = data['shift_name']
    if 'start_time' in data:
        shift.start_time = data['start_time']
    if 'end_time' in data:
        shift.end_time = data['end_time']
    if 'grace_time_minutes' in data:
        shift.grace_time_minutes = data['grace_time_minutes']
    if 'half_day_hours' in data:
        shift.half_day_hours = data['half_day_hours']
    if 'full_day_hours' in data:
        shift.full_day_hours = data['full_day_hours']
    if 'is_active' in data:
        shift.is_active = data['is_active']
    db.session.commit()
    return jsonify({"message": "Shift updated"}), 200

@bp.route('/staff-categories/<int:cat_id>', methods=['PUT'])
@token_required
@permission_required("hr.hr.staff-master", "write")
def update_staff_category(current_user, cat_id):
    cat = StaffCategoryMaster.query.get_or_404(cat_id)
    data = request.json or {}
    if 'category_name' in data:
        cat.category_name = data['category_name']
    if 'description' in data:
        cat.description = data['description']
    if 'display_order' in data:
        cat.display_order = data['display_order']
    if 'is_active' in data:
        cat.is_active = data['is_active']
    db.session.commit()
    return jsonify({"message": "Staff category updated"}), 200

@bp.route('/staff-statuses/<int:stat_id>', methods=['PUT'])
@token_required
@permission_required("hr.hr.staff-master", "write")
def update_staff_status(current_user, stat_id):
    stat = StaffStatusMaster.query.get_or_404(stat_id)
    data = request.json or {}
    if 'status_name' in data:
        stat.status_name = data['status_name']
    if 'description' in data:
        stat.description = data['description']
    if 'display_order' in data:
        stat.display_order = data['display_order']
    if 'is_active' in data:
        stat.is_active = data['is_active']
    if 'status_type' in data:
        stat.status_type = data['status_type']
    db.session.commit()
    return jsonify({"message": "Staff status updated"}), 200
