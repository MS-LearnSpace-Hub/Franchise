"""hr school_id and dual sequence tables

Revision ID: f3a8b1c2d4e5
Revises: cdda20559d39
Create Date: 2026-06-27

Changes:
  1. Add school_id (FK -> schools.id) to staff_master
  2. Backfill staff_master.school_id from branches.school_id
  3. Create staff_code_sequences (per school + branch + department)
  4. Create employee_id_sequences  (per school + department)
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f3a8b1c2d4e5'
down_revision = '195a642ab54b'
branch_labels = None
depends_on = None


def upgrade():
    # -- 1. Add school_id to staff_master -------------------------------------
    op.add_column(
        'staff_master',
        sa.Column('school_id', sa.Integer(), nullable=True)
    )

    op.create_foreign_key(
        'fk_staff_master_school_id',
        'staff_master', 'schools',
        ['school_id'], ['id'],
        ondelete='SET NULL'
    )

    # Create an index for fast school-level queries
    op.create_index(
        'ix_staff_master_school_id',
        'staff_master',
        ['school_id']
    )

    # -- 2. Backfill school_id from branches ----------------------------------
    # For every staff that has a branch_id, copy branch.school_id -> staff.school_id
    op.execute("""
        UPDATE staff_master sm
        JOIN branches b ON sm.branch_id = b.id
        SET sm.school_id = b.school_id
        WHERE sm.branch_id IS NOT NULL
          AND sm.school_id IS NULL
    """)

    # -- 3. Create staff_code_sequences ---------------------------------------
    op.create_table(
        'staff_code_sequences',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('school_id', sa.Integer(), nullable=False),
        sa.Column('branch_id', sa.Integer(), nullable=False),
        sa.Column('department_id', sa.Integer(), nullable=False),
        sa.Column('last_sequence', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['department_id'], ['department_master.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('school_id', 'branch_id', 'department_id',
                            name='uq_staff_code_seq'),
        sa.CheckConstraint('last_sequence >= 0', name='chk_staff_code_seq_positive'),
    )

    # -- 4. Create employee_id_sequences --------------------------------------
    op.create_table(
        'employee_id_sequences',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('school_id', sa.Integer(), nullable=False),
        sa.Column('department_id', sa.Integer(), nullable=False),
        sa.Column('last_sequence', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False,
                  server_default=sa.text('NOW()')),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['department_id'], ['department_master.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('school_id', 'department_id',
                            name='uq_employee_id_seq'),
        sa.CheckConstraint('last_sequence >= 0', name='chk_employee_id_seq_positive'),
    )


def downgrade():
    op.drop_table('employee_id_sequences')
    op.drop_table('staff_code_sequences')
    op.drop_index('ix_staff_master_school_id', table_name='staff_master')
    op.drop_constraint('fk_staff_master_school_id', 'staff_master', type_='foreignkey')
    op.drop_column('staff_master', 'school_id')
