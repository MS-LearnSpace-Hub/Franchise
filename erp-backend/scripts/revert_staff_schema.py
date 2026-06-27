"""Revert staff schema changes directly via SQLAlchemy to allow Alembic to generate them."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from extensions import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    conn = db.engine.connect()

    def execute(stmt):
        try:
            conn.execute(text(stmt))
            print(f'  + Executed: {stmt[:50]}...')
        except Exception as e:
            print(f'  skip: {e}')

    print('=== staff_master changes (revert) ===')
    execute('ALTER TABLE staff_master DROP COLUMN employee_id')
    execute('ALTER TABLE staff_master RENAME COLUMN staff_code TO employee_code')
    
    print('=== dropping staff_enrollment_sequences ===')
    execute('DROP TABLE IF EXISTS staff_enrollment_sequences')

    try:
        conn.execute(text('COMMIT'))
    except Exception:
        pass
    conn.close()
    print('ALL DONE.')
