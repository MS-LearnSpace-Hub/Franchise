# pyrefly: ignore [missing-import]
from flask import Blueprint, jsonify, request
from extensions import db, to_local_time
from models import SubjectMaster, Branch, OrgMaster, ClassSubjectAssignment
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql import exists
from helpers import (token_required, ensure_student_editable, get_user_allowed_branches,
                     StudentRecordLockedError, has_permission, resolve_user_scope,
                     can_manage_global, validate_cross_branch_access, skip_scoping)

bp = Blueprint("academic", __name__)
@bp.route("/api/academic/subjects", methods=["POST"])
@token_required
def create_subject(current_user):
    if not has_permission(current_user, "academics.academic.subject-master", "write"):
        return jsonify({"error": "Forbidden: missing permission"}), 403
    try: 
        data = request.json
        print(f"[DEBUG] Received request to create subject: {data}")

        if not data or not data.get("subject_name"):
            print("[ERROR] subject_name is missing from request")
            return jsonify({"error": "subject_name is required"}), 400

        subject_name = data["subject_name"].strip()
        subject_type = data.get("subject_type", "Academic")
        academic_year = data.get("academic_year")
        is_active = data.get("is_active", True) # Default to True if not sent

        if not academic_year:
             return jsonify({"error": "Academic Year is required"}), 400

        # Resolve school_id and branch_id — works for ALL roles via headers + permissions
        scope = resolve_user_scope(current_user)
        school_id = data.get("school_id") or scope['school_id']
        branch_id = data.get("branch_id") or scope['branch_id']

        # Validate the resolved IDs are within user's allowed scope
        if not scope['is_unlimited']:
            if school_id and scope['allowed_school_ids'] and school_id not in scope['allowed_school_ids']:
                return jsonify({"error": "Unauthorized school access"}), 403
            if branch_id and scope['allowed_branch_ids'] and branch_id not in scope['allowed_branch_ids']:
                return jsonify({"error": "Unauthorized branch access"}), 403

        # ✅ DUPLICATE CHECK (Scoped to Year, Type, School, and Branch)
        existing = SubjectMaster.query.filter_by(
            subject_name=subject_name,
            subject_type=subject_type,
            academic_year=academic_year,
            school_id=school_id,
            branch_id=branch_id
        ).first()

        if existing:
            print("[ERROR] Duplicate subject detected")
            return jsonify({
                "error": f"Subject '{subject_name}' already exists in {subject_type} group for year {academic_year}."
            }), 409

        subject = SubjectMaster(
            subject_name=subject_name,
            subject_type=subject_type,
            academic_year=academic_year,
            is_active=is_active,
            school_id=school_id,
            branch_id=branch_id
        )

        db.session.add(subject)
        db.session.commit()

        print(f"[SUCCESS] Subject created with ID: {subject.id}")
        return jsonify({
            "message": "Subject created successfully",
            "id": subject.id
        }), 201

    except IntegrityError as e:
        print(f"[ERROR] IntegrityError: {str(e)}")
        db.session.rollback()
        return jsonify({
            "error": "Duplicate subject is not allowed."
        }), 409

    except Exception as e:
        print(f"[ERROR] Failed to create subject: {str(e)}")
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@bp.route("/api/academic/subjects", methods=["GET"])
@token_required
def list_subjects(current_user):
    if not has_permission(current_user, "academics.academic.subject-master", "read"):
        return jsonify({"error": "Forbidden: missing permission"}), 403
    try:
        academic_year = request.args.get("academic_year")
        if academic_year:
            academic_year = academic_year.strip()
        
        query = SubjectMaster.query
        
        if academic_year:
            query = query.filter(
                (SubjectMaster.academic_year == academic_year) | 
                (SubjectMaster.academic_year.is_(None))
            )
            
        # Scope filtering — works for all roles via allowed branches
        scope = resolve_user_scope(current_user)
        if not scope['is_unlimited']:
            allowed_branch_ids = scope['allowed_branch_ids'] or set()
            effective_school_id = scope['school_id']
            
            if effective_school_id:
                if allowed_branch_ids:
                    branch_cond = SubjectMaster.branch_id.in_(list(allowed_branch_ids))
                    query = query.filter(
                        (SubjectMaster.school_id.is_(None) & SubjectMaster.branch_id.is_(None)) |
                        ((SubjectMaster.school_id == effective_school_id) & (SubjectMaster.branch_id.is_(None) | branch_cond))
                    )
                else:
                    query = query.filter(
                        (SubjectMaster.school_id.is_(None) & SubjectMaster.branch_id.is_(None)) |
                        ((SubjectMaster.school_id == effective_school_id) & SubjectMaster.branch_id.is_(None))
                    )
            else:
                query = query.filter(SubjectMaster.school_id.is_(None) & SubjectMaster.branch_id.is_(None))
                
        subjects = query.all()
        return jsonify([
            {
                "id": s.id, 
                "subject_name": s.subject_name,
                "subject_type": s.subject_type,
                "academic_year": s.academic_year,
                "is_active": s.is_active,
                "school_id": s.school_id,
                "branch_id": s.branch_id,
                "created_at": to_local_time(s.created_at).isoformat() if s.created_at else None,
                "updated_at": to_local_time(s.updated_at).isoformat() if s.updated_at else None,
                "created_by": s.created_by,
                "updated_by": s.updated_by
            }
            for s in subjects
        ])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/academic/copy-subjects", methods=["POST"])
