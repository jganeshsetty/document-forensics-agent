import os
import json
import asyncio
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List
import bcrypt
import jwt
from pydantic import BaseModel, field_validator
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer

# Security Configurations
SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "docverify_enterprise_secret_jwt_key_2026_super_secure_32chars_fips"
)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token", auto_error=False)

# Local Users Fallback File
USERS_FILE = Path("database/users.json")


class UserRegister(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = "Forensic Analyst"
    organization: Optional[str] = "Enterprise Security Ops"

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if "@" not in clean or "." not in clean:
            raise ValueError("Invalid email format")
        return clean


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class UserResponse(BaseModel):
    email: str
    full_name: str
    role: str
    organization: str
    created_at: str


def hash_password(password: str) -> str:
    """Hash password securely with bcrypt."""
    pw_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against hashed password."""
    try:
        pw_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pw_bytes, hash_bytes)
    except Exception:
        return False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Generate signed JWT token."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate signed JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None


# User Persistence Helpers (MongoDB + Local Fallback)
def _read_local_users() -> Dict[str, Dict[str, Any]]:
    if not USERS_FILE.exists():
        return {}
    try:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _write_local_users(data: Dict[str, Dict[str, Any]]):
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_file = USERS_FILE.with_suffix(".tmp")
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    temp_file.replace(USERS_FILE)


async def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Look up user from MongoDB or local fallback."""
    from database.connection import get_database
    db = get_database()
    if db is not None:
        try:
            users_col = db["users"]
            user = await asyncio.wait_for(users_col.find_one({"email": email.lower().strip()}), timeout=1.5)
            if user:
                user["_id"] = str(user["_id"])
                return user
        except Exception:
            pass

    # Local fallback
    local_users = _read_local_users()
    return local_users.get(email.lower().strip())


async def save_user(user_data: Dict[str, Any]) -> Dict[str, Any]:
    """Save user to MongoDB or local fallback."""
    email_key = user_data["email"].lower().strip()
    user_data["email"] = email_key

    from database.connection import get_database
    db = get_database()
    if db is not None:
        try:
            users_col = db["users"]
            await asyncio.wait_for(
                users_col.update_one(
                    {"email": email_key},
                    {"$set": user_data},
                    upsert=True
                ),
                timeout=1.5
            )
        except Exception:
            pass

    # Always persist locally for resilience
    local_users = _read_local_users()
    local_users[email_key] = user_data
    _write_local_users(local_users)
    return user_data


async def seed_default_admin():
    """Seed test user admin@docverify.com / password123 on server startup."""
    admin_email = "admin@docverify.com"
    existing = await get_user_by_email(admin_email)
    if not existing:
        admin_user = {
            "email": admin_email,
            "hashed_password": hash_password("password123"),
            "full_name": "Forensic Administrator",
            "role": "Lead Forensic Investigator",
            "organization": "DocVerify Enterprise Security",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await save_user(admin_user)
        print(f"[AUTH] Seeded default test user: {admin_email} / password123")


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
) -> Dict[str, Any]:
    """Dependency that verifies the JWT token from Bearer header or cookies."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication credentials were not provided or have expired.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    auth_token = token
    if not auth_token:
        # Fallback to Authorization header manually
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            auth_token = auth_header.split(" ", 1)[1].strip()

    if not auth_token:
        raise credentials_exception

    payload = decode_access_token(auth_token)
    if payload is None:
        raise credentials_exception

    email: Optional[str] = payload.get("sub")
    if not email:
        raise credentials_exception

    user = await get_user_by_email(email)
    if user is None:
        raise credentials_exception

    return user
