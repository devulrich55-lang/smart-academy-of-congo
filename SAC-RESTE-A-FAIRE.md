# Evo-smartUni — État de la plateforme

> Document de référence — mis à jour le **18 juin 2026**.  
> Bilan complet : ce qui marche, ce qui ne marche pas, ce qui reste à faire.

---

## Vue d'ensemble

| Zone | État global |
|------|-------------|
| **Site web** (14 pages, 5 rôles) | ✅ Très avancé |
| **API backend** (Python / FastAPI) | ✅ Très complète (local) |
| **Production Render** | ⚠️ Partielle — CORS, push Git, double dépôt |
| **Git / OneDrive** | ❌ Bloque les mises à jour |

**URLs production :**
- Site : `https://smart-academy-of-congoat.onrender.com`
- API : `https://smart-academy-of-congo-api-1.onrender.com`

**Architecture — 2 dépôts Git séparés :**

| Couche | Dossier local | Dépôt GitHub | Service Render |
|--------|---------------|--------------|----------------|
| **Frontend** | `Evo-smartUni/` | `smart-academy-of-congo` | Site `-dbfm` |
| **Backend** | `Evo-smartUni/backend-python/` | `smart-academy-of-congo-API` | API `-1` |

> Le dossier `backend-python/` est dans le `.gitignore` du frontend → un `git push` sur le site **ne déploie jamais l'API**.

---

## Tableau synthèse

| Élément | Code local | Push GitHub | Déployé Render | Opérationnel prod |
|---------|:----------:|:-----------:|:--------------:|:-----------------:|
| API + base SQLite persistante | ✅ | ✅ | ✅ | ✅ |
| Reset mot de passe Gmail | ✅ | ✅ | ✅ | ✅ |
| Connexion / inscription (CORS + session) | ✅ | ⚠️ | ⚠️ | ⚠️ si CORS mal configuré |
| Présence en ligne (tous comptes) | ✅ | ❌ | ❌ | ❌ |
| Logo `carte_rdc.jpeg` sur relevé | ✅ | ❌ | ❌ | ❌ |
| Fix CORS API (`allow_headers=["*"]`) | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Lives section (rôle section) | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Filtrage étudiant L2 / classe / section | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Git push depuis OneDrive | — | ❌ | — | ❌ |

**Légende :** ✅ confirmé · ⚠️ à vérifier · ❌ pas fait / bloqué

---

# ✅ CE QUI MARCHE

## Infrastructure (confirmé en production)

| Élément | Détail |
|---------|--------|
| **API en ligne** | `/api/health` → `ok: true`, `database: up` |
| **Base de données** | SQLite persistante `/data/sac.db` — comptes conservés après redémarrage |
| **Uploads** | Dossier `/data/uploads` sur disque Render |
| **E-mail Gmail** | Reset mot de passe (`emailConfigured: true`) |
| **Sécurité API** | JWT, cookies httpOnly, rôles, verrouillage après échecs, bcrypt |

## Comptes & authentification

| Fonctionnalité | Rôles |
|----------------|-------|
| Inscription en ligne | Étudiant, professeur, assistant, université |
| Connexion | Tous les rôles + chef de section |
| Session JWT | 15 min + refresh 7 jours |
| Mot de passe oublié | Code 6 chiffres par e-mail |
| Protection identité | 1 personne = 1 rôle, e-mail / téléphone uniques |
| Paiement inscription | Statut pending / verified / rejected |

## Dashboards par rôle (interface prête)

| Dashboard | Fonctions principales |
|-----------|----------------------|
| **Étudiant** | Profil, notes, documents, réclamations, frais, live, correction IA |
| **Professeur** | Publication, notes, correction IA, activité par classe, réunions |
| **Assistant** | Validation paiements, réclamations, publications, correction IA |
| **Université (DG)** | Sections, professeurs, nominations, communiqués, réunions, tarifs |
| **Chef de section** | Création comptes étudiants, réclamations, live section |

## Modules académiques (API + interface — code complet)

