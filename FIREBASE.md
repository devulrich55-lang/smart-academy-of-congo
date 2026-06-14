# Hébergement Firebase — Smart Academy of Congo

Guide simplifié (sans Render). Tout passe par **Google Firebase / Cloud Run**.

## Architecture

```
Utilisateur
    ↓
Firebase Hosting  (HTML, CSS, JS, logos.png)
    ↓  /api/*
Cloud Run         (API Python FastAPI — backend-python/)
```

Le frontend appelle `/api/...` sur le **même domaine** ; Firebase redirige vers Cloud Run automatiquement.

---

## Prérequis

1. Compte [Google](https://accounts.google.com/)
2. [Node.js](https://nodejs.org/) 18+ installé
3. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud`) pour l’API

---

## Étape 1 — Projet Firebase

1. Allez sur [console.firebase.google.com](https://console.firebase.google.com/)
2. **Créer un projet** (ex. `smart-academy-congo`)
3. Activez la **facturation** (requise pour Cloud Run ; le quota gratuit couvre souvent un petit trafic)

Dans le terminal, à la racine du projet :

```powershell
cd "c:\Users\1\OneDrive\Desktop\Smart Acamy of Congo"
npm install
npx firebase login
copy .firebaserc.example .firebaserc
```

Éditez `.firebaserc` et remplacez `VOTRE-PROJECT-ID-FIREBASE` par l’ID de votre projet Firebase.

---

## Étape 2 — Déployer le site (frontend)

```powershell
npm run deploy
```

Ou :

```powershell
npx firebase deploy --only hosting
```

URL obtenue : `https://VOTRE-PROJECT-ID.web.app`

Test local avant déploiement :

```powershell
npm run serve
```

Puis ouvrez `http://localhost:5000`

---

## Étape 3 — Déployer l’API sur Cloud Run

```powershell
gcloud auth login
gcloud config set project VOTRE-PROJECT-ID-FIREBASE
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

Déployez l’API depuis le dossier `backend-python` :

```powershell
cd backend-python
gcloud run deploy sac-api `
  --source . `
  --region europe-west1 `
  --allow-unauthenticated `
  --set-env-vars "NODE_ENV=production,COOKIE_SECURE=true" `
  --set-secrets "JWT_ACCESS_SECRET=JWT_ACCESS_SECRET:latest,JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest" `
  --memory 512Mi
```

> **Secrets JWT** : créez-les d’abord dans [Secret Manager](https://console.cloud.google.com/security/secret-manager) (valeurs d’au moins 32 caractères), ou remplacez `--set-secrets` par :
>
> `--set-env-vars "JWT_ACCESS_SECRET=votre-secret-long,JWT_REFRESH_SECRET=autre-secret-long"`

Ajoutez l’origine Firebase dans CORS :

```powershell
gcloud run services update sac-api --region europe-west1 `
  --update-env-vars "ALLOWED_ORIGINS=https://VOTRE-PROJECT-ID.web.app,https://VOTRE-PROJECT-ID.firebaseapp.com,http://localhost:5000,FRONTEND_URL=https://VOTRE-PROJECT-ID.web.app"
```

Pour des données persistantes, montez un volume sur `/data` et définissez `DATABASE_PATH=/data/sac.db`, `UPLOAD_DIR=/data/uploads` (voir `backend-python/cloudrun.env.example`).

Le nom du service doit être **`sac-api`** (comme dans `firebase.json`).

---

## Étape 4 — Lier Hosting et API

Le fichier `firebase.json` contient déjà :

```json
{
  "source": "/api/**",
  "run": {
    "serviceId": "sac-api",
    "region": "europe-west1"
  }
}
```

Redéployez le hosting après que Cloud Run soit actif :

```powershell
cd ..
npm run deploy
```

---

## Étape 5 — Vérifier

```text
GET https://VOTRE-PROJECT-ID.web.app/api/health
```

Réponse attendue :

```json
{"ok": true, "service": "Smart Academy API", "runtime": "python"}
```

Ouvrez `https://VOTRE-PROJECT-ID.web.app` et testez la connexion.

---

## URLs propres (sans .html)

Ces chemins fonctionnent grâce aux rewrites :

| URL | Page |
|-----|------|
| `/connexion` | connexion.html |
| `/inscription` | inscription.html |
| `/plateforme` | plateforme.html |
| `/fiche-cote` | fiche-cote.html |
| `/bulletin-semestre` | bulletin-semestre.html |

---

## Mode sans API (démonstration)

Si vous déployez **uniquement** le hosting (`npm run deploy`), l’application bascule sur le **stockage local** du navigateur (localStorage). Utile pour une démo rapide.

Pour l’API en production, suivez l’étape 3.

---

## Fichiers importants

| Fichier | Rôle |
|---------|------|
| `firebase.json` | Config hosting, rewrites, cache |
| `.firebaserc` | ID projet Firebase (local, non versionné) |
| `package.json` | Scripts `npm run deploy` / `serve` |
| `backend-python/Dockerfile` | Image Cloud Run |
| `js/sac-config.example.js` | URL API optionnelle si pas de rewrite |

---

## Dépannage

| Problème | Solution |
|----------|----------|
| `403 CORS_BLOCKED` | Ajoutez votre domaine `.web.app` dans `ALLOWED_ORIGINS` sur Cloud Run |
| `/api/health` → 404 | Vérifiez que le service Cloud Run s’appelle `sac-api` et que hosting est redéployé |
| Données perdues au redémarrage | Cloud Run est sans disque par défaut ; pour la prod, utilisez Cloud SQL ou un volume persistant |
| Render / Vercel | Ancienne config ; vous pouvez supprimer `vercel.json` si vous n’utilisez plus Vercel |

---

## Commandes utiles

```powershell
npm run serve          # Test local (port 5000)
npm run deploy         # Publier le site
firebase hosting:channel:deploy preview   # URL de prévisualisation temporaire
gcloud run services logs read sac-api --region europe-west1   # Logs API
```
