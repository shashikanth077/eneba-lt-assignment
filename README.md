# KEYMART – marketplace for digital game keys

Eneba Intern Assignment 2027. A marketplace web app styled after eneba.com: catalog with filters, fuzzy
search, config-driven homepage, product page with multi-seller offers, cart, Stripe test-mode checkout and
digital key delivery, and authentication. "KEYMART" is a placeholder brand name.

- Scope, API, payment flow, risks: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Design reference and component inventory: [docs/DESIGN_TOKENS.md](docs/DESIGN_TOKENS.md)
- Project rules for the AI agent: [CLAUDE.md](CLAUDE.md); full AI chat log: [docs/ai-log/](docs/ai-log/)

## Stack
PHP 8.3 + Slim 4 + PHP-DI + PDO, MySQL 8 · React + TypeScript + Vite, Redux Toolkit (RTK Query), MUI.

## Layout
```
backend/    PHP API: public/, config/, src/{Controllers,Services,Repositories,Middleware,Http,Support,Exceptions}, tests/
frontend/   React app: src/{app,components,features,theme}
docs/       Architecture, design tokens, AI log
docker-compose.yml
```

## Run with Docker (recommended)
```bash
docker compose up --build
```
| URL | What |
|---|---|
| http://localhost:5173 | React app (placeholder page; shows the API status) |
| http://localhost:8080/api/health | API health check -> `{"status":"ok","db":"ok"}` |
| localhost:3307 | MySQL (user/password/db: `keymart`) |

The first start installs Composer and npm dependencies inside the containers, so give it a minute.
Optional phpMyAdmin at http://localhost:8081: `docker compose --profile tools up`.
Reset the database: `docker compose down -v`.

## Run without Docker
Needs PHP 8.3 (with `pdo_mysql`), Composer, MySQL 8 and Node 22.
```bash
# backend
cd backend && cp .env.example .env && composer install
php -S localhost:8080 -t public public/index.php

# frontend (second terminal)
cd frontend && cp .env.example .env && npm install && npm run dev
```

## Checks
```bash
cd backend && composer test              # PHPUnit
cd frontend && npm run lint && npm run typecheck && npm run build
```

## API conventions
Every error has one shape, with `details` always present (`null` when there is nothing to add):
```json
{ "error": { "code": "validation_failed", "message": "The request data is invalid", "details": { "fields": { "email": ["Must be a valid email address"] } } } }
```
Configuration lives in environment variables only; see `backend/.env.example`, `frontend/.env.example` and
the root `.env.example`. Real `.env` files are git-ignored.
