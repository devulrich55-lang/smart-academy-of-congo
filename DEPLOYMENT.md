# Déploiement — Evo-smartUni

Checklist pour un déploiement **stable** sur **Render** (auth JWT, données persistantes, CORS).

---

## Production Render

| Service | Rôle | Fichier |
|---------|------|---------|
| **Frontend** (statique) | Site HTML/CSS/JS | `render.yaml` |
| **Backend** (API Python) | FastAPI + SQLite | dépôt `backend-python` · `render.yaml` |

URLs de production (exemple) :

## URL officielle Render

| Usage | URL |
|-------|-----|
| **Frontend Node (prod)** | https://smart-academy-of-congoat.onrender.com |
| **API** | https://smart-academy-of-congo-api-1.onrender.com |

Les anciennes URLs Static (`smart-academy-of-congo`, `dbfm`) redirigent vers **congoat** via `sac-config.js`.

---

- Frontend : `https://smart-academy-of-congoat.onrender.com`
- API : `https://smart-academy-of-congo-api-1.onrender.com`

Le frontend détecte automatiquement l’API via `js/sac-config.js` quand le hostname se termine par `.onrender.com`.

---

## Frontend (Render — site statique)

1. Connecter le dépôt GitHub à Render
2. Utiliser `render.yaml` à la racine (service `smart-academy-of-congo`, `runtime: static`)
3. Chaque `git push` sur `main` redéploie le site

Vérifier : ouvrir la page d’accueil et la connexion.

---

## Backend (Render — API)

1. Déployer le dépôt **backend-python** comme Web Service sur Render
2. **Disque persistant** 1 Go monté sur `/data` (voir `backend-python/render.yaml`)
3. Variables d’environnement :

```
ALLOWED_ORIGINS=https://smart-academy-of-congoat.onrender.com,https://www.evosmartuni.com,https://evosmartuni.com
FRONTEND_URL=https://smart-academy-of-congoat.onrender.com
DATABASE_PATH=/data/sac.db
UPLOAD_DIR=/data/uploads
COOKIE_SECURE=true
```

4. Vérifier : `GET https://smart-academy-of-congo-api-1.onrender.com/api/health` → `"database":"up"`

Les secrets JWT sont générés automatiquement par le Blueprint Render (`generateValue: true`).

---

## Variables obligatoires en production

| Variable | Rôle |
|----------|------|
| `JWT_ACCESS_SECRET` | Token court (15 min) |
| `JWT_REFRESH_SECRET` | Token refresh (7 j) |
| `ALLOWED_ORIGINS` | URL exacte du frontend Render (CORS) |
| `COOKIE_SECURE=true` | Cookies HTTPS uniquement |
| `DATABASE_PATH` | `/data/sac.db` sur disque Render |
| `UPLOAD_DIR` | `/data/uploads` sur disque Render |
| `FRONTEND_URL` | Liens e-mail (reset mot de passe) |

---

## Développement local

```powershell
.\start-local.bat
```

- Site + API : http://127.0.0.1:8000
- Copier `backend-python\.env.example` → `backend-python\.env`
- Compte démo : `etu.demo@unikin.cd` / `Demo2025!`

---

## Dépannage

| Symptôme | Cause probable | Solution |
|----------|----------------|----------|
| `403 CORS_BLOCKED` | Origine absente de `ALLOWED_ORIGINS` | Ajouter l’URL exacte du frontend Render |
| Données perdues au redémarrage | Pas de disque `/data` | Activer disque persistant sur Render |
| `"database":"down"` dans `/health` | SQLite inaccessible | Vérifier `DATABASE_PATH` et permissions |
| Connexion échoue en prod | CORS ou API en veille | Vérifier `ALLOWED_ORIGINS` · attendre le réveil API (~30–90 s) |
| API ne démarre pas | Secrets JWT par défaut | Régénérer secrets sur Render |

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `render.yaml` | Config frontend statique Render |
| `js/sac-config.js` | URL API Render en production |
| `backend-python/render.yaml` | Blueprint API Render |
| `backend-python/.env.example` | Config locale |

Vérification rapide :

```bash
npm run check:health https://smart-academy-of-congoat.onrender.com
npm run check:node-deploy -- https://smart-academy-of-congoat.onrender.com
```
