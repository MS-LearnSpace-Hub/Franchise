"""add staff_master missing columns

Revision ID: 55a35c104ecd
Revises: 11794112ea81
Create Date: 2026-07-22 10:25:57.243270

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '55a35c104ecd'
down_revision = '11794112ea81'
branch_labels = None
depends_on = None


def upgrade():
    
    op.create_index('ix_staff_master_biometric_id', 'staff_master', ['biometric_id'], unique=False)

    op.create_foreign_key(
        'fk_staff_master_staff_category_id', 'staff_master', 'staff_category_master',
        ['staff_category_id'], ['id'], ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_staff_master_staff_status_id', 'staff_master', 'staff_status_master',
        ['staff_status_id'], ['id'], ondelete='SET NULL'
    )


def downgrade():
    op.drop_constraint('fk_staff_master_staff_status_id', 'staff_master', type_='foreignkey')
    op.drop_constraint('fk_staff_master_staff_category_id', 'staff_master', type_='foreignkey')
    op.drop_index('ix_staff_master_biometric_id', table_name='staff_master')
