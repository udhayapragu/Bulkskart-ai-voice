# Bulkskart AI Voice Sales Agent

An AI voice assistant that explains Bulkskart (a B2B bulk trading marketplace) to manufacturers and suppliers, answers their questions from an approved knowledge base in Tamil, English, Hindi, Telugu and Malayalam, and records outcomes and leads in a CRM.

> **Status: the simulator and dashboard are complete and tested. Live telephone calling is not ready.**
> The Sarvam AI and Exotel adapters are fail-closed stubs until they are verified against their official APIs with real credentials. See [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md) for the blockers.

Repository note from the original README: "Video publish". The repository contained no other code before this work.

## What is in the box

| Area | What it does |
| --- | --- |
| Dashboard (React, TypeScript) | Ten pages in a black and purple theme: Overview, Supplier contacts, Lead statuses, AI campaigns, Call history, Voice agent, Languages, Knowledge base, Usage & cost, Integrations & health. |
| API (Node.js, TypeScript, Express) | Admin sign-in, suppliers and consent, campaigns, scheduler, calls, follow-ups, knowledge base, settings, analytics, signed telephony webhooks. |
| Conversation engine | Deterministic state machine. Identifies as Bulkskart's AI assistant, asks for a convenient time, explains the platform, asks about products, answers only from approved knowledge, honours stop and do-not-call requests, hands off to a person. |
| Database | Supabase PostgreSQL schema with Row Level Security on every table, and migrations. |
| Providers | Voice (speech-to-text and text-to-speech) and telephony interfaces. Mock implementations are complete. Sarvam and Exotel adapters are fail-closed stubs. |
| Mock mode | A calling simulator runs scripted supplier behaviour through the real engine. It never places a telephone call, and every such call is labelled **Simulated**. |

## Repository layout

```
server/                     Express API (TypeScript)
  migrations/001_init.sql   Database schema (Supabase-compatible, RLS enabled)
  src/config/               Environment validation (zod)
  src/db/                   Store interface, PostgreSQL store, in-memory store, migration runner
  src/auth/                 scrypt password hashing, HMAC session tokens
  src/domain/               Languages, phone normalisation, compliance rules, retry policy, types
  src/agent/                Conversation engine, intents, five-language templates, knowledge matching, simulator scenarios
  src/providers/            Voice and telephony interfaces and adapters (mock, Sarvam, Exotel)
  src/services/             Business logic: suppliers, knowledge, settings, campaigns, calls, analytics
  src/routes/               HTTP routes with input validation, and webhooks
  src/scripts/              hash-password, seed-demo
  tests/                    Unit, service, API and PostgreSQL integration tests
web/                        React dashboard (Vite, TypeScript)
  src/pages/                The ten pages and the login page
  src/lib/                  API client, types, formatting
docs/TESTING_CHECKLIST.md   What to test, stage by stage
docs/PRODUCTION_READINESS.md Blockers and go-live sequence
.env.example                Environment template (placeholders only)
Dockerfile, docker-compose.yml, .dockerignore
```

## 1. Prerequisites

- Node.js 22 or later, and npm.
- A Supabase project (or any PostgreSQL 13+ database) for `STORE_DRIVER=postgres`.
- Docker, only for the container deployment.

## 2. Install

```bash
git clone <your-repo-url> bulkskart-voice-agent
cd bulkskart-voice-agent
git checkout ccr-4d00c3b4-9s25k2

cd server && npm ci && cd ..
cd web && npm ci && cd ..
```

## 3. Configure

```bash
cp .env.example server/.env
```

Edit `server/.env`:

