import os
import boto3
from botocore.exceptions import ClientError
from werkzeug.utils import secure_filename
import uuid
import mimetypes

def get_s3_client():
    oci_endpoint_url = os.environ.get('OCI_ENDPOINT_URL')
    oci_access_key = os.environ.get('OCI_ACCESS_KEY_ID')
    oci_secret_key = os.environ.get('OCI_SECRET_ACCESS_KEY')
    
    if not oci_endpoint_url or not oci_access_key or not oci_secret_key:
        return None
        
    return boto3.client(
        's3',
        endpoint_url=oci_endpoint_url,
        aws_access_key_id=oci_access_key,
        aws_secret_access_key=oci_secret_key
    )

def upload_file_to_storage(file_stream, filename, folder=""):
    """
    Uploads a file to OCI Object Storage.
    :param file_stream: file object (e.g. from request.files)
    :param filename: Original or desired filename
    :param folder: Optional folder prefix (e.g. 'logos' or 'student_documents/1')
    :return: Object Key in the bucket
    """
    s3_client = get_s3_client()
    if not s3_client:
        raise ValueError("Storage service not configured (missing OCI credentials)")
    
    bucket_name = os.environ.get('OCI_BUCKET_NAME')
    if not bucket_name:
        raise ValueError("OCI_BUCKET_NAME is not set")
        
    object_key = f"{folder}/{filename}" if folder else filename
    # Remove leading slash if present
    object_key = object_key.lstrip('/')
    
    content_type, _ = mimetypes.guess_type(filename)
    if not content_type:
        content_type = 'application/octet-stream'

    try:
        s3_client.upload_fileobj(
            file_stream,
            bucket_name,
            object_key,
            ExtraArgs={'ContentType': content_type}
        )
        return object_key
    except ClientError as e:
        print(f"Failed to upload to object storage: {e}")
        raise e

def generate_presigned_url(object_key, expiration=3600):
    """
    Generate a presigned URL for secure access.
    """
    s3_client = get_s3_client()
    bucket_name = os.environ.get('OCI_BUCKET_NAME')
    if not s3_client or not bucket_name:
        return None
    
    try:
        response = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': bucket_name,
                                                            'Key': object_key},
                                                    ExpiresIn=expiration)
        return response
    except ClientError as e:
        print(e)
        return None

def get_file_stream(object_key):
    """
    Retrieves the file stream directly from OCI for passing to send_file
    """
    s3_client = get_s3_client()
    bucket_name = os.environ.get('OCI_BUCKET_NAME')
    if not s3_client or not bucket_name:
        return None
        
    try:
        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        return response['Body']
    except ClientError as e:
        print(e)
        return None
