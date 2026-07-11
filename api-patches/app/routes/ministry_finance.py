"""
Routes MESU + paie Evo Finance — à copier dans smart-academy-of-congo-API.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["ministry-finance"])


class InstitutionalPatch(BaseModel):
    ministryStatus: str | None = Field(None, pattern="^(approved|pending|suspended)$")


class PayrollRow(BaseModel):
    salary: float = 0
    bonus: float = 0
    deduction: float = 0
    autoPay: bool = False


def _require_ministere_or_super(user):
    role = getattr(user, "role", None) or (user or {}).get("role")
    if role not in ("ministere", "superadmin"):
        raise HTTPException(status_code=403, detail="Accès refusé")


def _require_superadmin(user):
    role = getattr(user, "role", None) or (user or {}).get("role")
    if role != "superadmin":
        raise HTTPException(status_code=403, detail="Réservé au Super Admin")


@router.patch("/admin/institutional/{email}")
async def patch_institutional_admin(
    email: str,
    body: InstitutionalPatch,
    user=Depends(lambda: None),  # brancher get_current_user
):
    """Met à jour le statut ministériel d'un admin université."""
    _require_ministere_or_super(user)
    # Implémentation : UPDATE institutional_admins SET ministry_status=... WHERE email=...
    return {"ok": True, "email": email, "ministryStatus": body.ministryStatus}


@router.get("/admin/finance/payroll")
async def get_finance_payroll(user=Depends(lambda: None)):
    """Liste la paie employés Evo Finance (superadmin)."""
    _require_superadmin(user)
    # SELECT email, salary, bonus, deduction, auto_pay FROM finance_payroll
    return {"payroll": {}}


@router.put("/admin/finance/payroll/{email}")
async def put_finance_payroll(
    email: str,
    body: PayrollRow,
    user=Depends(lambda: None),
):
    """Enregistre la paie d'un employé plateforme."""
    _require_superadmin(user)
    row = {
        "email": email.strip().lower(),
        "salary": body.salary,
        "bonus": body.bonus,
        "deduction": body.deduction,
        "autoPay": body.autoPay,
    }
    # UPSERT finance_payroll
    return {"ok": True, "row": row}


@router.get("/platform/grades/manage")
async def list_grades_manage(user=Depends(lambda: None)):
    """Agrégation nationale des cotes (ministère / superadmin)."""
    _require_ministere_or_super(user)
    # SELECT * FROM grades ORDER BY universite
    return {"grades": []}
