import os
from cryptography.fernet import Fernet, InvalidToken


def _get_fernet():
    key = os.environ.get("FERNET_KEY")
    if not key:
        raise RuntimeError(
            "FERNET_KEY is not set. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\" "
            "and add it to your .env file."
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_secret(plain_text):
    if plain_text is None:
        return None
    f = _get_fernet()
    return f.encrypt(plain_text.encode()).decode()


def decrypt_secret(cipher_text):
    if cipher_text is None:
        return None
    f = _get_fernet()
    try:
        return f.decrypt(cipher_text.encode()).decode()
    except InvalidToken:
        raise ValueError("Failed to decrypt secret — FERNET_KEY may have changed or the data is corrupted.")