1. **Database.** Set `STORE_DRIVER=postgres` and `DATABASE_URL` to your Supabase connection string (Project Settings → Database). Use the database owner credentials, never the anon key. Keep `STORE_DRIVER=memory` only for a throwaway demo; it loses all data on restart.
2. **Admin sign-in.** Set `ADMIN_EMAIL`. Generate the hash and paste it into `ADMIN_PASSWORD_HASH`:
   ```bash
   cd server && npm run build && npm run hash-password -- "a password of at least 12 characters" && cd ..
   ```
   Set `SESSION_SECRET` to at least 32 random characters, for example `openssl rand -base64 48`.
3. **Webhooks.** Set `TELEPHONY_WEBHOOK_SECRET` to at least 16 characters, for example `openssl rand -hex 32`. Without it, every telephony webhook is rejected.
4. **Providers.** Leave `VOICE_PROVIDER=mock` and `TELEPHONY_PROVIDER=mock` for now. Keep `LIVE_CALLING_ENABLED=false`.

Environment rules the server enforces at startup:

- `STORE_DRIVER=postgres` requires `DATABASE_URL`.
- `NODE_ENV=production` requires `STORE_DRIVER=postgres` and a voice provider other than `mock`.
- `SESSION_SECRET` must be at least 32 characters.
- `TELEPHONY_PROVIDER=exotel` requires all four `EXOTEL_*` values.
- Live calling cannot be enabled with the mock telephony provider.

## 4. Set up the database

```bash
cd server
npm run build
npm run migrate        # applies migrations/*.sql once, in order; safe to rerun
```

Optional demo data (approves only the B2B marketplace description; fees and other facts stay as drafts):

```bash
npm run seed:demo
```

## 5. Run locally

Terminal 1, API on port 8080:

```bash
cd server
npm run dev
```

Terminal 2, dashboard on port 5173 (proxies `/api` to the API):

```bash
cd web
npm run dev
```

Open http://localhost:5173 and sign in with `ADMIN_EMAIL` and the password you hashed.

## 6. Try the complete workflow without any phone calls

1. **Supplier contacts**: add a supplier, or paste a list of `phone, company, source` lines.
2. **Knowledge base**: add an answer and click **Approve**. Only approved answers are spoken.
3. **Voice agent**: choose a supplier and a scenario, then **Run simulation**. Open the transcript from the link.
4. **AI campaigns**: create a **Simulated** campaign, add suppliers, click **Launch…**, and type the exact confirmation text shown.
5. **Integrations & health**: **Run one pass** dials due contacts inside the calling window (09:00–19:00 IST by default).
6. **Call history** and **Lead statuses**: review outcomes, summaries and follow-up tasks.

## 7. Run the tests

```bash
cd server
npm run typecheck
npm test                                              # 92 pass, 4 need a database
TEST_DATABASE_URL=postgres://USER:PASS@HOST:5432/TEST_DB npm test   # all 96
```

> The PostgreSQL integration test **drops and recreates the schema** of the database at `TEST_DATABASE_URL`. Point it only at a disposable database.

```bash
cd web
npm run typecheck
npm test
npm run build
```

The full manual checklist is in [`docs/TESTING_CHECKLIST.md`](docs/TESTING_CHECKLIST.md).

## 8. Deploy

### Option A: Docker

```bash
cp .env.example server/.env          # then fill it in, with NODE_ENV=production
docker build -t bulkskart-voice-agent .
docker run --rm --env-file server/.env bulkskart-voice-agent node dist/db/migrate.js
docker run -d --name bulkskart --env-file server/.env -p 8080:8080 bulkskart-voice-agent
```

Or with Compose: `docker compose up -d --build`.

Put the container behind HTTPS (for example a load balancer or reverse proxy). The session cookie is marked `Secure` in production, so sign-in only works over HTTPS.

> The Dockerfile was not built in the environment where this was developed, because no Docker daemon was available. The production runtime was verified by running the compiled server with pruned dependencies. Run the build once in your environment before relying on it.

### Option B: Node.js directly

```bash
cd server && npm ci && npm run build && npm prune --omit=dev
cd ../web && npm ci && npm run build && cd ..
cp .env.example server/.env          # fill in, set NODE_ENV=production and WEB_DIST_DIR=/absolute/path/to/web/dist
cd server && npm run migrate && npm start
```

