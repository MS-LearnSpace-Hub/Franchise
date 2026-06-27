import logging
from flask import Blueprint, request, jsonify, g
from extensions import db
from models import (
    DepartmentMaster, DesignationMaster, ShiftMaster, StaffMaster,
    StaffCategoryMaster, StaffStatusMaster, User, Role, Branch
)
from helpers import permission_required, token_required, get_now, hash_user_password

bp = Blueprint('hr_bp', __name__)
logger = logging.getLogger(__name__)


from sqlalchemy import or_

# ==========================================
# HELPER FOR MASTER ROUTES
# ==========================================
def get_target_school_id(current_user):
    branch_id = request.args.get('branch_id', type=int)
    if branch_id:
        branch = Branch.query.get(branch_id)
        if branch:
            return branch.school_id
    return current_user.school_id

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
    data = request.json or {}
    if not data.get('category_code') or not data.get('category_name'):
        return jsonify({"error": "category_code and category_name are required"}), 400

    if StaffCategoryMaster.query.filter_by(category_code=data['category_code'].upper(), school_id=current_user.school_id).first():
        return jsonify({"error": "Category code already exists in your school"}), 400

    category = StaffCategoryMaster(
        school_id=current_user.school_id,
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
        "is_active": s.is_active
    } for s in statuses]
    return jsonify(result), 200


