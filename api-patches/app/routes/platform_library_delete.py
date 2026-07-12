"""
PATCH DELETE /api/platform/library/{id} — suppression définitive

Copier la logique dans `app/routers/platform_library.py` du dépôt API,
ou monter ce router si la route n'existe pas encore.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

# from app.deps import get_db, get_current_user
# from app.services.library_delete import hard_delete_library_item

router = APIRouter(tags=["platform-library"])


def _get_db():
    raise HTTPException(501, "Brancher get_db()")


def _get_user():
    raise HTTPException(401, "Brancher get_current_user()")


@router.delete("/platform/library/{item_id}")
async def delete_library_item(
    item_id: str,
    user=Depends(_get_user),
    conn=Depends(_get_db),
):
    try:
        from app.services.library_delete import hard_delete_library_item

        user_dict = user if isinstance(user, dict) else user.__dict__
        result = hard_delete_library_item(conn, item_id, user_dict)
        return result
    except ValueError as exc:
        code = str(exc)
        if code == "NOT_FOUND":
            raise HTTPException(404, detail={"error": "NOT_FOUND"})
        if code == "FORBIDDEN":
            raise HTTPException(403, detail={"error": "FORBIDDEN"})
        raise HTTPException(400, detail={"error": code})
