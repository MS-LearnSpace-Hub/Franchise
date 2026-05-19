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
    
    superadmin_role = Role.query.filter_by(name="SuperAdmin").first()
    if not superadmin_role:
        superadmin_role = Role(name="SuperAdmin", description="Super Administrator Role", is_system=True, is_active=True)
        db.session.add(superadmin_role)
        print("   + Created SuperAdmin role")
    else:
        print("   [OK] SuperAdmin role already exists")
        
    admin_role = Role.query.filter_by(name="Admin").first()
    if not admin_role:
        admin_role = Role(name="Admin", description="Administrator Role", is_system=True, is_active=True)
        db.session.add(admin_role)
        print("   + Created Admin role")
    else:
        print("   [OK] Admin role already exists")

    user_role = Role.query.filter_by(name="User").first()
    if not user_role:
        user_role = Role(name="User", description="Standard User Role", is_system=True, is_active=True)
        db.session.add(user_role)
        print("   + Created User role")
    else:
        print("   [OK] User role already exists")

    db.session.flush()

    # Get the latest IDs
    superadmin_id = superadmin_role.id
    admin_id = admin_role.id
    user_id_role = user_role.id
    
    print(f"   Roles in DB: SuperAdmin(ID={superadmin_id}), Admin(ID={admin_id}), User(ID={user_id_role})")

    # 3. Seed Default Role Permissions for "User" Role
    print("\n3. Seeding default permissions for User role...")
    permissions = Permission.query.filter_by(is_active=True).all()
    existing_user_permissions = {rp.permission_id: rp for rp in user_role.permissions.all()}

    for p in permissions:
        # Determine if this permission is restricted
        is_restricted = (
            p.code.startswith("fees.")
            or p.code.startswith("system.")
            or p.code.startswith("setup.")
        )

        rp = existing_user_permissions.get(p.id)

        # Only create defaults if permission does not already exist
        if not rp:
            rp = RolePermission(
                role_id=user_id_role,
                permission_id=p.id
            )

            if is_restricted:
                # Restricted: No access
                rp.can_read = False
                rp.can_write = False
                rp.can_append = False
                rp.can_delete = False
            else:
                # Default user access
                rp.can_read = True
                rp.can_write = True
                rp.can_append = True
                rp.can_delete = False

            db.session.add(rp)

    print("   [OK] Seeding user permissions completed.")

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
