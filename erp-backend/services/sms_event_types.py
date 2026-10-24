"""
Fixed SMS event TYPES — the only SMS part defined in code.
Events themselves are created on screen (sms_events table); each event picks one type.
The type decides who receives the SMS and which {variables} its templates may use.
"""
import re

STUDENT_VARS = [
    "student_name", "first_name", "admission_no", "class", "section",
    "school_name", "branch_name",
]

EVENT_TYPES = {
    "ABSENT": {
        "label": "Absent students",
        "description": "Parents of students marked absent on a chosen date",
        "variables": STUDENT_VARS + ["date"],
        "allows_custom_fields": False,
        "auto": False,
    },
    "FEE_DUE": {
        "label": "Fee due",
        "description": "Parents of students with dues up to a chosen date",
        "variables": STUDENT_VARS + ["due_amount", "cutoff_date"],
        "allows_custom_fields": False,
        "auto": False,
    },
    "FEE_RECEIPT": {
        "label": "Fee receipt",
        "description": "Sent automatically after a fee payment (if switched on for the branch)",
        "variables": STUDENT_VARS + ["paid_amount", "total_amount", "balance"],
        "allows_custom_fields": False,
        "auto": True,
    },
    "GENERAL": {
        "label": "General",
        "description": "Parents of chosen classes or students; extra fields are typed when sending",
        "variables": list(STUDENT_VARS),
        "allows_custom_fields": True,
        "auto": False,
    },
}

CUSTOM_FIELD_RE   = re.compile(r"^[a-z][a-z0-9_]{1,29}$")
MAX_CUSTOM_FIELDS = 5


def event_variables(event_type, custom_fields=None):
    """All {variables} a template of this event may use."""
    base = list(EVENT_TYPES.get(event_type, {}).get("variables", []))
    if EVENT_TYPES.get(event_type, {}).get("allows_custom_fields"):
        base += list(custom_fields or [])
    return base