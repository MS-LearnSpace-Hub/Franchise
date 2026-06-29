
from extensions import db
from models import BranchYearSequence, Branch, OrgMaster
from datetime import datetime
from sqlalchemy import func

class SequenceService:
    
    @staticmethod
    def resolve_branch_id(branch_identifier):
        """
        Resolves a branch identifier (name or code) to its DB ID.
        Returns ID or None.
        """
        if isinstance(branch_identifier, int):
            return branch_identifier
            
        branch = Branch.query.filter(
            (Branch.branch_code == branch_identifier) | 
            (Branch.branch_name == branch_identifier)
        ).first()
        
        return branch.id if branch else None

    @staticmethod
    def resolve_academic_year_id(year_code):
        """
        Resolves an academic year code (e.g. '2025-2026') to its OrgMaster ID.
        Returns ID or None.
        """
        if isinstance(year_code, int):
            return year_code
            
        ay = OrgMaster.query.filter_by(
            master_type='ACADEMIC_YEAR',
            code=year_code
        ).first()
        
        return ay.id if ay else None

    @staticmethod
    def get_or_create_sequence(branch_id, academic_year_id, user_id=None):
        """
        Ensures a sequence row exists for the given Branch/Year.
        If not, creates it with default prefixes.
        THIS IS NOT LOCKED. Use inside transaction or careful context.
        """
        seq = BranchYearSequence.query.filter_by(
            branch_id=branch_id, 
            academic_year_id=academic_year_id
        ).first()
        
        if not seq:
            branch = Branch.query.get(branch_id)
            adm_prefix = branch.branch_code if branch else "GEN"
            rec_prefix = branch.branch_code if branch else "REC"
            
            # Inherit the highest sequence from any existing year for this branch
            # to prevent resetting to 0 and causing Duplicate Entry IntegrityErrors.
            max_adm = db.session.query(func.max(BranchYearSequence.last_admission_no))\
                .filter_by(branch_id=branch_id).scalar() or 0
            max_rec = db.session.query(func.max(BranchYearSequence.last_receipt_no))\
                .filter_by(branch_id=branch_id).scalar() or 0
            
            seq = BranchYearSequence(
                branch_id=branch_id,
                academic_year_id=academic_year_id,
                admission_prefix=adm_prefix,
                receipt_prefix=rec_prefix,  
                last_admission_no=max_adm,
                last_receipt_no=max_rec,
                created_by=user_id,
                updated_by=user_id
            )
            db.session.add(seq)
            db.session.flush()
            
        return seq

    @staticmethod
    def _get_locked_sequence(branch_id, academic_year_id):
        """
        Fetches the sequence row with ROW-LEVEL LOCKING.
        Must be called inside an active transaction.
        Also locks the Branch to ensure global branch-level synchronization across years.
        """
        # Lock the branch to prevent cross-year race conditions
        db.session.query(Branch).with_for_update().filter_by(id=branch_id).first()
        return db.session.query(BranchYearSequence).with_for_update().filter_by(
            branch_id=branch_id, 
            academic_year_id=academic_year_id
        ).first()

    @staticmethod
    def generate_admission_number(branch_id, academic_year_id):
        """
        Generates next Admission Number: {Prefix}{0000} (e.g. HATC0152)
        """
        seq = SequenceService._get_locked_sequence(branch_id, academic_year_id)
        
        if not seq:
            seq = SequenceService.get_or_create_sequence(branch_id, academic_year_id)
        
        # Ensure we always increment from the absolute highest sequence for this branch
        max_adm = db.session.query(func.max(BranchYearSequence.last_admission_no)).filter_by(branch_id=branch_id).scalar() or 0
        
        new_adm_no = max(max_adm, seq.last_admission_no) + 1
        seq.last_admission_no = new_adm_no
        return f"{seq.admission_prefix}{new_adm_no:04d}"

    @staticmethod
    def generate_receipt_number(branch_id, academic_year_id, include_prefix=False):
        """
        Generates next Fee Receipt Number.
        If include_prefix=True: {Prefix}{00} (e.g. TC01)
        If include_prefix=False: {00} (e.g. 01, 02, 03...)
        """
        seq = SequenceService._get_locked_sequence(branch_id, academic_year_id)
        
        if not seq:
            seq = SequenceService.get_or_create_sequence(branch_id, academic_year_id)
        
        max_rec = db.session.query(func.max(BranchYearSequence.last_receipt_no)).filter_by(branch_id=branch_id).scalar() or 0
        new_rec_no = max(max_rec, seq.last_receipt_no) + 1
        seq.last_receipt_no = new_rec_no
        
        if include_prefix:
            return f"{seq.receipt_prefix}{new_rec_no:02d}"
        else:
            return f"{new_rec_no:02d}"

