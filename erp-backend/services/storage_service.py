import os
import io
import mimetypes

import oci
from oci.auth.signers import InstancePrincipalsSecurityTokenSigner


def get_object_storage_client():
    """
    Creates an OCI Object Storage client using Instance Principals.
    """
    signer = InstancePrincipalsSecurityTokenSigner()

    client = oci.object_storage.ObjectStorageClient(
        config={},
        signer=signer
    )

    return client


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

    content_type, _ = mimetypes.guess_type(filename)

    if not content_type:
        content_type = "application/octet-stream"

    client = get_object_storage_client()

    file_stream.seek(0)
    file_content = file_stream.read()

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

    namespace = os.getenv("OCI_NAMESPACE")
    bucket = os.getenv("OCI_BUCKET_NAME")

    client = get_object_storage_client()

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