| Module | Description |
|--------|-------------|
| **Notes & cotes** | Saisie prof, relevé, bulletin, fiche de cote |
| **Documents / publications** | PDF, images, vidéos — filtrés par niveau, filière, classe, section |
| **Réclamations** | Étudiant → section → réponse |
| **Sections faculté** | CRUD, responsables, chefs nommés |
| **Nominations** | Professeur → chef de section |
| **Tarifs campus** | Par rôle (USD / CDF) |
| **Bibliothèque numérique** | Ouvrages par campus |
| **Stages & emplois** | Annonces campus / national |
| **Cours en ligne** | Création, inscription |
| **Réseau social étudiant** | Posts, likes |
| **Diplômes** | Émission (université) + vérification publique |
| **Orientation IA** | Conseils par filière / intérêts |
| **Correction IA travaux** | Dépôt → correction → validation prof → note |
| **Cours live (Jitsi)** | Création, démarrage, participation, enregistrement |
| **Réunions institutionnelles** | Section↔prof, doyen↔chefs — votes, documents, IA |
| **Filtrage visibilité étudiant** | Un L2 ne voit que son niveau, sa section, les cours de sa classe |
| **Présence en ligne** | Point vert + compteurs (code prêt — voir § partiel) |
| **Logo carte RDC** | Sur relevé (`carte_rdc.jpeg` — code prêt) |

## Pages publiques

| Page | Rôle |
|------|------|
| `index.html` | Accueil, actualités |
| `connexion.html` / `inscription.html` | Auth |
| `mot-de-passe-oublie.html` / `reinitialisation.html` | Reset MDP |
| `verifier-diplome.html` | Vérification diplôme (public) |
| `plateforme.html` | Écosystème 10 modules |
| `bulletin-semestre.html` / `fiche-cote.html` | Documents académiques |

## Endpoints API principaux (backend-python)

```
/api/health
/api/auth/*                    → login, register, refresh, reset password
/api/documents/*               → publications filtrées par rôle
/api/reclamations/*            → réclamations étudiants
/api/sections/*                → sections, création étudiants
/api/nominations/*             → chefs de section
/api/tariffs/*                 → tarifs campus
/api/platform/grades/*         → notes, relevés
/api/platform/library/*        → bibliothèque
/api/platform/careers/*        → stages & emplois
/api/platform/courses/*        → cours en ligne
/api/platform/live/*           → sessions live
/api/platform/meetings/*       → réunions institutionnelles
/api/platform/social/*         → réseau étudiant
/api/platform/diplomas/*       → diplômes
/api/platform/corrections/*    → correction IA
/api/platform/orientation      → orientation IA
/api/platform/presence/*       → présence en ligne (à déployer)
```

---

# ⚠️ CE QUI MARCHE PARTIELLEMENT

| Problème | Symptôme | Cause probable |
|----------|----------|----------------|
| **Connexion depuis le site** | « API injoignable » | CORS : mauvaise URL dans `ALLOWED_ORIGINS` |
| **Inscription → profil** | Profil ne s'ouvre pas | Session cross-origin + CORS |
| **Présence en ligne** | Point gris, compteurs à 0 | Code local OK, API pas redéployée |
| **Logo RDC sur relevé** | Ancien logo ou absent | Pas poussé sur GitHub / Render |
| **Lives section** | Rôle section parfois absent | Push frontend incertain |
| **Modules écosystème** | Repli localStorage si API down | Comportement voulu en fallback |

> L'API répond seule (`/api/health` OK), mais le **navigateur** peut bloquer les appels si CORS n'est pas correct (`originAllowed: false`).

---

# ❌ CE QUI NE MARCHE PAS (ou pas encore)

| Élément | Détail |
|---------|--------|
| **Déploiement automatique complet** | 2 dépôts : push site ≠ push API |
| **Présence en ligne en production** | Routes `/presence/*` pas confirmées en ligne |
| **Dernières corrections frontend** | Présence, session post-inscription, logo — push bloqué |
| **Travail Git depuis OneDrive** | Sync verrouille `.git/objects/` |
| **Paiement Mobile Money réel** | Validation manuelle assistant — pas d'intégration opérateur |
| **IA externe (ChatGPT / OpenAI)** | Correction / réunions = logique interne EvoSU |
| **MySQL / PlanetScale en prod** | Config possible ; prod utilise **SQLite** sur Render |

