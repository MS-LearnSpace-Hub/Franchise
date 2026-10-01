"""add online class webhook sync fields

Revision ID: b3c9online002
Revises: a1b2online001
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa

revision = "b3c9online002"
down_revision = "a1b2online001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("online_classes", sa.Column("actual_start_time", sa.DateTime(), nullable=True))
    op.add_column("online_classes", sa.Column("actual_end_time", sa.DateTime(), nullable=True))
    op.add_column("online_classes", sa.Column("zoom_uuid", sa.String(120), nullable=True))
    op.add_column("online_classes", sa.Column("sync_source", sa.String(20), nullable=True))
    op.create_index("idx_online_class_external_meeting", "online_classes", ["external_meeting_id"])


def downgrade():
    op.drop_index("idx_online_class_external_meeting", table_name="online_classes")
    op.drop_column("online_classes", "sync_source")
    op.drop_column("online_classes", "zoom_uuid")
    op.drop_column("online_classes", "actual_end_time")
    op.drop_column("online_classes", "actual_start_time")