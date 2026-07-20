import os
from flask import Blueprint, jsonify, send_file, current_app
from helpers import token_required
from models import School, Student, StaffMaster, StudentDocument
import services.storage_service as storage_service
from oci.exceptions import ServiceError
import io

bp = Blueprint("media", __name__)

@bp.route("/api/media/schools/<int:school_id>/logo", methods=["GET"])
def get_school_logo(school_id):
    school = School.query.get_or_404(school_id)
    if not school.logo_url:
        return jsonify({"error": "Logo not found"}), 404
        
    try:
        # Check if it's an old local file (starts with /static/)
        if school.logo_url.startswith('/static/'):
            filename = school.logo_url.split('/')[-1]
            logos_folder = os.path.abspath(os.path.join(current_app.root_path, 'static', 'logos'))
            return send_file(os.path.join(logos_folder, filename))

        file_stream = storage_service.get_file_stream(school.logo_url)
        # Determine mimetype from extension
        ext = school.logo_url.rsplit('.', 1)[-1].lower() if '.' in school.logo_url else 'png'
        mimetypes_map = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp'}
        mimetype = mimetypes_map.get(ext, 'image/png')
        return send_file(file_stream, mimetype=mimetype)
    except ServiceError as e:
        return jsonify({"error": "Logo not found in storage"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/media/students/<int:student_id>/photo", methods=["GET"])
@token_required
def get_student_photo(current_user, student_id):
    student = Student.query.get_or_404(student_id)
    if not student.photopath:
        return jsonify({"error": "Photo not found"}), 404
        
    try:
        if student.photopath.startswith('Media/student_document/'):
            # Legacy local file path handling
            project_root = os.path.abspath(os.path.join(current_app.root_path, '..'))
            file_path = os.path.join(project_root, student.photopath)
            return send_file(file_path)

        file_stream = storage_service.get_file_stream(student.photopath)
        ext = student.photopath.rsplit('.', 1)[-1].lower() if '.' in student.photopath else 'jpg'
        mimetypes_map = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp'}
        mimetype = mimetypes_map.get(ext, 'image/jpeg')
        return send_file(file_stream, mimetype=mimetype)
    except ServiceError as e:
        return jsonify({"error": "Photo not found in storage"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/media/staff/<int:staff_id>/photo", methods=["GET"])
@token_required
def get_staff_photo(current_user, staff_id):
    staff = StaffMaster.query.get_or_404(staff_id)
    if not staff.photo:
        return jsonify({"error": "Photo not found"}), 404
        
    try:
        if staff.photo.startswith('/static/'):
            filename = staff.photo.split('/')[-1]
            folder = os.path.abspath(os.path.join(current_app.root_path, 'static', 'staff_photos'))
            return send_file(os.path.join(folder, filename))

        file_stream = storage_service.get_file_stream(staff.photo)
        ext = staff.photo.rsplit('.', 1)[-1].lower() if '.' in staff.photo else 'jpg'
        mimetypes_map = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'webp': 'image/webp'}
        mimetype = mimetypes_map.get(ext, 'image/jpeg')
        return send_file(file_stream, mimetype=mimetype)
    except ServiceError as e:
        return jsonify({"error": "Photo not found in storage"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@bp.route("/api/media/students/<int:student_id>/documents/<int:document_id>", methods=["GET"])
@token_required
def get_student_document(current_user, student_id, document_id):
    document = StudentDocument.query.filter_by(id=document_id, student_id=student_id).first_or_404()
    if not can_access_student(current_user, document.student):
        return jsonify({"error": "Access denied"}), 403
    if not document.file_path:
        return jsonify({"error": "Document not found"}), 404
        
    try:
        if document.file_path.startswith('/static/'):
            filename = document.file_path.split('/')[-1]
            folder = os.path.abspath(os.path.join(current_app.root_path, 'static', 'student_docs'))
            return send_file(os.path.join(folder, filename))

        file_stream = storage_service.get_file_stream(document.file_path)
        mimetype = document.mime_type or 'application/pdf'
        return send_file(
            file_stream,
            mimetype=mimetype,
            as_attachment=True,
            download_name=document.file_name or f"document_{document_id}.pdf"
        )
    except ServiceError as e:
        return jsonify({"error": "Document not found in storage"}), 404
    except FileNotFoundError:
        return jsonify({"error": "Document not found in storage"}),404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
