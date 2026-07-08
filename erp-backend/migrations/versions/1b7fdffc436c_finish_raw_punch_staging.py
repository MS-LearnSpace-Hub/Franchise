"""finish raw punch staging

Revision ID: 1b7fdffc436c
Revises: 11e6cbe59e71
Create Date: 2026-07-02 12:26:46.667963

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql
from sqlalchemy import text, inspect

# revision identifiers, used by Alembic.
revision = "1b7fdffc436c"
down_revision = "11e6cbe59e71"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)

    # If this is a fresh database and the table doesn't exist yet,
    # skip this migration.
    if "staff_master" not in inspector.get_table_names():
        return

    # Prevent making school_id NOT NULL when existing NULL values exist.
    null_count = conn.execute(
        text("SELECT COUNT(*) FROM staff_master WHERE school_id IS NULL")
    ).scalar()

    if null_count:
        raise RuntimeError(
            f"Migration aborted: {null_count} staff_master records have NULL school_id. "
            "Backfill these records before making school_id NOT NULL."
        )

    with op.batch_alter_table("staff_master", schema=None) as batch_op:
        batch_op.drop_constraint(
            batch_op.f("fk_staff_master_school_id"),
            type_="foreignkey",
        )
        batch_op.alter_column(
            "school_id",
            existing_type=mysql.INTEGER(),
            nullable=False,
        )
        batch_op.create_foreign_key(
            None,
            "schools",
            ["school_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # Only alter sync_log if it exists
    if "sync_log" in inspector.get_table_names():
        with op.batch_alter_table("sync_log", schema=None) as batch_op:
            batch_op.drop_constraint(
                batch_op.f("sync_log_ibfk_1"),
                type_="foreignkey",
            )
            batch_op.drop_column("branch_id")


def downgrade():
    conn = op.get_bind()
    inspector = inspect(conn)

    if "sync_log" in inspector.get_table_names():
        with op.batch_alter_table("sync_log", schema=None) as batch_op:
            batch_op.add_column(
                sa.Column(
                    "branch_id",
                    mysql.INTEGER(),
                    autoincrement=False,
                    nullable=False,
                )
            )
            batch_op.create_foreign_key(
                batch_op.f("sync_log_ibfk_1"),
                "branches",
                ["branch_id"],
                ["id"],
                ondelete="CASCADE",
            )

    if "staff_master" in inspector.get_table_names():
        with op.batch_alter_table("staff_master", schema=None) as batch_op:
            batch_op.drop_constraint(None, type_="foreignkey")
            batch_op.create_foreign_key(
                batch_op.f("fk_staff_master_school_id"),
                "schools",
                ["school_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch_op.alter_column(
                "school_id",
                existing_type=mysql.INTEGER(),
                nullable=True,
            )