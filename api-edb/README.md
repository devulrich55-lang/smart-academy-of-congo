# EvoDigitalBooks — extension API

Copier ce dossier dans le dépôt **smart-academy-of-congo-API** (`backend-python`).

## Installation

1. Exécuter `schema_edb.sql` sur la base (`/data/sac.db` sur Render).
2. Copier `app/services/edb_service.py` et `app/routes/edb.py` dans le projet API.
3. Dans `app/main.py` :

```python
from app.routes.edb import router as edb_router
from app.services.edb_service import EdbService

app.include_router(edb_router, prefix="/api")
```

4. Brancher `_get_edb_service()` dans `edb.py` vers votre `get_db()` et `hash_password()`.
5. Ajouter le rôle **`auteur`** dans la table users / contraintes RBAC (login `/auth/login`).
6. Lors de l'approbation auteur (`status=approved`), créer ou activer l'utilisateur `role=auteur`.
7. Les livres publiés passent par **`POST /api/platform/library`** avec :
   - `source: "evodigitalbooks"`
   - `authorRole: "auteur"`
   - `authorEmail`, `authorMobileMoney`

## Endpoints

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/api/platform/edb/authors/register` | Public |
| GET | `/api/platform/edb/authors/pending` | superadmin |
| PATCH | `/api/platform/edb/authors/{email}/status` | superadmin |
| POST | `/api/platform/edb/purchases` | Authentifié / soft |
| GET | `/api/platform/edb/purchases/me` | Acheteur |

## Paiements Mobile Money

Le frontend envoie `metadata` à `/payments/mobile/initiate` :

- `purpose: "evodigitalbooks"`
- `authorMobileMoney` — numéro récepteur auteur
- `authorShare` (75 %) · `platformFee` (25 %)

Adapter `payment_service.py` pour router le versement vers l'auteur.

## Déploiement Render

```powershell
cd backend-python
git add app/routes/edb.py app/services/edb_service.py
git commit -m "feat(edb): EvoDigitalBooks authors, purchases and device limits"
git push
```

Manual Deploy sur **smart-academy-of-congo-api-1**.
