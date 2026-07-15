import os
import boto3
from botocore.exceptions import ClientError
from werkzeug.utils import secure_filename
import uuid
import mimetypes
from flask import current_app

# OCI Object Storage S3-Compatible configuration
OCI_ENDPOINT_URL = os.environ.get('OCI_ENDPOINT_URL')
OCI_ACCESS_KEY_ID = os.environ.get('OCI_ACCESS_KEY_ID')
OCI_SECRET_ACCESS_KEY = os.environ.get('OCI_SECRET_ACCESS_KEY')
OCI_BUCKET_NAME = os.environ.get('OCI_BUCKET_NAME')

class StoragePath:
    @staticmethod
    def student_photo(student_id):
        return f"students/{student_id}"

    @staticmethod
    def student_document(student_id):
        return f"students/{student_id}"
        
    @staticmethod
    def employee_photo(emp_id):
        return f"employees/{emp_id}"
        
    @staticmethod
    def branch_logo(branch_id):
        return f"branches/{branch_id}"
        
    @staticmethod
    def school_logo(school_id):
        return f"schools/{school_id}"


def get_s3_client():
    if not all([OCI_ENDPOINT_URL, OCI_ACCESS_KEY_ID, OCI_SECRET_ACCESS_KEY]):
        # Fallback to None if not configured (can handle gracefully in calling functions)
        return None
    return boto3.client(
        's3',
        endpoint_url=OCI_ENDPOINT_URL,
        aws_access_key_id=OCI_ACCESS_KEY_ID,
        aws_secret_access_key=OCI_SECRET_ACCESS_KEY
    )

def upload_file_to_storage(file_stream, filename, folder=""):
    """
    Uploads a file to OCI Object Storage.
    :param file_stream: file object (e.g. from request.files)
    :param filename: Original or desired filename
    :param folder: Optional folder prefix (e.g. 'logos' or 'student_documents/1')
    :return: dict with metadata (object_key, content_type, filename)
    """
    s3_client = get_s3_client()
    if not s3_client:
        raise ValueError("Storage service not configured (missing OCI credentials)")
    
    if not OCI_BUCKET_NAME:
        raise ValueError("OCI_BUCKET_NAME is not set")
        
    safe_filename = secure_filename(filename)
    ext = os.path.splitext(safe_filename)[1].lower()
    unique_filename = f"{uuid.uuid4().hex}{ext}"
        
    object_key = f"{folder}/{unique_filename}" if folder else unique_filename
    # Remove leading slash if present
    object_key = object_key.lstrip('/')
    
    content_type, _ = mimetypes.guess_type(safe_filename)
    if not content_type:
        content_type = 'application/octet-stream'

    try:
        s3_client.upload_fileobj(
            file_stream,
            OCI_BUCKET_NAME,
            object_key,
            ExtraArgs={'ContentType': content_type}
        )
        return {
            "object_key": object_key,
            "content_type": content_type,
            "filename": unique_filename
        }
    except ClientError as e:
        current_app.logger.exception("OCI upload failed")
        raise e

def generate_presigned_url(object_key, expiration=3600):
    """
    Generate a presigned URL for secure access.
    """
    s3_client = get_s3_client()
    if not s3_client:
        return None
    
    try:
        response = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': OCI_BUCKET_NAME,
                                                            'Key': object_key},
                                                    ExpiresIn=expiration)
        return response
    except ClientError as e:
        current_app.logger.exception("Failed to generate presigned url")
        return None

def get_file_stream(object_key):
    """
    Retrieves the file stream directly from OCI for passing to send_file
    """
    s3_client = get_s3_client()
    if not s3_client:
        return None
        
    try:
        response = s3_client.get_object(Bucket=OCI_BUCKET_NAME, Key=object_key)
        return response['Body']
    except ClientError as e:
        current_app.logger.exception("Failed to get file stream")
        return None

def delete_file(object_key):
    """
    Deletes a file from OCI Object Storage.
    """
    s3_client = get_s3_client()
    if not s3_client:
        return False
        
    try:
        s3_client.delete_object(Bucket=OCI_BUCKET_NAME, Key=object_key)
        return True
    except ClientError as e:
        current_app.logger.exception("OCI delete failed")
        return False

def file_exists(object_key):
    """
    Checks if a file exists in OCI Object Storage.
    """
    s3_client = get_s3_client()
    if not s3_client:
        return False
        
    try:
        s3_client.head_object(Bucket=OCI_BUCKET_NAME, Key=object_key)
        return True
    except ClientError as e:
        # Check if the error was a 404
        error_code = e.response.get('Error', {}).get('Code')
        if error_code == '404':
            return False
        current_app.logger.exception("OCI head_object failed")
        return False
