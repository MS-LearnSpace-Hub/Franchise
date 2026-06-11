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


@bp.route("/api/attendance/send-sms", methods=["POST"])
@token_required
def send_absent_sms(current_user):
    """
    Body: {
        "date": "2024-11-15",
        "student_ids": [1, 2, 3]   <- only the checked ones from frontend
    }
    """
    try:
        data = request.json or {}
        date_str    = data.get("date")
        student_ids = data.get("student_ids", [])

        if not date_str or not student_ids:
            return jsonify({"error": "date and student_ids are required"}), 400

        h_year, err, code = require_academic_year()
        if err: return err, code

        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()

        # Verify these are actually absent on that date (safety check)
        confirmed_absent = {
            r.student_id for r in
            Attendance.query.filter(
                Attendance.student_id.in_(student_ids),
                Attendance.date == target_date,
                Attendance.status == "Absent"
            ).all()
        }

        students = Student.query.filter(
            Student.student_id.in_(confirmed_absent)
        ).all()

        # Branch guard
        allowed = get_user_allowed_branches(current_user)
        if not allowed["is_unlimited"]:
            students = [s for s in students if s.branch in allowed["names"]]

        sent, failed, skipped = 0, 0, 0
        results = []

        for s in students:
            # Your Student model uses sms_no / father_mobile — adjust field names if different
            raw_phone = s.FatherPhone or ""
            phone = str(raw_phone).strip().replace(" ", "").replace("+91", "").lstrip("0")

            if len(phone) != 10 or not phone.isdigit():
                skipped += 1
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

        print(f"[FEE SMS] Sending to {phone_with_code}...")
        r = requests.post(
            f"https://restapi.smscountry.com/v0.1/Accounts/{username}/SMSes/",
            json=payload,
            auth=(username, password),
            timeout=10
        )
        print(f"[FEE SMS] Response: {r.status_code} — {r.text}")

        if r.status_code in (200, 201, 202):
            return jsonify({"ok": True, "message": "SMS sent"}), 200
        else:
            return jsonify({"ok": False, "message": r.text}), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500
@bp.route("/api/sms/send-fee-due", methods=["POST"])
@token_required
def send_fee_due_sms(current_user):
    try:
        import os, requests as req_lib
        data        = request.json or {}
        student_ids = data.get("student_ids", [])

        if not student_ids:
            return jsonify({"error": "student_ids are required"}), 400

        h_year, err, code = require_academic_year()
        if err: return err, code

        from models import StudentFee
        from sqlalchemy import func

        rows = db.session.query(
            Student,
            func.sum(StudentFee.due_amount).label("total_due"),
        ).join(StudentFee).filter(
            Student.student_id.in_(student_ids),
            StudentFee.academic_year == h_year,
            StudentFee.is_active == True
        ).group_by(Student.student_id).all()

        allowed = get_user_allowed_branches(current_user)
        if not allowed["is_unlimited"]:
            rows = [r for r in rows if r[0].branch in allowed["names"]]

        username = os.environ.get("SMS_AUTH_KEY", "")
        password = os.environ.get("SMS_AUTH_TOKEN", "")
        sender   = os.environ.get("SMS_SENDER_ID", "SCHOOL")
        template_id = os.environ.get("SMS_DUE_TEMPLATE_ID", "")

        sent, failed, skipped = 0, 0, 0
        results = []

        for s, due in rows:
            raw_phone = s.FatherPhone or ""
            phone = str(raw_phone).strip().replace(" ", "").replace("+91", "").lstrip("0")

            if len(phone) != 10 or not phone.isdigit():
                skipped += 1
                results.append({
                    "student_id": s.student_id,
                    "name": f"{s.first_name} {s.last_name}",
                    "status": "skipped",
                    "reason": "No valid phone number"
                })
                continue

            phone_with_code = f"91{phone}"
            message = "Dear Parent, Kindly clear the fee dues as soon as possible. If the fees is cleared kindly ignore. MSDC Asif Nagar. MS Educational and Welfare Trust."

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
                if r.status_code in (200, 201, 202):
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
                results.append({
                    "student_id": s.student_id,
                    "name": f"{s.first_name} {s.last_name}",
                    "status": "failed",
                    "reason": str(e)
                })

        return jsonify({
            "message": f"Done. Sent: {sent}, Failed: {failed}, Skipped: {skipped}",
            "sent": sent, "failed": failed, "skipped": skipped,
            "results": results
        }), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/sms/send-announcement", methods=["POST"])
@token_required
def send_announcement_sms(current_user):
    try:
        data        = request.json or {}
        student_ids = data.get("student_ids", [])
        message     = data.get("message", "").strip()

        if not student_ids or not message:
            return jsonify({"error": "student_ids and message are required"}), 400

        students = Student.query.filter(Student.student_id.in_(student_ids)).all()

        allowed = get_user_allowed_branches(current_user)
        if not allowed["is_unlimited"]:
            students = [s for s in students if s.branch in allowed["names"]]

        sent, failed, skipped = 0, 0, 0
        for s in students:
            raw = s.FatherPhone or ""
            phone = str(raw).strip().replace(" ", "").replace("+91", "").lstrip("0")
            if len(phone) != 10 or not phone.isdigit():
                skipped += 1
                continue
            ok = _send_sms(phone, message)
            if ok["ok"]: sent += 1
            else:        failed += 1

        return jsonify({"message": "Done", "sent": sent, "failed": failed, "skipped": skipped}), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/sms/send-custom", methods=["POST"])
@token_required
def send_custom_sms(current_user):
    try:
        data    = request.json or {}
        phones  = data.get("phones", [])
        message = data.get("message", "").strip()

        if not phones or not message:
            return jsonify({"error": "phones and message are required"}), 400

        sent, failed, skipped = 0, 0, 0
        for raw in phones:
            phone = str(raw).strip().replace(" ", "").replace("+91", "").lstrip("0")
            if len(phone) != 10 or not phone.isdigit():
                skipped += 1
                continue
            ok = _send_sms(phone, message)
            if ok["ok"]: sent += 1
            else:        failed += 1

        return jsonify({"message": "Done", "sent": sent, "failed": failed, "skipped": skipped}), 200

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    
    