"""EvoDigitalBooks — auteurs, achats, limite appareils."""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

PLATFORM_FEE_RATE = 0.25
MAX_DEVICES = 3


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def split_fee(amount: float) -> dict[str, float]:
    total = float(amount or 0)
    platform_fee = round(total * PLATFORM_FEE_RATE, 2)
    author_share = round(total - platform_fee, 2)
    return {"total": total, "platform_fee": platform_fee, "author_share": author_share}


def _author_row_to_dict(r) -> dict[str, Any]:
    return {
        "id": r[0],
        "email": r[1],
        "penName": r[2],
        "mobileMoney": r[3],
        "mobileMoney2": r[4] or "",
        "mobileMoney3": r[5] or "",
        "bio": r[6] or "",
        "status": r[7],
        "createdAt": r[8] if len(r) > 8 else "",
    }


_AUTHOR_SELECT = """
    id, email, pen_name, mobile_money, mobile_money_2, mobile_money_3, bio, status, created_at
"""


class EdbService:
    def __init__(self, get_db):
        self.get_db = get_db

    def register_author(
        self,
        email: str,
        password_hash: str,
        pen_name: str,
        mobile_money: str,
        bio: str = "",
        mobile_money_2: str = "",
        mobile_money_3: str = "",
    ) -> dict[str, Any]:
        email = email.strip().lower()
        conn = self.get_db()
        cur = conn.cursor()
        cur.execute("SELECT id FROM edb_authors WHERE email = ?", (email,))
        if cur.fetchone():
            raise ValueError("EMAIL_EXISTS")
        author_id = f"edb_author_{uuid.uuid4().hex[:12]}"
        cur.execute(
            """
            INSERT INTO edb_authors
            (id, email, pen_name, mobile_money, mobile_money_2, mobile_money_3,
             bio, password_hash, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
            """,
            (
                author_id,
                email,
                pen_name,
                mobile_money,
                mobile_money_2 or "",
                mobile_money_3 or "",
                bio or "",
                password_hash,
                _now(),
            ),
        )
        conn.commit()
        return {
            "id": author_id,
            "email": email,
            "penName": pen_name,
            "mobileMoney": mobile_money,
            "mobileMoney2": mobile_money_2 or "",
            "mobileMoney3": mobile_money_3 or "",
            "status": "pending",
        }

    def list_pending_authors(self) -> list[dict[str, Any]]:
        conn = self.get_db()
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT {_AUTHOR_SELECT.strip()}
            FROM edb_authors WHERE status = 'pending' ORDER BY created_at DESC
            """
        )
        rows = cur.fetchall()
        return [_author_row_to_dict(r) for r in rows]

    def set_author_status(self, email: str, status: str, reviewer: str = "") -> dict[str, Any]:
        email = email.strip().lower()
        if status not in ("approved", "rejected", "pending"):
            raise ValueError("INVALID_STATUS")
        conn = self.get_db()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE edb_authors
            SET status = ?, reviewed_at = ?, reviewed_by = ?
            WHERE email = ?
            """,
            (status, _now(), reviewer or "", email),
        )
        if cur.rowcount == 0:
            raise ValueError("AUTHOR_NOT_FOUND")
        conn.commit()
        cur.execute(
            f"SELECT {_AUTHOR_SELECT.strip()} FROM edb_authors WHERE email = ?",
            (email,),
        )
        r = cur.fetchone()
        return _author_row_to_dict(r)

    def update_author_payment_numbers(
        self,
        email: str,
        mobile_money: str,
        mobile_money_2: str = "",
        mobile_money_3: str = "",
    ) -> dict[str, Any]:
        email = email.strip().lower()
        conn = self.get_db()
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE edb_authors
            SET mobile_money = ?, mobile_money_2 = ?, mobile_money_3 = ?
            WHERE email = ?
            """,
            (mobile_money, mobile_money_2 or "", mobile_money_3 or "", email),
        )
        if cur.rowcount == 0:
            raise ValueError("AUTHOR_NOT_FOUND")
        conn.commit()
        cur.execute(
            f"SELECT {_AUTHOR_SELECT.strip()} FROM edb_authors WHERE email = ?",
            (email,),
        )
        r = cur.fetchone()
        return _author_row_to_dict(r)

    def get_author_by_email(self, email: str) -> dict[str, Any] | None:
        email = email.strip().lower()
        conn = self.get_db()
        cur = conn.cursor()
        cur.execute(
            f"SELECT {_AUTHOR_SELECT.strip()} FROM edb_authors WHERE email = ?",
            (email,),
        )
        r = cur.fetchone()
        if not r:
            return None
        return _author_row_to_dict(r)

    def _device_count(self, cur: sqlite3.Cursor, buyer_email: str) -> int:
        cur.execute(
            "SELECT COUNT(*) FROM edb_devices WHERE buyer_email = ?",
            (buyer_email,),
        )
        return int(cur.fetchone()[0])

    def register_device(self, buyer_email: str, device_id: str) -> dict[str, Any]:
        buyer_email = buyer_email.strip().lower()
        device_id = (device_id or "").strip()
        if not buyer_email or not device_id:
            return {"ok": False, "reason": "invalid"}
        conn = self.get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM edb_devices WHERE buyer_email = ? AND device_id = ?",
            (buyer_email, device_id),
        )
        if cur.fetchone():
            return {"ok": True, "deviceId": device_id}
        if self._device_count(cur, buyer_email) >= MAX_DEVICES:
            return {"ok": False, "reason": "device_limit", "max": MAX_DEVICES}
        cur.execute(
            "INSERT INTO edb_devices (buyer_email, device_id, registered_at) VALUES (?, ?, ?)",
            (buyer_email, device_id, _now()),
        )
        conn.commit()
        return {"ok": True, "deviceId": device_id}

    def record_purchase(self, payload: dict[str, Any]) -> dict[str, Any]:
        book_id = str(payload.get("bookId") or payload.get("book_id") or "").strip()
        buyer_email = str(payload.get("email") or payload.get("buyer_email") or "").strip().lower()
        device_id = str(payload.get("deviceId") or payload.get("device_id") or "").strip()
        amount = float(payload.get("amount") or 0)
        currency = str(payload.get("currency") or "USD").upper()
        fees = split_fee(amount)
        author_share = float(payload.get("authorShare") or fees["author_share"])
        platform_fee = float(payload.get("platformFee") or fees["platform_fee"])
        author_mobile = str(payload.get("authorMobileMoney") or payload.get("author_mobile_money") or "")
        author_email = str(payload.get("authorEmail") or payload.get("author_email") or "")

        if not book_id or not buyer_email:
            raise ValueError("INVALID_PAYLOAD")

        if device_id:
            dev = self.register_device(buyer_email, device_id)
            if not dev.get("ok"):
                raise ValueError(dev.get("reason", "device_limit"))

        purchase_id = f"edb_purchase_{uuid.uuid4().hex[:12]}"
        conn = self.get_db()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO edb_purchases
            (id, book_id, buyer_email, amount, currency, author_share, platform_fee,
             author_email, author_mobile_money, device_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                purchase_id,
                book_id,
                buyer_email,
                amount,
                currency,
                author_share,
                platform_fee,
                author_email,
                author_mobile,
                device_id,
                _now(),
            ),
        )
        conn.commit()
        return {
            "id": purchase_id,
            "bookId": book_id,
            "buyerEmail": buyer_email,
            "amount": amount,
            "authorShare": author_share,
            "platformFee": platform_fee,
            "ok": True,
        }

    def buyer_owns_book(self, buyer_email: str, book_id: str) -> bool:
        buyer_email = buyer_email.strip().lower()
        conn = self.get_db()
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 FROM edb_purchases WHERE buyer_email = ? AND book_id = ? LIMIT 1",
            (buyer_email, book_id),
        )
        return cur.fetchone() is not None

    def ensure_schema(self) -> None:
        from pathlib import Path
        conn = self.get_db()
        schema_path = Path(__file__).resolve().parents[2] / "schema_edb.sql"
        try:
            conn.executescript(schema_path.read_text(encoding="utf-8"))
            conn.commit()
        except OSError:
            pass
        cur = conn.cursor()
        for col in ("mobile_money_2", "mobile_money_3"):
            try:
                cur.execute(f"ALTER TABLE edb_authors ADD COLUMN {col} TEXT DEFAULT ''")
                conn.commit()
            except sqlite3.OperationalError:
                pass
