"""Apply all missing schema changes and seed data directly via SQLAlchemy."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from extensions import db
from sqlalchemy import text, inspect
from datetime import datetime

app = create_app()
with app.app_context():
    insp = inspect(db.engine)
    conn = db.engine.connect()

    def add_col(table, col_def):
        try:
            conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {col_def}'))
            print(f'  + {table}.{col_def.split()[0]}')
        except Exception as e:
            print(f'  skip {table}.{col_def.split()[0]}: already exists')

    def add_fk(stmt):
        try:
            conn.execute(text(stmt))
            print(f'  + FK applied')
        except Exception as e:
            print(f'  skip FK: {e}')

    def add_idx(stmt):
        try:
            conn.execute(text(stmt))
            print(f'  + Index applied')
        except Exception as e:
            print(f'  skip Index: {e}')

    print('=== staff_master columns ===')
    add_col('staff_master', 'staff_category_id INT NULL')
    add_col('staff_master', 'staff_status_id INT NULL')
    add_col('staff_master', 'employee_sequence INT NULL')
    add_col('staff_master', 'biometric_id VARCHAR(20) NULL')

    print('=== department_master columns ===')
    add_col('department_master', 'department_short_code VARCHAR(10) NULL')
    add_col('department_master', 'department_numeric_code VARCHAR(10) NULL')

    print('=== users columns ===')
    add_col('users', 'is_first_login TINYINT(1) NOT NULL DEFAULT 0')
    add_col('users', 'password_changed_at DATETIME NULL')
    add_col('users', 'last_login DATETIME NULL')
    add_col('users', 'failed_login_count INT NOT NULL DEFAULT 0')

    print('=== Foreign Keys ===')
    add_fk('ALTER TABLE staff_master ADD CONSTRAINT fk_sm_category FOREIGN KEY (staff_category_id) REFERENCES staff_category_master(id) ON DELETE SET NULL')
    add_fk('ALTER TABLE staff_master ADD CONSTRAINT fk_sm_status FOREIGN KEY (staff_status_id) REFERENCES staff_status_master(id) ON DELETE SET NULL')

    print('=== Index ===')
    add_idx('CREATE INDEX ix_staff_master_biometric_id ON staff_master(biometric_id)')

    now = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')

    print('=== Seeding staff_category_master ===')
    categories = [
        ('TEACH',  'Teaching',       1),
        ('NTEACH', 'Non Teaching',   2),
        ('MENIAL', 'Menial',         3),
        ('ADMIN',  'Administration', 4),
        ('MGMT',   'Management',     5),
    ]
    for code, name, order in categories:
        try:
            conn.execute(text(
                f"INSERT IGNORE INTO staff_category_master (category_code, category_name, display_order, is_active, created_at, updated_at) "
                f"VALUES ('{code}', '{name}', {order}, 1, '{now}', '{now}')"
            ))
            print(f'  + {code} - {name}')
        except Exception as e:
            print(f'  skip {code}: {e}')
    conn.execute(text('COMMIT'))

    print('=== Seeding staff_status_master ===')
    statuses = [
        ('ACTIVE',        'Active',        1),
        ('PROBATION',     'Probation',     2),
        ('NOTICE_PERIOD', 'Notice Period', 3),
        ('SUSPENDED',     'Suspended',     4),
        ('RESIGNED',      'Resigned',      5),
        ('TERMINATED',    'Terminated',    6),
        ('RETIRED',       'Retired',       7),
    ]
    for code, name, order in statuses:
        try:
            conn.execute(text(
                f"INSERT IGNORE INTO staff_status_master (status_code, status_name, display_order, is_active, created_at, updated_at) "
                f"VALUES ('{code}', '{name}', {order}, 1, '{now}', '{now}')"
            ))
            print(f'  + {code} - {name}')
        except Exception as e:
            print(f'  skip {code}: {e}')
    conn.execute(text('COMMIT'))

    print()
    print('=== Final Verification ===')
    sm_cols = [c['name'] for c in insp.get_columns('staff_master')]
    u_cols  = [c['name'] for c in insp.get_columns('users')]
    d_cols  = [c['name'] for c in insp.get_columns('department_master')]
    print('staff_master new cols:', [c for c in sm_cols if c in ('staff_category_id','staff_status_id','employee_sequence','biometric_id')])
    print('users new cols:', [c for c in u_cols if c in ('is_first_login','password_changed_at','last_login','failed_login_count')])
    print('dept new cols:', [c for c in d_cols if c in ('department_short_code','department_numeric_code')])
    print('cat rows:', conn.execute(text('SELECT COUNT(*) FROM staff_category_master')).scalar())
    print('status rows:', conn.execute(text('SELECT COUNT(*) FROM staff_status_master')).scalar())
    conn.close()
    print()
    print('ALL DONE.')
