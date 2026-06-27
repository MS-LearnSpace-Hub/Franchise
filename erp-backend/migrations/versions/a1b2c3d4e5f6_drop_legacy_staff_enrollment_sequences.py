"""Drop legacy staff_enrollment_sequences table

Revision ID: a1b2c3d4e5f6
Revises: f3a8b1c2d4e5
Create Date: 2026-06-27

Reason:
  The staff_enrollment_sequences table used an incorrect structure:
  - No school_id  (not multi-tenant safe)
  - Used text short codes (e.g. "MT") not numeric codes (e.g. "51")
  - Combined both staff code + employee ID counters in one row

  It has been replaced by two purpose-built tables:
  - staff_code_sequences  (per school + branch + department)
  - employee_id_sequences (per school + department)

  Any existing rows in staff_enrollment_sequences produced codes in the
  OLD format (MSMNMT0001) which is incompatible with the new format
  (MSMN510001). Migrating the counter values would cause sequence
  collisions, so the table is dropped cleanly.

  Downgrade restores the table structure (empty -- counters are not
  recoverable because the format changed).
"""

from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'f3a8b1c2d4e5'
branch_labels = None
depends_on = None


def upgrade():
    # Drop the legacy combined sequence table.
    # New code exclusively uses staff_code_sequences and employee_id_sequences.
    op.drop_table('staff_enrollment_sequences')


def downgrade():
    # Restore empty table structure (data is not recoverable -- format changed)
    op.create_table(
        'staff_enrollment_sequences',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('branch_id', sa.Integer(),
                  sa.ForeignKey('branches.id'), nullable=True),
        sa.Column('department_id', sa.Integer(),
                  sa.ForeignKey('department_master.id'), nullable=False),
        sa.Column('staff_code_prefix', sa.String(20), nullable=False),
        sa.Column('last_staff_no', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('employee_id_prefix', sa.String(20), nullable=False),
        sa.Column('last_employee_no', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.UniqueConstraint('branch_id', 'department_id',
                            name='uq_branch_dept_staff_sequence'),
        sa.CheckConstraint('last_staff_no >= 0', name='chk_staff_no_positive'),
        sa.CheckConstraint('last_employee_no >= 0', name='chk_employee_no_positive'),
    )
