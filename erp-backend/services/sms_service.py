"""
SMS send engine.

Everything comes from what is set up on screen — NO .env, NO built-in text.
For each student:
    branch   → the student's branch
    account  → branch setting: SCHOOL / OWN / NONE (must be saved + active)
    event    → active; common or this branch's
    template → this branch's default, else the common default
    values   → student details + date/amount + typed fields
    provider → plug-in (PROVIDERS)
    log      → sms_logs (event_id, template_id, reason)
If anything is missing, the SMS is NOT sent and the reason is logged.

This module never commits: the caller must call db.session.commit().
"""
import re
import logging
from datetime import datetime, date

import requests

from extensions import db

logger = logging.getLogger(__name__)

REASON_MAX = 250   # sms_logs.reason is String(255)

# Which Student column to read for each recipient choice (first valid number wins)
RECIPIENT_FIELDS = {
    "FATHER":   ["FatherPhone", "SmsNo"],
    "MOTHER":   ["SecondaryPhone", "SmsNo", "FatherPhone"],
    "SMS_NO":   ["SmsNo", "FatherPhone"],
    "GUARDIAN": ["GuardianContactNo", "SmsNo", "FatherPhone"],
}

_VAR_RE = re.compile(r"\{(\w+)\}")


# ─────────────────────────────────────────────────────────────────────────────
#  Small helpers
# ─────────────────────────────────────────────────────────────────────────────
def normalize_phone(raw):
    """Return a 10-digit Indian mobile number, or None if invalid."""
    if raw is None:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if len(digits) == 10 else None


def mask_phone(phone):
    return f"XXXXXX{phone[-4:]}" if phone and len(phone) >= 4 else (phone or "")


def format_sms_date(value):
    """date / 'YYYY-MM-DD' -> '10-oct-2026'."""
    if isinstance(value, str):
        try:
            value = datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            return value
    if isinstance(value, (date, datetime)):
        return f"{value.day}-{value.strftime('%b').lower()}-{value.year}"
    return str(value or "")


def render_template(body, variables):
    """Fill {placeholders}. Returns (text, missing_variable_names)."""
    missing = []

    def _sub(match):
        key = match.group(1)
        val = variables.get(key)
        if val is None or str(val).strip() == "":
            missing.append(key)
            return ""
        return str(val)

    return _VAR_RE.sub(_sub, body or ""), missing


# ─────────────────────────────────────────────────────────────────────────────
#  Provider plug-ins. To add a provider: write a class with code, label, send()
#  and add it to PROVIDERS. Nothing else in the engine changes.
# ─────────────────────────────────────────────────────────────────────────────
class SmsCountryProvider:
    code                 = "SMSCOUNTRY"
    label                = "SMSCountry"
    key_label            = "Auth key / Account ID"
    token_label          = "Auth token"
    uses_route           = True
    requires_template_id = False
    URL                  = "https://restapi.smscountry.com/v0.1/Accounts/{account}/SMSes/"

    @classmethod
    def send(cls, account, phone, text, sender, dlt_template_id):
        """Return (ok, reason)."""
        payload = {
            "Text":     text,
            "Number":   f"91{phone}",
            "SenderId": sender,
            "Route":    account.get("route") or "Trans",
            "Tool":     "API",
        }
        if dlt_template_id:
            payload["TemplateId"] = dlt_template_id
        try:
            r = requests.post(
                cls.URL.format(account=account["auth_key"]),
                json=payload,
                auth=(account["auth_key"], account["auth_token"]),
                timeout=10,
            )
        except requests.RequestException as e:
            logger.warning("SMSCountry request error to %s: %s", mask_phone(phone), e)
            return False, str(e)[:REASON_MAX]
        if r.status_code in (200, 201, 202):
            return True, None
        logger.warning("SMSCountry returned %s for %s", r.status_code, mask_phone(phone))
        return False, (r.text or f"HTTP {r.status_code}")[:REASON_MAX]


