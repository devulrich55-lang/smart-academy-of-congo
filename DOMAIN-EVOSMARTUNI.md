# Domaine evosmartuni.com — configuration

## URL officielle

| Usage | URL |
|-------|-----|
| **Site principal** | https://www.evosmartuni.com |
| **Racine (redirection)** | https://evosmartuni.com → www |
| **API (interne)** | https://smart-academy-of-congo-api-1.onrender.com |
| **Render (production Node)** | https://smart-academy-of-congoat.onrender.com |

---

## Étape 1 — Render (frontend)

1. [dashboard.render.com](https://dashboard.render.com) → service **smart-academy-of-congoat**
2. **Settings** → **Custom Domains** → **Add Custom Domain**
3. Ajoutez :
   - `www.evosmartuni.com`
   - `evosmartuni.com`
4. Render affiche les enregistrements DNS — **notez-les** (voir ci-dessous).

---

## Étape 2 — DNS (chez votre registrar)

Exemple typique (vérifiez les valeurs **exactes** affichées par Render) :

| Type | Nom / Host | Valeur |
|------|------------|--------|
| **CNAME** | `www` | `smart-academy-of-congoat.onrender.com` |
| **A** | `@` | IP fournie par Render pour la racine |

Ou si votre registrar propose **ALIAS / ANAME** pour `@` :
- `@` → même cible que le CNAME Render

Attendre **15 min à 48 h** (souvent &lt; 1 h).

Vérification : https://www.evosmartuni.com doit afficher la page d’accueil Evo-smartUni.

---

## Étape 3 — API Render (obligatoire)

Service **smart-academy-of-congo-api-1** → **Environment** :

```
ALLOWED_ORIGINS=https://www.evosmartuni.com,https://evosmartuni.com,https://smart-academy-of-congoat.onrender.com
FRONTEND_URL=https://smart-academy-of-congoat.onrender.com
CROSS_ORIGIN_AUTH=true
```

→ **Save** puis **Manual Deploy**.

Test : https://www.evosmartuni.com/connexion.html — connexion sans erreur « API injoignable ».

---

## Étape 4 — Google Search Console

1. [search.google.com/search-console](https://search.google.com/search-console)
2. Propriété : `https://www.evosmartuni.com`
3. Vérification : balise HTML dans `index.html` **ou** enregistrement DNS TXT
4. **Sitemaps** → `https://www.evosmartuni.com/sitemap.xml`
5. Inspection d’URL → page d’accueil → **Demander une indexation**

Recherchez ensuite sur Google : `Evo-smartUni` ou `evosmartuni.com`.

---

## Étape 5 — Déployer le code (GitHub → Render)

Après chaque mise à jour du projet :

```powershell
git add .
git commit -m "Domaine evosmartuni.com"
git push origin main
```

Render redéploie automatiquement (2–5 min).

---

## Checklist

- [ ] DNS `www` et `@` configurés
- [ ] Render Custom Domains : statut **Verified**
- [ ] https://www.evosmartuni.com ouvre le site
- [ ] Variables API mises à jour + redeploy API
- [ ] Connexion / inscription testées sur le domaine
- [ ] Search Console + sitemap soumis

---

*Evo-smartUni — evosmartuni.com*
