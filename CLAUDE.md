# CLAUDE.md

## Project goal
Eneba Intern Assignment 2027: a marketplace web app that looks and feels like eneba.com.
Parts: Store (browse, filter, sort, search), Homepage (blocks, each fed by its own backend
service/DB, nothing hardcoded in the frontend), Search (typo and partial-name tolerant, available
from anywhere), Product page (details plus offers from several sellers), Cart and Checkout
(Stripe test mode, buyer receives a digital key), Authentication (sign up/in; checkout and order
history require sign-in), Eneba styling on every screen.
Flow: Homepage or Search -> Product page -> Cart -> Checkout (auth) -> Payment -> Order and key.
Priority: a few features done extensively beat many minimal ones. The author must be able to
explain every line, so keep code simple and readable. Scope shortcuts are allowed but must be
justified in docs/.
Deliverables: GitHub link, public free-tier deployment URL, full AI chat log (docs/ai-log/).

## Stack
- Backend: PHP 8.3, MySQL 8, REST (JSON). No heavy framework unless agreed; PDO prepared statements.
- Frontend: React + TypeScript + Vite, Redux Toolkit with RTK Query, Material UI (themed to Eneba).
- Payments: Stripe test mode only. Email: EmailJS.

## Folder layout
- /backend  PHP API (src/, public/index.php, bin/, database/{migrations,seeds}, tests/)
- /frontend React app (src/features/<name>, src/app, src/components, src/theme)
- /docs     Architecture, decisions, scope justifications, and ai-log/
- /docs/ai-log/P<number>.md  One file per task (see AI log rule)
- CLAUDE.md, README.md at the repo root

## Coding conventions
- TypeScript strict; no `any`. Function components and hooks only. One RTK Query API slice per
  backend resource; the frontend renders only what the API returns.
- PHP: `declare(strict_types=1)`, PSR-12, typed properties and returns, PDO prepared statements
  only, thin controllers, logic in services, one JSON error shape `{ "error": { "code", "message", "details" } }` (`details` is `null` when empty).
- Passwords hashed with `password_hash`; auth via token or session; never trust client prices
  (recompute totals server-side).
- Secrets (Stripe, DB, EmailJS) live in `.env` files, never committed; keep `.env.example` current.
- Styling through the MUI theme (colors, typography, spacing tokens); no scattered magic values.
- Small focused files, descriptive names, comments only for the non-obvious "why".
- No application code or dependencies beyond what the current task needs.

## Commit message format
`P<number>: summary` (imperative, under 72 chars), e.g. `P3: add product catalog endpoint`.
`<number>` is the task number and matches the ai-log file. One task = one or more commits with
the same P-number. End commits with the attribution lines required by the environment.

## AI log rule (mandatory, after EVERY task)
1. Determine the task number N: the highest existing docs/ai-log/P<N>.md plus one (P1 if none).
2. Create or append to `docs/ai-log/P<N>.md` containing:
   - `## Prompt` the FULL, verbatim text of the user's prompt (never shortened or paraphrased);
   - `## Response summary` a summary of the answer: what was done, files changed, decisions,
     trade-offs, open questions.
3. If the user sends a follow-up within the same task, append another Prompt/Response pair to the
   same file instead of creating a new one.
4. Commit the log together with the task's changes under the same `P<N>:` commit.
This log is a submission deliverable; keep it complete and honest, including mistakes and fixes.

## Working agreement
- Confirm scope in one or two lines before large changes; ask only when truly blocked.
- Verify before claiming done (run the app, tests, or build) and report failures plainly.
- Develop on the branch assigned for the session; do not open PRs unless asked.
