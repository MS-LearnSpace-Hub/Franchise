from flask import Blueprint, jsonify, request
from extensions import db
from models import Student, Attendance
from helpers import token_required, require_academic_year, get_user_allowed_branches
from datetime import datetime

bp = Blueprint('sms_routes', __name__)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SWAP THIS ONE FUNCTION when going to production
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _send_sms(phone: str, message: str) -> dict:
    """
    SMSCountry provider — uses Basic Auth.
    Reads SMS_USERNAME, SMS_PASSWORD, SMS_SENDER from .env
    """
    import os, requests
    username = os.environ.get("SMS_AUTH_KEY", "")
    password = os.environ.get("SMS_AUTH_TOKEN", "")
    sender   = os.environ.get("SMS_SENDER_ID", "SCHOOL")

    if not username or not password:
        print("[SMS ERROR] SMS_USERNAME or SMS_PASSWORD not set in .env")
        return {"ok": False, "reason": "credentials not configured"}

    # SMSCountry expects 91XXXXXXXXXX format for India
    phone_with_code = f"91{phone}"

    payload = {
        "Text":               message,
        "Number":             phone_with_code,
        "SenderId":           sender,
        "DRNotifyUrl":        "https://www.domainname.com/notifyurl",
        "DRNotifyHttpMethod": "POST",
        "Tool":               "API"
    }

    try:
        print(f"[SMS] Sending to {phone_with_code} via SMSCountry...")
        r = requests.post(
            "https://restapi.smscountry.com/v0.1/Accounts/{}/SMSes/".format(username),
            json=payload,
            auth=(username, password),
            timeout=10
        )
        print(f"[SMS] Response: {r.status_code} — {r.text}")

        if r.status_code in (200, 201, 202):
            return {"ok": True, "reason": "sent"}
        else:
            return {"ok": False, "reason": r.text}

    except Exception as e:
        print(f"[SMS ERROR] {e}")
        return {"ok": False, "reason": str(e)}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _build_message(student_name: str, date_str: str) -> str:
    # Format date as "2-jun" style to match DLT template
    from datetime import datetime
    try:
        d = datetime.strptime(date_str, "%d %b %Y")
        formatted = f"{d.day}-{d.strftime('%b').lower()}-{d.year}"
    except:
        formatted = date_str
    return f"Dear parent ur ward is absent today {formatted}, send her regularly to college PRIN, MSDC.Asif Nagar-MS Educational and Welfare Trust."


def _log_sms(sms_type: str, phone: str, message: str, status: str,
             student_id=None, reason=None, sent_by=None,
             school_id=None, branch_id=None):
    try:
        from models import SmsLog
        log = SmsLog(
            sms_type   = sms_type,
            phone      = phone,
            message    = message,
            status     = status,
            reason     = reason,
            student_id = student_id,
            sent_at    = datetime.utcnow(),
            sent_by    = sent_by,
            school_id  = school_id,
            branch_id  = branch_id,
        )
        db.session.add(log)
    except Exception as e:
        print(f"[SMS LOG ERROR] {e}")


