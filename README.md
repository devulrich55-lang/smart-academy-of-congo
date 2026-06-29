# Evo-smartUni

Plateforme éducative pour les universités et instituts partenaires en Afrique centrale et dans la région : inscription, notes, relevés officiels, réclamations, cours en direct et vérification de diplômes.

## Démarrage local

1. Installez **Python 3.10+** ([python.org](https://www.python.org/downloads/)) avec « Add to PATH ».
2. Double-cliquez **`start-local.bat`** (ou exécutez-le depuis ce dossier).
3. Ouvrez [http://127.0.0.1:8000](http://127.0.0.1:8000)

Le script installe les dépendances, crée `backend-python/data/` et copie `.env.example` → `.env` si besoin.

### Compte démo

| Champ | Valeur |
|-------|--------|
| E-mail | `etu.demo@unikin.cd` |
| Mot de passe | `Demo2025!` |

Pages utiles : [connexion](http://127.0.0.1:8000/connexion.html) · [plateforme](http://127.0.0.1:8000/plateforme.html) · [relevé de notes](http://127.0.0.1:8000/bulletin-semestre.html)

## Architecture

| Couche | Technologie |
|--------|-------------|
| Frontend | HTML, CSS, JavaScript statique |
| API | FastAPI (Python) · SQLite |
| Auth | JWT (Bearer cross-origin sur Render) |
| Hébergement | **Render** (frontend statique + API) ou serveur local |

Les notes et relevés sont synchronisés via `/api/platform/grades`. Les **réclamations** et **sections faculté** passent par `/api/reclamations` et `/api/sections`. L'authentification API est obligatoire en production ; le repli `localStorage` n'est actif qu'en localhost.

## Déploiement

Voir **[DEPLOYMENT.md](DEPLOYMENT.md)** pour Render, variables d'environnement et dépannage.

Vérification rapide après déploiement :

```bash
npm run check:health https://smart-academy-of-congo-dbfm.onrender.com
```

## Structure

```
├── js/                  Modules frontend (session, notes, relevés, plateforme)
├── css/                 Styles et thème
├── backend-python/      API FastAPI + base SQLite
├── render.yaml          Config frontend Render
├── dashboard-*.html     Espaces par rôle (étudiant, prof, assistant, section, université)
├── plateforme.html      Portail unifié (10 piliers)
└── bulletin-semestre.html   Relevé de notes officiel
```

## Rôles

| Rôle | Tableau de bord |
|------|-----------------|
| Étudiant | `dashboard-etudiant.html` |
| Professeur | `dashboard-professeur.html` |
| Assistant | `dashboard-assistant.html` |
| Chef de section | `dashboard-section.html` |
| Université | `dashboard-universite.html` |

## Licence

Projet Evo-smartUni — usage institutionnel.
