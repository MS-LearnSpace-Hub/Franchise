from flask import Blueprint, jsonify, request, g
from functools import wraps
from datetime import datetime
import logging

from extensions import db
from models import Student, Attendance
from helpers import (token_required, permission_required, has_permission,
                     require_academic_year, get_user_allowed_branches, skip_scoping)
from routes.sms_template_routes import ApiError, _transactional, _bool
from services.sms_event_types import EVENT_TYPES

bp = Blueprint('sms_routes', __name__)
logger = logging.getLogger(__name__)

# ── Permission codes (single source of truth for this file) ──────────────
PERM_SMS_SEND    = "administration.sms.send-sms"
PERM_SMS_REPORTS = "administration.sms.reports"
PERM_TAKE_FEE    = "fees.fee.take-fee"

MAX_RECIPIENTS = 2000   # per send request
FIELD_MAX      = 500    # typed extra field length


def require_any_permission(*rules):
    """Allow the request if the user matches ANY (permission_code, action) pair."""
    def decorator(func):
        @wraps(func)
        def wrapper(current_user, *args, **kwargs):
            if any(has_permission(current_user, code, action) for code, action in rules):
                return func(current_user, *args, **kwargs)
            return jsonify({"error": "Forbidden: missing permission"}), 403
        return wrapper
    return decorator


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _ctx():
    return getattr(g, 'school_id', None), getattr(g, 'branch_id', None), getattr(g, 'user_id', None)


def _student_name(s):
    return " ".join(p for p in [s.first_name, s.last_name] if p)


def _fmt_amount(value):
    try:
        v = float(value or 0)
    except (TypeError, ValueError):
        return str(value)
    return str(int(v)) if v.is_integer() else f"{v:.2f}"


def _int_list(values):
    out = []
    for v in values or []:
        try:
            i = int(v)
        except (TypeError, ValueError):
            continue
        if i not in out:
            out.append(i)
    return out


def _result_row(student, res):
    row = {"student_id": student.student_id, "name": _student_name(student), "status": res["status"]}
    if res["status"] == "sent":
        row["phone"] = res["phone"]
    else:
        row["reason"] = res.get("reason") or ""
    return row


