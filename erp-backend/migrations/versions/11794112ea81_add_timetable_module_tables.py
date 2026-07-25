"""Add timetable module tables

Revision ID: 11794112ea81
Revises: 407c67fbaeee
Create Date: 2026-07-18

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '11794112ea81'
down_revision = '407c67fbaeee'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('timetable_day_structure',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('school_id', sa.Integer(), nullable=True),
        sa.Column('branch_id', sa.Integer(), nullable=False),
        sa.Column('class_id', sa.Integer(), nullable=False),
        sa.Column('section_id', sa.Integer(), nullable=False),
        sa.Column('academic_year', sa.String(length=20), nullable=False),
        sa.Column('day_of_week', sa.Enum('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', name='tt_day_of_week'), nullable=False),
        sa.Column('is_working_day', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['class_id'], ['classes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['section_id'], ['class_sections.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['updated_by'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('branch_id', 'class_id', 'section_id', 'academic_year', 'day_of_week', name='uq_day_structure_context')
    )

    op.create_table('timetable_subject_teacher',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('school_id', sa.Integer(), nullable=True),
        sa.Column('branch_id', sa.Integer(), nullable=False),
        sa.Column('class_id', sa.Integer(), nullable=False),
        sa.Column('section_id', sa.Integer(), nullable=False),
        sa.Column('academic_year', sa.String(length=20), nullable=False),
        sa.Column('subject_id', sa.Integer(), nullable=False),
        sa.Column('teacher_id', sa.Integer(), nullable=True),
        sa.Column('is_primary', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['class_id'], ['classes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['school_id'], ['schools.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['section_id'], ['class_sections.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subject_id'], ['subjectmaster.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['teacher_id'], ['staff_master.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('branch_id', 'class_id', 'section_id', 'subject_id', 'academic_year', 'is_primary', name='uq_subject_teacher_context')
    )

    op.create_table('timetable_slot',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('day_structure_id', sa.Integer(), nullable=False),
        sa.Column('slot_order', sa.Integer(), nullable=False),
        sa.Column('slot_type', sa.Enum('PERIOD', 'BREAK', 'LUNCH', 'ASSEMBLY', name='tt_slot_type'), nullable=False),
        sa.Column('label', sa.String(length=100), nullable=True),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('subject_id', sa.Integer(), nullable=True),
        sa.Column('teacher_id', sa.Integer(), nullable=True),
        sa.Column('room', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=True),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.user_id'], ),
        sa.ForeignKeyConstraint(['day_structure_id'], ['timetable_day_structure.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['subject_id'], ['subjectmaster.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['teacher_id'], ['staff_master.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['updated_by'], ['users.user_id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_index('idx_day_structure_context', 'timetable_day_structure', ['branch_id', 'class_id', 'section_id', 'academic_year'], unique=False)
    op.create_index('idx_subj_teacher_context', 'timetable_subject_teacher', ['branch_id', 'class_id', 'section_id', 'academic_year'], unique=False)
    op.create_index('idx_slot_day_order', 'timetable_slot', ['day_structure_id', 'slot_order'], unique=False)
    op.create_index('idx_slot_teacher', 'timetable_slot', ['teacher_id'], unique=False)


def downgrade():
    op.drop_index('idx_slot_teacher', table_name='timetable_slot')
    op.drop_index('idx_slot_day_order', table_name='timetable_slot')
    op.drop_table('timetable_slot')

    op.drop_index('idx_subj_teacher_context', table_name='timetable_subject_teacher')
    op.drop_table('timetable_subject_teacher')

    op.drop_index('idx_day_structure_context', table_name='timetable_day_structure')
    op.drop_table('timetable_day_structure')