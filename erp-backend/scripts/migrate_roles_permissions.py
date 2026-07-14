import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from extensions import db
from models import Role, User, Permission, RolePermission
from routes.rbac_routes import _sync_permission_catalog


def run_migration():
    print("=== STARTING DATABASE SEEDING & MIGRATION ===")

    # ------------------------------------------------------------------
    # 1. Sync Permission Catalog
    # ------------------------------------------------------------------
    print("\n1. Syncing permission catalog...")
    _sync_permission_catalog()
    print("   [OK] Permissions synced.")

    # ------------------------------------------------------------------
    # 2. Ensure SuperAdmin Role Exists
    # ------------------------------------------------------------------
    print("\n2. Ensuring SuperAdmin role exists...")

    superadmin_role = Role.query.filter_by(name="SuperAdmin").first()

    if not superadmin_role:
        superadmin_role = Role(
            name="SuperAdmin",
            description="Super Administrator Role",
            is_system=True,
            is_active=True
        )

        db.session.add(superadmin_role)
        db.session.flush()

        print("   + Created SuperAdmin role")

    else:
        print("   [OK] SuperAdmin role already exists")

    superadmin_id = superadmin_role.id

    # ------------------------------------------------------------------
    # 3. Grant All Permissions To SuperAdmin
    # ------------------------------------------------------------------
    print("\n3. Granting all permissions to SuperAdmin...")

    permissions = Permission.query.filter_by(is_active=True).all()

    force_reseed = "--force" in sys.argv

    if force_reseed:
        print("   Removing existing role permissions...")
        RolePermission.query.filter_by(
            role_id=superadmin_id
        ).delete()

    existing_permissions = {
        rp.permission_id
        for rp in RolePermission.query.filter_by(
            role_id=superadmin_id
        ).all()
    }

    created_count = 0

    for permission in permissions:

        if not force_reseed and permission.id in existing_permissions:
            continue

        role_permission = RolePermission(
            role_id=superadmin_id,
            permission_id=permission.id,
            can_read=True,
            can_write=True,
            can_append=True,
            can_delete=True
        )

        db.session.add(role_permission)
        created_count += 1

    print(
        f"   [OK] Assigned {created_count} permission mappings "
        f"to SuperAdmin."
    )

    # ------------------------------------------------------------------
    # 4. Assign Existing Users To SuperAdmin
    # ------------------------------------------------------------------
    print("\n4. Assigning users to SuperAdmin...")

    users = User.query.all()

    for user in users:

        print(
            f"   Processing '{user.username}' "
            f"(role={user.role}, role_id={user.role_id})"
        )

        if user.role_id is None:

            user.role = "SuperAdmin"
            user.role_id = superadmin_id

            print(
                f"      -> Assigned SuperAdmin "
                f"(ID={superadmin_id})"
            )

        else:
            print(
                f"      [OK] Already assigned "
                f"(role_id={user.role_id})"
            )

    # ------------------------------------------------------------------
    # 5. Commit Changes
    # ------------------------------------------------------------------
    db.session.commit()

    print("\n=== MIGRATION COMPLETE ===")
    print("SuperAdmin role verified.")
    print("Permissions synchronized.")
    print("Users migrated successfully.")


if __name__ == "__main__":
    from app import create_app

    app = create_app()

    with app.app_context():
        run_migration()