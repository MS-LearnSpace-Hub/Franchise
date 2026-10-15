"""sms tab permissions

Revision ID: edeb30a2780b
Revises: dcce7f1ee3f6
Create Date: 2026-10-10 12:19:35.185320

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'edeb30a2780b'
down_revision = 'dcce7f1ee3f6'
branch_labels = None
depends_on = None


NEW_SMS_PERMS = [
    ("administration.sms.send-sms", "Send SMS", "Send attendance, fee due and other SMS from SMS Center"),
    ("administration.sms.reports", "SMS Reports", "View SMS delivery reports"),
]
SOURCE_PERM = "administration.sms.sms-center"


def upgrade():
    conn = op.get_bind()

    for code, component, desc in NEW_SMS_PERMS:
        # 1. Create the permission row if the catalog sync hasn't already
        exists = conn.execute(
            sa.text("SELECT id FROM permissions WHERE code = :c"), {"c": code}
        ).first()
        if not exists:
            conn.execute(sa.text("""
                INSERT INTO permissions
                    (dashboard, module, component, code, description, is_active, created_at, updated_at)
                VALUES ('Administration', 'SMS', :comp, :code, :desc, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """), {"comp": component, "code": code, "desc": desc})

        # 2. Every role that has SMS Center gets the same ticks on the new permission
        conn.execute(sa.text("""
            INSERT INTO role_permissions
                (role_id, permission_id, can_read, can_write, can_append, can_delete,
                 school_id, branch_id, created_at, updated_at)
            SELECT rp.role_id, pn.id, rp.can_read, rp.can_write, rp.can_append, rp.can_delete,
                   rp.school_id, rp.branch_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            FROM role_permissions rp
            JOIN permissions po ON po.id = rp.permission_id AND po.code = :src
            JOIN permissions pn ON pn.code = :new
            WHERE NOT EXISTS (
                SELECT 1 FROM role_permissions ex
                WHERE ex.role_id = rp.role_id AND ex.permission_id = pn.id
            )
        """), {"src": SOURCE_PERM, "new": code})


def downgrade():
    conn = op.get_bind()
    for code, _, _ in NEW_SMS_PERMS:
        conn.execute(sa.text("""
            DELETE FROM role_permissions
            WHERE permission_id IN (SELECT id FROM permissions WHERE code = :c)
        """), {"c": code})
        conn.execute(sa.text("DELETE FROM permissions WHERE code = :c"), {"c": code})
