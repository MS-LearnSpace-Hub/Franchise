from app import create_app
from extensions import db
from models import Permission, RolePermission

app = create_app()
with app.app_context():
    old_perm = db.session.query(Permission).filter_by(code='fees.fee.remittance').first()
    if old_perm:
        # Find all roles that had this permission
        role_perms = db.session.query(RolePermission).filter_by(permission_id=old_perm.id).all()
        role_ids = [rp.role_id for rp in role_perms]
        
        # Grant new permissions to these roles
        new_perms_data = [
            {'code': 'fees.fee.remittance-deposit', 'component': 'Cash Management', 'description': 'Create and submit cash remittances', 'dashboard': 'Fees', 'module': 'Fee'},
            {'code': 'fees.fee.remittance-approvals', 'component': 'Cash Management', 'description': 'Manage and approve cash remittances', 'dashboard': 'Fees', 'module': 'Fee'},
            {'code': 'fees.fee.reconciliation-dashboard', 'component': 'Cash Management', 'description': 'View cash reconciliation dashboard', 'dashboard': 'Fees', 'module': 'Fee'}
        ]
        
        for p_data in new_perms_data:
            perm = db.session.query(Permission).filter_by(code=p_data['code']).first()
            if not perm:
                perm = Permission(
                    code=p_data['code'],
                    component=p_data['component'],
                    description=p_data['description'],
                    dashboard=p_data['dashboard'],
                    module=p_data['module']
                )
                db.session.add(perm)
                db.session.flush()
                
            for role_id in role_ids:
                # check if already exists
                existing = db.session.query(RolePermission).filter_by(role_id=role_id, permission_id=perm.id).first()
                if not existing:
                    rp = RolePermission(role_id=role_id, permission_id=perm.id, can_read=True, can_write=True, can_append=True, can_delete=True)
                    db.session.add(rp)
        
        # Delete old role permissions and permission
        for rp in role_perms:
            db.session.delete(rp)
        db.session.delete(old_perm)
        db.session.commit()
        print("Migrated old remittance permission successfully.")
    else:
        print("Old permission not found.")
