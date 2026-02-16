# StarRupture Map — Serveur collaboratif

Application web de cartographie interactive pour StarRupture (Arcadia-7).
Stack : **Node.js + Express + SQLite + Docker**.

---

## 🚀 Démarrage rapide (Docker)

```bash
# 1. Copier et configurer les variables d'environnement
cp .env.example .env
# Editez .env pour changer JWT_SECRET et ADMIN_PASSWORD

# 2. Lancer l'application
docker compose up -d

# 3. Ouvrir dans le navigateur
#    Carte     → http://localhost:3000
#    Admin     → http://localhost:3000/admin.html
```

**Compte admin par défaut** : `admin` / `admin1234`  
⚠️ **Changez le mot de passe immédiatement** via l'interface admin.

---

## ⚙️ Variables d'environnement

| Variable         | Défaut                        | Description                          |
|------------------|-------------------------------|--------------------------------------|
| `PORT`           | `3000`                        | Port exposé                          |
| `JWT_SECRET`     | `starrupture-change-me`       | Clé de signature JWT — **à changer**|
| `ADMIN_PASSWORD` | `admin1234`                   | Mot de passe admin initial           |
| `DB_PATH`        | `/data/starrupture.db`        | Chemin vers la base SQLite           |

---

## 📁 Structure du projet

```
starrupture-app/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── package.json
├── server/
│   ├── index.js          ← Express + démarrage
│   ├── db.js             ← SQLite, schéma, seed
│   ├── auth.js           ← JWT middleware
│   └── routes/
│       ├── api.js        ← Auth, marqueurs, modules, ressources
│       └── admin.js      ← Gestion users, ressources, logs, reset
└── public/
    ├── index.html        ← Application carte (login requis)
    ├── admin.html        ← Interface administration (admin requis)
    └── map_starrupture.png
```

---

## 🗺️ Fonctionnalités

### Application carte (`/`)
- Login / session JWT via cookie httpOnly
- Carte interactive pan/zoom d'Arcadia-7
- 5 types de marqueurs : Rupture, Ressource, Base, Alien, Blueprint
- Modules logistiques Envoi / Réception avec flux animés
- **Filtre ressources** sur les modules (par type, par ressource)
- Données persistées en SQLite, partagées entre joueurs en temps réel (rechargement)

### Interface admin (`/admin.html`)
- **Utilisateurs** : créer, changer le rôle, réinitialiser le mot de passe, supprimer
- **Ressources** : éditer nom, catégorie et couleur inline ; ajouter de nouvelles ressources
- **Journaux** : historique paginé de toutes les actions (login, création, suppression...)
- **Réinitialisation** : vider la carte, les joueurs, les logs, ou tout réinitialiser

---

## 🔌 API REST

### Auth
| Méthode | Route               | Description           |
|---------|---------------------|-----------------------|
| POST    | `/api/auth/login`   | Login, retourne JWT   |
| POST    | `/api/auth/logout`  | Déconnexion           |
| GET     | `/api/auth/me`      | Profil utilisateur    |

### Données (requiert auth)
| Méthode | Route                | Description              |
|---------|----------------------|--------------------------|
| GET     | `/api/resources`     | Liste des ressources      |
| GET     | `/api/markers`       | Liste des marqueurs       |
| POST    | `/api/markers`       | Créer un marqueur         |
| PUT     | `/api/markers/:id`   | Modifier un marqueur      |
| DELETE  | `/api/markers/:id`   | Supprimer (cascade mods)  |
| GET     | `/api/modules`       | Liste des modules         |
| POST    | `/api/modules`       | Créer un module           |
| PUT     | `/api/modules/:id`   | Modifier un module        |
| DELETE  | `/api/modules/:id`   | Supprimer un module       |

### Admin (requiert rôle admin)
| Méthode | Route                           | Description                  |
|---------|---------------------------------|------------------------------|
| GET     | `/api/admin/users`              | Liste utilisateurs            |
| POST    | `/api/admin/users`              | Créer utilisateur             |
| PUT     | `/api/admin/users/:id/password` | Réinitialiser mot de passe    |
| PUT     | `/api/admin/users/:id/role`     | Changer le rôle               |
| DELETE  | `/api/admin/users/:id`          | Supprimer utilisateur         |
| GET     | `/api/admin/resources`          | Liste ressources (admin)      |
| PUT     | `/api/admin/resources/:id`      | Modifier une ressource        |
| POST    | `/api/admin/resources`          | Ajouter une ressource         |
| GET     | `/api/admin/logs`               | Journaux (paginés)            |
| POST    | `/api/admin/reset/map`          | Vider marqueurs + modules     |
| POST    | `/api/admin/reset/players`      | Supprimer joueurs             |
| POST    | `/api/admin/reset/logs`         | Vider journaux                |
| POST    | `/api/admin/reset/all`          | Réinitialisation totale       |

---

## 🔒 Sécurité

- Mots de passe hashés avec **bcrypt** (10 rounds)
- Sessions via **JWT** dans un cookie `httpOnly; SameSite=Lax`
- Middleware d'authentification sur toutes les routes `/api/*`
- Middleware admin séparé sur `/api/admin/*`
- Impossible de se supprimer soi-même en admin
- WAL mode SQLite pour les accès concurrents

---

## 🛠️ Développement local (sans Docker)

```bash
npm install
cp .env.example .env
npm start
# ou avec rechargement auto :
npm run dev
```
