# Publication web Evo-smartUni — Google & visibilité

Guide pour rendre le site **trouvable sur Google** et prêt pour les universités.

---

## URL officielle (production)

| Service | URL |
|---------|-----|
| **Site web** | https://smart-academy-of-congoat.onrender.com |
| **API** | https://smart-academy-of-congo-api-1.onrender.com |

> Si vous ajoutez un domaine personnalisé (ex. `www.evosmartuni.cd`), mettez à jour `sitemap.xml`, `robots.txt` et les variables CORS de l’API.

---

## Ce qui est déjà en place (dans le code)

- `sitemap.xml` — pages publiques indexables
- `robots.txt` — autorise l’accueil, connexion, inscription, bibliothèque ; bloque les dashboards privés
- `js/sac-seo.js` — balises canonical + Open Graph
- `privacy.html` — politique de confidentialité
- PWA — installation depuis le navigateur

---

## Étape 1 — Déployer sur Render

1. Commitez et poussez sur GitHub (`main`).
2. Render → service **smart-academy-of-congo** → vérifiez **Auto-Deploy** activé.
3. Attendez la fin du déploiement (2–5 min).
4. Testez :
   - https://smart-academy-of-congoat.onrender.com/
   - https://smart-academy-of-congoat.onrender.com/sitemap.xml
   - https://smart-academy-of-congoat.onrender.com/robots.txt

---

## Étape 2 — Google Search Console (indispensable pour Google)

1. Allez sur [Google Search Console](https://search.google.com/search-console).
2. **Ajouter une propriété** → **Préfixe d’URL** :
   ```
   https://smart-academy-of-congoat.onrender.com
   ```
3. **Vérification** — méthode recommandée : balise HTML  
   - Copiez la balise `google-site-verification` fournie par Google.
   - Collez-la dans `index.html` (section `<head>`, après les autres meta).
   - Redéployez, puis cliquez **Vérifier** dans Search Console.
4. **Sitemaps** → Ajouter :
   ```
   sitemap.xml
   ```
5. **Inspection d’URL** → testez `https://smart-academy-of-congoat.onrender.com/` → **Demander une indexation**.

Délai habituel : **quelques jours à 2 semaines** avant d’apparaître sur Google pour des recherches comme « Evo-smartUni ».

---

## Étape 3 — CORS API (connexion sans erreur)

Sur Render → service **API** → Variables :

```
ALLOWED_ORIGINS=https://smart-academy-of-congoat.onrender.com,https://smart-academy-of-congo-dbfm.onrender.com
FRONTEND_URL=https://smart-academy-of-congoat.onrender.com
CROSS_ORIGIN_AUTH=true
```

Puis **Manual Deploy** de l’API.

---

## Étape 4 — Domaine personnalisé (optionnel, recommandé)

1. Render → service frontend → **Custom Domains** → ajoutez `www.votredomaine.cd`.
2. Chez votre registrar DNS : enregistrement CNAME vers Render.
3. Mettez à jour `sitemap.xml` et `robots.txt` avec la nouvelle URL.
4. Ajoutez le domaine dans Search Console et dans `ALLOWED_ORIGINS`.

---

## Pages indexées (publiques)

| Page | Rôle |
|------|------|
| `/` | Accueil, présentation |
| `/connexion.html` | Connexion |
| `/inscription.html` | Inscription |
| `/plateforme.html` | Bibliothèque numérique |
| `/verifier-diplome.html` | Vérification diplôme |
| `/privacy.html` | Confidentialité |

Les dashboards (`dashboard-*.html`) restent **hors Google** (données privées).

---

## Checklist université

- [ ] Site en ligne et connexion testée
- [ ] Super Admin crée le compte université
- [ ] URL partagée aux étudiants / professeurs
- [ ] Search Console configurée + sitemap soumis
- [ ] (Optionnel) Domaine `.cd` ou `.com` propre

---

*Evo-smartUni — publication web*
