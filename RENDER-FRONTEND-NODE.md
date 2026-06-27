# Option B — Frontend Node + proxy API (Render)

Guide pas à pas pour remplacer le site **Static** par un **Web Service Node** avec `server.js`.

---

## Pourquoi ?

| Static (actuel) | Node (Option B) |
|-----------------|-----------------|
| Pas de `server.js` | Proxy `/api` → API-1 |
| CORS obligatoire | **Même domaine**, plus de CORS |
| Connexion fragile sur iPhone | Connexion stable |

---

## Étape 1 — Créer le Web Service Node

1. Ouvrez [dashboard.render.com](https://dashboard.render.com)
2. **New +** → **Web Service**
3. Connectez le repo **`devulrich55-lang/smart-academy-of-congo`**
4. Branche : **`main`**

### Réglages du service

| Champ | Valeur |
|-------|--------|
| **Name** | `smart-academy-of-congo-web` (ou un nom libre) |
| **Region** | Oregon (comme l’API) |
| **Runtime** | **Node** |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Plan** | Starter (~7 $/mois) recommandé (pas de veille) |

### Variable d’environnement

| Key | Value |
|-----|-------|
| `API_PROXY_TARGET` | `https://smart-academy-of-congo-api-1.onrender.com` |

5. Cliquez **Create Web Service** → attendez le déploiement (**Live**).

---

## Étape 2 — Tester le nouveau service

Render affiche une URL, par ex. :
`https://smart-academy-of-congo-web.onrender.com`

### Test 1 — Proxy API

Ouvrez dans Safari (iPhone ou PC) :

```
https://VOTRE-NOUVELLE-URL.onrender.com/api/health
```

**Attendu :** JSON avec `"ok": true` (ou `"database": "up"`).

Si ça échoue → onglet **Logs** du service Node (erreur `npm install` ou proxy).

### Test 2 — Site

```
https://VOTRE-NOUVELLE-URL.onrender.com/connexion.html
```

Connectez-vous avec un compte étudiant.

---

## Étape 3 — Utiliser l’URL `dbfm` (optionnel)

Votre ancienne URL : `smart-academy-of-congo-dbfm.onrender.com`

**Méthode simple :**

1. Une fois le Node **testé et OK**, supprimez l’ancien service **Static** `smart-academy-of-congo`
2. Créez un **nouveau** Web Service Node (même repo) avec le name **`smart-academy-of-congo`**
   → Render peut redonner une URL proche de l’ancienne

**Ou** gardez la nouvelle URL et mettez à jour vos liens / bookmarks.

---

## Étape 4 — API (API-1)

Sur **`smart-academy-of-congo-API-1`**, gardez quand même :

```
CROSS_ORIGIN_AUTH=true
ALLOWED_ORIGINS=https://VOTRE-URL-FRONTEND.onrender.com
FRONTEND_URL=https://VOTRE-URL-FRONTEND.onrender.com
```

(Remplacez par l’URL **Node** finale, pas l’ancienne Static si elle change.)

**Manual Deploy** sur API-1 après modification.

---

## Étape 5 — iPhone

1. Navigation privée ou vider le cache Safari
2. Ouvrir la **nouvelle URL Node**
3. **Déconnexion → reconnexion**
4. Tester le réseau social (Publier)

---

## Dépannage

| Symptôme | Solution |
|----------|----------|
| Build failed | Logs → vérifier `npm install` et `package.json` |
| `/api/health` 404 | Service encore **Static** → recréer en **Node** |
| Connexion échoue | Vérifier `API_PROXY_TARGET` sur le service Node |
| « hors ligne » | Déconnexion / reconnexion pour obtenir les JWT |

---

## Fichiers du projet

| Fichier | Rôle |
|---------|------|
| `server.js` | Express + proxy `/api` et `/uploads` |
| `package.json` | `npm start` → `node server.js` |
| `render.yaml` | Blueprint Node (si Blueprint Render) |
| `js/sac-config.js` | Détecte proxy ou repli API directe |

---

## Résumé en 3 lignes

1. **New Web Service Node** → repo frontend → `npm install` / `npm start`
2. Tester **`/api/health`** sur la nouvelle URL
3. Supprimer l’ancien **Static** quand tout fonctionne
