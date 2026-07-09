"""
EvoDigitalBooks — routes FastAPI
Monter dans main.py : app.include_router(edb_router, prefix="/api")

Endpoints :
  POST   /platform/edb/authors/register
  GET    /platform/edb/authors/pending        (superadmin)
  PATCH  /platform/edb/authors/{email}/status (superadmin)
  POST   /platform/edb/purchases
  GET    /platform/edb/purchases/me           (acheteur connecté)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

# Adapter ces imports au layout de smart-academy-of-congo-API :
# from app.deps import get_db, get_current_user, require_roles
# from app.services.auth_service import hash_password
# from app.services.edb_service import EdbService

router = APIRouter(tags=["evodigitalbooks"])


class AuthorRegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    penName: str = Field(min_length=2)
    mobileMoney: str = Field(min_length=8)
    bio: str = ""
    role: str = "auteur"


class AuthorStatusBody(BaseModel):
    status: str = Field(pattern="^(approved|rejected|pending)$")


class PurchaseBody(BaseModel):
    bookId: str
    email: str | None = None
    amount: float = 0
    currency: str = "USD"
    authorShare: float | None = None
    platformFee: float | None = None
    authorEmail: str | None = None
    authorMobileMoney: str | None = None
    deviceId: str | None = None


def _get_edb_service():
    """Remplacer par injection réelle : EdbService(get_db)."""
    raise HTTPException(501, "Brancher EdbService dans deps.py")


def _require_superadmin(user=Depends(lambda: None)):
    """Remplacer par require_roles('superadmin')."""
    return user


@router.post("/platform/edb/authors/register")
async def register_edb_author(body: AuthorRegisterBody):
    try:
        svc = _get_edb_service()
        # password_hash = hash_password(body.password)
        password_hash = body.password  # TEMPORAIRE — utiliser bcrypt en prod
        author = svc.register_author(
            email=str(body.email),
            password_hash=password_hash,
            pen_name=body.penName,
            mobile_money=body.mobileMoney,
            bio=body.bio,
        )
        return {"ok": True, "author": author}
    except ValueError as e:
        code = str(e)
        if code == "EMAIL_EXISTS":
            raise HTTPException(409, detail={"error": "EMAIL_EXISTS"})
        raise HTTPException(400, detail={"error": code})


@router.get("/platform/edb/authors/pending")
async def list_pending_edb_authors(_user=Depends(_require_superadmin)):
    svc = _get_edb_service()
    return {"ok": True, "authors": svc.list_pending_authors()}


@router.patch("/platform/edb/authors/{email}/status")
async def set_edb_author_status(
    email: str,
    body: AuthorStatusBody,
    user=Depends(_require_superadmin),
):
    try:
        svc = _get_edb_service()
        reviewer = getattr(user, "email", None) or getattr(user, "identifiant", "") or ""
        author = svc.set_author_status(email, body.status, reviewer)
        return {"ok": True, "author": author}
    except ValueError as e:
        if str(e) == "AUTHOR_NOT_FOUND":
            raise HTTPException(404, detail={"error": "AUTHOR_NOT_FOUND"})
        raise HTTPException(400, detail={"error": str(e)})


@router.post("/platform/edb/purchases")
async def record_edb_purchase(body: PurchaseBody):
    try:
        svc = _get_edb_service()
        result = svc.record_purchase(body.model_dump())
        return {"ok": True, **result}
    except ValueError as e:
        if str(e) == "device_limit":
            raise HTTPException(403, detail={"error": "DEVICE_LIMIT", "max": 3})
        raise HTTPException(400, detail={"error": str(e)})


@router.get("/platform/edb/purchases/me")
async def my_edb_purchases(user=Depends(_require_superadmin)):
    """Remplacer Depends par get_current_user — retourne les book_id achetés."""
    return {"ok": True, "bookIds": []}
