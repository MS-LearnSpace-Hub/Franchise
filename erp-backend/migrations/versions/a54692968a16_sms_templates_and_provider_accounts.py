"""sms templates and provider accounts

Revision ID: a54692968a16
Revises: edeb30a2780b
Create Date: 2026-10-10

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a54692968a16'
down_revision = 'edeb30a2780b'
branch_labels = None
depends_on = None
def upgrade():
    # 1. One SMS account per school
    op.create_table(
        'sms_provider_accounts',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('school_id', sa.Integer(), sa.ForeignKey('schools.id', ondelete='CASCADE'), nullable=False),
        sa.Column('provider', sa.String(30), nullable=False, server_default='SMSCOUNTRY'),
        sa.Column('auth_key', sa.String(120), nullable=False),
        sa.Column('auth_token_encrypted', sa.Text(), nullable=False),
        sa.Column('default_sender_id', sa.String(20), nullable=False),
        sa.Column('route', sa.String(20), nullable=False, server_default='Trans'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.user_id'), nullable=True),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('users.user_id'), nullable=True),
        sa.UniqueConstraint('school_id', name='uq_sms_provider_school'),
    )

    # 2. Templates per school
    op.create_table(
        'sms_templates',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('school_id', sa.Integer(), sa.ForeignKey('schools.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_code', sa.String(50), nullable=False),
        sa.Column('name', sa.String(150), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('dlt_template_id', sa.String(50), nullable=True),
        sa.Column('sender_id', sa.String(20), nullable=True),
        sa.Column('recipient', sa.String(20), nullable=False, server_default='FATHER'),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('0')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.user_id'), nullable=True),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('users.user_id'), nullable=True),
    )
    op.create_index('idx_sms_tpl_school_event', 'sms_templates', ['school_id', 'event_code', 'is_active'])

    # 3. Link each SMS log row to the template used
    op.add_column('sms_logs', sa.Column('template_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_sms_logs_template', 'sms_logs', 'sms_templates',
        ['template_id'], ['id'], ondelete='SET NULL'
    )


def downgrade():
    op.drop_constraint('fk_sms_logs_template', 'sms_logs', type_='foreignkey')
    op.drop_column('sms_logs', 'template_id')
    op.drop_table('sms_templates')          # also drops idx_sms_tpl_school_event
    op.drop_table('sms_provider_accounts')