@bp.route('/staff-statuses', methods=['POST'])
@token_required
@permission_required("hr.hr.staff-master", "write")
def create_staff_status(current_user):
    data = request.json or {}
    if not data.get('status_code') or not data.get('status_name'):
        return jsonify({"error": "status_code and status_name are required"}), 400

    if StaffStatusMaster.query.filter_by(status_code=data['status_code'].upper(), school_id=current_user.school_id).first():
        return jsonify({"error": "Status code already exists in your school"}), 400

    status = StaffStatusMaster(
        school_id=current_user.school_id,
        status_code=data['status_code'].upper(),
        status_name=data['status_name'],
        description=data.get('description'),
        display_order=data.get('display_order', 0),
        is_active=data.get('is_active', True)
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
    if not data or not data.get('department_code') or not data.get('department_name'):
        return jsonify({"error": "Department code and name are required"}), 400

    if DepartmentMaster.query.filter_by(department_code=data['department_code'], school_id=current_user.school_id).first():
        return jsonify({"error": "Department code already exists in your school"}), 400

    dept = DepartmentMaster(
        school_id=current_user.school_id,
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
    if not data or not data.get('designation_code') or not data.get('designation_name') or not data.get('department_id'):
        return jsonify({"error": "Designation code, name, and department_id are required"}), 400

    if DesignationMaster.query.filter_by(designation_code=data['designation_code'], school_id=current_user.school_id).first():
        return jsonify({"error": "Designation code already exists in your school"}), 400

    desig = DesignationMaster(
        school_id=current_user.school_id,
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
    if not data or not data.get('shift_code') or not data.get('shift_name') or not data.get('start_time') or not data.get('end_time'):
        return jsonify({"error": "Shift code, name, start time, and end time are required"}), 400

    if ShiftMaster.query.filter_by(shift_code=data['shift_code'], school_id=current_user.school_id).first():
        return jsonify({"error": "Shift code already exists in your school"}), 400

    shift = ShiftMaster(
        school_id=current_user.school_id,
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

def _generate_staff_ids(branch_id, department_id):
    """
    Generate structured staff code and employee ID using StaffEnrollmentSequence.
    staff_code: BranchCode + DeptShortCode + Sequence
    employee_id: DeptNumericCode + Sequence (also used as biometric ID)
    """
    branch_code = ""
    dept_short = ""
    dept_numeric = ""

    if branch_id:
        branch = Branch.query.get(branch_id)
        if branch and branch.branch_code:
            branch_code = branch.branch_code.strip()

    if department_id:
        dept = DepartmentMaster.query.get(department_id)
        if dept:
            dept_short = (dept.department_short_code or dept.department_code or "").strip()
            dept_numeric = (dept.department_numeric_code or dept.department_short_code or dept.department_code or "").strip()

    staff_code_prefix = f"{branch_code}{dept_short}"
    employee_id_prefix = f"{dept_numeric}"
    
    # Get or create sequence
    if department_id:
        seq = StaffEnrollmentSequence.query.filter_by(
            branch_id=branch_id, department_id=department_id
        ).with_for_update().first()
        
        if not seq:
            seq = StaffEnrollmentSequence(
                branch_id=branch_id,
                department_id=department_id,
                staff_code_prefix=staff_code_prefix,
                last_staff_no=0,
                employee_id_prefix=employee_id_prefix,
                last_employee_no=0
            )
            db.session.add(seq)
            
        seq.last_staff_no += 1
        seq.last_employee_no += 1
        
        staff_sequence = seq.last_staff_no
        emp_sequence = seq.last_employee_no
    else:
        # Fallback if no department is specified
        last_staff = StaffMaster.query.order_by(StaffMaster.id.desc()).first()
        staff_sequence = (last_staff.id + 1) if last_staff else 1
        emp_sequence = staff_sequence
        staff_code_prefix = "MS"
        employee_id_prefix = "E"
        
    staff_seq_str = f"{staff_sequence:04d}"
    emp_seq_str = f"{emp_sequence:04d}"

    staff_code = f"{staff_code_prefix}{staff_seq_str}"
    employee_id = f"{employee_id_prefix}{emp_seq_str}"
    
    return staff_code, employee_id, staff_sequence


# ==========================================
# STAFF ROUTES
# ==========================================

@bp.route('/staff', methods=['GET'])
@token_required
@permission_required("hr.hr.staff-master", "read")
def get_staff(current_user):
    staff_list = StaffMaster.query.all()
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
        "employment_type": s.employment_type,
        "mobile": s.mobile,
        "email": s.email,
        "joining_date": str(s.joining_date) if s.joining_date else None,
        "employment_status": s.employment_status  # legacy field
    } for s in staff_list]
    return jsonify(result), 200


@bp.route('/staff', methods=['POST'])
@token_required
@permission_required("hr.hr.staff-master", "write")
def create_staff(current_user):
    """
    Create a new staff member in a single atomic transaction.

    Employee code format: BranchCode + DeptNumericCode + Sequence  (e.g. MSMN51001)
    Biometric ID:         DeptNumericCode + Sequence                (e.g. 51001)

    Login is always created automatically:
    - Username:  employee_code
    - Password:  hash(employee_code)  — temporary
    - is_first_login = True  — forces password change on first login

    The raw password is NEVER returned in the response.
    """
    data = request.json
    if not data or not data.get('first_name') or not data.get('joining_date') or not data.get('employment_type'):
        return jsonify({"error": "first_name, joining_date, and employment_type are required"}), 400

    # Resolve staff_status_id — default to ACTIVE status if not provided
    staff_status_id = data.get('staff_status_id')
    if not staff_status_id:
        active_status = StaffStatusMaster.query.filter_by(status_code='ACTIVE').first()
        if active_status:
            staff_status_id = active_status.id

    # Validate role if provided
    role_id = data.get('role_id')
    role = None
    if role_id:
        role = Role.query.get(role_id)
        if not role:
            return jsonify({"error": f"Role ID {role_id} not found"}), 400
        if not role.is_active:
            return jsonify({"error": "Selected role is inactive"}), 400

    try:
        # Generate structured staff code
        branch_id = data.get('branch_id')
        department_id = data.get('department_id')
        staff_code, employee_id, sequence = _generate_staff_ids(branch_id, department_id)

        # Verify uniqueness (guard against race conditions)
        if StaffMaster.query.filter_by(staff_code=staff_code).first():
            return jsonify({"error": f"Staff code {staff_code} already exists. Please retry."}), 409

        first_name = data['first_name']
        last_name = data.get('last_name', '')
        display_name = data.get('display_name', f"{first_name} {last_name}".strip())

        staff = StaffMaster(
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
            staff_category_id=data.get('staff_category_id'),
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
            designation_id=data.get('designation_id'),
            default_shift_id=data.get('default_shift_id'),
            reporting_manager_id=data.get('reporting_manager_id'),
            attendance_source=data.get('attendance_source', 'MANUAL'),
            weekly_off=data.get('weekly_off', 'Sunday'),
            joining_branch=data.get('joining_branch'),
            attendance_required=data.get('attendance_required', True),
            payroll_enabled=data.get('payroll_enabled', True)
        )
        db.session.add(staff)
        db.session.flush()  # get staff.id before creating user

        # Auto-create login — always, in the same transaction
        # Username = staff_code, Password = staff_code (hashed), force change on first login
        if User.query.filter_by(username=staff_code).first():
            db.session.rollback()
            return jsonify({"error": f"Username {staff_code} already exists"}), 409

        user = User(
            username=staff_code,
            password=hash_user_password(staff_code),   # temporary password = staff code
            role=role.name if role else 'User',
            role_id=role.id if role else None,
            staff_id=staff.id,
            branch_id=staff.branch_id,
            useremail=staff.email,
            is_active=True,
            is_first_login=True,             # force password change on first login
            failed_login_count=0
        )
        db.session.add(user)
        db.session.commit()

        logger.info(
            "Staff created: %s (id=%s), user login created with is_first_login=True",
            staff_code, staff.id
        )

        return jsonify({
            "message": "Staff created successfully",
            "staff_id": staff.id,
            "staff_code": staff_code,
            "employee_id": employee_id,
            "biometric_id": employee_id,
            "username": staff_code,
            # Never return the raw password — only confirm it was generated
            "temporary_password_generated": True,
            "note": "Employee must change password on first login"
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.exception("Error creating staff")
        return jsonify({"error": "Failed to create staff. Please try again."}), 500


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
        "designation_id": s.designation_id,
        "designation_name": s.designation.designation_name if s.designation else None,
        "default_shift_id": s.default_shift_id,
        "reporting_manager_id": s.reporting_manager_id,
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


@bp.route('/staff/<int:staff_id>', methods=['PUT'])
@token_required
@permission_required("hr.hr.staff-master", "write")
def update_staff(current_user, staff_id):
    s = StaffMaster.query.get_or_404(staff_id)
    data = request.json or {}

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

    db.session.commit()
    return jsonify({"message": "Staff updated successfully", "staff_code": s.staff_code}), 200
