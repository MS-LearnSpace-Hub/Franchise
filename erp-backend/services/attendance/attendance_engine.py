from models import db, AttendanceStaging, AttendanceHead, StaffMaster
from datetime import datetime
from services.attendance.attendance_rules import calculate_attendance_status, calculate_working_minutes

def process_staging_records():
    """
    Reads PENDING or RETRY records from AttendanceStaging and processes them into AttendanceHead.
    """
    records = AttendanceStaging.query.filter(AttendanceStaging.status.in_(['PENDING', 'RETRY'])).all()
    processed_count = 0
    failed_count = 0
    
    # Since the staging data is already aggregated by date and employee, we can process them directly
    for p in records:
        try:
            # 1. Map employee_id to staff_id
            staff = StaffMaster.query.filter_by(staff_code=p.employee_id).first()
            
            # If standard staff_code fails, try biometric_id
            if not staff:
                staff = StaffMaster.query.filter_by(biometric_id=p.employee_id).first()
                
            if not staff:
                p.status = 'FAILED'
                p.error_message = f"Staff not found for code: {p.employee_id}"
                failed_count += 1
                continue
                
            # 2. Extract First In and Last Out
            # Since these are Time objects, we need to combine them with attendance_date to pass to calculate_working_minutes
            first_in = None
            last_out = None
            if p.first_in:
                first_in = datetime.combine(p.attendance_date, p.first_in)
            if p.last_out:
                last_out = datetime.combine(p.attendance_date, p.last_out)
            
            # 3. Upsert AttendanceHead
            head = AttendanceHead.query.filter_by(
                staff_id=staff.id,
                attendance_date=p.attendance_date
            ).first()
            
            working_mins = calculate_working_minutes(first_in, last_out) if first_in else 0
            status = calculate_attendance_status(first_in, last_out, staff.default_shift) if first_in else 'ABSENT'
            
            if not head:
                head = AttendanceHead(
                    staff_id=staff.id,
                    attendance_date=p.attendance_date,
                    first_in=first_in,
                    last_out=last_out if first_in != last_out else None,
                    source='PAYTIME',
                    attendance_status=status,
                    working_minutes=working_mins
                )
                db.session.add(head)
            else:
                if not head.attendance_locked:
                    # Merge with existing head times if any
                    all_times = []
                    if first_in: all_times.append(first_in)
                    if last_out: all_times.append(last_out)
                    if head.first_in: all_times.append(head.first_in)
                    if head.last_out: all_times.append(head.last_out)
                        
                    if all_times:
                        new_first_in = min(all_times)
                        new_last_out = max(all_times)
                        
                        head.first_in = new_first_in
                        head.last_out = new_last_out if new_first_in != new_last_out else None
                        head.source = 'PAYTIME'
                        head.attendance_status = calculate_attendance_status(new_first_in, new_last_out if new_first_in != new_last_out else None, staff.default_shift)
                        head.working_minutes = calculate_working_minutes(new_first_in, new_last_out if new_first_in != new_last_out else None)
            
            # 4. Mark staging as PROCESSED
            p.status = 'PROCESSED'
            p.processed_at = datetime.utcnow()
            p.error_message = None
            processed_count += 1
            
        except Exception as e:
            p.status = 'RETRY'
            p.error_message = str(e)
            failed_count += 1
            
    db.session.commit()
    return processed_count, failed_count
