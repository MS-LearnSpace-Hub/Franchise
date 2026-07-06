"""Add login tracking fields to users

Revision ID: 2e590438fab3
Revises: 583e65499039
Create Date: 2026-06-29 15:37:23.469428
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "2e590438fab3"
down_revision = "583e65499039"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_first_login",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )

        batch_op.add_column(
            sa.Column(
                "password_changed_at",
                sa.DateTime(),
                nullable=True,
            )
        )

        batch_op.add_column(
            sa.Column(
                "last_login",
                sa.DateTime(),
                nullable=True,
            )
        )

        batch_op.add_column(
            sa.Column(
                "failed_login_count",
                sa.Integer(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )

    # Remove defaults after existing rows have been populated
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.alter_column(
            "is_first_login",
            existing_type=sa.Boolean(),
            server_default=None,
        )

        batch_op.alter_column(
            "failed_login_count",
            existing_type=sa.Integer(),
            server_default=None,
        )


def downgrade():
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_column("failed_login_count")
        batch_op.drop_column("last_login")
        batch_op.drop_column("password_changed_at")
        batch_op.drop_column("is_first_login")