import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extensions import db
from models import Role, User, Permission, RolePermission
from routes.rbac_routes import _sync_permission_catalog

def run_migration():
    print("=== STARTING DATABASE SEEDING & MIGRATION ===")
    
    # 1. Sync Permission Catalog
    print("\n1. Syncing permission catalog...")
    _sync_permission_catalog()
    print("   [OK] Permissions synced.")

    # 2. Ensure Standard Roles Exist
    print("\n2. Ensuring standard roles exist...")
    roles_config = {
        "SuperAdmin": {"desc": "Super Administrator Role", "is_system": True},
        "Admin": {"desc": "Administrator Role", "is_system": True},
        "User": {"desc": "Standard User Role", "is_system": True},
        "Accountant": {"desc": "Accountant Role", "is_system": False},
        "Finance": {"desc": "Finance Role", "is_system": False},
        "Franchise Admin": {"desc": "Franchise Admin Role", "is_system": False},
        "BranchAdmin": {"desc": "Branch Admin Role", "is_system": False},
    }
    
    role_objs = {}
    for r_name, cfg in roles_config.items():
        role_obj = Role.query.filter_by(name=r_name).first()
        if not role_obj:
            role_obj = Role(name=r_name, description=cfg["desc"], is_system=cfg["is_system"], is_active=True)
            db.session.add(role_obj)
            print(f"   + Created {r_name} role")
        else:
            print(f"   [OK] {r_name} role already exists")
        role_objs[r_name] = role_obj

    db.session.flush()
    
    superadmin_id = role_objs["SuperAdmin"].id
    admin_id = role_objs["Admin"].id
    user_id_role = role_objs["User"].id

    # 3. Seed Default Role Permissions
    print("\n3. Seeding default permissions for all roles...")
    permissions = Permission.query.filter_by(is_active=True).all()
    
    force_reseed = "--force" in sys.argv
    for r_name, r_obj in role_objs.items():
        print(f"   Seeding permissions for role: {r_name} (force={force_reseed})...")
        
        existing_rp_map = {}
        if force_reseed:
            RolePermission.query.filter_by(role_id=r_obj.id).delete()
        else:
            existing_rps = RolePermission.query.filter_by(role_id=r_obj.id).all()
            existing_rp_map = {rp.permission_id: rp for rp in existing_rps}
        
        for p in permissions:
            if not force_reseed and p.id in existing_rp_map:
                continue
                
            rp = RolePermission(role_id=r_obj.id, permission_id=p.id)
            
            if r_name in ("SuperAdmin", "Admin", "Franchise Admin", "BranchAdmin"):
                # Admins have full access to everything
                rp.can_read = True
                rp.can_write = True
                rp.can_append = True
                rp.can_delete = True
            elif r_name == "User":
                is_restricted = (
                    p.code.startswith("fees.")
                    or p.code.startswith("system.")
                    or p.code.startswith("setup.")
                )
                if is_restricted:
                    rp.can_read = False
                    rp.can_write = False
                    rp.can_append = False
                    rp.can_delete = False
                else:
                    rp.can_read = True
                    rp.can_write = True
                    rp.can_append = True
                    rp.can_delete = False
            elif r_name in ("Accountant", "Finance"):
                # Accountants/Finance have write/append access to fees, read access to everything else except system/setup
                if p.code.startswith("fees."):
                    rp.can_read = True
                    rp.can_write = True
                    rp.can_append = True
                    rp.can_delete = False
                elif p.code.startswith("home.dashboard."):
                    rp.can_read = True
                    rp.can_write = True
                    rp.can_append = True
                    rp.can_delete = False
                elif p.code.startswith("system.") or p.code.startswith("setup."):
                    rp.can_read = False
                    rp.can_write = False
                    rp.can_append = False
                    rp.can_delete = False
                else:
                    # Academics, administration, documents, attendance: Read-only
                    rp.can_read = True
                    rp.can_write = False
                    rp.can_append = False
                    rp.can_delete = False
            
            db.session.add(rp)

    print("   [OK] Seeding role permissions completed.")

    # 4. Migrate Users
    print("\n4. Migrating existing users to database roles...")
    users = User.query.all()
    for u in users:
        print(f"   Processing user '{u.username}' (current role='{u.role}', role_id={u.role_id})...")
        
        # Override AMAdmin explicitly to Admin (role ID = 5, role = 'Admin')
        if u.username == "AMAdmin":
            u.role = "Admin"
            u.role_id = admin_id
            print(f"      -> Explicitly promoted legacy AMAdmin user to Admin (ID={admin_id})")
        # General migration logic for others with no role_id
        elif u.role_id is None:
            if u.role == "SuperAdmin":
                u.role_id = superadmin_id
                print(f"      -> Set role_id to SuperAdmin (ID={superadmin_id})")
            elif u.role == "Admin":
                u.role_id = admin_id
                print(f"      -> Set role_id to Admin (ID={admin_id})")
            else:
                u.role = "User"
                u.role_id = user_id_role
                print(f"      -> Set role_id to User (ID={user_id_role}) and role to 'User'")
        else:
            print("      [OK] Already has role_id, skipping.")

    db.session.commit()
    print("\n=== MIGRATION COMPLETE AND COMMITTED SUCCESSFULLY ===")

if __name__ == "__main__":
    from app import create_app
    app = create_app()
    with app.app_context():
        run_migration()