class LeonasProvider:
    """
    Leonas (smslogin.co) — HTTP POST, values in the URL (confirmed working in Postman).
        username   → account auth_key
        apikey     → account token (stored encrypted)
        senderid   → sender
        mobile     → 91XXXXXXXXXX
        message    → text (URL-encoded by requests)
        templateid → template's DLT Template ID (required)
    Success = HTTP 200 and reply contains 'campid' (confirmed by a real test).
    The API key is never written to logs or reasons.
    """
    code                 = "LEONAS"
    label                = "Leonas (smslogin.co)"
    key_label            = "Username"
    token_label          = "API key"
    uses_route           = False
    requires_template_id = True
    URL                  = "https://smslogin.co/v3/api.php"

    @classmethod
    def send(cls, account, phone, text, sender, dlt_template_id):
        """Return (ok, reason)."""
        if not dlt_template_id:
            return False, "DLT Template ID is required for Leonas. Add it to the template."
        params = {
            "username":   account["auth_key"],
            "apikey":     account["auth_token"],
            "senderid":   sender,
            "mobile":     f"91{phone}",
            "message":    text,
            "templateid": dlt_template_id,
        }
        try:
            r = requests.post(cls.URL, params=params, timeout=15)   # POST: confirmed working in Postman
        except requests.RequestException as e:
            # Never include str(e): it can contain the full URL with the API key
            logger.warning("Leonas request error to %s: %s", mask_phone(phone), type(e).__name__)
            return False, f"Could not reach Leonas ({type(e).__name__})"

        body = (r.text or "").strip()
        if r.status_code != 200:
            return False, f"HTTP {r.status_code}: {body[:200]}"
        # Confirmed success reply: {'campid':'<campaign id>'}
        if "campid" in body.lower():
            return True, None
        # Anything else is a failure; Leonas' own message is kept as the reason
        return False, (body or "Empty response from Leonas")[:REASON_MAX]


PROVIDERS = {
    SmsCountryProvider.code: SmsCountryProvider,
    LeonasProvider.code:     LeonasProvider,
}