def _summary(results):
    sent    = sum(1 for r in results if r["status"] == "sent")
    failed  = sum(1 for r in results if r["status"] == "failed")
    skipped = sum(1 for r in results if r["status"] == "skipped")
    return {
        "message": f"Done. Sent: {sent}, Failed: {failed}, Skipped: {skipped}",
        "sent": sent, "failed": failed, "skipped": skipped, "results": results,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Send screen: which events can this branch send?
# ─────────────────────────────────────────────────────────────────────────────
@bp.route("/api/sms/send-options", methods=["GET"])
@token_required
@permission_required(PERM_SMS_SEND, "read")
@_transactional
def sms_send_options(current_user):
    from models import SmsEvent
    from routes.sms_account_routes import _resolve_scope
    from services.sms_service import SmsSender

    school_id, branch = _resolve_scope(current_user)
    if not branch:
        return jsonify({"branch": None, "account_ready": False,
                        "account_message": "Select a branch in the top bar to send SMS.",
                        "events": []}), 200

    sender = SmsSender()
    _, acc_reason = sender.account_for_branch(branch.id)

    with skip_scoping():
        events = SmsEvent.query.filter(
            SmsEvent.school_id == school_id,
            SmsEvent.is_active == True,
            (SmsEvent.target_branch_id.is_(None)) | (SmsEvent.target_branch_id == branch.id),
        ).order_by(SmsEvent.name).all()

    out = []
    for ev in events:
        t = EVENT_TYPES.get(ev.event_type)
        if not t or t["auto"]:          # fee receipt is automatic, not sent from this screen
            continue
        reasons = sender.readiness(ev, branch.id)
        out.append({
            "id": ev.id, "name": ev.name, "event_type": ev.event_type, "type_label": t["label"],
            "is_common": ev.target_branch_id is None,
            "custom_fields": ev.custom_fields or [],
            "ready": not reasons, "reasons": reasons,
        })

    return jsonify({
        "branch":          {"id": branch.id, "name": branch.branch_name},
        "account_ready":   acc_reason is None,
        "account_message": acc_reason or "SMS account is ready.",
        "events":          out,
    }), 200


# ─────────────────────────────────────────────────────────────────────────────
#  Send screen: preview or send one event to selected students
#  Body: { event_id, student_ids, date?, cutoff_date?, fields?, preview_only? }
# ─────────────────────────────────────────────────────────────────────────────
@bp.route("/api/sms/send", methods=["POST"])
@token_required
@permission_required(PERM_SMS_SEND, "write")
@_transactional
def sms_send(current_user):
    from routes.sms_account_routes import _resolve_scope
    from services.sms_service import SmsSender, format_sms_date

    data = request.json or {}
    school_id, branch = _resolve_scope(current_user)
    if not branch:
        raise ApiError("Select a branch in the top bar to send SMS.")

    _, _, user_id = _ctx()
    sender = SmsSender(sent_by=user_id)

    try:
        ev = sender.event(int(data.get("event_id") or 0))
    except (TypeError, ValueError):
        ev = None
    if not ev:
        raise ApiError("Please choose an event.")
    if EVENT_TYPES.get(ev.event_type, {}).get("auto"):
        raise ApiError("Fee receipt SMS is sent automatically after payment.")

    reasons = sender.readiness(ev, branch.id)
    if reasons:
        raise ApiError(" · ".join(reasons))

    student_ids = _int_list(data.get("student_ids"))
    if not student_ids:
        raise ApiError("Please select at least one student.")
    if len(student_ids) > MAX_RECIPIENTS:
        raise ApiError(f"Maximum {MAX_RECIPIENTS} students per send. Please send in smaller groups.")

    rows = []   # (student, extra_vars)

    if ev.event_type == "ABSENT":
        date_str = data.get("date")
        if not date_str:
            raise ApiError("Please choose the attendance date.")
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            raise ApiError("Invalid date.")
        absent_ids = {
            r.student_id for r in Attendance.query.filter(
                Attendance.student_id.in_(student_ids),
                Attendance.date == target_date,
                Attendance.status == "Absent",
            ).all()
        }
        extra = {"date": format_sms_date(target_date)}
        rows = [(s, extra) for s in Student.query.filter(Student.student_id.in_(absent_ids)).all()]

    elif ev.event_type == "FEE_DUE":
        from models import StudentFee
        from sqlalchemy import func

        h_year, err, code = require_academic_year()
        if err:
            return err, code

        q = db.session.query(Student, func.sum(StudentFee.due_amount).label("total_due")) \
            .join(StudentFee).filter(
                Student.student_id.in_(student_ids),
                StudentFee.academic_year == h_year,
                StudentFee.is_active == True,
                StudentFee.due_amount > 0,
            )
        cutoff_str = data.get("cutoff_date")
        if cutoff_str:
            try:
                cutoff = datetime.strptime(cutoff_str, "%Y-%m-%d").date()
            except ValueError:
                raise ApiError("Invalid cutoff date.")
            q = q.filter(StudentFee.due_date != None, StudentFee.due_date <= cutoff)
        cutoff_text = format_sms_date(cutoff_str) if cutoff_str else ""
        rows = [(s, {"due_amount": _fmt_amount(due), "cutoff_date": cutoff_text})
                for s, due in q.group_by(Student.student_id).all()]

    elif ev.event_type == "GENERAL":
        fields = data.get("fields") or {}
        extra = {}
        for f in (ev.custom_fields or []):
            value = str(fields.get(f) or "").strip()
            if not value:
                raise ApiError(f"Please fill in '{f}'.")
            if len(value) > FIELD_MAX:
                raise ApiError(f"'{f}' must be {FIELD_MAX} characters or less.")
            extra[f] = value
        rows = [(s, extra) for s in Student.query.filter(
            Student.student_id.in_(student_ids), Student.status == "Active").all()]

    else:
        raise ApiError("This event type can't be sent from this screen.")

    # Only students of the selected branch (and branches the user can access)
    allowed = get_user_allowed_branches(current_user)
    rows = [(s, x) for s, x in rows
            if sender.branch_id_of(s) == branch.id
            and (allowed["is_unlimited"] or branch.id in (allowed["ids"] or set()))]
    if not rows:
        raise ApiError("None of the selected students are eligible for this SMS in this branch.")

    if _bool(data.get("preview_only")):
        s, extra = rows[0]
        text, problem = sender.render_for_student(ev, s, extra)
        return jsonify({"recipients": len(rows), "preview": text,
                        "preview_student": _student_name(s), "problem": problem}), 200

    results = [_result_row(s, sender.send_to_student(ev, s, extra)) for s, extra in rows]
    db.session.commit()
    return jsonify(_summary(results)), 200


# ─────────────────────────────────────────────────────────────────────────────
#  Fee receipt — called automatically after fee collection.
#  Always returns 200 so it can NEVER disturb the payment.
# ─────────────────────────────────────────────────────────────────────────────
@bp.route("/api/sms/send-fee-receipt", methods=["POST"])
@token_required
@require_any_permission(
    (PERM_SMS_SEND, "write"),
    (PERM_TAKE_FEE, "write"),
    (PERM_TAKE_FEE, "append"),
)
def send_fee_receipt_sms(current_user):
    try:
        from services.sms_service import SmsSender

        data = request.json or {}
        _, branch_id, user_id = _ctx()
        sender = SmsSender(sent_by=user_id)

        student_id = data.get("student_id")
        student = Student.query.get(student_id) if student_id else None
        if student:
            branch_id = sender.branch_id_of(student) or branch_id
        if not branch_id:
            return jsonify({"ok": False, "message": "No branch for this payment; fee receipt SMS not sent."}), 200

        ev, reason = sender.fee_receipt_event(branch_id)
        if reason:                                     # switched off: nothing to send, nothing logged
            return jsonify({"ok": False, "message": reason}), 200

        extra = {
            "paid_amount":  _fmt_amount(data.get("paid_amount", 0)),
            "total_amount": _fmt_amount(data.get("total_amount", 0)),
            "balance":      _fmt_amount(data.get("balance", 0)),
        }
        if data.get("admission_no"):
            extra["admission_no"] = data.get("admission_no")

        if student:
            res = sender.send_to_student(ev, student, extra)
        else:
            b = sender.branch(branch_id)
            variables = {"school_name": sender.school_name(b.school_id) if b else "",
                         "branch_name": b.branch_name if b else ""}
            variables.update(extra)
            res = sender.send_to_phone(ev, branch_id, data.get("phone"), variables)

        db.session.commit()
        return jsonify({"ok": res["status"] == "sent",
                        "message": "SMS sent" if res["status"] == "sent" else (res.get("reason") or "SMS not sent")}), 200

    except Exception:
        db.session.rollback()
        logger.exception("Fee receipt SMS failed")
        return jsonify({"ok": False, "message": "Fee receipt SMS failed"}), 200
@bp.route("/api/sms/reports", methods=["GET"])
@token_required
@permission_required(PERM_SMS_REPORTS, "read")
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
        event_filter = request.args.get("event_id", type=int)
        if event_filter:
            q = q.filter(SmsLog.event_id == event_filter)

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

        from models import Branch, SmsEvent
        branch_map = {b.id: b.branch_name for b in Branch.query.all()}
        event_ids  = {r.event_id for r in records if r.event_id}
        with skip_scoping():
            event_map = ({e.id: e.name for e in SmsEvent.query.filter(SmsEvent.id.in_(event_ids)).all()}
                         if event_ids else {})

        rows = []
        for rec in records:
            s_name = ""
            if rec.student:
                s_name = f"{rec.student.first_name or ''} {rec.student.last_name or ''}".strip()
            rows.append({
                "id":           rec.id,
                "sms_type":     rec.sms_type,
                "event_name":   event_map.get(rec.event_id) or "—",
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
    
    