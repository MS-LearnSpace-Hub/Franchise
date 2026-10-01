import base64
import requests

ZOOM_OAUTH_TOKEN_URL = "https://zoom.us/oauth/token"
ZOOM_API_BASE = "https://api.zoom.us/v2"


def _get_access_token(account_id, client_id, client_secret):
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    resp = requests.post(
        ZOOM_OAUTH_TOKEN_URL,
        headers={"Authorization": f"Basic {basic}"},
        data={"grant_type": "account_credentials", "account_id": account_id},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def create_meeting(account_id, client_id, client_secret, host_email, topic, start_datetime,
                    duration_minutes, timezone, agenda=None, recurrence=None):
    token = _get_access_token(account_id, client_id, client_secret)
    payload = {
        "topic": topic,
        "type": 8 if recurrence else 2,  # 2=scheduled, 8=recurring with fixed time
        "start_time": start_datetime.strftime("%Y-%m-%dT%H:%M:%S"),
        "duration": duration_minutes,
        "timezone": timezone,
        "agenda": agenda or "",
        "settings": {"join_before_host": False, "waiting_room": True, "approval_type": 2},
    }
    if recurrence:
        payload["recurrence"] = recurrence

    resp = requests.post(
        f"{ZOOM_API_BASE}/users/{host_email}/meetings",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        "external_meeting_id": str(data["id"]),
        "join_url": data.get("join_url"),
        "start_url": data.get("start_url"),
        "password": data.get("password"),
    }


def update_meeting(account_id, client_id, client_secret, meeting_id, start_datetime=None, duration_minutes=None, timezone=None):
    token = _get_access_token(account_id, client_id, client_secret)
    payload = {}
    if start_datetime:
        payload["start_time"] = start_datetime.strftime("%Y-%m-%dT%H:%M:%S")
        # Zoom requires timezone whenever start_time is being changed —
        # without it, the update is rejected with 400 Bad Request.
        payload["timezone"] = timezone or "Asia/Kolkata"
    if duration_minutes:
        payload["duration"] = duration_minutes
    if not payload:
        return
    resp = requests.patch(
        f"{ZOOM_API_BASE}/meetings/{meeting_id}",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()


def cancel_meeting(account_id, client_id, client_secret, meeting_id):
    token = _get_access_token(account_id, client_id, client_secret)
    resp = requests.delete(
        f"{ZOOM_API_BASE}/meetings/{meeting_id}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    if resp.status_code not in (204, 404):
        resp.raise_for_status()