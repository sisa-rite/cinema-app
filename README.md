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
- **Deployment:** Microsoft Azure, GitHub Actions (CI/CD)

## Repository structure

```
cinema-app/
├── Frontend/   # React app (Vite + Tailwind)
├── Backend/    # Express REST API
└── Database/   # Docker Compose for local PostgreSQL + SQL init scripts
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
SQL files in `Database/init` run only on the first start. To re-run them:
`docker compose down -v && docker compose up -d` (this deletes local data).

### 2. Backend

```bash
cd Backend
cp .env.example .env
npm install
npm run dev
```

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

- Live app: _coming soon_
- Trello board: _add link_
