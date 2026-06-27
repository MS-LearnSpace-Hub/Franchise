"""Apply staff schema changes directly via SQLAlchemy."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from extensions import db
from sqlalchemy import text, inspect

app = create_app()
with app.app_context():
    conn = db.engine.connect()

    def execute(stmt):
        try:
            conn.execute(text(stmt))
            print(f'  + Executed: {stmt[:50]}...')
        except Exception as e:
            print(f'  skip: {e}')

    print('=== staff_master changes ===')
    execute('ALTER TABLE staff_master RENAME COLUMN employee_code TO staff_code')
    execute('ALTER TABLE staff_master ADD COLUMN employee_id VARCHAR(50) NULL UNIQUE')
    
    print('=== creating staff_enrollment_sequences ===')
    execute('''
    CREATE TABLE IF NOT EXISTS staff_enrollment_sequences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        branch_id INT NULL,
        department_id INT NOT NULL,
        staff_code_prefix VARCHAR(20) NOT NULL,
        last_staff_no INT NOT NULL DEFAULT 0,
        employee_id_prefix VARCHAR(20) NOT NULL,
        last_employee_no INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_by INT NULL,
        FOREIGN KEY (branch_id) REFERENCES branches(id),
        FOREIGN KEY (department_id) REFERENCES department_master(id),
        UNIQUE (branch_id, department_id)
    )
    ''')

    try:
        conn.execute(text('COMMIT'))
    except Exception:
        pass
    conn.close()
    print('ALL DONE.')
