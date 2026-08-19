from flask import Blueprint, jsonify, request, g
from extensions import db, to_local_time
from models import GradeScale, GradeScaleDetails
from sqlalchemy.exc import IntegrityError
from helpers import token_required

grade_scale_bp = Blueprint("grade_scale", __name__)

@grade_scale_bp.route("/api/grade-scales", methods=["POST"])
@token_required
def create_grade_scale(current_user):
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
 
        scale_name = data.get("scale_name")
        location = data.get("location")
        branch = data.get("branch")
        academic_year = data.get("academic_year")
        total_marks = data.get("total_marks") # New Field
        description = data.get("scale_description")
        details = data.get("details", [])
        class_ids = data.get("class_ids", [])

        if not all([scale_name, location, academic_year, total_marks]):
             return jsonify({"error": "Missing required fields (scale_name, location, academic_year, total_marks)"}), 400
             
        if not class_ids:
             return jsonify({"error": "Please select at least one class"}), 400

        # Validate Details (Min/Max and Overlap)
        sorted_details = sorted(details, key=lambda x: int(x['min_marks']))
        for i in range(len(sorted_details)):
            d = sorted_details[i]
            if "grade" not in d or "min_marks" not in d or "max_marks" not in d:
                return jsonify({"error": "Invalid details format"}), 400

            min_m = int(d['min_marks'])
            max_m = int(d['max_marks'])
            
            if min_m < 0 or max_m < 0:
                 return jsonify({"error": f"Marks cannot be negative for grade {d['grade']}"}), 400
            if min_m > max_m:
                 return jsonify({"error": f"Min marks cannot be greater than Max marks for grade {d['grade']}"}), 400
            if max_m > int(total_marks):
                 return jsonify({"error": f"Max marks for grade {d['grade']} cannot exceed Total Marks ({total_marks})"}), 400

            # Overlap Check
            if i < len(sorted_details) - 1:
                next_d = sorted_details[i+1]
                next_min = int(next_d['min_marks'])
                if max_m >= next_min: # Inclusive Overlap
                     return jsonify({"error": f"Grade range overlap detected: {d['grade']} ({min_m}-{max_m}) overlaps with {next_d['grade']} ({next_min}-{next_d.get('max_marks')})"}), 400

        # Check for duplicates across selected classes
        for cid in class_ids:
            existing = GradeScale.query.filter_by(
                academic_year=academic_year,
                branch=branch,
                class_id=cid,
                total_marks=total_marks
            ).first()

            if existing:
                if not existing.is_active:
                    return jsonify({"error": f"Grade Scale for class {cid} exists but is inactive."}), 409
                return jsonify({"error": f"A Grade Scale already exists for class {cid} with total marks {total_marks}."}), 409

        # Create Master and Details for each class
        first_id = None
        for cid in class_ids:
            new_scale = GradeScale(
                scale_name=scale_name,
                scale_description=description,
                location=location,
                branch=branch,
                academic_year=academic_year,
                total_marks=total_marks,
                class_id=cid,
                is_active=True
            )
            db.session.add(new_scale)
            db.session.flush() # Get ID
            
            if not first_id:
                first_id = new_scale.id

            # Create Details
            for d in details:
                if "grade" not in d or "min_marks" not in d or "max_marks" not in d:
                    continue
                    
                new_detail = GradeScaleDetails(
                    grade_scale_id=new_scale.id,
                    grade=d["grade"],
                    min_marks=d["min_marks"],
                    max_marks=d["max_marks"],
                    description=d.get("description", ""),
                    is_active=True
                )
                db.session.add(new_detail)

        db.session.commit()
        return jsonify({"message": "Grade Scale created successfully", "id": first_id}), 201

    except IntegrityError as e:
        db.session.rollback()
        return jsonify({"error": "Duplicate entry or Invalid Data (Integrity Error)"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@grade_scale_bp.route("/api/grade-scales", methods=["GET"])
@token_required
def get_grade_scales(current_user):
    from helpers import scope_query
    try:
        academic_year = request.args.get("academic_year")
        branch = request.args.get("branch")
        
        query = GradeScale.query.filter_by(is_active=True)

        if academic_year:
            query = query.filter_by(academic_year=academic_year)
            
        # Filter by Location if provided
        location = request.args.get("location")
        if location:
            query = query.filter_by(location=location) 
            
        # Functional filtering based on user's currently selected context (UI selection)
        # We do this because scope_query bypasses filtering for SuperAdmins, 
        # but SuperAdmins still want to see data filtered by their selected branch dropdown.
        s_id = getattr(g, 'school_id', None)
        if s_id is not None:
            query = query.filter((GradeScale.school_id == s_id) | (GradeScale.school_id.is_(None)))
            
        b_id = getattr(g, 'branch_id', None)
        if b_id is not None:
            query = query.filter((GradeScale.branch_id == b_id) | (GradeScale.branch_id.is_(None)))
            
        # Apply scope query to restrict by allowed permissions (Security)
        query = scope_query(query, GradeScale)
        
        scales = query.all()
        print(f"DEBUG get_grade_scales: args={request.args}, g.school_id={getattr(g, 'school_id', None)}, g.branch_id={getattr(g, 'branch_id', None)}, found={len(scales)}")

        # Future: If we receive location, filter by it.
        # query = query.filter_by(location=request.args.get('location'))
            
        scales = query.all()
        
        # Group scales by common attributes to show in frontend as a single entity
        grouped_scales = {}
        from models import ClassMaster
        
        for s in scales:
            key = (s.scale_name, s.academic_year, s.branch, s.total_marks)
            if key not in grouped_scales:
                grouped_scales[key] = {
                    "id": s.id, # Send the first ID for references, though edit might be tricky
                    "scale_name": s.scale_name,
                    "scale_description": s.scale_description,
                    "academic_year": s.academic_year,
                    "branch": s.branch,
                    "location": s.location,
                    "total_marks": s.total_marks,
                    "class_ids": [],
                    "classes": [],
                    "created_at": to_local_time(s.created_at).isoformat() if s.created_at else None,
                    "updated_at": to_local_time(s.updated_at).isoformat() if s.updated_at else None,
                    "created_by": s.created_by,
                    "updated_by": s.updated_by
                }
            if s.class_id:
                grouped_scales[key]["class_ids"].append(s.class_id)
                # Fetch class name ideally via join, but doing lazy load here for simplicity
                c = ClassMaster.query.get(s.class_id)
                if c:
                    grouped_scales[key]["classes"].append({"id": c.id, "class_name": c.class_name})
            
        result = list(grouped_scales.values())
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@grade_scale_bp.route("/api/grade-scales/<int:id>", methods=["GET"])
def get_grade_scale_details_route(id):
    try:
        from models import ClassMaster
        # ID here is just one of the GradeScale entries for the group
        scale = GradeScale.query.get(id)
        if not scale or not scale.is_active:
            return jsonify({"error": "Grade scale not found"}), 404
            
        # Get all related scales for this group
        related_scales = GradeScale.query.filter_by(
            scale_name=scale.scale_name,
            academic_year=scale.academic_year,
            branch=scale.branch,
            total_marks=scale.total_marks,
            is_active=True
        ).all()
        
        class_ids = [s.class_id for s in related_scales if s.class_id]
        
        details = GradeScaleDetails.query.filter_by(grade_scale_id=scale.id).order_by(GradeScaleDetails.min_marks.asc()).all()
        
        details_list = [{
            "id": d.id,
            "grade": d.grade,
            "min_marks": d.min_marks,
            "max_marks": d.max_marks,
            "description": d.description
        } for d in details]

        return jsonify({
            "id": scale.id,
            "scale_name": scale.scale_name,
            "scale_description": scale.scale_description,
            "academic_year": scale.academic_year,
            "branch": scale.branch,
            "location": scale.location,
            "total_marks": scale.total_marks,
            "class_ids": class_ids,
            "details": details_list
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@grade_scale_bp.route("/api/grade-scales/<int:id>", methods=["PUT"])
@token_required
def update_grade_scale(current_user, id):
    try:
        scale = GradeScale.query.get(id)
        if not scale or not scale.is_active:
            return jsonify({"error": "Grade scale not found"}), 404

        data = request.json
        if not data:
             return jsonify({"error": "No data"}), 400

        # For update, we might have multiple classes. The simplest way is to delete all existing scales for this group and recreate, or update existing and add/remove.
        # Since we use ID to edit, it refers to one scale. But we need to update the group.
        # Let's delete all existing in the group and recreate.
        
        related_scales = GradeScale.query.filter_by(
            scale_name=scale.scale_name,
            academic_year=scale.academic_year,
            branch=scale.branch,
            total_marks=scale.total_marks
        ).all()
        
        for rs in related_scales:
            db.session.delete(rs)
            
        # Recreate based on payload
        scale_name = data.get("scale_name", scale.scale_name)
        description = data.get("scale_description", scale.scale_description)
        total_marks = data.get("total_marks", scale.total_marks)
        class_ids = data.get("class_ids", [])
        
        if not class_ids:
            return jsonify({"error": "Please select at least one class"}), 400
            
        # Validate Details
        new_details = data.get("details", [])
        if new_details:
            sorted_details = sorted(new_details, key=lambda x: int(x['min_marks']))
            for i in range(len(sorted_details)):
                d = sorted_details[i]
                if "grade" not in d or "min_marks" not in d or "max_marks" not in d:
                     return jsonify({"error": "Invalid details format"}), 400

                min_m = int(d['min_marks'])
                max_m = int(d['max_marks'])
                
                if min_m < 0 or max_m < 0:
                     return jsonify({"error": f"Marks cannot be negative"}), 400
                if min_m > max_m:
                     return jsonify({"error": f"Min > Max for {d['grade']}"}), 400
                if max_m > int(total_marks):
                     return jsonify({"error": f"Max marks for {d['grade']} > Total Marks ({total_marks})"}), 400

                if i < len(sorted_details) - 1:
                    next_d = sorted_details[i+1]
                    next_min = int(next_d['min_marks'])
                    if max_m >= next_min:
                         return jsonify({"error": f"Overlap: {d['grade']} and {next_d['grade']}"}), 400
                         
        # Recreate Master and Details for each class
        for cid in class_ids:
            new_scale = GradeScale(
                scale_name=scale_name,
                scale_description=description,
                location=scale.location,
                branch=scale.branch,
                academic_year=scale.academic_year,
                total_marks=total_marks,
                class_id=cid,
                is_active=True
            )
            db.session.add(new_scale)
            db.session.flush() # Get ID

            # Create Details
            for d in new_details:
                if "grade" not in d or "min_marks" not in d or "max_marks" not in d:
                    continue
                    
                new_detail = GradeScaleDetails(
                    grade_scale_id=new_scale.id,
                    grade=d["grade"],
                    min_marks=d["min_marks"],
                    max_marks=d["max_marks"],
                    description=d.get("description", ""),
                    is_active=True
                )
                db.session.add(new_detail)

        db.session.commit()
        return jsonify({"message": "Updated successfully"}), 200

    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Duplicate entry or range conflict"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@grade_scale_bp.route("/api/grade-scales/<int:id>", methods=["DELETE"])
@token_required
def delete_grade_scale(current_user, id):
    try:
        scale = GradeScale.query.get(id)
        if not scale:
            return jsonify({"error": "Grade scale not found"}), 404

        # Soft delete the entire group
        related_scales = GradeScale.query.filter_by(
            scale_name=scale.scale_name,
            academic_year=scale.academic_year,
            branch=scale.branch,
            total_marks=scale.total_marks
        ).all()
        
        for rs in related_scales:
            rs.is_active = False
            
        db.session.commit()
        return jsonify({"message": "Grade Scale deleted (soft)"}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
