# Passer le frontend Render de Static → Node (proxy API)

Votre capture Render montre **Runtime: Static** pour `smart-academy-of-congo`.  
Un site **Static** ne peut **pas** exécuter `server.js` ni proxifier `/api`.

Tant que le service reste Static, le navigateur doit appeler l'API directement → **CORS obligatoire** sur API-1.

---

## Option A — Recommandée : Web Service Node

### 1. Créer un nouveau service (Render ne convertit pas Static → Node)

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**
2. Repo : `devulrich55-lang/smart-academy-of-congo`
3. Branche : `main`
4. **Runtime** : `Node`
5. **Build Command** : `npm install`
6. **Start Command** : `npm start`
7. **Environment** :
   ```
   API_PROXY_TARGET=https://smart-academy-of-congo-api-1.onrender.com
   ```

### 2. URL

- Render donne une URL du type `https://smart-academy-of-congo-xxxx.onrender.com`
- Test : `https://VOTRE-URL.onrender.com/api/health` → JSON `ok: true`
- Si vous utilisez `dbfm.onrender.com`, déplacez le domaine vers le **nouveau** service Node

### 3. Supprimer l’ancien Static (optionnel)

Une fois le Node OK, supprimez l’ancien service **Static** pour éviter la confusion.

---

## Option B — Garder Static (CORS sur l’API)

Si vous restez en **Static**, configurez **API-1 → Environment** :

```
ALLOWED_ORIGINS=https://smart-academy-of-congo-dbfm.onrender.com
FRONTEND_URL=https://smart-academy-of-congo-dbfm.onrender.com
CROSS_ORIGIN_AUTH=true
NODE_ENV=production
```

Puis **Manual Deploy** sur **API-1** (pas seulement le site).

Test Safari :  
`https://smart-academy-of-congo-api-1.onrender.com/api/health`  
→ doit afficher `"originAllowed": true` si CORS est bon.

---

## Résumé

| Frontend Render | API appelée | CORS requis |
|-----------------|-------------|-------------|
| **Static** | api-1 direct | **Oui** — ALLOWED_ORIGINS exact |
| **Node** (server.js) | même domaine `/api` | **Non** |

Le code détecte automatiquement : proxy Node si `/api/health` répond sur le site, sinon repli API directe.
