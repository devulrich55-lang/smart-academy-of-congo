# Extensions API — Ministère & Evo Finance

Copier dans le dépôt **smart-academy-of-congo-API** (`backend-python`).

## Installation

1. Exécuter `schema_ministry.sql` sur la base (`/data/sac.db` sur Render).
2. Copier `app/routes/ministry_finance.py` dans le projet API.
3. Dans `app/main.py` :

```python
from app.routes.ministry_finance import router as ministry_finance_router
app.include_router(ministry_finance_router, prefix="/api")
```

4. Brancher `Depends(get_current_user)` et les requêtes SQL réelles (voir commentaires dans le fichier).
5. Inclure `ministry_status` dans la réponse `GET /admin/institutional`.

## Endpoints

| Méthode | Route | Rôle |
|---------|-------|------|
| PATCH | `/api/admin/institutional/{email}` | ministere, superadmin |
| GET | `/api/admin/finance/payroll` | superadmin |
| PUT | `/api/admin/finance/payroll/{email}` | superadmin |
| GET | `/api/platform/grades/manage` | ministere, superadmin |

## Déploiement

```powershell
cd backend-python
git add app/routes/ministry_finance.py
git commit -m "feat(api): statuts ministere, paie finance et cotes nationales"
git push
```

Manual Deploy sur **smart-academy-of-congo-api-1**.
