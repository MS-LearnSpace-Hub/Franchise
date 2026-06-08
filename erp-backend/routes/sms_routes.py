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
        "Text":       message,
        "Number":     phone_with_code,
        "SenderId":   sender,
        "Route":      os.environ.get("SMS_ROUTE", "Trans"),
        "Tool":       "API",
        "TemplateId": os.environ.get("SMS_TEMPLATE_ID", "")
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
    return "Dear parent ur ward is absent today *, send her regularly to college PRIN, MSDC.Asif Nagar-MS Educational and Welfare Trust."


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
    
    