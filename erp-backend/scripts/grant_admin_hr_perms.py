from app import create_app
from extensions import db
from sqlalchemy import text

app = create_app()
with app.app_context():
    conn = db.engine.connect()
    admin_id = conn.execute(text("SELECT id FROM roles WHERE name='Admin'")).scalar()
    if admin_id:
        for code in ['hr.hr.staff-master', 'hr.staff-master']:
            perm_id = conn.execute(text(f"SELECT id FROM permissions WHERE code='{code}'")).scalar()
            if not perm_id:
                conn.execute(text(f"INSERT INTO permissions (code, permission_name, module) VALUES ('{code}', 'Staff Master', 'hr')"))
                perm_id = conn.execute(text(f"SELECT id FROM permissions WHERE code='{code}'")).scalar()
            
            rp_id = conn.execute(text(f"SELECT id FROM role_permissions WHERE role_id={admin_id} AND permission_id={perm_id}")).scalar()
            if not rp_id:
                conn.execute(text(f"INSERT INTO role_permissions (role_id, permission_id, can_read, can_write, can_append, can_delete) VALUES ({admin_id}, {perm_id}, 1, 1, 1, 1)"))
            else:
                conn.execute(text(f"UPDATE role_permissions SET can_read=1, can_write=1, can_append=1, can_delete=1 WHERE id={rp_id}"))
        conn.commit()
        print('Raw SQL permissions granted!')
    conn.close()
