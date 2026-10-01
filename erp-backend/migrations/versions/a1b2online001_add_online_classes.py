"""add online classes module (online_classes, zoom_credentials, google_oauth_tokens)

Revision ID: a1b2online001
Revises: eaf76f101918
Create Date: 2026-08-28
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2online001"
down_revision = "eaf76f101918"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "zoom_credentials",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id", ondelete="CASCADE"), nullable=True),
        sa.Column("account_id", sa.String(120), nullable=False),
        sa.Column("client_id", sa.String(120), nullable=False),
        sa.Column("client_secret_encrypted", sa.Text(), nullable=False),
        sa.Column("default_host_email", sa.String(200), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.user_id"), nullable=True),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.user_id"), nullable=True),
        sa.UniqueConstraint("school_id", "branch_id", name="uq_zoom_credentials_school_branch"),
    )

    op.create_table(
        "google_oauth_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("staff_id", sa.Integer(), sa.ForeignKey("staff_master.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="SET NULL"), nullable=True),
        sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("refresh_token_encrypted", sa.Text(), nullable=False),
        sa.Column("access_token_encrypted", sa.Text(), nullable=True),
        sa.Column("token_expiry", sa.DateTime(), nullable=True),
        sa.Column("scope", sa.String(300), nullable=True),
        sa.Column("google_email", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.user_id"), nullable=True),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.user_id"), nullable=True),
    )

    op.create_table(
        "online_classes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("school_id", sa.Integer(), sa.ForeignKey("schools.id", ondelete="SET NULL"), nullable=True),
        sa.Column("branch_id", sa.Integer(), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjectmaster.id", ondelete="SET NULL"), nullable=True),
        sa.Column("class_id", sa.Integer(), sa.ForeignKey("classes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("section_id", sa.Integer(), sa.ForeignKey("class_sections.id", ondelete="SET NULL"), nullable=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("staff_master.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("external_meeting_id", sa.String(120), nullable=True),
        sa.Column("join_url", sa.String(500), nullable=True),
        sa.Column("start_url", sa.String(500), nullable=True),
        sa.Column("meeting_password", sa.String(50), nullable=True),
        sa.Column("timezone", sa.String(60), nullable=False, server_default="Asia/Kolkata"),
        sa.Column("start_datetime", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="45"),
        sa.Column("is_recurring", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("recurrence_days", sa.String(30), nullable=True),
        sa.Column("recurrence_end_date", sa.Date(), nullable=True),
        sa.Column("academic_year", sa.String(20), nullable=True),
        sa.Column("target_section_ids", sa.String(300), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="SCHEDULED"),
        sa.Column("cancel_reason", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.user_id"), nullable=True),
        sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.user_id"), nullable=True),
    )
    op.create_index("idx_online_class_teacher_time", "online_classes", ["teacher_id", "start_datetime"])
    op.create_index("idx_online_class_branch_year", "online_classes", ["branch_id", "academic_year"])
    op.create_index("idx_online_class_status", "online_classes", ["status"])


def downgrade():
    op.drop_index("idx_online_class_status", table_name="online_classes")
    op.drop_index("idx_online_class_branch_year", table_name="online_classes")
    op.drop_index("idx_online_class_teacher_time", table_name="online_classes")
    op.drop_table("online_classes")
    op.drop_table("google_oauth_tokens")
    op.drop_table("zoom_credentials")