from models import db, AttendanceStaging, AttendanceHead, StaffMaster
from datetime import datetime
from services.attendance.attendance_rules import calculate_attendance_status, calculate_working_minutes

def process_staging_records():
    """
    Reads PENDING or RETRY records from AttendanceStaging and processes them into AttendanceHead.
    Optimized for high volume with in-memory map lookups and batched database writes.
    """
    records = AttendanceStaging.query.filter(AttendanceStaging.status.in_(['PENDING', 'RETRY'])).all()
    if not records:
        return 0, 0

    processed_count = 0
    failed_count = 0

    # 1. Preload all active staff into memory maps (indexed by staff_code and biometric_id)
    all_staff = StaffMaster.query.all()
    staff_by_code = {str(s.staff_code).strip(): s for s in all_staff if s.staff_code}
    staff_by_bio = {str(s.biometric_id).strip(): s for s in all_staff if s.biometric_id}

    # 2. Preload existing AttendanceHead records for the relevant dates into an in-memory map
    unique_dates = {p.attendance_date for p in records if p.attendance_date}
    existing_heads = AttendanceHead.query.filter(AttendanceHead.attendance_date.in_(unique_dates)).all() if unique_dates else []
    heads_map = {(h.staff_id, h.attendance_date): h for h in existing_heads}

    # Since the staging data is already aggregated by date and employee, process them directly in memory
    for i, p in enumerate(records):
        try:
            emp_key = str(p.employee_id).strip() if p.employee_id else ''
            staff = staff_by_code.get(emp_key) or staff_by_bio.get(emp_key)

            if not staff:
                p.status = 'FAILED'
                p.error_message = f"Staff not found for code: {p.employee_id}"
                failed_count += 1
                continue

            # Extract First In and Last Out
            first_in = None
            last_out = None
            if p.first_in:
                first_in = datetime.combine(p.attendance_date, p.first_in)
            if p.last_out:
                last_out = datetime.combine(p.attendance_date, p.last_out)

            # Upsert AttendanceHead from in-memory heads_map
            head = heads_map.get((staff.id, p.attendance_date))

            working_mins = calculate_working_minutes(first_in, last_out) if first_in else 0
            status = calculate_attendance_status(first_in, last_out, staff.default_shift) if first_in else 'ABSENT'

            if not head:
                head = AttendanceHead(
                    staff_id=staff.id,
                    employee_id=p.employee_id,
                    attendance_date=p.attendance_date,
                    first_in=first_in,
                    last_out=last_out if first_in != last_out else None,
                    source='PAYTIME',
                    attendance_status=status,
                    working_minutes=working_mins
                )
                db.session.add(head)
                heads_map[(staff.id, p.attendance_date)] = head
            else:
                if not head.attendance_locked:
                    all_times = []
                    if first_in: all_times.append(first_in)
                    if last_out: all_times.append(last_out)
                    if head.first_in: all_times.append(head.first_in)
                    if head.last_out: all_times.append(head.last_out)

                    if all_times:
                        head.first_in = min(all_times)
                        head.last_out = max(all_times) if min(all_times) != max(all_times) else None
                        head.source = 'PAYTIME'
                        head.attendance_status = calculate_attendance_status(head.first_in, head.last_out, staff.default_shift)
                        head.working_minutes = calculate_working_minutes(head.first_in, head.last_out)

                    if not head.employee_id:
                        head.employee_id = p.employee_id

            # Mark staging as PROCESSED
            p.status = 'PROCESSED'
            p.processed_at = datetime.utcnow()
            p.error_message = None
            processed_count += 1

        except Exception as e:
            p.status = 'RETRY'
            p.error_message = str(e)
            failed_count += 1

        # Periodic commit every 1000 records to keep memory and transaction log small
        if (i + 1) % 1000 == 0:
            db.session.commit()

    db.session.commit()
    return processed_count, failed_count