The API serves the built dashboard from `WEB_DIST_DIR` on the same origin, so no CORS configuration is needed.

## 9. API overview

All `/api` routes except `/api/auth/login` and `/api/auth/logout` need a valid session cookie. Responses are JSON. Error bodies contain `error` and never stack traces.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Sign in (rate-limited) |
| GET | `/api/auth/me` | Current admin |
| GET | `/api/overview` | Dashboard counts |
| GET/POST | `/api/suppliers` | List (search, `lead_status`, `limit`) or create (duplicate phone returns the existing record) |
| POST | `/api/suppliers/import` | Bulk import, up to 5,000 rows |
| POST | `/api/suppliers/:id/do-not-call` | Suppress from all campaigns |
| POST | `/api/suppliers/:id/consent` | Record consent |
| PATCH | `/api/suppliers/:id/lead-status` | Move a lead |
| GET/POST | `/api/campaigns` | List or create (draft) |
| POST | `/api/campaigns/:id/enroll` | Add suppliers; duplicates and blocked numbers are reported |
| POST | `/api/campaigns/:id/launch` | Body `{ "confirmation": "LAUNCH <name>" }` |
| POST | `/api/campaigns/:id/pause` / `resume` | Pause; resume needs the confirmation |
| POST | `/api/scheduler/tick` | Run one scheduler pass now |
| GET | `/api/calls`, `/api/calls/:id` | Call history, transcript and summary |
| POST | `/api/calls/simulate` | Run a simulated conversation (mock provider only) |
| GET/PATCH | `/api/follow-ups` | Follow-up tasks |
| GET/POST/PATCH | `/api/knowledge` | Knowledge base entries |
| POST | `/api/knowledge/:id/status` | `approved`, `draft` or `retired` |
| GET/PUT | `/api/settings`, `/api/settings/:section` | Calling rules, languages, usage rates |
| GET | `/api/agent/templates` | Five-language scripts for review |
| GET | `/api/analytics/usage` | Call volume and cost estimate |
| GET | `/api/system/health` | Provider and safety status |
| POST | `/webhooks/telephony/status` | Signed status callbacks |
| POST | `/webhooks/telephony/inbound` | Signed inbound-call routing |

## 10. Security model

- **Database.** RLS is enabled on every table with no policies, and anon and authenticated roles have no privileges. Only the backend connects to the database.
- **Secrets.** Provider keys, `DATABASE_URL` and `SESSION_SECRET` are read from the environment on the server. The dashboard receives none of them.
- **Authorisation.** Every API route checks the session on the server. The dashboard's hiding of controls is a convenience, not a control.
- **Input.** Every request body is validated with zod. Phone numbers are normalised to E.164.
- **Webhooks.** Each request is verified with HMAC-SHA256 over the raw body before it is trusted.
- **Sessions.** HttpOnly, `SameSite=Strict` cookie, `Secure` in production, expires after `SESSION_TTL_HOURS`.
- **Consent and calling.** Do-not-call, consent, cooldown and calling-window rules are checked at dial time, not only at enrolment.

## 11. Design notes and limitations

- The conversation engine speaks only scripted templates and approved knowledge-base answers. It never generates facts. Its replies are deterministic and therefore testable.
- Intent detection uses keyword cues in all five languages, checked in priority order (stop, human, not interested, later, yes, no, question). It is a deterministic baseline. A production deployment should also use the speech model's intent output, with these cues as a guard.
- Language switches happen when the supplier speaks in a native script. Romanised speech keeps the current language.
- Simulated calls use scripted supplier lines and a simulated duration. They do not measure real call quality, latency or speech recognition accuracy.
- The scheduler runs inside the API process. See the scaling items in `docs/PRODUCTION_READINESS.md` before running more than one instance.
