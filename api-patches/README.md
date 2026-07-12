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

## Suppression définitive bibliothèque / EvoDigitalBooks

Copier aussi :
- `app/services/library_delete.py`
- `app/routes/platform_library_delete.py` (ou fusionner dans `platform_library.py`)

La route `DELETE /api/platform/library/{id}` doit :
1. **Supprimer la ligne** en base (pas seulement `published=false`)
2. **Effacer les fichiers** uploadés (PDF, couverture)
3. Autoriser l'**auteur** à supprimer ses livres (`author_email` = session)
4. Autoriser **ministère / superadmin** pour tout document

Sans ce patch API, le frontend refuse la suppression locale si le serveur ne confirme pas.