@token_required
def copy_subjects(current_user):
    """
    Copies Subjects from a source branch to multiple target branches.
    Uses skip_scoping to allow multi-tenant inserts.
    """
    if not has_permission(current_user, "academics.academic.subject-master", "write"):
        return jsonify({"error": "Forbidden: missing permission"}), 403

    try:
        data = request.json or {}
        source_branch_id_raw = data.get("source_branch_id")
        target_branch_ids_raw = data.get("target_branch_ids")
        academic_year = data.get("academic_year")

        if not all([source_branch_id_raw, target_branch_ids_raw, academic_year]):
            return jsonify({"error": "Missing required fields"}), 400

        source_branch_id = int(source_branch_id_raw)
        target_branch_ids = [int(x) for x in target_branch_ids_raw if x]

        # Validate permissions for cross-branch copy
        is_valid, perm_error = validate_cross_branch_access(
            current_user,
            source_branch_id=source_branch_id,
            target_branch_ids=target_branch_ids
        )
        if not is_valid:
            return jsonify({"error": perm_error}), 403

        # Fetch source subjects
        source_subjects = SubjectMaster.query.filter_by(
            branch_id=source_branch_id,
            academic_year=academic_year
        ).all()

        if not source_subjects:
            return jsonify({"message": "No subjects found in source branch to copy."}), 404

        target_branches = Branch.query.filter(Branch.id.in_(target_branch_ids)).all()

        copied_count = 0
        skipped_count = 0

        with skip_scoping():
            for t_br in target_branches:
                for src_sub in source_subjects:
                    try:
                        with db.session.begin_nested():
                            # Check if subject already exists in target branch
                            existing = SubjectMaster.query.filter_by(
                                subject_name=src_sub.subject_name,
                                subject_type=src_sub.subject_type,
                                academic_year=academic_year,
                                branch_id=t_br.id
                            ).first()

                            if existing:
                                skipped_count += 1
                                continue

                            new_sub = SubjectMaster(
                                subject_name=src_sub.subject_name,
                                subject_type=src_sub.subject_type,
                                academic_year=academic_year,
                                is_active=src_sub.is_active,
                                branch_id=t_br.id,
                                school_id=t_br.school_id or src_sub.school_id
                            )
                            db.session.add(new_sub)
                            db.session.flush()
                            copied_count += 1
                    except IntegrityError:
                        skipped_count += 1

        db.session.commit()
        return jsonify({
            "message": "Subjects copied successfully",
            "details": {
                "copied": copied_count,
                "skipped": skipped_count
            }
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Copy Subjects: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route("/api/academic/subjects/<int:subject_id>", methods=["PUT"])
@token_required
def update_subject(current_user, subject_id):
    if not has_permission(current_user, "academics.academic.subject-master", "write"):
        return jsonify({"error": "Forbidden: missing permission"}), 403
    try:
        data = request.json
        if not data:
             return jsonify({"error": "No data provided"}), 400

        subject = SubjectMaster.query.get(subject_id)
        if not subject:
            return jsonify({"error": "Subject not found"}), 404

        # Scope check — works for all roles via permissions
        scope = resolve_user_scope(current_user)
        if not scope['is_unlimited']:
            if subject.school_id is None and not can_manage_global(current_user):
                return jsonify({"error": "Cannot modify global subjects without franchise management permission"}), 403
            if subject.school_id and scope['allowed_school_ids'] and subject.school_id not in scope['allowed_school_ids']:
                return jsonify({"error": "Unauthorized"}), 403
            if subject.branch_id and scope['allowed_branch_ids'] and subject.branch_id not in scope['allowed_branch_ids']:
                return jsonify({"error": "Unauthorized"}), 403

        if "subject_name" in data:
            subject.subject_name = data["subject_name"].strip()
            
        if "subject_type" in data:
            subject.subject_type = data["subject_type"]

        if "is_active" in data:
            subject.is_active = data["is_active"]
            
        db.session.commit()

        return jsonify({"message": "Subject updated successfully"})

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/academic/subjects/<int:subject_id>", methods=["DELETE"])
@token_required
def delete_subject(current_user, subject_id):
    if not has_permission(current_user, "academics.academic.subject-master", "write"):
        return jsonify({"error": "Forbidden: missing permission"}), 403
    try:
        subject = SubjectMaster.query.get(subject_id)
        if not subject:
            return jsonify({"error": "Subject not found"}), 404

        # Scope check — works for all roles via permissions
        scope = resolve_user_scope(current_user)
        if not scope['is_unlimited']:
            if subject.school_id is None and not can_manage_global(current_user):
                return jsonify({"error": "Cannot delete global subjects without franchise management permission"}), 403
            if subject.school_id and scope['allowed_school_ids'] and subject.school_id not in scope['allowed_school_ids']:
                return jsonify({"error": "Unauthorized"}), 403
            if subject.branch_id and scope['allowed_branch_ids'] and subject.branch_id not in scope['allowed_branch_ids']:
                return jsonify({"error": "Unauthorized"}), 403

        # 🔒 Check if subject is assigned to ANY class
        assigned = (
            db.session.query(ClassSubjectAssignment.id)
            .filter(ClassSubjectAssignment.subject_id == subject_id)
            .first()
        )

        if assigned:
            return jsonify({
                "error": "Subject already assigned to class. Cannot delete."
            }), 409  # Conflict

        db.session.delete(subject)
        db.session.commit()

        return jsonify({"message": "Subject deleted successfully"})

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------
# Class Subject Assignment
# ---------------------------------------------------------
from models import ClassSubjectAssignment, Branch, ClassMaster, OrgMaster, Student, StudentSubjectAssignment, StudentAcademicRecord

@bp.route("/api/academic/assign-subjects", methods=["POST"])
@token_required
def assign_subjects(current_user):
    try:
        data = request.json
        print(f"[DEBUG] Assign Request: {data}")
        
        class_id = data.get("class_id")
        subject_id = data.get("subject_id")
        academic_year_id = data.get("academic_year_id")
        location_id = data.get("location_id")
        branch_id_input = data.get("branch_id") # Can be int or "All" string if handled that way, mainly int expected

        if not all([class_id, subject_id, academic_year_id, location_id]):
            return jsonify({"error": "Missing required fields"}), 400

        # Logic: If branch_id_input is "All" or -1 (depending on frontend), fetch all branches
        # Assuming frontend sends -1 or "All" for All Branches, or a list.
        # Let's assume frontend sends "All" or similar if intended for all.
        
        # Resolution Logic (IDs -> Names)
        academic_year_name = str(academic_year_id)
        if str(academic_year_id).isdigit():
             ay = OrgMaster.query.filter_by(id=academic_year_id, master_type='ACADEMIC_YEAR').first()
             if ay:
                 academic_year_name = ay.display_name
        
        # Location (Default Hyderabad if ID/Name logic ambiguous, assuming input is ID)
        location_name = "Hyderabad" 
        # Optional: Resolve if location_id is provided and you have a Location Master. 
        # Current logic often defaults to Hyderabad or takes string.

        # Check permissions
        allowed = get_user_allowed_branches(current_user)

        target_branches = []
        if branch_id_input == "All" or branch_id_input == -1:
             branches = Branch.query.filter_by(is_active=True).all()
             if not allowed['is_unlimited']:
                 target_branches = [b for b in branches if b.branch_name in allowed['names']]
             else:
                 target_branches = [b for b in branches]
        else:
             # Fetch specific branch obj
             br = Branch.query.filter_by(id=branch_id_input).first()
             if br:
                  target_branches = [br]

        if not allowed['is_unlimited']:
            for br_obj in target_branches:
                if br_obj.branch_name not in allowed['names']:
                    return jsonify({"error": f"Unauthorized branch: '{br_obj.branch_name}'"}), 403
        
        assignments_created = 0
        
        for br_obj in target_branches:
            b_name = br_obj.branch_name
            # Check if exists (Using Names & IDs)
            exists = ClassSubjectAssignment.query.filter_by(
                class_id=class_id,
                subject_id=subject_id,
                academic_year=academic_year_name,
                location_name=location_name,
                branch_id=br_obj.id
            ).first()

            if not exists:
                new_assign = ClassSubjectAssignment(
                    class_id=class_id,
                    subject_id=subject_id,
                    academic_year=academic_year_name,
                    location_name=location_name,
                    branch=b_name,
                    branch_id=br_obj.id
                )
                db.session.add(new_assign)
                assignments_created += 1
        
        db.session.commit()
        return jsonify({"message": f"Successfully assigned to {assignments_created} contexts"}), 201

    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Assign failed: {e}")
        return jsonify({"error": str(e)}), 500

@bp.route("/api/academic/assigned-subjects", methods=["GET"])
@token_required
def get_assigned_subjects(current_user):
    try:
        # Filters (Inputs might be IDs or Names)
        class_id = request.args.get("class_id")
        academic_year_input = request.args.get("academic_year_id")
        branch_input = request.args.get("branch_id")
        
        # Resolve Names for Filtering
        academic_year_name = None
        if academic_year_input:
             if str(academic_year_input).isdigit():
                  ay = OrgMaster.query.filter_by(id=academic_year_input).first()
                  if ay: academic_year_name = ay.display_name
             else:
                  academic_year_name = academic_year_input

        branch_name = None
        if branch_input and branch_input != "All":
             if str(branch_input).isdigit():
                 br = Branch.query.filter_by(id=branch_input).first()
                 if br: branch_name = br.branch_name
             else:
                 branch_name = branch_input

        # Query
        query = db.session.query(ClassSubjectAssignment, SubjectMaster)\
            .join(SubjectMaster, ClassSubjectAssignment.subject_id == SubjectMaster.id)
            
        if class_id:
            query = query.filter(ClassSubjectAssignment.class_id == class_id)
        
        if academic_year_name:
            query = query.filter(ClassSubjectAssignment.academic_year == academic_year_name)
            
        allowed = get_user_allowed_branches(current_user)
        if not allowed['is_unlimited']:
             if branch_name and branch_name != "All":
                  if branch_name not in allowed['names']:
                       branch_name = None
             if branch_name:
                  query = query.filter(ClassSubjectAssignment.branch == branch_name)
             else:
                  query = query.filter(ClassSubjectAssignment.branch.in_(list(allowed['names'])))
        else:
             if branch_name:
                  query = query.filter(ClassSubjectAssignment.branch == branch_name)

        results = query.all()
        
        output = []
        for assign, subject in results:
            output.append({
                "id": assign.id,
                "class_id": assign.class_id,
                "subject_name": subject.subject_name,
                "subject_type": subject.subject_type,
                "branch_name": assign.branch,
                "created_at": to_local_time(assign.created_at).isoformat() if assign.created_at else None,
                "updated_at": to_local_time(assign.updated_at).isoformat() if assign.updated_at else None,
                "created_by": assign.created_by,
                "updated_by": assign.updated_by
            })
            
        return jsonify(output)

    except Exception as e:
        print(f"[ERROR] List assigned failed: {e}")
        return jsonify({"error": str(e)}), 500

@bp.route("/api/academic/assigned-subjects/<int:id>", methods=["DELETE"])
@token_required
def delete_assignment(current_user, id):
    try:
        record = ClassSubjectAssignment.query.get(id)
        if not record:
            return jsonify({"error": "Assignment not found"}), 404

        allowed = get_user_allowed_branches(current_user)
        if not allowed['is_unlimited'] and record.branch not in allowed['names']:
            return jsonify({"error": "Unauthorized"}), 403

        # 🔒 ERP LOCK:
        # Block deletion if subject is already used by any student
        # in the SAME class + academic year

        # Resolve class_id to class_name for historical check
        class_obj = ClassMaster.query.get(record.class_id)
        if not class_obj:
            return jsonify({"error": f"Consistency issue: Class with ID {record.class_id} not found."}), 500

        exists = (
            db.session.query(StudentSubjectAssignment.id)
            .join(
                StudentAcademicRecord,
                StudentAcademicRecord.student_id == StudentSubjectAssignment.student_id
            )
            .filter(
                StudentSubjectAssignment.subject_id == record.subject_id,
                StudentAcademicRecord.class_name == class_obj.class_name, # Match by name
                StudentAcademicRecord.academic_year == record.academic_year
            )
            .first()
        )

        if exists:
            return jsonify({
                "error": "Cannot unassign subject. Subject already assigned to students."
            }), 409

        db.session.delete(record)
        db.session.commit()

        return jsonify({"message": "Deleted successfully"}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/academic/manage-subject-assignment/bulk", methods=["POST"])
@token_required
def manage_subject_assignment_bulk(current_user):
    try:
        data = request.json
        updates = data.get("updates", [])
        
        # Frontend sends Ids usually. We need Names.
        # But wait, frontend calls logic is sending `academic_year` (which typically is ID).
        # We need to resolve names.
        
        academic_year_id = data.get("academic_year_id") # Likely an ID or Name
        branch_id_input = data.get("branch_id")
        
        # Resolve Academic Year Name
        # If it's an ID (digit), fetch name. If it's not digit, assume it's Name.
        academic_year_name = str(academic_year_id)
        if str(academic_year_id).isdigit():
             ay = OrgMaster.query.filter_by(id=academic_year_id, master_type='ACADEMIC_YEAR').first()
             if ay:
                 academic_year_name = ay.display_name
        
        # Resolve Target Branches (NAMES)
        target_branches = [] # List of Names
        if branch_id_input == "All" or branch_id_input == -1:
             branches_objs = Branch.query.filter_by(is_active=True).all()
             target_branches = [b.branch_name for b in branches_objs]
        else:
             # Assume specific branch ID
             br = Branch.query.filter_by(id=branch_id_input).first()
             if br:
                 target_branches = [br.branch_name]
             else:
                 # fallback if input was name?
                 target_branches = [str(branch_id_input)]

        # Check permissions
        allowed = get_user_allowed_branches(current_user)
        if not allowed['is_unlimited']:
            for b_name in target_branches:
                if b_name not in allowed['names']:
                    return jsonify({"error": f"Unauthorized branch: '{b_name}'"}), 403

        location_name = "Hyderabad" # Default/Hardcoded as per previous logic

        if not updates:
             return jsonify({"message": "No updates to process"}), 200

        # --- Performance: Create a lookup map for class IDs to names ---
        all_class_ids_in_request = {up.get("class_id") for up in updates if up.get("class_id")}
        classes_map = {c.id: c.class_name for c in ClassMaster.query.filter(ClassMaster.id.in_(all_class_ids_in_request)).all()}
        
        processed_count = 0
        errors_found = [] # To collect errors

        for update in updates:
            action = update.get("action")
            class_id = update.get("class_id")
            subject_id = update.get("subject_id")

            if not all([action, class_id, subject_id]): 
                continue

            # Resolve class name for historical check
            current_class_name = classes_map.get(class_id)
            if not current_class_name:
                print(f"[WARN] Skipping update for invalid class_id: {class_id}")
                errors_found.append(f"Invalid class ID encountered: {class_id}")
                continue
                
            for b_name in target_branches:
                existing = ClassSubjectAssignment.query.filter_by(
                    class_id=class_id,
                    subject_id=subject_id,
                    academic_year=academic_year_name,
                    branch=b_name
                ).first()

                if action == "assign":
                    if not existing:
                        new_assign = ClassSubjectAssignment(
                            class_id=class_id,
                            subject_id=subject_id,
                            academic_year=academic_year_name,
                            location_name=location_name,
                            branch=b_name
                        )
                        db.session.add(new_assign)
                        processed_count += 1
                
                elif action == "remove":
                    if existing:
                        used = (
                            db.session.query(StudentSubjectAssignment.id)
                            .join(
                                StudentAcademicRecord,
                                StudentAcademicRecord.student_id == StudentSubjectAssignment.student_id
                            )
                            .filter(
                                StudentSubjectAssignment.subject_id == subject_id,
                                StudentAcademicRecord.class_name == current_class_name,
                                StudentAcademicRecord.academic_year == academic_year_name,
                                StudentSubjectAssignment.branch == b_name
                            )
                            .first()
                        )
                        if used:
                            errors_found.append(f"Subject '{subject_id}' (Class: '{current_class_name}', Branch: '{b_name}') is assigned to students and cannot be unassigned.")
                        else:
                            db.session.delete(existing)
                            processed_count += 1
        
        if errors_found:
            db.session.rollback()
            return jsonify({"error": "One or more subjects could not be unassigned.", "details": errors_found}), 409
            
        db.session.commit()
        return jsonify({"message": f"Successfully processed {processed_count} updates for {len(target_branches)} branches (Year: {academic_year_name})"}), 200

    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Bulk Assign failed: {e}")
        return jsonify({"error": str(e)}), 500

@bp.route("/api/academic/manage-subject-assignment", methods=["POST"])
@token_required
def manage_subject_assignment(current_user):
    # Deprecated/Wrapper for single update, can call bulk logic or implement similarly
    # For now implementation similar to bulk but single item
    try:
        data = request.json
        action = data.get("action")
        class_id = data.get("class_id")
        subject_id = data.get("subject_id")
        
        class_obj = ClassMaster.query.get(class_id)
        current_class_name = class_obj.class_name if class_obj else None
        
        academic_year_id = data.get("academic_year_id")
        branch_id_input = data.get("branch_id")
        
        # Logic same as bulk...
        # Resolve Names
        academic_year_name = str(academic_year_id)
        if str(academic_year_id).isdigit():
             ay = OrgMaster.query.filter_by(id=academic_year_id, master_type='ACADEMIC_YEAR').first()
             if ay:
                 academic_year_name = ay.display_name
         
        target_branches = []
        if branch_id_input == "All" or branch_id_input == -1:
             branches_objs = Branch.query.filter_by(is_active=True).all()
             target_branches = [b.branch_name for b in branches_objs]
        else:
             br = Branch.query.filter_by(id=branch_id_input).first()
             if br:
                 target_branches = [br.branch_name]
             else:
                 target_branches = [str(branch_id_input)]

        # Check permissions
        allowed = get_user_allowed_branches(current_user)
        if not allowed['is_unlimited']:
            for b_name in target_branches:
                if b_name not in allowed['names']:
                    return jsonify({"error": f"Unauthorized branch: '{b_name}'"}), 403
                  
        location_name = "Hyderabad"

        processed = 0
        for b_name in target_branches:
            existing = ClassSubjectAssignment.query.filter_by(
                class_id=class_id,
                subject_id=subject_id,
                academic_year=academic_year_name,
                branch=b_name
            ).first()
            
            if action == "assign":
                if not existing:
                    db.session.add(ClassSubjectAssignment(
                         class_id=class_id, subject_id=subject_id, 
                         academic_year=academic_year_name, branch=b_name, location_name=location_name
                    ))
                    processed += 1
            elif action == "remove":
                 if existing:
                     used = (
                         db.session.query(StudentSubjectAssignment.id)
                         .join(
                             StudentAcademicRecord,
                             StudentAcademicRecord.student_id == StudentSubjectAssignment.student_id
                         )
                         .filter(
                             StudentSubjectAssignment.subject_id == subject_id,
                             StudentAcademicRecord.class_name == current_class_name,
                             StudentAcademicRecord.academic_year == academic_year_name,
                             StudentSubjectAssignment.branch == b_name
                         )
                         .first()
                     )
                     if used:
                          return jsonify({"error": f"Subject '{subject_id}' (Class: '{current_class_name}', Branch: '{b_name}') is assigned to students and cannot be unassigned."}), 409
                     db.session.delete(existing)
                     processed += 1
        
        db.session.commit()
        return jsonify({"message": f"Processed {processed}"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/sections", methods=["GET"])
@token_required
def get_sections(current_user):
    """
    Get sections for a specific class.
    Query Param: class (required)
    Returns: List of unique sections.
    """
    class_name = request.args.get("class")
    if not class_name:
        return jsonify({"error": "Class name is required"}), 400

    # Pull sections from class_sections table (source of truth for class/section setup).
    from models import ClassMaster, ClassSection, Branch

    branch_input = request.args.get("branch") or request.headers.get("X-Branch")
    academic_year = request.args.get("academic_year") or request.headers.get("X-Academic-Year")
    if academic_year:
        academic_year = academic_year.strip()

    try:
        sections = db.session.query(Student.section).filter(Student.clazz == class_name).distinct().all()
        query = db.session.query(ClassSection.section_name).join(
            ClassMaster, ClassMaster.id == ClassSection.class_id
        ).filter(
            ClassMaster.class_name == class_name,
            ClassSection.is_active == True
        )

        if academic_year:
            query = query.filter(ClassSection.academic_year == academic_year)

        allowed = get_user_allowed_branches(current_user)
        if not allowed['is_unlimited']:
            if branch_input and branch_input != "All":
                branch_obj = None
                if str(branch_input).isdigit():
                    branch_obj = Branch.query.get(int(branch_input))
                else:
                    branch_obj = Branch.query.filter_by(branch_name=branch_input).first() or \
                                 Branch.query.filter_by(branch_code=branch_input).first()

                if branch_obj and branch_obj.branch_name in allowed['names']:
                    query = query.filter(ClassSection.branch_id == branch_obj.id)
                else:
                    allowed_br_ids = [b.id for b in Branch.query.filter(Branch.branch_name.in_(list(allowed['names']))).all()]
                    query = query.filter(ClassSection.branch_id.in_(allowed_br_ids))
            else:
                allowed_br_ids = [b.id for b in Branch.query.filter(Branch.branch_name.in_(list(allowed['names']))).all()]
                query = query.filter(ClassSection.branch_id.in_(allowed_br_ids))
        else:
            if branch_input and branch_input != "All":
                branch_obj = None
                if str(branch_input).isdigit():
                    branch_obj = Branch.query.get(int(branch_input))
                else:
                    branch_obj = Branch.query.filter_by(branch_name=branch_input).first() or \
                                 Branch.query.filter_by(branch_code=branch_input).first()

                if branch_obj:
                    query = query.filter(ClassSection.branch_id == branch_obj.id)

        sections = query.distinct().all()
        # Flatten list of tuples
        section_list = [s[0] for s in sections if s[0]]
        
        # Sort them nicely (A, B, C...)
        section_list.sort()
        
        if not section_list:
             # Fallback/Default if no students yet? Or return empty?
             # Let's return defaults if empty, or just empty. 
             # User expects A, B, C, D usually.
             pass 
             
        return jsonify({"sections": section_list}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
# ---------------------------------------------------------
# Student Subject Assignment (Overrides)
# ---------------------------------------------------------
@bp.route("/api/academics/assignment-data", methods=["GET"])
@token_required
def get_assignment_data(current_user):
    from sqlalchemy import or_, and_

    try:
        class_id = request.args.get("class_id") # e.g. "X"
        section_id = request.args.get("section_id") # e.g. "A"
        academic_year = request.args.get("academic_year")
        branch = request.args.get("branch")
        subject_type = request.args.get("subject_type")
        
        if not all([class_id, academic_year, branch]):
            return jsonify({"error": "Missing required filters"}), 400

        # Normalize academic year (trim spaces)
        academic_year = academic_year.strip() if academic_year else academic_year

        print(f"[DEBUG] get_assignment_data: class_id={class_id}, academic_year='{academic_year}', branch={branch}")

        # 1. Get Students (History-Aware)
        # We need to find students who were in this class/section in the requested academic_year.
        # They might be currently in a different class (promoted), so we check StudentAcademicRecord.

        query = db.session.query(Student, StudentAcademicRecord).outerjoin(
            StudentAcademicRecord,
            and_(Student.student_id == StudentAcademicRecord.student_id, 
                 StudentAcademicRecord.academic_year == academic_year)
        )

        # Check Branch
        allowed = get_user_allowed_branches(current_user)
        if not allowed['is_unlimited']:
             if branch and branch != "All":
                  if branch not in allowed['names']:
                       return jsonify({"error": "Unauthorized branch"}), 403
                  query = query.filter(Student.branch == branch)
             else:
                  query = query.filter(Student.branch.in_(list(allowed['names'])))
        else:
             if branch and branch != "All":
                  query = query.filter(Student.branch == branch)

        # Filter by Class and Academic Year
        # We MUST ensure the student was in this class in THIS academic year.
        # Primary check: StudentAcademicRecord (History)
        # Fallback check: Student Profile (Current) - ONLY if NO record exists for that student in ANY year?
        # Actually, StudentAcademicRecord is created for the current year too usually.
        
        # Stricter Filter:
        # If a record exists for THIS year, it MUST match the class.
        # If NO record exists for THIS year, they MUST match the current profile year and class.
        
        query = query.filter(or_(
            and_(StudentAcademicRecord.id != None, StudentAcademicRecord.class_name == class_id),
            and_(
                StudentAcademicRecord.id == None, 
                Student.clazz == class_id, 
                Student.academic_year == academic_year
            )
        ))

        # Filter by Section (if provided)
        if section_id and section_id != "All Sections" and section_id != "":
             query = query.filter(or_(
                and_(StudentAcademicRecord.id != None, StudentAcademicRecord.section == section_id),
                and_(StudentAcademicRecord.id == None, Student.section == section_id)
            ))
            
        # Status - optional, maybe only Active?
        query = query.filter(Student.status == "Active")

        rows = query.all()
        
        student_list = []
        for row in rows:
            student, record = row
            # If record exists, use its roll number, otherwise student's
            roll_no = record.roll_number if record else student.Roll_Number
            
            student_list.append({
                "student_id": student.student_id,
                "admission_no": student.admission_no,
                "name": f"{student.first_name} {student.last_name}",
                "roll_number": roll_no
            })

        # 2. Get Class Subjects (Default Assignments)
        # ClassSubjectAssignment uses class_id (Integer). We have class_id (String Name).
        # Resolve Name -> ID
        class_obj = ClassMaster.query.filter_by(class_name=class_id).first()
        if not class_obj:
             # If class not found in master, probably no assignments either. 
             # return empty, or handle error. 
             # But we found students, so class exists? 
             # Students might utilize a class name not in master? Unlikely but possible in loose systems.
             # Return empty subjects if Class Master not found.
             return jsonify({
                "students": student_list,
                "subjects": [],
                "overrides": {}
             }), 200
        
        real_class_id = class_obj.id

        class_subjects_query = db.session.query(ClassSubjectAssignment, SubjectMaster)\
            .join(SubjectMaster, ClassSubjectAssignment.subject_id == SubjectMaster.id)\
            .filter(ClassSubjectAssignment.class_id == real_class_id)
            
        if subject_type:
            class_subjects_query = class_subjects_query.filter(SubjectMaster.subject_type == subject_type)
            
        class_subjects = class_subjects_query.all()

        # NOTE: If we get empty class_subjects, it might be due to ID mismatch. 
        # We will filter visually on frontend if needed, but better to query correctly.
        # Let's try to match logic in `get_assigned_subjects` (line 205). 
        # It takes `class_id` and filters directly.

        # Additional Filter: Academic Year and Branch
        # ClassSubjectAssignment stores academic_year and branch_name as STRINGS (Names).
        # We assume params academic_year and branch are Names.
        
        # We have to filter the list manually or add to query if we are sure about column names.
        # Existing query was specific to Class. Let's refine.
        
        subject_list = []
        for assign, subj in class_subjects:
            # Check context matches
            if (assign.academic_year == academic_year and 
                assign.branch == branch):
                subject_list.append({
                    "subject_id": subj.id,
                    "subject_name": subj.subject_name,
                    "subject_type": subj.subject_type
                })

        # 3. Get Overrides
        # Extract student IDs from the processed list
        student_ids = [s['student_id'] for s in student_list]
        
        overrides_query = StudentSubjectAssignment.query.filter(
            StudentSubjectAssignment.student_id.in_(student_ids),
            StudentSubjectAssignment.academic_year == academic_year
        )
        if not allowed['is_unlimited']:
             overrides_query = overrides_query.filter(StudentSubjectAssignment.branch.in_(list(allowed['names'])))
        else:
             if branch:
                  overrides_query = overrides_query.filter(StudentSubjectAssignment.branch == branch)
        overrides = overrides_query.all()
        
        override_map = {}
        for o in overrides:
            if o.student_id not in override_map:
                override_map[o.student_id] = {}
            override_map[o.student_id][o.subject_id] = o.status

        return jsonify({
            "students": student_list,
            "subjects": subject_list,
            "overrides": override_map
        }), 200

    except Exception as e:
        import traceback
        import sys
        
        err_msg = traceback.format_exc()
        print(f"[ERROR] Assignment Data Traceback:\n{err_msg}", file=sys.stderr)
        
        try:
            with open("backend_error.log", "w") as f:
                f.write(err_msg)
        except:
             pass

        return jsonify({"error": str(e), "traceback": err_msg}), 500

@bp.route("/api/academics/save-student-subjects", methods=["POST"])
@token_required
def save_student_subjects(current_user):
    try:
        data = request.json
        academic_year = data.get("academic_year")
        branch = data.get("branch")
        student_data = data.get("data") # List of { student_id, subjects: { sub_id: bool } }

        if not all([academic_year, branch, student_data]):
            return jsonify({"error": "Missing data"}), 400

        allowed = get_user_allowed_branches(current_user)
        if not allowed['is_unlimited'] and branch not in allowed['names']:
             return jsonify({"error": "Unauthorized"}), 403
            
        # Normalize academic year
        academic_year = academic_year.strip() if academic_year else academic_year
        class_id = data.get("class_id") # New: context validation

        for item in student_data:
            s_id = item.get("student_id")
            try:
                s_obj = Student.query.get(s_id)
                if not s_obj:
                    return jsonify({"error": f"Student {s_id} not found"}), 404
                if not allowed['is_unlimited'] and s_obj.branch not in allowed['names']:
                    return jsonify({"error": f"Unauthorized branch access for student {s_id} in branch {s_obj.branch}"}), 403

                # 1. Basic Editability Check (Lock/Record existence)
                ensure_student_editable(s_id, academic_year)
                
                # 2. Context Consistency Check
                # Verify student is in the requested class for the requested year
                from models import StudentAcademicRecord
                valid_student = False
                
                # Check history
                hist_record = StudentAcademicRecord.query.filter_by(student_id=s_id, academic_year=academic_year).first()
                if hist_record:
                    if hist_record.class_name == class_id:
                        valid_student = True
                else: 
                    # Check current profile if no history record for this year
                    if s_obj.clazz == class_id and s_obj.academic_year == academic_year:
                        valid_student = True
                
                if not valid_student:
                    print(f"[WARN] Save blocked: Student {s_id} does not match context year={academic_year}, class={class_id}")
                    return jsonify({"error": f"Student {s_id} does not belong to class {class_id} in {academic_year}"}), 400

            except StudentRecordLockedError as e:
                return jsonify({"error": str(e)}), 403
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        count = 0
        for item in student_data:
            s_id = item.get("student_id")
            subjects = item.get("subjects", {})
            
            for sub_id, status in subjects.items():
                # Upsert
                record = StudentSubjectAssignment.query.filter_by(
                    student_id=s_id,
                    subject_id=sub_id,
                    academic_year=academic_year
                ).first() # Unique constraint doesn't include branch in logic but maybe we should? 
                # Schema: unique(student_id, subject_id, academic_year). 
                # Branch is redundant but good for filtering.
                
                if record:
                    record.status = status
                    record.branch = branch 
                else:
                    record = StudentSubjectAssignment(
                        student_id=s_id,
                        subject_id=sub_id,
                        academic_year=academic_year,
                        branch=branch,
                        status=status
                    )
                    db.session.add(record)
                count += 1
        
        db.session.commit()
        return jsonify({"message": "Saved successfully", "count": count}), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Save Student Subjects: {e}")
        return jsonify({"error": str(e)}), 500

@bp.route("/api/academic/copy-subject-assignments", methods=["POST"])
@token_required
def copy_subject_assignments(current_user):
    try:
        data = request.json
        source_branch_id = int(data.get("source_branch_id")) if data.get("source_branch_id") is not None else None
        target_branch_ids = [int(x) for x in data.get("target_branch_ids", []) if x is not None]
        academic_year_id = data.get("academic_year_id") # Usually ID
        
        if not all([source_branch_id, target_branch_ids, academic_year_id]):
            return jsonify({"error": "Missing required fields"}), 400
            
        if source_branch_id in target_branch_ids:
            # Just in case details slip through
            target_branch_ids = [t for t in target_branch_ids if t != source_branch_id]

        # 1. Resolve Names (ID -> Name)
        # Academic Year
        academic_year_name = str(academic_year_id)
        ay = OrgMaster.query.filter_by(id=academic_year_id, master_type='ACADEMIC_YEAR').first()
        if ay:
            academic_year_name = ay.display_name
        elif not str(academic_year_id).isdigit():
             academic_year_name = academic_year_id # Was already a name

        # Source Branch
        source_branch_name = None
        s_br = Branch.query.filter_by(id=source_branch_id).first()
        if s_br:
             source_branch_name = s_br.branch_name
        else:
             return jsonify({"error": "Source branch not found"}), 404

        # Target Branches (Fetch all to get names and locations)
        target_branches = Branch.query.filter(Branch.id.in_(target_branch_ids)).all()

        # Centralized permission check for source + target branches
        is_valid, perm_error = validate_cross_branch_access(
            current_user,
            source_branch_id=source_branch_id,
            target_branch_ids=target_branch_ids
        )
        if not is_valid:
            return jsonify({"error": perm_error}), 403
        
        # Location Helper (if needed, but ClassSubjectAssignment stores location_name)
        # We should use the target branch's location.
        # Need to map location_code -> location_name
        loc_map = {}
        all_locs = OrgMaster.query.filter_by(master_type='LOCATION').all()
        for l in all_locs:
            loc_map[l.code] = l.display_name
            
        # 2. Fetch Source Assignments
        source_assignments = ClassSubjectAssignment.query.filter_by(
            academic_year=academic_year_name,
            branch=source_branch_name
        ).all()
        
        if not source_assignments:
             return jsonify({"message": "No assignments found in source branch to copy."}), 404

        copied_count = 0
        skipped_count = 0
        
        # 3. Process Each Target Branch (MERGE MODE)
        with skip_scoping():
            for t_br in target_branches:
                t_branch_name = t_br.branch_name
                t_location_name = loc_map.get(t_br.location_code, "Hyderabad") # Default

                # Fetch existing assignments for this target (to check duplicates)
                existing_target_assigns = ClassSubjectAssignment.query.filter_by(
                    academic_year=academic_year_name,
                    branch=t_branch_name
                ).all()

                # Create a set of existing keys: (class_id, subject_name) since subject_id might differ
                existing_set = set()
                for a in existing_target_assigns:
                    sub = SubjectMaster.query.get(a.subject_id)
                    if sub:
                        existing_set.add((a.class_id, sub.subject_name))

                for src_assign in source_assignments:
                    src_sub = SubjectMaster.query.get(src_assign.subject_id)
                    if not src_sub:
                        continue

                    # Check if this (class, subject_name) already exists in target
                    if (src_assign.class_id, src_sub.subject_name) in existing_set:
                        skipped_count += 1
                        continue # MERGE MODE: Skip if exists

                    # Find matching target subject by name
                    target_sub = SubjectMaster.query.filter_by(
                        subject_name=src_sub.subject_name,
                        academic_year=academic_year_name,
                        branch_id=t_br.id
                    ).first()

                    if not target_sub:
                        # Fallback to global subject if exists
                        target_sub = SubjectMaster.query.filter_by(
                            subject_name=src_sub.subject_name,
                            academic_year=academic_year_name,
                            branch_id=None
                        ).first()

                        if not target_sub:
                            skipped_count += 1
                            continue # Target branch doesn't have this subject

                    # Logic for Insert
                    new_assign = ClassSubjectAssignment(
                        class_id=src_assign.class_id,
                        subject_id=target_sub.id,
                        academic_year=academic_year_name,
                        branch=t_branch_name,
                        location_name=t_location_name,
                        branch_id=t_br.id,
                        school_id=t_br.school_id or src_assign.school_id
                    )
                    db.session.add(new_assign)
                    copied_count += 1

            db.session.commit()
        
        return jsonify({
            "message": "Copy completed (Merge Mode)",
            "details": {
                "copied": copied_count,
                "skipped_duplicates": skipped_count,
                "targets": len(target_branches)
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"[ERROR] Copy Assignment Failed: {e}")
        return jsonify({"error": str(e)}), 500