@bp.route("/api/attendance/send-sms", methods=["POST"])
@token_required
def send_absent_sms(current_user):
    try:
        from flask import g
        data = request.json or {}
        date_str    = data.get("date")
        student_ids = data.get("student_ids", [])

        if not date_str or not student_ids:
            return jsonify({"error": "date and student_ids are required"}), 400

        h_year, err, code = require_academic_year()
        if err: return err, code

        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()

        confirmed_absent = {
            r.student_id for r in
            Attendance.query.filter(
                Attendance.student_id.in_(student_ids),
                Attendance.date == target_date,
                Attendance.status == "Absent"
            ).all()
        }

        students = Student.query.filter(Student.student_id.in_(confirmed_absent)).all()

        allowed = get_user_allowed_branches(current_user)
        if not allowed["is_unlimited"]:
            students = [s for s in students if s.branch in allowed["names"]]

        sent, failed, skipped = 0, 0, 0
        results = []
        school_id = getattr(g, 'school_id', None)
        branch_id = getattr(g, 'branch_id', None)
        sent_by   = getattr(g, 'user_id',   None)

        for s in students:
            raw_phone = s.FatherPhone or ""
            phone = str(raw_phone).strip().replace(" ", "").replace("+91", "").lstrip("0")

            if len(phone) != 10 or not phone.isdigit():
                skipped += 1
                _log_sms("ATTENDANCE", phone or raw_phone, "", "skipped",
                         student_id=s.student_id, reason="No valid phone number",
                         sent_by=sent_by, school_id=school_id,
                         branch_id=s.branch_id or branch_id)
                results.append({
                    "student_id": s.student_id,
                    "name": f"{s.first_name} {s.last_name}",
                    "status": "skipped",
                    "reason": "No valid phone number"
                })
                continue

            msg = _build_message(
                student_name=f"{s.first_name} {s.last_name}",
                date_str=target_date.strftime("%d %b %Y")
            )

            result = _send_sms(phone, msg)
            status = "sent" if result["ok"] else "failed"
            _log_sms("ATTENDANCE", phone, msg, status,
                     student_id=s.student_id,
                     reason=None if result["ok"] else result.get("reason"),
                     sent_by=sent_by, school_id=school_id,
                     branch_id=s.branch_id or branch_id)

            if result["ok"]:
                sent += 1
                results.append({
                    "student_id": s.student_id,
                    "name": f"{s.first_name} {s.last_name}",
                    "status": "sent",
                    "phone": f"XXXXXX{phone[-4:]}"
                })
            else:
                failed += 1
                results.append({
                    "student_id": s.student_id,
                    "name": f"{s.first_name} {s.last_name}",
                    "status": "failed",
                    "reason": result.get("reason", "")
                })

        db.session.commit()
        return jsonify({
            "message": f"Done. Sent: {sent}, Failed: {failed}, Skipped: {skipped}",
            "sent": sent, "failed": failed, "skipped": skipped,
            "results": results
        }), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    
@bp.route("/api/sms/send-fee-receipt", methods=["POST"])
@token_required
def send_fee_receipt_sms(current_user):
    """
    Send fee receipt SMS after payment collection.
    Body: {
        "phone": "9390769913",
        "paid_amount": 1000,
        "total_amount": 2080,
        "admission_no": "vocJC0001",
        "balance": 1080,
        "branch_name": "Main Branch"
    }
    """
    try:
        import os, requests
        data       = request.json or {}
        phone_raw  = data.get("phone", "")
        paid       = data.get("paid_amount", 0)
        total      = data.get("total_amount", 0)
        adm_no     = data.get("admission_no", "")
        balance    = data.get("balance", 0)
        branch     = data.get("branch_name", "School")

        if not phone_raw:
            return jsonify({"error": "phone is required"}), 400

        # Sanitise phone
        phone = str(phone_raw).strip().replace(" ", "").replace("+91", "").lstrip("0")
        if len(phone) != 10 or not phone.isdigit():
            return jsonify({"error": f"Invalid phone number: {phone_raw}"}), 400

        phone_with_code = f"91{phone}"

        # Build message matching your DLT template exactly
        message = (
            f"We have received an amount of Rs.{paid} towards fees against "
            f"Term {total} on GR No {adm_no} .In case of any variance "
            f"{balance} discrepancies please contact {branch}"
        )

        username    = os.environ.get("SMS_AUTH_KEY", "")
        password    = os.environ.get("SMS_AUTH_TOKEN", "")
        sender      = os.environ.get("SMS_FEE_SENDER_ID", os.environ.get("SMS_SENDER_ID", "SCHOOL"))
        template_id = os.environ.get("SMS_FEE_TEMPLATE_ID", "")

        student_id = data.get("student_id")

        if not username or not password:
            return jsonify({"error": "SMS credentials not configured"}), 500

        payload = {
            "Text":       message,
            "Number":     phone_with_code,
            "SenderId":   sender,
            "Route":      os.environ.get("SMS_ROUTE", "Trans"),
            "Tool":       "API",
            "TemplateId": template_id
        }

        from flask import g
        school_id  = getattr(g, 'school_id', None)
        branch_id  = getattr(g, 'branch_id', None)
        sent_by    = getattr(g, 'user_id',   None)
        student_id = data.get("student_id")

        print(f"[FEE SMS] Sending to {phone_with_code}...")
        r = requests.post(
            f"https://restapi.smscountry.com/v0.1/Accounts/{username}/SMSes/",
            json=payload,
            auth=(username, password),
            timeout=10
        )
        print(f"[FEE SMS] Response: {r.status_code} — {r.text}")

        status = "sent" if r.status_code in (200, 201, 202) else "failed"
        _log_sms("FEE_RECEIPT", phone, message, status,
                 student_id=student_id,
                 reason=None if status == "sent" else r.text,
                 sent_by=sent_by, school_id=school_id, branch_id=branch_id)
        db.session.commit()

        if status == "sent":
            return jsonify({"ok": True, "message": "SMS sent"}), 200
        else:
            return jsonify({"ok": False, "message": r.text}), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500
