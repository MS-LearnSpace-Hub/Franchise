import os
import io
import mimetypes
import re

import oci
from oci.auth.signers import InstancePrincipalsSecurityTokenSigner


def slugify(text):
    if not text:
        return "unknown"
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-') or "unknown"


def _get_school_branch_details(student_id):
    try:
        from models import Student, School, Branch
        if isinstance(student_id, Student):
            student = student_id
        else:
            student = Student.query.get(student_id)

        if not student:
            return "unknown-school", 0, "unknown-branch", 0, "unknown-admission"

        school_name = "unknown-school"
        school_id = student.school_id or 0
        if student.school_id:
            school = School.query.get(student.school_id)
            if school and school.school_name:
                school_name = school.school_name
        elif getattr(student, 'school', None) and getattr(student.school, 'school_name', None):
            school_name = student.school.school_name

        branch_name = "unknown-branch"
        branch_id = student.branch_id or 0
        if student.branch_id:
            branch = Branch.query.get(student.branch_id)
            if branch and branch.branch_name:
                branch_name = branch.branch_name
        elif getattr(student, 'branch', None):
            branch_name = str(getattr(student, 'branch'))

        admission_no = student.admission_no or student.AdmissionNumber or f"STUDENT_{student.student_id}"

        return slugify(school_name), school_id, slugify(branch_name), branch_id, admission_no
    except Exception as e:
        print(f"Error fetching student school/branch details for key generation: {e}")
        return "unknown-school", 0, "unknown-branch", 0, str(student_id)


def get_object_storage_client():
    """
    Creates an OCI Object Storage client using Instance Principals.
    """

    env = os.getenv("FLASK_ENV", "development").lower()

    print(f"[Storage] FLASK_ENV={env}")

    if env != "production":
        return None

    try:
        signer = InstancePrincipalsSecurityTokenSigner()

        return oci.object_storage.ObjectStorageClient(
            config={},
            signer=signer
        )
    except Exception as e:
        print(f"[Storage] Failed to create OCI client: {e}")
        raise
def _get_local_storage_path(object_key):
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    return os.path.join(project_root, 'Media', object_key.replace('/', os.sep))

def upload_file_to_storage(file_stream, filename, folder=""):
    """
    Upload file to OCI Object Storage.

    Returns:
        object_key
    """

    namespace = os.getenv("OCI_NAMESPACE")
    bucket = os.getenv("OCI_BUCKET_NAME")

    if not namespace:
        raise ValueError("OCI_NAMESPACE not configured")

    if not bucket:
        raise ValueError("OCI_BUCKET_NAME not configured")

    object_key = f"{folder}/{filename}" if folder else filename
    object_key = object_key.lstrip("/")

    client = get_object_storage_client()
    
    if hasattr(file_stream, "stream"):
        file_stream.stream.seek(0)
        file_content = file_stream.stream.read()
    else:
        file_stream.seek(0)
        file_content = file_stream.read()

    if not client:
        # Local storage fallback
        local_path = _get_local_storage_path(object_key)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, 'wb') as f:
            f.write(file_content)
        return object_key

    content_type, _ = mimetypes.guess_type(filename)

    if not content_type:
        content_type = "application/octet-stream"

    client.put_object(
        namespace_name=namespace,
        bucket_name=bucket,
        object_name=object_key,
        put_object_body=file_content,
        content_type=content_type
    )

    return object_key


def get_file_stream(object_key):
    """
    Download object from OCI Object Storage.

    Returns:
        BytesIO stream
    """

    client = get_object_storage_client()

    if not client:
        # Local storage fallback
        local_path = _get_local_storage_path(object_key)
        if os.path.exists(local_path):
            with open(local_path, 'rb') as f:
                return io.BytesIO(f.read())
        # Check legacy path (Media/local_storage/...)
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
        legacy_path = os.path.join(project_root, 'Media', 'local_storage', object_key.replace('/', os.sep))
        if os.path.exists(legacy_path):
            with open(legacy_path, 'rb') as f:
                return io.BytesIO(f.read())
        raise FileNotFoundError(f"File not found in local storage: {object_key}")

    namespace = os.getenv("OCI_NAMESPACE")
    bucket = os.getenv("OCI_BUCKET_NAME")

    response = client.get_object(
        namespace_name=namespace,
        bucket_name=bucket,
        object_name=object_key
    )

    return io.BytesIO(response.data.content)


def generate_presigned_url(object_key, expiration=3600):
    """
    Instance Principals cannot generate S3-style pre-signed URLs.

    We serve files through the Flask endpoint instead.

    This function is kept only for compatibility.
    """
    return None

def generate_school_logo_key(school_id, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'png'
    return f"franchise/schools/logos/school_{school_id}.{ext}"

def generate_student_photo_key(student_id, filename):
    school_slug, school_id, branch_slug, branch_id, admission_no = _get_school_branch_details(student_id)
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    return f"franchise/{school_slug}_{school_id}/{branch_slug}_{branch_id}/{admission_no}/profile.{ext}"

def generate_staff_photo_key(staff_id, filename):
    try:
        from models import StaffMaster, School, Branch
        staff = StaffMaster.query.get(staff_id) if not isinstance(staff_id, StaffMaster) else staff_id
        if staff:
            school_name = "unknown-school"
            school_id = staff.school_id or 0
            if staff.school_id:
                school = School.query.get(staff.school_id)
                if school and school.school_name:
                    school_name = school.school_name

            branch_name = "unknown-branch"
            branch_id = staff.branch_id or 0
            if staff.branch_id:
                branch = Branch.query.get(staff.branch_id)
                if branch and branch.branch_name:
                    branch_name = branch.branch_name

            emp_code = staff.employee_id or staff.staff_code or f"EMP{staff.id}"
            ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
            return f"franchise/{slugify(school_name)}_{school_id}/{slugify(branch_name)}_{branch_id}/Staff/{emp_code}/profile.{ext}"
    except Exception as e:
        print(f"Error fetching staff details for key generation: {e}")

    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    return f"franchise/staff/photos/{staff_id}.{ext}"

def generate_student_document_key(student_id, doc_type_name, filename):
    school_slug, school_id, branch_slug, branch_id, admission_no = _get_school_branch_details(student_id)
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'pdf'
    clean_doc_type = slugify(doc_type_name)
    return f"franchise/{school_slug}_{school_id}/{branch_slug}_{branch_id}/{admission_no}/{clean_doc_type}.{ext}"

