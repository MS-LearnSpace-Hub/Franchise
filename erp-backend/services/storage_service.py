import os
import io
import mimetypes

import oci
from oci.auth.signers import InstancePrincipalsSecurityTokenSigner


def get_object_storage_client():
    """
    Creates an OCI Object Storage client using Instance Principals.
    """
    env = os.environ.get('ENV', 'development')
    if env != 'production':
        return None

    signer = InstancePrincipalsSecurityTokenSigner()

    client = oci.object_storage.ObjectStorageClient(
        config={},
        signer=signer
    )

    return client

def _get_local_storage_path(object_key):
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    return os.path.join(project_root, 'Media', 'local_storage', object_key.replace('/', os.sep))

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
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    return f"franchise/students/photos/{student_id}.{ext}"

def generate_staff_photo_key(staff_id, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'jpg'
    return f"franchise/staff/photos/{staff_id}.{ext}"

def generate_student_document_key(student_id, doc_type_name, filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'pdf'
    # Sanitize doc_type_name for URL/Key
    clean_doc_type = "".join(c if c.isalnum() else "_" for c in doc_type_name).strip("_").lower()
    return f"franchise/students/documents/{student_id}/{clean_doc_type}.{ext}"