@bp.route("/api/sms/send-fee-due", methods=["POST"])
@token_required
def send_fee_due_sms(current_user):
    import os
    import requests as req_lib
    try:
        from flask import g
        from models import StudentFee
        from sqlalchemy import func

        data        = request.json or {}
        student_ids = data.get("student_ids", [])
        cutoff_str  = data.get("cutoff_date")  # optional: only sum overdue-as-of-cutoff

        if not student_ids:
            return jsonify({"error": "student_ids are required"}), 400

        h_year, err, code = require_academic_year()
        if err: return err, code

        base_query = db.session.query(
            Student,
            func.sum(StudentFee.due_amount).label("total_due"),
        ).join(StudentFee).filter(
            Student.student_id.in_(student_ids),
            StudentFee.academic_year == h_year,
            StudentFee.is_active == True,
            StudentFee.due_amount > 0
        )

        if cutoff_str:
            cutoff_date = datetime.strptime(cutoff_str, "%Y-%m-%d").date()
            base_query = base_query.filter(
                StudentFee.due_date != None,
                StudentFee.due_date <= cutoff_date
            )

        rows = base_query.group_by(Student.student_id).all()

        allowed = get_user_allowed_branches(current_user)
        if not allowed["is_unlimited"]:
            rows = [r for r in rows if r[0].branch in allowed["names"]]

        username    = os.environ.get("SMS_AUTH_KEY", "")
        password    = os.environ.get("SMS_AUTH_TOKEN", "")
        sender      = os.environ.get("SMS_SENDER_ID", "SCHOOL")
        template_id = os.environ.get("SMS_DUE_TEMPLATE_ID", "")

        school_id = getattr(g, 'school_id', None)
        branch_id = getattr(g, 'branch_id', None)
        sent_by   = getattr(g, 'user_id',   None)

        sent, failed, skipped = 0, 0, 0
        results = []

        for s, due in rows:
            raw_phone = s.FatherPhone or ""
            phone = str(raw_phone).strip().replace(" ", "").replace("+91", "").lstrip("0")

            if len(phone) != 10 or not phone.isdigit():
                skipped += 1
                _log_sms("FEE_DUE", phone or str(raw_phone), "", "skipped",
                         student_id=s.student_id, reason="No valid phone number",
                         sent_by=sent_by, school_id=school_id,
                         branch_id=s.branch_id or branch_id)
                results.append({
                    "student_id": s.student_id,
                    "name": f"{s.first_name} {s.last_name}",
                    "status": "skipped",
                    "reason": "No valid phone number"
                })
                continue

            phone_with_code = f"91{phone}"
            message = (
                "Dear Parent, Kindly clear the fee dues as soon as possible. "
                "If the fees is cleared kindly ignore. MSDC Asif Nagar. "
                "MS Educational and Welfare Trust."
            )

            payload = {
                "Text":               message,
                "Number":             phone_with_code,
                "SenderId":           sender,
                "DRNotifyUrl":        "https://www.domainname.com/notifyurl",
                "DRNotifyHttpMethod": "POST",
                "Tool":               "API",
                "TemplateId":         template_id
            }

            try:
                r = req_lib.post(
                    f"https://restapi.smscountry.com/v0.1/Accounts/{username}/SMSes/",
                    json=payload,
                    auth=(username, password),
                    timeout=10
                )
                print(f"[FEE DUE SMS] {phone_with_code} → {r.status_code} {r.text}")
                sms_status = "sent" if r.status_code in (200, 201, 202) else "failed"
                _log_sms("FEE_DUE", phone, message, sms_status,
                         student_id=s.student_id,
                         reason=None if sms_status == "sent" else r.text,
                         sent_by=sent_by, school_id=school_id,
                         branch_id=s.branch_id or branch_id)
                if sms_status == "sent":
                    sent += 1
                    results.append({
                        "student_id": s.student_id,
                        "name": f"{s.first_name} {s.last_name}",
                        "status": "sent",
                        "phone": f"XXXXXX{phone[-4:]}"
                    })
                else:
                    failed += 1
                    results.append({
                        "student_id": s.student_id,
                        "name": f"{s.first_name} {s.last_name}",
                        "status": "failed",
                        "reason": r.text
                    })
            except Exception as e:
                failed += 1
                _log_sms("FEE_DUE", phone, message, "failed",
                         student_id=s.student_id, reason=str(e),
                         sent_by=sent_by, school_id=school_id,
                         branch_id=s.branch_id or branch_id)
                results.append({
                    "student_id": s.student_id,
                    "name": f"{s.first_name} {s.last_name}",
                    "status": "failed",
                    "reason": str(e)
                })

        db.session.commit()
        return jsonify({
            "message": f"Done. Sent: {sent}, Failed: {failed}, Skipped: {skipped}",
            "sent": sent, "failed": failed, "skipped": skipped,
            "results": results
        }), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/sms/reports", methods=["GET"])
