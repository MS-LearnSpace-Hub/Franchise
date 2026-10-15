"""sms per school and branch

Revision ID: b7023a69ca45
Revises: a54692968a16
Create Date: 2026-10-12 15:34:55.005574

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b7023a69ca45'
down_revision = 'a54692968a16'
branch_labels = None
depends_on = None

def _audit_cols():
    return [
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.user_id'), nullable=True),
        sa.Column('updated_by', sa.Integer(), sa.ForeignKey('users.user_id'), nullable=True),
    ]


def upgrade():
    # 1. Events (created on screen)
    op.create_table(
        'sms_events',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('school_id', sa.Integer(), sa.ForeignKey('schools.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_branch_id', sa.Integer(), sa.ForeignKey('branches.id', ondelete='CASCADE'), nullable=True),
        sa.Column('name', sa.String(150), nullable=False),
        sa.Column('event_type', sa.String(30), nullable=False),
        sa.Column('custom_fields', sa.JSON(), nullable=True),
        sa.Column('description', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        *_audit_cols(),
    )
    op.create_index('idx_sms_event_scope', 'sms_events', ['school_id', 'target_branch_id', 'is_active'])
    op.create_index('idx_sms_event_type', 'sms_events', ['event_type'])

    # 2. Branch settings (explicit choices per branch + school common row)
    op.create_table(
        'sms_branch_settings',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('school_id', sa.Integer(), sa.ForeignKey('schools.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_branch_id', sa.Integer(), sa.ForeignKey('branches.id', ondelete='CASCADE'), nullable=True),
        sa.Column('account_source', sa.String(10), nullable=False, server_default='NONE'),
        sa.Column('fee_receipt_mode', sa.String(10), nullable=False, server_default='OFF'),
        sa.Column('fee_receipt_event_id', sa.Integer(), sa.ForeignKey('sms_events.id', ondelete='SET NULL'), nullable=True),
        *_audit_cols(),
        sa.UniqueConstraint('target_branch_id', name='uq_sms_settings_branch'),
    )
    op.create_index('idx_sms_settings_school', 'sms_branch_settings', ['school_id'])

    # 3. Accounts: school account (branch empty) or a branch's own account
    op.create_index('idx_sms_provider_school', 'sms_provider_accounts', ['school_id'])
    op.drop_constraint('uq_sms_provider_school', 'sms_provider_accounts', type_='unique')
    op.add_column('sms_provider_accounts', sa.Column('target_branch_id', sa.Integer(), nullable=True))
    op.create_unique_constraint('uq_sms_provider_branch', 'sms_provider_accounts', ['target_branch_id'])
    op.create_foreign_key('fk_sms_provider_branch', 'sms_provider_accounts', 'branches',
                          ['target_branch_id'], ['id'], ondelete='CASCADE')
    op.add_column('sms_provider_accounts', sa.Column('dlt_entity_id', sa.String(50), nullable=True))
    op.add_column('sms_provider_accounts', sa.Column('extra_config', sa.JSON(), nullable=True))

    # 4. Templates: linked to an event, common or branch-only
    op.add_column('sms_templates', sa.Column('event_id', sa.Integer(), nullable=True))
    op.add_column('sms_templates', sa.Column('target_branch_id', sa.Integer(), nullable=True))
    op.create_index('idx_sms_tpl_event_scope', 'sms_templates', ['event_id', 'target_branch_id', 'is_active'])
    op.create_foreign_key('fk_sms_tpl_event', 'sms_templates', 'sms_events',
                          ['event_id'], ['id'], ondelete='RESTRICT')
    op.create_foreign_key('fk_sms_tpl_branch', 'sms_templates', 'branches',
                          ['target_branch_id'], ['id'], ondelete='CASCADE')
    op.alter_column('sms_templates', 'event_code', existing_type=sa.String(50), nullable=True)

    # 5. Logs: which event each SMS was for
    op.add_column('sms_logs', sa.Column('event_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_sms_logs_event', 'sms_logs', 'sms_events',
                          ['event_id'], ['id'], ondelete='SET NULL')


def downgrade():
    conn = op.get_bind()

    # 5. Logs
    op.drop_constraint('fk_sms_logs_event', 'sms_logs', type_='foreignkey')
    op.drop_column('sms_logs', 'event_id')

    # 4. Templates (drop FKs before their indexes - MySQL rule)
    op.drop_constraint('fk_sms_tpl_event', 'sms_templates', type_='foreignkey')
    op.drop_constraint('fk_sms_tpl_branch', 'sms_templates', type_='foreignkey')
    op.drop_index('idx_sms_tpl_event_scope', table_name='sms_templates')
    op.drop_column('sms_templates', 'event_id')
    op.drop_column('sms_templates', 'target_branch_id')
    conn.execute(sa.text("UPDATE sms_templates SET event_code = 'UNKNOWN' WHERE event_code IS NULL"))
    op.alter_column('sms_templates', 'event_code', existing_type=sa.String(50), nullable=False)

    # 3. Accounts (old schema allowed only one account per school)
    op.drop_constraint('fk_sms_provider_branch', 'sms_provider_accounts', type_='foreignkey')
    op.drop_constraint('uq_sms_provider_branch', 'sms_provider_accounts', type_='unique')
    conn.execute(sa.text("DELETE FROM sms_provider_accounts WHERE target_branch_id IS NOT NULL"))
    op.drop_column('sms_provider_accounts', 'target_branch_id')
    op.drop_column('sms_provider_accounts', 'dlt_entity_id')
    op.drop_column('sms_provider_accounts', 'extra_config')
    op.create_unique_constraint('uq_sms_provider_school', 'sms_provider_accounts', ['school_id'])
    op.drop_index('idx_sms_provider_school', table_name='sms_provider_accounts')

    # 2 + 1. New tables
    op.drop_table('sms_branch_settings')
    op.drop_table('sms_events')

