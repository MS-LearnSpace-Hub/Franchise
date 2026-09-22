import os
import requests
from datetime import timedelta

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"
SCOPES = "https://www.googleapis.com/auth/calendar.events openid email"

def get_authorization_url(state):
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI")
    if not client_id or not redirect_uri:
        raise RuntimeError("GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI not configured in .env")
    params = (
        f"client_id={client_id}&redirect_uri={redirect_uri}&response_type=code"
        f"&scope={SCOPES}&access_type=offline&prompt=consent&state={state}"
    )
    return f"{GOOGLE_AUTH_URL}?{params}"


def exchange_code_for_tokens(code):
    resp = requests.post(GOOGLE_TOKEN_URL, data={
        "code": code,
        "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET"),
        "redirect_uri": os.environ.get("GOOGLE_REDIRECT_URI"),
        "grant_type": "authorization_code",
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def refresh_access_token(refresh_token):
    resp = requests.post(GOOGLE_TOKEN_URL, data={
        "refresh_token": refresh_token,
        "client_id": os.environ.get("GOOGLE_CLIENT_ID"),
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET"),
        "grant_type": "refresh_token",
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def get_user_email(access_token):
    """Used right after connecting, to show the teacher which Google account got linked."""
    resp = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("email")


def create_meeting(access_token, topic, start_datetime, duration_minutes, timezone_str, description=None):
    end_datetime = start_datetime + timedelta(minutes=duration_minutes)
    payload = {
        "summary": topic,
        "description": description or "",
        "start": {"dateTime": start_datetime.isoformat(), "timeZone": timezone_str},
        "end": {"dateTime": end_datetime.isoformat(), "timeZone": timezone_str},
        "conferenceData": {
            "createRequest": {
                "requestId": f"meet-{start_datetime.timestamp()}",
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }
    resp = requests.post(
        f"{GOOGLE_CALENDAR_API}/calendars/primary/events?conferenceDataVersion=1",
        headers={"Authorization": f"Bearer {access_token}"},
        json=payload,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    join_url = None
    for ep in data.get("conferenceData", {}).get("entryPoints", []):
        if ep.get("entryPointType") == "video":
            join_url = ep.get("uri")
            break
    return {"external_meeting_id": data["id"], "join_url": join_url}


def update_meeting(access_token, event_id, start_datetime, duration_minutes, timezone_str):
    end_datetime = start_datetime + timedelta(minutes=duration_minutes)
    payload = {
        "start": {"dateTime": start_datetime.isoformat(), "timeZone": timezone_str},
        "end": {"dateTime": end_datetime.isoformat(), "timeZone": timezone_str},
    }
    resp = requests.patch(
        f"{GOOGLE_CALENDAR_API}/calendars/primary/events/{event_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        json=payload,
        timeout=15,
    )
    if not resp.ok:
        raise Exception(f"Google Calendar API error {resp.status_code}: {resp.text}")


def cancel_meeting(access_token, event_id):
    resp = requests.delete(
        f"{GOOGLE_CALENDAR_API}/calendars/primary/events/{event_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )
    if resp.status_code not in (204, 410, 404):
        resp.raise_for_status()