"""add rbac roles and permissions

Revision ID: 3f7b2a9c1d4e
Revises: e095f12ddfde
Create Date: 2026-05-05 00:00:00.000000

"""
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from permission_catalog import PERMISSION_CATALOG


revision = "3f7b2a9c1d4e"
down_revision = "e095f12ddfde"
branch_labels = None
depends_on = None


def _audit_columns(nullable_user=True):
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=True if nullable_user else False),
        sa.Column("updated_by", sa.Integer(), nullable=True),
    ]


def upgrade():
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["created_by"], ["users.user_id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.user_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_roles_name"),
    )

    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dashboard", sa.String(length=100), nullable=False),
        sa.Column("module", sa.String(length=100), nullable=False),
        sa.Column("component", sa.String(length=120), nullable=False),
        sa.Column("code", sa.String(length=160), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["created_by"], ["users.user_id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.user_id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_permissions_code"),
        sa.UniqueConstraint("dashboard", "module", "component", name="uq_permission_path"),
    )

    op.create_table(
        "role_permissions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.Column("can_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_write", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_append", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("can_delete", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_audit_columns(),
        sa.ForeignKeyConstraint(["created_by"], ["users.user_id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.user_id"]),
        sa.ForeignKeyConstraint(["permission_id"], ["permissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),
    )
    op.create_index("idx_role_permissions_role", "role_permissions", ["role_id"])
    op.create_index("idx_role_permissions_permission", "role_permissions", ["permission_id"])

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("role_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key("fk_users_role_id_roles", "roles", ["role_id"], ["id"], ondelete="SET NULL")

    now = datetime.utcnow()
    roles_table = sa.table(
        "roles",
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("is_system", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )
    permissions_table = sa.table(
        "permissions",
        sa.column("dashboard", sa.String),
        sa.column("module", sa.String),
        sa.column("component", sa.String),
        sa.column("code", sa.String),
        sa.column("description", sa.String),
        sa.column("is_active", sa.Boolean),
        sa.column("created_at", sa.DateTime),
        sa.column("updated_at", sa.DateTime),
    )

    op.bulk_insert(
        roles_table,
        [
            {"name": "SuperAdmin", "description": "Full system access", "is_active": True, "is_system": True, "created_at": now, "updated_at": now},
            {"name": "Admin", "description": "School administration access", "is_active": True, "is_system": True, "created_at": now, "updated_at": now},
            {"name": "User", "description": "Default read-only user access", "is_active": True, "is_system": True, "created_at": now, "updated_at": now},
        ],
    )
    op.bulk_insert(
        permissions_table,
        [
            {
                "dashboard": dashboard,
                "module": module,
                "component": component,
                "code": code,
                "description": description,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
            for item in PERMISSION_CATALOG
            for dashboard, module, component, code, description in [(
                item["dashboard"],
                item["module"],
                item["component"],
                item["code"],
                item.get("description"),
            )]
        ],
    )

    op.execute(
        "INSERT INTO role_permissions "
        "(role_id, permission_id, can_read, can_write, can_append, can_delete, created_at, updated_at) "
        "SELECT roles.id, permissions.id, 1, 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP "
        "FROM roles CROSS JOIN permissions WHERE roles.name IN ('SuperAdmin', 'Admin')"
    )
    op.execute(
        "INSERT INTO role_permissions "
        "(role_id, permission_id, can_read, can_write, can_append, can_delete, created_at, updated_at) "
        "SELECT roles.id, permissions.id, 1, 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP "
        "FROM roles CROSS JOIN permissions WHERE roles.name = 'User'"
    )
    op.execute("UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'SuperAdmin') WHERE role = 'SuperAdmin'")
    op.execute("UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'Admin') WHERE role = 'Admin'")
    op.execute("UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'User') WHERE role = 'User'")


def downgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_constraint("fk_users_role_id_roles", type_="foreignkey")
        batch_op.drop_column("role_id")

    op.drop_index("idx_role_permissions_permission", table_name="role_permissions")
    op.drop_index("idx_role_permissions_role", table_name="role_permissions")
    op.drop_table("role_permissions")
    op.drop_table("permissions")
    op.drop_table("roles")
