"""
Suppression définitive d'un document bibliothèque — smart-academy-of-congo-API

Intégrer dans le routeur existant `platform_library` (DELETE /platform/library/{id}).

Comportement attendu :
- Suppression physique de la ligne en base (pas de simple published=false)
- Suppression des fichiers uploadés (PDF, couverture) si stockés localement
- Auteur EvoDigitalBooks : peut supprimer ses propres livres (author_email)
- Ministère / superadmin : peut supprimer tout document national
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


def _norm_email(value: str | None) -> str:
    return str(value or "").strip().lower()


def _local_upload_path(url: str, upload_root: Path) -> Path | None:
    if not url:
        return None
    parsed = urlparse(str(url))
    path = parsed.path or str(url)
    if "/uploads/" not in path and not path.startswith("/data/"):
        return None
    rel = path.split("/uploads/", 1)[-1] if "/uploads/" in path else path.lstrip("/")
    candidate = upload_root / rel
    try:
        candidate.resolve().relative_to(upload_root.resolve())
    except ValueError:
        return None
    return candidate


def _unlink_if_exists(path: Path | None) -> None:
    if not path or not path.is_file():
        return
    try:
        path.unlink()
    except OSError:
        pass


def hard_delete_library_item(
    conn: sqlite3.Connection,
    item_id: str,
    user: dict[str, Any],
    *,
    table: str = "library_items",
    upload_root: str | Path = "/data/uploads",
) -> dict[str, Any]:
    """
    DELETE physique. Adapter `table` au nom réel (library_items, digital_library, …).
    Colonnes attendues : id, file_url, cover_url, author_email, source, author_role.
    """
    item_id = str(item_id or "").strip()
    if not item_id:
        raise ValueError("INVALID_ID")

    role = str(user.get("role") or "").lower()
    user_email = _norm_email(user.get("email") or user.get("identifiant"))

    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT id, file_url, cover_url, author_email, source, author_role
        FROM {table}
        WHERE id = ?
        LIMIT 1
        """,
        (item_id,),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError("NOT_FOUND")

    author_email = _norm_email(row[3])
    source = str(row[4] or "")
    author_role = str(row[5] or "")

    is_owner = (
        role == "auteur"
        and author_role == "auteur"
        and author_email
        and author_email == user_email
    )
    is_staff = role in ("ministere", "superadmin")
    if not (is_owner or is_staff):
        raise ValueError("FORBIDDEN")

    root = Path(upload_root)
    _unlink_if_exists(_local_upload_path(row[1] or "", root))
    _unlink_if_exists(_local_upload_path(row[2] or "", root))

    cur.execute(f"DELETE FROM {table} WHERE id = ?", (item_id,))
    if cur.rowcount == 0:
        raise ValueError("NOT_FOUND")

    # Achats EvoDigitalBooks liés (si table présente)
    try:
        cur.execute("DELETE FROM edb_purchases WHERE book_id = ?", (item_id,))
    except sqlite3.OperationalError:
        pass

    conn.commit()
    return {"ok": True, "id": item_id, "source": source}