@token_required
def sms_reports(current_user):
    try:
        from flask import g
        from models import SmsLog
        from sqlalchemy import func, case

        from_date_str = request.args.get("from_date")
        to_date_str   = request.args.get("to_date")
        sms_type      = request.args.get("sms_type", "")
        status_filter = request.args.get("status", "")
        page          = int(request.args.get("page", 1))
        per_page      = min(int(request.args.get("per_page", 50)), 200)

        if not from_date_str or not to_date_str:
            return jsonify({"error": "from_date and to_date are required"}), 400

        from_dt = datetime.strptime(from_date_str, "%Y-%m-%d")
        to_dt   = datetime.strptime(to_date_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59)

        q = db.session.query(SmsLog).filter(
            SmsLog.sent_at >= from_dt,
            SmsLog.sent_at <= to_dt
        )

        from helpers import get_effective_role_name
        role  = get_effective_role_name(current_user)
        s_id  = getattr(g, 'school_id', None)
        b_id  = getattr(g, 'branch_id', None)

        # Explicit branch/school filter from query param takes priority over g context
        filter_branch_id = request.args.get("branch_id", "").strip()
        filter_school_id = request.args.get("school_id", "").strip()

        # Resolve effective branch: explicit param > g context
        effective_branch_id = int(filter_branch_id) if filter_branch_id else b_id
        effective_school_id = int(filter_school_id) if filter_school_id else s_id

        allowed_b = get_user_allowed_branches(current_user)
        if not allowed_b['is_unlimited']:
            q = q.filter(SmsLog.branch_id.in_(allowed_b['ids']))

        if effective_branch_id:
            q = q.filter(SmsLog.branch_id == effective_branch_id)
        if effective_school_id:
            q = q.filter(SmsLog.school_id == effective_school_id)

        if sms_type:
            q = q.filter(SmsLog.sms_type == sms_type)
        if status_filter:
            q = q.filter(SmsLog.status == status_filter)

        # Summary stats per type
        stats_q = db.session.query(
            SmsLog.sms_type,
            func.count().label("total"),
            func.sum(case((SmsLog.status == "sent",    1), else_=0)).label("sent"),
            func.sum(case((SmsLog.status == "failed",  1), else_=0)).label("failed"),
            func.sum(case((SmsLog.status == "skipped", 1), else_=0)).label("skipped"),
        ).filter(SmsLog.sent_at >= from_dt, SmsLog.sent_at <= to_dt)

        if not allowed_b['is_unlimited']:
            stats_q = stats_q.filter(SmsLog.branch_id.in_(allowed_b['ids']))
            if s_id:
                stats_q = stats_q.filter((SmsLog.school_id == s_id) | (SmsLog.school_id.is_(None)))
            if b_id:
                stats_q = stats_q.filter((SmsLog.branch_id == b_id) | (SmsLog.branch_id.is_(None)))
        if effective_branch_id:
            stats_q = stats_q.filter(SmsLog.branch_id == effective_branch_id)
        if effective_school_id:
            stats_q = stats_q.filter(SmsLog.school_id == effective_school_id)
        if sms_type:
            stats_q = stats_q.filter(SmsLog.sms_type == sms_type)

        stats_rows = stats_q.group_by(SmsLog.sms_type).all()
        summary = {
            r.sms_type: {
                "total": r.total, "sent": r.sent or 0,
                "failed": r.failed or 0, "skipped": r.skipped or 0,
            }
            for r in stats_rows
        }

        grand_total = sum(v["total"]   for v in summary.values())
        grand_sent  = sum(v["sent"]    for v in summary.values())
        grand_fail  = sum(v["failed"]  for v in summary.values())
        grand_skip  = sum(v["skipped"] for v in summary.values())

        # Daily breakdown for chart
        daily_q = db.session.query(
            func.date(SmsLog.sent_at).label("day"),
            func.count().label("total"),
            func.sum(case((SmsLog.status == "sent", 1), else_=0)).label("sent"),
        ).filter(SmsLog.sent_at >= from_dt, SmsLog.sent_at <= to_dt)

        if not allowed_b['is_unlimited']:
            daily_q = daily_q.filter(SmsLog.branch_id.in_(allowed_b['ids']))
            if s_id:
                daily_q = daily_q.filter((SmsLog.school_id == s_id) | (SmsLog.school_id.is_(None)))
            if b_id:
                daily_q = daily_q.filter((SmsLog.branch_id == b_id) | (SmsLog.branch_id.is_(None)))
        if effective_branch_id:
            daily_q = daily_q.filter(SmsLog.branch_id == effective_branch_id)
        if effective_school_id:
            daily_q = daily_q.filter(SmsLog.school_id == effective_school_id)
        if sms_type:
            daily_q = daily_q.filter(SmsLog.sms_type == sms_type)

        daily_rows = daily_q.group_by(func.date(SmsLog.sent_at)).order_by("day").all()
        daily = [{"day": str(r.day), "total": r.total, "sent": r.sent or 0} for r in daily_rows]

        # Paginated detail
        total_records = q.count()
        records = (
            q.order_by(SmsLog.sent_at.desc())
             .offset((page - 1) * per_page)
             .limit(per_page)
             .all()
        )

        from models import Branch
        branch_map = {b.id: b.branch_name for b in Branch.query.all()}

        rows = []
        for rec in records:
            s_name = ""
            if rec.student:
                s_name = f"{rec.student.first_name or ''} {rec.student.last_name or ''}".strip()
            rows.append({
                "id":           rec.id,
                "sms_type":     rec.sms_type,
                "phone":        f"XXXXXX{rec.phone[-4:]}" if rec.phone and len(rec.phone) >= 4 else rec.phone,
                "status":       rec.status,
                "reason":       rec.reason,
                "sent_at":      rec.sent_at.strftime("%Y-%m-%d %H:%M") if rec.sent_at else "",
                "student_id":   rec.student_id,
                "student_name": s_name,
                "school_id":    rec.school_id,
                "branch_id":    rec.branch_id,
                "branch_name":  branch_map.get(rec.branch_id, "—"),
            })

        return jsonify({
            "summary":       summary,
            "grand": {
                "total":         grand_total,
                "sent":          grand_sent,
                "failed":        grand_fail,
                "skipped":       grand_skip,
                "delivery_rate": round((grand_sent / grand_total * 100) if grand_total else 0, 1)
            },
            "daily":         daily,
            "records":       rows,
            "total_records": total_records,
            "page":          page,
            "per_page":      per_page,
            "total_pages":   (total_records + per_page - 1) // per_page,
        }), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    
    