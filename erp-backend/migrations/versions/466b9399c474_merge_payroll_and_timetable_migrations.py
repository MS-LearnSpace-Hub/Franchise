"""merge payroll and timetable migrations

Revision ID: 466b9399c474
Revises: 6e5d43b50d1c, b3c9online002
Create Date: 2026-09-22 15:00:18.228409

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '466b9399c474'
down_revision = ('6e5d43b50d1c', 'b3c9online002')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
