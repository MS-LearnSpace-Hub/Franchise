import logging
from flask import Blueprint, request, jsonify, g
from extensions import db
from models import DepartmentMaster, DesignationMaster, ShiftMaster, StaffMaster, User, Role
from helpers import permission_required, get_now, hash_user_password

bp = Blueprint('hr_bp', __name__)
logger = logging.getLogger(__name__)

# ==========================================
# DEPARTMENT ROUTES
# ==========================================
@bp.route('/departments', methods=['GET'])
@permission_required("hr.hr.departments", "read")
def get_departments():
    departments = DepartmentMaster.query.order_by(DepartmentMaster.display_order).all()
    result = [{
        "id": d.id,
        "department_code": d.department_code,
        "department_name": d.department_name,
        "description": d.description,
        "display_order": d.display_order,
        "status": d.status
    } for d in departments]
    return jsonify(result), 200

@bp.route('/departments', methods=['POST'])
@permission_required("hr.hr.departments", "write")
def create_department():
    data = request.json
    if not data or not data.get('department_code') or not data.get('department_name'):
        return jsonify({"error": "Department code and name are required"}), 400
        
    if DepartmentMaster.query.filter_by(department_code=data['department_code']).first():
        return jsonify({"error": "Department code already exists"}), 400
        
    dept = DepartmentMaster(
        department_code=data['department_code'],
        department_name=data['department_name'],
        description=data.get('description'),
        display_order=data.get('display_order', 0),
        status=data.get('status', 'ACTIVE')
    )
    db.session.add(dept)
    db.session.commit()
    return jsonify({"message": "Department created successfully", "id": dept.id}), 201

# ==========================================
# DESIGNATION ROUTES
# ==========================================
@bp.route('/designations', methods=['GET'])
@permission_required("hr.hr.designations", "read")
def get_designations():
    designations = DesignationMaster.query.order_by(DesignationMaster.display_order).all()
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
@permission_required("hr.hr.designations", "write")
def create_designation():
    data = request.json
    if not data or not data.get('designation_code') or not data.get('designation_name') or not data.get('department_id'):
        return jsonify({"error": "Designation code, name, and department_id are required"}), 400
        
    if DesignationMaster.query.filter_by(designation_code=data['designation_code']).first():
        return jsonify({"error": "Designation code already exists"}), 400
        
    desig = DesignationMaster(
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
@permission_required("hr.hr.shifts", "read")
def get_shifts():
    shifts = ShiftMaster.query.all()
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
@permission_required("hr.hr.shifts", "write")
def create_shift():
    data = request.json
    if not data or not data.get('shift_code') or not data.get('shift_name') or not data.get('start_time') or not data.get('end_time'):
        return jsonify({"error": "Shift code, name, start time, and end time are required"}), 400
        
    if ShiftMaster.query.filter_by(shift_code=data['shift_code']).first():
        return jsonify({"error": "Shift code already exists"}), 400
        
    shift = ShiftMaster(
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
# STAFF ROUTES
# ==========================================
@bp.route('/staff', methods=['GET'])
@permission_required("hr.hr.staff-master", "read")
def get_staff():
    staff = StaffMaster.query.all()
    result = [{
        "id": s.id,
        "employee_code": s.employee_code,
        "first_name": s.first_name,
        "last_name": s.last_name,
        "display_name": s.display_name,
        "department_name": s.department.department_name if s.department else None,
        "designation_name": s.designation.designation_name if s.designation else None,
        "employment_type": s.employment_type,
        "employment_status": s.employment_status,
        "mobile": s.mobile,
        "email": s.email
    } for s in staff]
    return jsonify(result), 200

@bp.route('/staff', methods=['POST'])
@permission_required("hr.hr.staff-master", "write")
def create_staff():
    data = request.json
    if not data or not data.get('first_name') or not data.get('joining_date') or not data.get('employment_type'):
        return jsonify({"error": "First name, joining date, and employment type are required"}), 400

    # Auto generate employee code if not provided
    employee_code = data.get('employee_code')
    if not employee_code:
        last_staff = StaffMaster.query.order_by(StaffMaster.id.desc()).first()
        next_id = (last_staff.id + 1) if last_staff else 1
        employee_code = f"MS{next_id:05d}"
    
    first_name = data['first_name']
    last_name = data.get('last_name', '')
    display_name = data.get('display_name', f"{first_name} {last_name}".strip())

    staff = StaffMaster(
        employee_code=employee_code,
        first_name=first_name,
        middle_name=data.get('middle_name'),
        last_name=last_name,
        display_name=display_name,
        gender=data.get('gender', 'OTHER'),
        date_of_birth=data.get('date_of_birth'),
        joining_date=data['joining_date'],
        employment_type=data['employment_type'],
        employment_status=data.get('employment_status', 'ACTIVE'),
        email=data.get('email'),
        mobile=data.get('mobile'),
        address=data.get('address'),
        city=data.get('city'),
        state=data.get('state'),
        country=data.get('country'),
        pincode=data.get('pincode'),
        confirmation_date=data.get('confirmation_date') or None,
        relieving_date=data.get('relieving_date') or None,
        branch_id=data.get('branch_id'),
        department_id=data.get('department_id'),
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
    db.session.flush() # flush to get staff.id
    
    # Auto Create Login flow
    if data.get('create_login') and data.get('role_id'):
        role = Role.query.get(data['role_id'])
        if not role:
            db.session.rollback()
            return jsonify({"error": "Invalid role_id selected for login creation"}), 400
            
        username = employee_code
        password = "Welcome@123" # Default password
        
        if User.query.filter_by(username=username).first():
            db.session.rollback()
            return jsonify({"error": f"Username {username} already exists"}), 400
            
        user = User(
            username=username,
            password=hash_user_password(password),
            role=role.name,
            role_id=role.id,
            staff_id=staff.id,
            branch_id=staff.branch_id,
            useremail=staff.email,
            is_active=True
        )
        db.session.add(user)
        
    db.session.commit()
    
    response_data = {
        "message": "Staff created successfully",
        "staff_id": staff.id,
        "employee_code": employee_code
    }
    
    if data.get('create_login'):
        response_data["login_created"] = True
        response_data["username"] = employee_code
        response_data["password"] = "Welcome@123"
        
    return jsonify(response_data), 201
