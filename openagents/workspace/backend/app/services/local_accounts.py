"""Password credentials for operator-provisioned workspace accounts."""

import hashlib
import re
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 256
_SALT_BYTES = 16
_DIGEST_BYTES = 32


def _derive_key(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=2**15, r=8, p=3,
        maxmem=64 * 1024**2, dklen=_DIGEST_BYTES,
    )


def provision_local_account(db: Session, email: str, password: str, display_name: str | None) -> None:
    email = email.strip().lower()
    if len(email) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+", email):
        raise ValueError("Enter a valid email address.")
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise ValueError(f"Use a password of {MIN_PASSWORD_LENGTH} to {MAX_PASSWORD_LENGTH} characters.")

    salt = secrets.token_bytes(_SALT_BYTES)
    digest = _derive_key(password, salt)
    user = db.scalar(select(User).where(User.email == email).with_for_update())
    if user is None:
        user = User(email=email)
        db.add(user)
    if user.local_password_hash is not None:
        raise ValueError("This account already has a local password.")
    user.local_password_hash = f"{salt.hex()}:{digest.hex()}"
    if display_name:
        user.display_name = display_name


def authenticate_local_account(db: Session, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    encoded = user.local_password_hash if user is not None else None
    # Do the same password hashing work for unknown and unprovisioned accounts.
    if encoded:
        salt, digest = (bytes.fromhex(part) for part in encoded.split(":"))
    else:
        salt, digest = bytes(_SALT_BYTES), bytes(_DIGEST_BYTES)
    matches = secrets.compare_digest(_derive_key(password, salt), digest)
    return user if matches and encoded else None
