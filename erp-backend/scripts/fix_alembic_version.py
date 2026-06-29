"""Fix alembic_version table: remove duplicate 195a642ab54b row."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from extensions import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    with db.engine.connect() as conn:
        rows_before = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
        print("Before:", [r[0] for r in rows_before])

        conn.execute(text("DELETE FROM alembic_version WHERE version_num = '195a642ab54b'"))
        conn.commit()

        rows_after = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
        print("After: ", [r[0] for r in rows_after])