---

# 📋 CE QUI RESTE À FAIRE

## Priorité 1 — Débloquer la production

- [ ] **Pause OneDrive** + fermer Cursor, ou copier le projet hors OneDrive
- [ ] **Corriger CORS Render API** (`ALLOWED_ORIGINS` = URL `-dbfm`)
- [ ] **Push + Manual Deploy API** (dépôt `backend-python`)
- [ ] **Push + Manual Deploy site** (dépôt principal)

## Priorité 2 — Activer les dernières fonctionnalités

- [ ] Présence en ligne (tous comptes)
- [ ] Session après inscription
- [ ] Logo carte RDC sur relevé
- [ ] Fix CORS headers API

## Priorité 3 — Tests après déploiement

- [ ] Inscription étudiant → profil s'ouvre
- [ ] Connexion / déconnexion / reconnexion
- [ ] Manual Deploy API → compte toujours là
- [ ] Point vert « en ligne » sur chaque dashboard
- [ ] Compteurs section / professeur / campus
- [ ] Relevé avec logo RDC
- [ ] Réclamation étudiant → traitement section
- [ ] Reset mot de passe par e-mail

## Priorité 4 — Améliorations futures (non urgent)

- Intégration paiement Mobile Money (Orange, Airtel, M-Pesa…)
- IA externe (OpenAI) pour correction et réunions
- Migration MySQL si très gros volume
- Projet définitivement **hors OneDrive**
- Monitoring / logs centralisés

---

## Schéma simple

```
┌─────────────────────────────────────────────────────────┐
│  SITE (frontend)          API (backend)                   │
│  ✅ Pages & dashboards    ✅ Logique complète (local)     │
│  ⚠️ Push Git bloqué       ⚠️ Push séparé requis           │
│  ⚠️ CORS peut bloquer     ✅ DB + e-mail OK en prod       │
└─────────────────────────────────────────────────────────┘

         Ce qui manque surtout :
         → git push (2 dépôts)
         → CORS Render corrigé
         → Manual Deploy site + API
```

---

# DÉTAIL TECHNIQUE — BLOQUANTS & ACTIONS

## Bloquant n°1 — Git / OneDrive

### Symptôme
```
Deletion of directory '.git/objects/01' failed. Should I try again? (y/n)
```

### Cause
Projet dans OneDrive : `C:\Users\1\OneDrive\Desktop\Evo-smartUni`

### Solution immédiate
1. Répondre `n` si ça boucle, fermer le terminal.
2. **Pause OneDrive** (2 h).
3. **Fermer Cursor** complètement.
4. Nouveau PowerShell → commit + push.

### Solution durable
```powershell
xcopy "C:\Users\1\OneDrive\Desktop\Evo-smartUni" "C:\dev\Smart-Academy-of-Congo" /E /I /H
cd "C:\dev\Smart-Academy-of-Congo"
```

---

## Bloquant n°2 — CORS sur Render

### Symptôme
- `/api/health` OK en direct.
- Site : « API injoignable » ou connexion échoue.
- `"originAllowed": false`

### Cause
`ALLOWED_ORIGINS` pointait vers la mauvaise URL :
- ✅ `https://smart-academy-of-congoat.onrender.com` (Web Service Node)
- ❌ `https://smart-academy-of-congo.onrender.com` (Static legacy → redirige)
- ❌ `https://smart-academy-of-congo-dbfm.onrender.com` (obsolète)

### Variables Render API (Environment)
```
NODE_ENV=production
ALLOWED_ORIGINS=https://smart-academy-of-congoat.onrender.com
FRONTEND_URL=https://smart-academy-of-congoat.onrender.com
CROSS_ORIGIN_AUTH=true
COOKIE_SECURE=true
DATABASE_BACKEND=sqlite
DATABASE_PATH=/data/sac.db
UPLOAD_DIR=/data/uploads
JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
```

**Actions :** Save → **Manual Deploy** API.

---

## Présence en ligne — détail

### Objectif
- Chaque utilisateur : **point vert** « en ligne ».
- **Chef de section** : compteur section.
- **Professeur** : compteur par classe.
- **Assistant / Université** : compteur campus.

