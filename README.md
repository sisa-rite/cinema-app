# Rio Theatres — Cinema Booking Web Application

Web application for browsing movies, selecting seats and buying or reserving tickets
for Rio Theatres in Oulu and Tampere.
Advanced Web Application Project, autumn 2026 — Team I.

## Team

| Name             | Role                                                   |
| ---------------- | ------------------------------------------------------ |
| Simona Horáčková | Scrum Master, Product Owner, Lead Developer (frontend) |
| Terézia Bartková | Developer (backend / database)                         |
| Vanesa Vigašová  | Developer (backend / database)                         |

## Tech stack

- **Frontend:** React (Vite), Tailwind CSS
- **Backend:** Node.js, Express
- **Database:** PostgreSQL 16
- **Deployment:** CSC Rahti (OpenShift), Docker Hub, GitHub Actions (CI/CD)

## Repository structure

```
cinema-app/
├── Frontend/   # React app (Vite + Tailwind)
├── Backend/    # Express REST API
└── Database/   # Docker Compose for local PostgreSQL
```

## Prerequisites

- Node.js 20+
- Docker Desktop
- Git

## Local setup

### 1. Database

```bash
cd Database
docker compose up -d
```

PostgreSQL runs on `localhost:5432` (user `cinema`, password `cinema`, database `cinema`).
Tables are created automatically when the backend starts (SQL files in `Backend/migrations`).
To run migrations manually: `cd Backend && npm run migrate`.
To reset the local database: `docker compose down -v && docker compose up -d` (this deletes local data).

### 2. Backend

```bash
cd Backend
cp .env.example .env
npm install
npm run migrate
npm run fetch-movies
npm run seed
npm run dev
```

`npm run fetch-movies` requires an OMDb API key in `Backend/.env` as
`OMDB_API_KEY`. Create a free key at [omdbapi.com](https://www.omdbapi.com/)
and keep it local; never commit it. The script writes the fixed IMDb catalog to
`Backend/seed/movies.json`. Finnish age ratings are maintained manually there;
OMDb's US `Rated` value is not used.

The seed creates demo accounts:

| Role | Email |
| ---- | ----- |
| Admin | `admin@rio.test` |
| Oulu cashier | `cashier.oulu@rio.test` |
| Tampere cashier | `cashier.tampere@rio.test` |

Use the `SEED_PASSWORD` from `Backend/.env` to sign in; locally it defaults to
`Rio-demo-2026`. To rebuild the demo data, run `npm run seed -- --reset`.
Reset is blocked when `NODE_ENV=production`.

API runs on http://localhost:3000. Health checks:

- `GET /api/health`
- `GET /api/health/db`

### 3. Frontend

```bash
cd Frontend
cp .env.example .env
npm install
npm run dev
```

App runs on http://localhost:5173.

## Environment variables

| Location | Variable       | Description                    |
| -------- | -------------- | ------------------------------ |
| Backend  | `PORT`         | API port (default 3000)        |
| Backend  | `CORS_ORIGIN`  | Allowed frontend origin        |
| Backend  | `DATABASE_URL` | PostgreSQL connection string   |
| Backend  | `DB_SSL`       | `true` in Azure, unset locally |
| Backend  | `OMDB_API_KEY` | Free API key used to fetch the seed movie data |
| Backend  | `SEED_PASSWORD` | Optional password for local demo accounts |
| Frontend | `VITE_API_URL` | Base URL of the API            |

## Git workflow

- `main` — production, deployed automatically
- `dev` — integration branch, all features are merged here first
- `feature/<short-name>` — one branch per Trello card

Rules:

1. Create a feature branch from `dev`.
2. Open a Pull Request into `dev`. Only the Scrum Master (Simona) merges PRs.
3. `main` and `dev` are protected: teammates cannot push directly. `main` is updated only via Pull Request before each sprint review.
4. Every Pull Request must pass CI (lint, build, tests) before merging.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `chore:`, `docs:`, `test:`.

## Links

- Live app: https://cinema-frontend-rio-cinema.2.rahtiapp.fi
- API health check: https://cinema-backend-rio-cinema.2.rahtiapp.fi/api/health/db
- Architecture: [docs/architecture.md](docs/architecture.md)
- Database schema (ERD): [docs/erd.png](docs/erd.png)
