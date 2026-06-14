# Déploiement — Smart Academy of Congo

Checklist pour un déploiement **stable** (auth JWT, données persistantes, CORS).

---

## Option A — Firebase + Cloud Run (recommandé)

| Étape | Action |
|-------|--------|
| 1 | `npm install` · `copy .firebaserc.example .firebaserc` · renseigner l'ID projet |
| 2 | Déployer l'API : voir [FIREBASE.md](FIREBASE.md) étape 3 |
| 3 | Variables Cloud Run : copier [backend-python/cloudrun.env.example](backend-python/cloudrun.env.example) |
| 4 | `ALLOWED_ORIGINS` = votre `.web.app` + `.firebaseapp.com` |
| 5 | `npm run deploy` (hosting) |
| 6 | Tester `GET https://VOTRE-PROJECT-ID.web.app/api/health` → `"database":"up"` |

Le rewrite `/api/**` → Cloud Run est dans `firebase.json`.

---

## Option B — Vercel + Render

### Backend (Render)

1. Créer un **Web Service** depuis `backend-python/render.yaml` (Blueprint) ou manuellement
2. **Disque persistant** 1 Go monté sur `/data` (inclus dans `render.yaml`)
3. Après le 1er déploiement, définir dans le dashboard Render :

```
ALLOWED_ORIGINS=https://VOTRE-APP.vercel.app
FRONTEND_URL=https://VOTRE-APP.vercel.app
```

4. Vérifier : `GET https://sac-api-python.onrender.com/api/health`

Les secrets JWT sont générés automatiquement par le Blueprint (`generateValue: true`).

### Frontend (Vercel)

1. Importer le dépôt sur [vercel.com](https://vercel.com)
2. Variables d'environnement (voir [vercel.env.example](vercel.env.example)) :

```
SAC_API_URL=https://VOTRE-SERVICE.onrender.com
```

3. Déployer — le proxy `api/[...path].js` route `/api/*` vers Render **sans URL en dur** dans `vercel.json`
4. Tester : `GET https://VOTRE-APP.vercel.app/api/health`

---

## Variables obligatoires en production

| Variable | Rôle |
|----------|------|
| `JWT_ACCESS_SECRET` | Token court (15 min) |
| `JWT_REFRESH_SECRET` | Token refresh (7 j) |
| `ALLOWED_ORIGINS` | Domaines frontend autorisés (CORS) |
| `COOKIE_SECURE=true` | Cookies HTTPS uniquement |
| `DATABASE_PATH` | `/data/sac.db` sur Render · volume persistant |
| `UPLOAD_DIR` | `/data/uploads` sur Render |
| `FRONTEND_URL` | Liens e-mail (reset mot de passe) |

---

## Développement local

```powershell
# Double-clic ou :
.\start-local.bat
```

- Site + API : http://127.0.0.1:8000
- Copier `backend-python\.env.example` → `backend-python\.env`
- Compte démo : `etu.demo@unikin.cd` / `Demo2025!`

---

## Dépannage

| Symptôme | Cause probable | Solution |
|----------|----------------|----------|
| `403 CORS_BLOCKED` | Origine absente de `ALLOWED_ORIGINS` | Ajouter l'URL exacte du frontend |
| `503 API_NOT_CONFIGURED` (Vercel) | `SAC_API_URL` manquant | Variable Vercel → redéployer |
| Données perdues au redémarrage | Pas de disque `/data` | Activer disque Render ou volume Cloud Run |
| `"database":"down"` dans `/health` | SQLite inaccessible | Vérifier `DATABASE_PATH` et permissions |
| Connexion échoue en prod | JWT dev ou cookies cross-domain | Vérifier proxy `/api` same-origin + `COOKIE_SECURE` |
| API ne démarre pas | Secrets JWT par défaut | Régénérer secrets (Render Blueprint le fait) |

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `firebase.json` | Hosting + rewrite Cloud Run |
| `vercel.json` | URLs propres frontend |
| `api/[...path].js` | Proxy API Vercel → Render |
| `backend-python/render.yaml` | Blueprint Render complet |
| `backend-python/Dockerfile` | Image Cloud Run |
| `backend-python/.env.example` | Config locale |
| `vercel.env.example` | Variables Vercel |