### Frontend (fait localement)
`css/presence.css`, `js/sac-presence.js`, `js/sac-api.js`, tous les `dashboard-*.html`

### Backend (fait localement)
`db/schema-platform.sql`, `db/schema-mysql.sql`, `platform_service.py`, `platform.py`

### Endpoints
```
POST /api/platform/presence/ping
GET  /api/platform/presence/section
GET  /api/platform/presence/classes
```

### Comportement attendu
- Point **vert** = API + session + ping OK.
- Point **gris** = API absente, CORS, ou session expirée.
- Compteur = actifs dans les **90 dernières secondes**.

---

## Logo carte RDC — détail

- Fichier : `carte_rdc.jpeg`
- `js/sac-grade-sheet.js`, `css/grade-sheet.css`
- À pousser avec le frontend + Manual Deploy site.

---

# COMMANDES GIT

## Frontend
```powershell
# Pause OneDrive + fermer Cursor avant
cd "C:\Users\1\OneDrive\Desktop\Evo-smartUni"
git status
git add css/presence.css js/sac-presence.js js/sac-api.js js/sac-session.js js/sac-config.js
git add dashboard-etudiant.html dashboard-professeur.html dashboard-section.html
git add dashboard-assistant.html dashboard-universite.html
git add connexion.html inscription.html
git add js/sac-live.js js/sac-video-live.js
git add carte_rdc.jpeg js/sac-grade-sheet.js css/grade-sheet.css
git commit -m "feat: présence en ligne, CORS session, logo RDC relevé"
git push origin main
```

## Backend API
```powershell
cd "C:\Users\1\OneDrive\Desktop\Evo-smartUni\backend-python"
git status
git add app/main.py app/config.py
git add app/routes/platform.py app/services/platform_service.py
git add db/schema-platform.sql db/schema-mysql.sql
git commit -m "feat: CORS, présence en ligne heartbeat section et classes"
git push origin main
```

---

# CHECKLIST RENDER

### Site (frontend)
- [ ] Push GitHub réussi
- [ ] Manual Deploy → statut **Live**

### API (backend)
- [ ] Push GitHub (`smart-academy-of-congo-API`)
- [ ] `ALLOWED_ORIGINS` = URL `-dbfm`
- [ ] `CROSS_ORIGIN_AUTH=true`
- [ ] Manual Deploy → statut **Live**

### Test santé API
`https://smart-academy-of-congo-api-1.onrender.com/api/health`

Attendu : `"ok": true`, `"database": "up"`, `"originAllowed": true`

---

# FICHIERS MODIFIÉS RÉCEMMENT

### Frontend (push incertain)
`connexion.html`, `inscription.html`, `dashboard-*.html`, `js/sac-api.js`, `js/sac-config.js`, `js/sac-session.js`, `js/sac-presence.js`, `js/sac-live.js`, `js/sac-video-live.js`, `js/sac-grade-sheet.js`, `css/presence.css`, `css/grade-sheet.css`, `carte_rdc.jpeg`

### Backend (dépôt séparé, push incertain)
`app/main.py`, `app/config.py`, `app/routes/platform.py`, `app/services/platform_service.py`, `db/schema-platform.sql`, `db/schema-mysql.sql`

---

# EN CAS DE PROBLÈME

| Problème | Piste |
|----------|-------|
| `.git/objects` failed | Pause OneDrive, fermer Cursor, ou projet hors OneDrive |
| API injoignable | CORS : `originAllowed` doit être `true` |
| Point présence gris | API pas déployée avec routes `/presence/*` |
| Profil ne s'ouvre pas après inscription | `CROSS_ORIGIN_AUTH=true` + `js/sac-session.js` déployé |
| Comptes perdus après redeploy | `DATABASE_PATH=/data/sac.db` + disque persistant Render |

---

## En une phrase

**La plateforme est très avancée** (comptes, notes, documents, réclamations, live, réunions, IA, 5 rôles) — le code est là, mais **la production n'est pas à jour** à cause du **CORS Render**, du **Git bloqué par OneDrive**, et du **double dépôt** (site + API à pousser séparément).

---

*Mettre à jour ce fichier après chaque étape terminée (cocher les cases, ajuster les statuts).*
