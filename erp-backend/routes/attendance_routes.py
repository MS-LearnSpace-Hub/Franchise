# pyrefly: ignore [missing-import]
from flask import Blueprint, jsonify, request
from extensions import db, get_today, get_now, to_local_time
from models import Student, Attendance, Branch, UserBranchAccess, StudentAcademicRecord
from helpers import token_required, permission_required, require_academic_year, student_to_dict, get_default_location, ensure_student_editable, get_user_allowed_branches, StudentRecordLockedError, scope_query, get_target_school_id
from datetime import datetime, date
from sqlalchemy import or_
from routes.config_routes import is_weekoff_or_holiday
import traceback
bp = Blueprint('attendance_routes', __name__)

@bp.route("/api/attendance", methods=["GET"])
@token_required
def get_attendance(current_user):
    try:
        class_name = request.args.get("class")
        section = request.args.get("section")
        date_str = request.args.get("date")
        student_id = request.args.get("student_id")
        month_str = request.args.get("month")
        year_str = request.args.get("year")
        
        h_branch = request.headers.get("X-Branch")
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        # Base query joining Student and Academic Record
        # We need students who were in the requested class/section DURING the requested academic year
        q = db.session.query(Student, StudentAcademicRecord).join(
            StudentAcademicRecord, 
            Student.student_id == StudentAcademicRecord.student_id
        ).filter(
            StudentAcademicRecord.academic_year == h_year,
            Student.status == "Active"
        )
        
        # STRICT BRANCH SEGREGATION
        allowed = get_user_allowed_branches(current_user)
        req_branch = request.args.get("branch") or request.headers.get("X-Branch")
        if req_branch in ("All", "All Branches", "AllBranches", None):
            req_branch = None

        if not allowed['is_unlimited']:
            if req_branch and req_branch in allowed['names']:
                q = q.filter(Student.branch == req_branch)
            else:
                q = q.filter(Student.branch.in_(list(allowed['names'])))
        else:
            if req_branch:
                q = q.filter(Student.branch == req_branch)
        
        if class_name:
            q = q.filter(StudentAcademicRecord.class_name == class_name)
        if section:
            q = q.filter(StudentAcademicRecord.section == section)
        if student_id:
            q = q.filter(Student.student_id == student_id)
            
        # If no filters provided
        if not (class_name or student_id or date_str):
             return jsonify({"error": "Please provide Class, Student ID, or Date"}), 400
        
        results = q.all()
        
        # Extract students and build list
        students = []
        student_ids = []
        
        for s, record in results:
            s_dict = student_to_dict(s)
            # OVERRIDE with Historical Data for key fields
            s_dict['class'] = record.class_name
            s_dict['section'] = record.section
            s_dict['Roll_Number'] = record.roll_number
            s_dict['rollNo'] = record.roll_number # Frontend expects this often
            s_dict['is_locked'] = record.is_locked
            s_dict['is_promoted'] = record.is_promoted
            students.append(s_dict)
            student_ids.append(s.student_id)
            
        if not student_ids:
             return jsonify({"students": [], "attendance": {}}), 200
        
        attendance_data = {}
        
        if date_str:
            # Daily View (Specific Date)
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            records = Attendance.query.filter(
                Attendance.student_id.in_(student_ids),
                Attendance.date == target_date
            ).all()
            
            # Map student_id -> status
            for r in records:
                attendance_data[r.student_id] = r.status
                
        elif month_str and year_str:
            # Monthly View
            records = Attendance.query.filter(
                Attendance.student_id.in_(student_ids),
                db.extract('year', Attendance.date) == int(year_str),
                db.extract('month', Attendance.date) == int(month_str)
            ).all()
            
            # Map student_id -> { date: status }
            for r in records:
                if r.student_id not in attendance_data:
                    attendance_data[r.student_id] = {}
                attendance_data[r.student_id][r.date.isoformat()] = r.status
        
        # If student_id is provided, we might want all history if no date/month specified
        elif student_id:
             records = Attendance.query.filter(
                Attendance.student_id == student_id,
                Attendance.academic_year == h_year
            ).order_by(Attendance.date.desc()).all()
             
             if int(student_id) not in attendance_data:
                 attendance_data[int(student_id)] = {}
             for r in records:
                 attendance_data[int(student_id)][r.date.isoformat()] = r.status

        # Calculate stats for the response
        class_update_count = 0
        last_modified = None
        
        if date_str and 'records' in locals() and records:
             class_update_count = max((r.update_count for r in records if r.update_count is not None), default=0)
             last_mod_dt = max((to_local_time(r.updated_at) for r in records if r.updated_at is not None), default=None)
             last_modified = last_mod_dt.isoformat() if last_mod_dt else None

        return jsonify({
            "students": students, # Already converted and patched above
            "attendance": attendance_data,
            "class_update_count": class_update_count,
            "last_modified": last_modified
        }), 200
    except Exception as e:
        print(f"Get Attendance Error: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route("/api/attendance", methods=["POST"])
@token_required
def save_attendance(current_user):
    try:
        data = request.json
        attendance_list = data.get("attendance") or [] # List of {student_id, date, status}
        
        print(f"DEBUG: Save Attendance Bulk. Count={len(attendance_list)}")

        if not attendance_list:
             return jsonify({"message": "No data to save"}), 200

        # Header Filtering for context
        h_branch = request.headers.get("X-Branch") or "Main"
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        locked_students = set()
        for att in attendance_list:
            try:
                ensure_student_editable(att["student_id"], h_year)
            except Exception as e:
                locked_students.add(att["student_id"])
        
        # 1. Collect IDs and Dates for Bulk Fetch
        student_ids = set()
        dates = set()
        
        # Validation & Pre-processing
        valid_items = []
        skipped_count = 0
        skip_details = []

        for item in attendance_list:
            s_id = item.get("student_id")
            d_str = item.get("date")
            status = item.get("status")

            if not s_id or not d_str or not status:
                skipped_count += 1
                skip_details.append(f"Invalid Item: {item}")
                continue
            
            if s_id in locked_students:
                skipped_count += 1
                skip_details.append(f"Student {s_id} is locked/promoted")
                continue

            try:
                d_obj = datetime.strptime(d_str, '%Y-%m-%d').date()
                
                # Default dates for statistics
                now = get_now()
                today = now.date()
                if (d_obj.year > today.year) or (d_obj.year == today.year and d_obj.month > today.month):
                    skipped_count += 1
                    skip_details.append(f"Future month blocked: {d_str}")
                    continue

                valid_items.append({
                    "student_id": s_id,
                    "date": d_obj,
                    "status": status
                })
                student_ids.add(s_id)
                dates.add(d_obj)
            except ValueError:
                skipped_count += 1
                skip_details.append(f"Invalid Date Format: {d_str}")
        
        if not valid_items:
            return jsonify({
                "message": "No valid items to process",
                "skipped": skipped_count,
                 "details": skip_details
            }), 400

        # Enforce allowed branch boundaries
        allowed = get_user_allowed_branches(current_user)
        students = Student.query.filter(Student.student_id.in_(student_ids)).all()
        students_obj_map = {s.student_id: s for s in students}
        
        if not allowed['is_unlimited']:
            for s in students:
                if s.branch not in allowed['names']:
                    return jsonify({"error": f"Unauthorized to edit attendance for student {s.first_name} in branch {s.branch}"}), 403

        # 2. Bulk Fetch Existing Records
        existing_records = Attendance.query.filter(
            Attendance.student_id.in_(student_ids),
            Attendance.date.in_(dates)
        ).all()

        # Map existing: (student_id, date) -> record
        record_map = {(r.student_id, r.date): r for r in existing_records}

        added_count = 0
        updated_count = 0

        # Resolve branch to ID for weekoff/holiday check
        student_branch_map = {}
        branch_names = set([s.branch for s in students if s.branch])
        if branch_names:
            branches = Branch.query.filter(Branch.branch_name.in_(branch_names)).all()
            branch_name_to_id = {b.branch_name: b.id for b in branches}
            for s in students:
                if s.branch in branch_name_to_id:
                    student_branch_map[s.student_id] = branch_name_to_id[s.branch]

        # 3. Process Batch
        for item in valid_items:
            key = (item["student_id"], item["date"])
            status = item["status"]

            # 3a. Check weekoff / holiday
            s_branch_id = student_branch_map.get(item["student_id"])
            if s_branch_id:
                date_check = is_weekoff_or_holiday(item["date"], s_branch_id, h_year)
                if date_check["is_weekoff"] or date_check["is_holiday"]:
                    skipped_count += 1
                    skip_details.append(f"Date {item['date']} blocked: {date_check['reason']}")
                    continue

            s_obj = students_obj_map.get(item["student_id"])
            record_branch = s_obj.branch if s_obj and s_obj.branch else "Main"

            if key in record_map:
                # Update
                record = record_map[key]
                if record.status != status:
                    record.status = status
                    record.update_count = (record.update_count or 0) + 1
                    record.updated_at = get_now()
                    updated_count += 1
            else:
                # Insert
                new_record = Attendance(
                    student_id=item["student_id"],
                    date=item["date"],
                    status=status,
                    update_count=0,
                    updated_at=get_now(),
                    branch=record_branch,
                    academic_year=h_year,
                    location=current_user.location if current_user.location else get_default_location()
                )
                db.session.add(new_record)
                added_count += 1
        
        db.session.commit()
        print(f"Bulk Save Logic: Added={added_count}, Updated={updated_count}, Skipped={skipped_count}")
        
        return jsonify({
            "message": "Attendance saved successfully",
            "stats": {
                "added": added_count,
                "updated": updated_count,
                "skipped": skipped_count,
                "skip_details": skip_details[:5]
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"Save Attendance Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/attendance/template", methods=["GET"])
@token_required
def generate_template(current_user):
    try:
        import pandas as pd
        from io import BytesIO
        
        class_name = request.args.get("class")
        section = request.args.get("section")
        month = request.args.get("month")
        year = request.args.get("year")
        
        if not class_name or not month or not year:
             return jsonify({"error": "Class, month, and year are required"}), 400
        
        month = int(month)
        year = int(year)             
        # Reuse logic to fetch students
        req_branch = request.headers.get("X-Branch") or request.args.get("branch")
        if req_branch in ("All", "All Branches", "AllBranches", None):
            req_branch = None
            
        h_year, err, code = require_academic_year()
        if err: return err, code
        
        allowed = get_user_allowed_branches(current_user)

        q = db.session.query(Student, StudentAcademicRecord).join(
            StudentAcademicRecord, Student.student_id == StudentAcademicRecord.student_id
        ).filter(
            StudentAcademicRecord.academic_year == h_year,
            Student.status == "Active",
            StudentAcademicRecord.class_name == class_name
        )
        
        if section:
            q = q.filter(StudentAcademicRecord.section == section)
            
        # Branch Logic
        if not allowed['is_unlimited']:
            if req_branch and req_branch in allowed['names']:
                q = q.filter(Student.branch == req_branch)
            else:
                q = q.filter(Student.branch.in_(list(allowed['names'])))
        else:
            if req_branch:
                q = q.filter(Student.branch == req_branch)
        
        results = q.order_by(StudentAcademicRecord.roll_number).all()
        
        # Create Data Structure
        # Columns: Student ID, Name, Roll No, 1, 2, 3 ... 31
        data = []
        
        # Days in month
        import calendar
        num_days = calendar.monthrange(year, month)[1]
        day_columns = [str(d) for d in range(1, num_days + 1)]
        
        columns = ["Admission No", "Student Name", "Roll No"] + day_columns
        
        for s, rec in results:
             row = {
                 "Admission No": s.admission_no,
                 "Student Name": f"{s.first_name} {s.last_name}",
                 "Roll No": rec.roll_number or ""
             }
             # Init days as empty
             for d in day_columns:
                 row[d] = ""
             data.append(row)
             
        df = pd.DataFrame(data, columns=columns)
        
        # Output to Excel
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Attendance')
            
        output.seek(0)
        
        # pyrefly: ignore [missing-import]
        from flask import send_file
        filename = f"Attendance_Template_{class_name}_{month}_{year}.xlsx"
        return send_file(output, as_attachment=True, download_name=filename, mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

    except Exception as e:
        print(f"Template Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/attendance/upload", methods=["POST"])
@token_required
def upload_attendance(current_user):
    try:
        import pandas as pd
        
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
            
        file = request.files['file']
        year = request.form.get("year")
        month = request.form.get("month")
        
        if not year or not month:
             return jsonify({"error": "Month and Year context required"}), 400
             
        year = int(year)
        month = int(month)
        
        # Check for future month
        today = date.today()
        if (year > today.year) or (year == today.year and month > today.month):
            return jsonify({"error": "Attendance cannot be uploaded for future months"}), 400

        df = pd.read_excel(file)
        
        # Validate Columns
        if "Admission No" not in df.columns:
             return jsonify({"error": "Invalid Template: 'Admission No' column missing"}), 400
             
        # Transform to Attendance List for save_attendance logic
        attendance_list = []
        
        # Get Day Columns (1, 2, 3...) that exist in df
        day_cols = [c for c in df.columns if str(c).isdigit()]

        # 0. Pre-fetch Students by Admission No to map to IDs
        # We need a map: Admission No -> Student ID
        
        # Extract all admission numbers from file
        uploaded_adm_nos = df["Admission No"].dropna().astype(str).tolist()
        
        if not uploaded_adm_nos:
             return jsonify({"error": "No admission numbers found in file"}), 400

        # Fetch students matching these admission numbers
        # Implicitly filter by branch if needed, but admission_no should be unique anyway or we trust the file context
        # Better to filter by branch/active status if strict
        
        from models import Student
        students = Student.query.filter(Student.admission_no.in_(uploaded_adm_nos)).all()
        adm_map = {str(s.admission_no): s.student_id for s in students}
        
        for _, row in df.iterrows():
            adm_no = row["Admission No"]
            if pd.isna(adm_no): continue
            
            adm_no_str = str(adm_no)
            if adm_no_str not in adm_map:
                 # Student not found or not in allowed scope
                 continue
                 
            student_id = adm_map[adm_no_str]
            
            for day in day_cols:
                status = row[day] # P, A, H, etc.
                if pd.isna(status) or str(status).strip() == "": continue
                
                # Convert status code if needed (e.g. 'P' -> 'Present')
                # Assuming user types full status or we map properly
                status_str = str(status).strip().capitalize()
                
                # Map shorthand
                shorthand = {'P': 'Present', 'A': 'Absent'}
                if status_str in shorthand:
                    status_str = shorthand[status_str]
                
                date_obj = date(year, month, int(day))
                
                attendance_list.append({
                    "student_id": int(student_id),
                    "date": date_obj.isoformat(),
                    "status": status_str
                })
        
        if not attendance_list:
             return jsonify({"message": "No valid attendance data found in file"}), 200
             
        # reuse internal logic or mocking request for save_attendance is cleaner?
        # Let's call the logic directly to avoid route overhead/auth issues
        # But save_attendance relies on request.json. 
        # Easier to construct a fake request context or extract logic.
        # Extracted logic involves: Bulk Fetch -> Bulk Insert/Update.
        # Let's just do it here to save time refactoring.
        
        h_year, err, code = require_academic_year()
        if err: return err, code

        # 1. Collect IDs and Dates
        student_ids = set([x['student_id'] for x in attendance_list])

        # Validate student record editability
        try:
            for s_id in student_ids:
                ensure_student_editable(s_id, h_year)
        except StudentRecordLockedError as e:
            return jsonify({"error": str(e)}), 403
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        dates = set([datetime.strptime(x['date'], '%Y-%m-%d').date() for x in attendance_list])

        # Enforce allowed branch boundaries
        allowed = get_user_allowed_branches(current_user)
        students = Student.query.filter(Student.student_id.in_(student_ids)).all()
        students_obj_map = {s.student_id: s for s in students}
        
        if not allowed['is_unlimited']:
            for s in students:
                if s.branch not in allowed['names']:
                    return jsonify({"error": f"Unauthorized to edit attendance for student {s.first_name} in branch {s.branch}"}), 403
        
        # 2. Bulk Fetch
        existing_records = Attendance.query.filter(
            Attendance.student_id.in_(student_ids),
            Attendance.date.in_(dates)
        ).all()
        
        record_map = {(r.student_id, r.date): r for r in existing_records}
        
        added = 0
        updated = 0
        
        for item in attendance_list:
             d_obj = datetime.strptime(item['date'], '%Y-%m-%d').date()
             s_id = item['student_id']
             status = item['status']
             
             key = (s_id, d_obj)
             if key in record_map:
                 r = record_map[key]
                 if r.status != status:
                     r.status = status
                     r.update_count = (r.update_count or 0) + 1
                     updated += 1
             else:
                 s_obj = students_obj_map.get(s_id)
                 record_branch = s_obj.branch if s_obj and s_obj.branch else "Main"
                 new_r = Attendance(
                    student_id=s_id,
                    date=d_obj,
                    status=status,
                    branch=record_branch,
                    academic_year=h_year,
                    location=current_user.location or get_default_location()
                 )
                 db.session.add(new_r)
                 added += 1
        
        db.session.commit()
        return jsonify({"message": "Upload Successful", "added": added, "updated": updated}), 200
        
    except Exception as e:
        print(f"Upload Error: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

# ==========================================
# STAFF ATTENDANCE ROUTES
# ==========================================
from models import AttendanceHead, AttendanceDetail, ShiftMaster, StaffMaster, Branch, School, DepartmentMaster, DesignationMaster
from services.attendance.attendance_engine import process_staging_records

@bp.route('/api/attendance/staff/summary', methods=['GET'])
@token_required
def get_staff_attendance_summary(current_user):
    try:
        from helpers import has_permission
        is_hr = has_permission(current_user, "attendance.summary", "read")

        query = AttendanceHead.query.join(StaffMaster)
        query = scope_query(query, StaffMaster)
        
        # Additional joins for enrichment
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

        # If doing a month-wide query, don't limit strictly to 200
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

@bp.route('/api/attendance/sync/process', methods=['POST'])
@token_required
@permission_required("attendance.summary", "write")
def trigger_attendance_sync_process(current_user):
    try:
        # Trigger the engine to process any pending records in staging to head
        processed_count = process_staging_records()
        return jsonify({
            "message": "Staging data processed successfully",
            "processed_count": processed_count
        }), 200
    except Exception as e:
        print(f"Error processing staging data: {e}")
        return jsonify({"error": str(e)}), 500

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
