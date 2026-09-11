# pyrefly: ignore [missing-import]
from flask import Blueprint, jsonify, request
from extensions import db
from models import (
    AttendanceHead,
    AttendanceDetail,
    ShiftMaster,
    StaffMaster,
    Branch,
    School,
    DepartmentMaster,
    DesignationMaster
)
from helpers import (
    token_required,
    permission_required,
    scope_query,
    get_target_school_id,
    has_permission,
    get_effective_role_name
)
from services.attendance.attendance_engine import process_staging_records
from sqlalchemy.orm import joinedload

bp = Blueprint('staff_attendance_routes', __name__)

# ==========================================
# STAFF ATTENDANCE SUMMARY
# ==========================================
@bp.route('/api/attendance/staff/summary', methods=['GET'])
@token_required
def get_staff_attendance_summary(current_user):
    try:
        has_read_perm = has_permission(current_user, "hr.attendance.summary", "read")
        effective_role = get_effective_role_name(current_user)
        is_hr = has_read_perm and effective_role in ["SuperAdmin", "Admin", "HR", "Principal", "Management"]

        query = AttendanceHead.query.join(StaffMaster)
        query = scope_query(query, StaffMaster)
        
        # Eager load relationships to prevent N+1 query latency
        query = query.options(
            joinedload(AttendanceHead.staff).joinedload(StaffMaster.branch).joinedload(Branch.school),
            joinedload(AttendanceHead.staff).joinedload(StaffMaster.department),
            joinedload(AttendanceHead.staff).joinedload(StaffMaster.designation)
        )
        
        # Additional joins for filtering
        query = query.outerjoin(Branch, StaffMaster.branch_id == Branch.id) \
                     .outerjoin(School, Branch.school_id == School.id) \
                     .outerjoin(DepartmentMaster, StaffMaster.department_id == DepartmentMaster.id) \
                     .outerjoin(DesignationMaster, StaffMaster.designation_id == DesignationMaster.id)
        
        if is_hr:
            target_school_id = get_target_school_id(current_user)
            if target_school_id:
                query = query.filter(StaffMaster.school_id == target_school_id)
                
            # Filters from request
            branch_id = request.args.get('branch_id')
            if branch_id and branch_id.lower() != 'all':
                query = query.filter(StaffMaster.branch_id == int(branch_id))
                
            department_id = request.args.get('department_id')
            if department_id and department_id.lower() != 'all':
                query = query.filter(StaffMaster.department_id == int(department_id))
                
            employee = request.args.get('employee')
            if employee:
                query = query.filter(db.or_(
                    StaffMaster.display_name.ilike(f'%{employee}%'),
                    AttendanceHead.employee_id.ilike(f'%{employee}%'),
                    StaffMaster.staff_code.ilike(f'%{employee}%')
                ))
        else:
            query = query.filter(db.or_(
                StaffMaster.employee_id == current_user.username,
                StaffMaster.staff_code == current_user.username
            ))

        date_from = request.args.get('date_from')
        if date_from:
            query = query.filter(AttendanceHead.attendance_date >= date_from)
            
        date_to = request.args.get('date_to')
        if date_to:
            query = query.filter(AttendanceHead.attendance_date <= date_to)
            
        status = request.args.get('status')
        if status and status.lower() != 'all':
            query = query.filter(AttendanceHead.attendance_status == status)

        # If doing a month-wide query, retrieve all within range; otherwise cap at 200
        if date_from and date_to:
            records = query.order_by(AttendanceHead.attendance_date.desc()).all()
        else:
            records = query.order_by(AttendanceHead.attendance_date.desc()).limit(200).all()

        result = [{
            "id": r.id,
            "staff_id": r.staff_id,
            "employee_id": r.employee_id,
            "staff_name": r.staff.display_name if r.staff else None,
            "branch_name": r.staff.branch.branch_name if r.staff and r.staff.branch else None,
            "school_name": r.staff.branch.school.school_name if r.staff and r.staff.branch and r.staff.branch.school else None,
            "department": r.staff.department.department_name if r.staff and r.staff.department else None,
            "designation": r.staff.designation.designation_name if r.staff and r.staff.designation else None,
            "attendance_date": str(r.attendance_date),
            "first_in": str(r.first_in.strftime('%H:%M')) if r.first_in else None,
            "last_out": str(r.last_out.strftime('%H:%M')) if r.last_out else None,
            "working_minutes": r.working_minutes,
            "late_minutes": r.late_minutes,
            "attendance_status": r.attendance_status,
            "source": r.source,
            "payroll_locked": r.payroll_locked,
            "attendance_locked": r.attendance_locked,
            "payroll_processed": r.payroll_processed
        } for r in records]
        return jsonify(result), 200
    except Exception as e:
        print(f"Error fetching staff attendance: {e}")
        return jsonify({"error": str(e)}), 500


# ==========================================
# ATTENDANCE SYNC PROCESS
# ==========================================
@bp.route('/api/attendance/sync/process', methods=['POST'])
@token_required
@permission_required("hr.attendance.summary", "write")
def trigger_attendance_sync_process(current_user):
    try:
        processed_count, failed_count = process_staging_records()
        return jsonify({
            "message": "Staging data processed successfully",
            "processed_count": processed_count,
            "failed_count": failed_count
        }), 200
    except Exception as e:
        print(f"Error processing staging data: {e}")
        return jsonify({"error": str(e)}), 500


# ==========================================
# MANUAL STAFF ATTENDANCE
# ==========================================
@bp.route('/api/attendance/staff/manual', methods=['POST'])
@bp.route('/staff/manual', methods=['POST'])
@token_required
@permission_required("attendance.manual", "write")
def add_manual_staff_attendance(current_user):
    try:
        data = request.json
        if not data or not data.get('staff_id') or not data.get('attendance_date') or not data.get('status'):
            return jsonify({"error": "staff_id, attendance_date, and status are required"}), 400
            
        head = AttendanceHead.query.filter_by(
            staff_id=data['staff_id'], 
            attendance_date=data['attendance_date']
        ).first()
        
        if not head:
            head = AttendanceHead(
                staff_id=data['staff_id'],
                attendance_date=data['attendance_date'],
                generated_from='MANUAL'
            )
            db.session.add(head)
            
        if head.attendance_locked or head.payroll_processed:
            return jsonify({"error": "Attendance for this date is already locked or processed for payroll"}), 400
            
        head.attendance_status = data['status']
        head.remarks = data.get('remarks')
        
        if data.get('first_in'):
            head.first_in = data['first_in']
        if data.get('last_out'):
            head.last_out = data['last_out']
            
        db.session.commit()
        return jsonify({"message": "Manual attendance saved successfully", "id": head.id}), 200
    except Exception as e:
        print(f"Error saving manual staff attendance: {e}")
        return jsonify({"error": str(e)}), 500
