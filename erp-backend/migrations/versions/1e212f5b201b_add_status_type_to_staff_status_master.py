"""add_status_type_to_staff_status_master

Revision ID: 1e212f5b201b
Revises: a1b2c3d4e5f6
Create Date: 2026-06-28 13:30:54.528365

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision = '1e212f5b201b'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('staff_status_master', schema=None) as batch_op:
        batch_op.add_column(sa.Column('status_type', sa.Enum('ACTIVE', 'INACTIVE'), nullable=False, server_default='ACTIVE'))

def downgrade():
    with op.batch_alter_table('staff_status_master', schema=None) as batch_op:
        batch_op.drop_column('status_type')
