"""
One-time setup script: Promote a user to SuperAdmin
Run: python scripts/make_superadmin.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from extensions import db
from models import User

app = create_app()

with app.app_context():
    # List all users first
    print("\n=== Current Users ===")
    for u in User.query.order_by(User.user_id).all():
        print(f"  ID={u.user_id} | username={u.username} | role={u.role}")

    # ── CHANGE THIS ──────────────────────────────────────────
    TARGET_USERNAME = "admin"      # <-- put your admin username here
    # ─────────────────────────────────────────────────────────

    user = User.query.filter_by(username=TARGET_USERNAME).first()
    if not user:
        print(f"\nERROR: User '{TARGET_USERNAME}' not found. Check username above.")
        sys.exit(1)

    old_role = user.role
    user.role = "SuperAdmin"
    db.session.commit()
    print(f"\nSUCCESS: User '{TARGET_USERNAME}' promoted from '{old_role}' -> 'SuperAdmin'")
    print("Now log out and log back in to see the Franchise Management menu.")