from extensions import db
from models import BranchYearSequence, Branch, OrgMaster
from datetime import datetime

class SequenceService:
    
    @staticmethod
    def resolve_branch_id(branch_identifier):
        """
        Resolves a branch identifier (name or code) to its DB ID.
        Returns ID or None.
        """
        if isinstance(branch_identifier, int):
            return branch_identifier
            
        branch = Branch.query.filter(
            (Branch.branch_code == branch_identifier) | 
            (Branch.branch_name == branch_identifier)
        ).first()
        
        return branch.id if branch else None

    @staticmethod
    def resolve_academic_year_id(year_code):
        """
        Resolves an academic year code (e.g. '2025-2026') to its OrgMaster ID.
        Returns ID or None.
        """
        if isinstance(year_code, int):
            return year_code
            
        ay = OrgMaster.query.filter_by(
            master_type='ACADEMIC_YEAR',
            code=year_code
        ).first()
        
        return ay.id if ay else None

    @staticmethod
    def get_or_create_sequence(branch_id, academic_year_id, user_id=None):
        """
        Ensures a sequence row exists for the given Branch/Year.
        If not, creates it with default prefixes.
        THIS IS NOT LOCKED. Use inside transaction or careful context.
        """
        from helpers import skip_scoping
        from sqlalchemy.exc import IntegrityError

        with skip_scoping():
            seq = BranchYearSequence.query.filter_by(
                branch_id=branch_id, 
                academic_year_id=academic_year_id
            ).first()
            
            if not seq:
                try:
                    with db.session.begin_nested():
                        branch = Branch.query.get(branch_id)
                        adm_prefix = branch.branch_code if branch else "GEN"
                        rec_prefix = branch.branch_code if branch else "REC"
                        
                        seq = BranchYearSequence(
                            branch_id=branch_id,
                            academic_year_id=academic_year_id,
                            admission_prefix=adm_prefix,
                            receipt_prefix=rec_prefix,  
                            last_admission_no=0,
                            last_receipt_no=0,
                            created_by=user_id,
                            updated_by=user_id
                        )
                        db.session.add(seq)
                        db.session.flush()
                except IntegrityError:
                    # Catch race conditions where another thread created the sequence simultaneously
                    seq = db.session.query(BranchYearSequence).with_for_update().filter_by(
                        branch_id=branch_id, 
                        academic_year_id=academic_year_id
                    ).first()
                
            return seq

    @staticmethod
    def _get_locked_sequence(branch_id, academic_year_id):
        """
        Fetches the sequence row with ROW-LEVEL LOCKING.
        Must be called inside an active transaction.
        """
        from helpers import skip_scoping
        with skip_scoping():
            return db.session.query(BranchYearSequence).with_for_update().filter_by(
                branch_id=branch_id, 
                academic_year_id=academic_year_id
            ).first()

    @staticmethod
    def generate_admission_number(branch_id, academic_year_id):
        """
        Generates next Admission Number: {Prefix}{0000} (e.g. HATC0152)
        """
        seq = SequenceService._get_locked_sequence(branch_id, academic_year_id)
        
        if not seq:
            # Fallback: Create if not exists (though ideally should exist)
            # CAUTION: get_or_create_sequence does FLUSH. 
            # If we are in existing transaction, this is fine.
            # But we can't lock what doesn't exist.
            # So we create, then lock? Or just use the new one (which is implicitly locked by insert in this txn).
            seq = SequenceService.get_or_create_sequence(branch_id, academic_year_id)
        
        seq.last_admission_no += 1
        return f"{seq.admission_prefix}{seq.last_admission_no:04d}"

    @staticmethod
    def generate_receipt_number(branch_id, academic_year_id, include_prefix=False):
        """
        Generates next Fee Receipt Number.
        If include_prefix=True: {Prefix}{00} (e.g. TC01)
        If include_prefix=False: {00} (e.g. 01, 02, 03...)
        """
        seq = SequenceService._get_locked_sequence(branch_id, academic_year_id)
        
        if not seq:
            seq = SequenceService.get_or_create_sequence(branch_id, academic_year_id)
        
        seq.last_receipt_no += 1
        
        if include_prefix:
            return f"{seq.receipt_prefix}{seq.last_receipt_no:02d}"
        else:
            return f"{seq.last_receipt_no:02d}"  # Just the number 
>>>>>>> Staff