# ─────────────────────────────────────────────────────────────────────────────
#  SmsSender — create ONE per request; lookups are cached for the request
# ─────────────────────────────────────────────────────────────────────────────
class SmsSender:
    def __init__(self, sent_by=None):
        self.sent_by         = sent_by
        self._branches       = {}
        self._branch_by_name = {}
        self._school_names   = {}
        self._accounts       = {}
        self._templates      = {}
        self._events         = {}

    # ── basic lookups ────────────────────────────────────────────────────────
    def branch(self, branch_id):
        if branch_id not in self._branches:
            from models import Branch
            self._branches[branch_id] = Branch.query.get(branch_id) if branch_id else None
        return self._branches[branch_id]

    def branch_id_of(self, student):
        """Student's branch id (falls back to matching the legacy branch name)."""
        if student.branch_id:
            return student.branch_id
        key = (student.school_id, student.branch)
        if key not in self._branch_by_name:
            from models import Branch
            b = None
            if student.branch:
                q = Branch.query.filter_by(branch_name=student.branch)
                if student.school_id:
                    q = q.filter_by(school_id=student.school_id)
                b = q.first()
            self._branch_by_name[key] = b.id if b else None
        return self._branch_by_name[key]

    def school_name(self, school_id):
        if not school_id:
            return ""
        if school_id not in self._school_names:
            from models import School
            s = School.query.get(school_id)
            self._school_names[school_id] = s.school_name if s else ""
        return self._school_names[school_id]

    def event(self, event_id):
        if not event_id:
            return None
        if event_id not in self._events:
            from models import SmsEvent
            from helpers import skip_scoping
            with skip_scoping():
                self._events[event_id] = SmsEvent.query.get(event_id)
        return self._events[event_id]

    # ── account (explicit branch choice) ─────────────────────────────────────
    def account_for_branch(self, branch_id):
        """(account dict, None) or (None, reason)."""
        if branch_id not in self._accounts:
            self._accounts[branch_id] = self._load_account(branch_id)
        return self._accounts[branch_id]

    def _load_account(self, branch_id):
        from models import SmsBranchSetting, SmsProviderAccount
        from helpers import skip_scoping

        b = self.branch(branch_id)
        if not b:
            return None, "Student has no branch"

        with skip_scoping():
            setting = SmsBranchSetting.query.filter_by(target_branch_id=b.id).first()
            source  = setting.account_source if setting else "NONE"
            if source == "SCHOOL":
                acc, label = SmsProviderAccount.query.filter_by(school_id=b.school_id, target_branch_id=None).first(), "school account"
            elif source == "OWN":
                acc, label = SmsProviderAccount.query.filter_by(target_branch_id=b.id).first(), "branch's own account"
            else:
                return None, f"No SMS account chosen for branch {b.branch_name}"

        if not acc or not acc.is_active:
            return None, f"The {label} for {b.branch_name} is not set up or not active"
        if acc.provider not in PROVIDERS:
            return None, f"SMS provider {acc.provider} is not supported"
        try:
            from crypto_utils import decrypt_secret
            token = decrypt_secret(acc.auth_token_encrypted)
        except Exception:
            logger.exception("SMS: could not decrypt token for account %s", acc.id)
            return None, f"The {label} password could not be read. Re-enter it in SMS Account."

        return {
            "provider":      acc.provider,
            "auth_key":      acc.auth_key,
            "auth_token":    token,
            "sender_id":     acc.default_sender_id,
            "route":         acc.route or "Trans",
            "dlt_entity_id": acc.dlt_entity_id,
            "extra_config":  acc.extra_config or {},
        }, None

    # ── event / template ─────────────────────────────────────────────────────
    def event_problem(self, ev, branch_id):
        b = self.branch(branch_id)
        if not ev:
            return "SMS event not found"
        if not ev.is_active:
            return f"Event '{ev.name}' is inactive"
        if not b or ev.school_id != b.school_id:
            return f"Event '{ev.name}' does not belong to this school"
        if ev.target_branch_id not in (None, b.id):
            return f"Event '{ev.name}' is not available for {b.branch_name}"
        return None

    def template_for(self, ev, branch_id):
        """This branch's default active template, else the common default."""
        key = (ev.id, branch_id)
        if key not in self._templates:
            from models import SmsTemplate
            from helpers import skip_scoping
            with skip_scoping():
                base  = SmsTemplate.query.filter_by(event_id=ev.id, is_active=True)
                order = (SmsTemplate.is_default.desc(), SmsTemplate.updated_at.desc())
                tpl = base.filter(SmsTemplate.target_branch_id == branch_id).order_by(*order).first() \
                      or base.filter(SmsTemplate.target_branch_id.is_(None)).order_by(*order).first()
            self._templates[key] = tpl
        return self._templates[key]

    def readiness(self, ev, branch_id):
        """List of reasons this event can't be sent for this branch (empty = ready)."""
        reasons = []

        # 1. Event must be active and available to this branch
        problem = self.event_problem(ev, branch_id)
        if problem:
            reasons.append(problem)

        # 2. Branch must have an active account chosen
        account, acc_reason = self.account_for_branch(branch_id)
        if acc_reason:
            reasons.append(acc_reason)

        # 3. There must be an active template (branch's own, else common)
        tpl = None
        if not problem:
            tpl = self.template_for(ev, branch_id)
            if not tpl:
                b = self.branch(branch_id)
                reasons.append(f"No active template for '{ev.name}' in {b.branch_name if b else 'this branch'}")

        # 4. Some providers (e.g. Leonas) need a DLT Template ID on the template
        provider = PROVIDERS.get(account["provider"]) if account else None
        if tpl and provider and getattr(provider, "requires_template_id", False) and not tpl.dlt_template_id:
            reasons.append(f"Template '{tpl.name}' needs a DLT Template ID for {provider.label}")

        return reasons

    def fee_receipt_event(self, branch_id):
        """(event, None) or (None, reason) from the branch's fee-receipt setting."""
        from models import SmsBranchSetting
        from helpers import skip_scoping

        b = self.branch(branch_id)
        if not b:
            return None, "Student has no branch"
        with skip_scoping():
            s    = SmsBranchSetting.query.filter_by(target_branch_id=b.id).first()
            mode = s.fee_receipt_mode if s else "OFF"
            if mode == "COMMON":
                s    = SmsBranchSetting.query.filter_by(school_id=b.school_id, target_branch_id=None).first()
                mode = s.fee_receipt_mode if s else "OFF"
        if mode != "ON" or not s or not s.fee_receipt_event_id:
            return None, f"Automatic fee receipt SMS is off for {b.branch_name}"
        return self.event(s.fee_receipt_event_id), None

    # ── values ───────────────────────────────────────────────────────────────
    def student_variables(self, student, branch_id):
        b = self.branch(branch_id)
        return {
            "student_name": " ".join(p for p in [student.first_name, student.last_name] if p),
            "first_name":   student.first_name or "",
            "admission_no": student.admission_no or "",
            "class":        student.clazz or "",
            "section":      student.section or "",
            "school_name":  self.school_name(b.school_id if b else student.school_id),
            "branch_name":  b.branch_name if b else (student.branch or ""),
        }

    @staticmethod
    def pick_phone(student, recipient):
        for field in RECIPIENT_FIELDS.get(recipient or "FATHER", RECIPIENT_FIELDS["FATHER"]):
            value = getattr(student, field, None)
            if normalize_phone(value):
                return value
        return getattr(student, "FatherPhone", None)

    # ── preview (no send, no log) ────────────────────────────────────────────
    def render_for_student(self, ev, student, extra_vars=None):
        """(text, problem). problem is None when the SMS could be sent."""
        branch_id = self.branch_id_of(student)
        reasons = self.readiness(ev, branch_id)
        if reasons:
            return None, reasons[0]
        tpl = self.template_for(ev, branch_id)
        variables = self.student_variables(student, branch_id)
        variables.update(extra_vars or {})
        text, missing = render_template(tpl.body, variables)
        if missing:
            return text, "Missing values: " + ", ".join(sorted(set(missing)))
        if not normalize_phone(self.pick_phone(student, tpl.recipient)):
            return text, "This student has no valid phone number"
        return text, None

    # ── send ─────────────────────────────────────────────────────────────────
    def send_to_student(self, ev, student, extra_vars=None):
        branch_id = self.branch_id_of(student)
        variables = self.student_variables(student, branch_id)
        variables.update(extra_vars or {})
        return self._send(ev, branch_id, None, variables, student.student_id, recipient_student=student)

    def send_to_phone(self, ev, branch_id, phone_raw, variables, student_id=None):
        return self._send(ev, branch_id, phone_raw, variables or {}, student_id)

    def _send(self, ev, branch_id, raw_phone, variables, student_id, recipient_student=None):
        b = self.branch(branch_id)
        school_id = b.school_id if b else None

        reasons = self.readiness(ev, branch_id)
        if reasons:
            return self._log("failed", None, raw_phone, "", reasons[0], ev, None, student_id, school_id, branch_id)

        tpl = self.template_for(ev, branch_id)
        if recipient_student is not None:
            raw_phone = self.pick_phone(recipient_student, tpl.recipient)

        phone = normalize_phone(raw_phone)
        if not phone:
            return self._log("skipped", None, raw_phone, "", "No valid phone number", ev, tpl.id, student_id, school_id, branch_id)

        text, missing = render_template(tpl.body, variables)
        if missing:
            return self._log("failed", phone, raw_phone, text, "Missing values: " + ", ".join(sorted(set(missing))),
                             ev, tpl.id, student_id, school_id, branch_id)

        account, _ = self.account_for_branch(branch_id)
        sender_id  = tpl.sender_id or account["sender_id"]
        ok, reason = PROVIDERS[account["provider"]].send(account, phone, text, sender_id, tpl.dlt_template_id)
        return self._log("sent" if ok else "failed", phone, raw_phone, text, None if ok else reason,
                         ev, tpl.id, student_id, school_id, branch_id)

    def _log(self, status, phone, raw_phone, text, reason, ev, template_id, student_id, school_id, branch_id):
        try:
            from models import SmsLog
            db.session.add(SmsLog(
                sms_type=(ev.event_type if ev else "UNKNOWN"),
                phone=(phone or str(raw_phone or ""))[:20],
                message=text or "",
                status=status,
                reason=(reason[:REASON_MAX] if reason else None),
                student_id=student_id,
                sent_at=datetime.utcnow(),
                sent_by=self.sent_by,
                school_id=school_id,
                branch_id=branch_id,
                template_id=template_id,
                event_id=(ev.id if ev else None),
            ))
        except Exception:
            logger.exception("SMS: failed to write sms_log")
        return {"status": status, "phone": mask_phone(phone), "reason": reason}