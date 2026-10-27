# Production readiness checklist

Status as of this build. **Live calling is not ready.** Only the simulator and the dashboard
have been verified. Items marked **BLOCKER** must be complete before `LIVE_CALLING_ENABLED=true`.

## 1. Verified in this build

- [x] Supabase-compatible PostgreSQL schema with RLS enabled on all ten tables and anon/authenticated access revoked. Verified on PostgreSQL 16.
- [x] Backend uses only parameterised SQL. Identifiers are restricted to a fixed table list.
- [x] Admin sign-in: scrypt password hash, HMAC-signed HttpOnly `SameSite=Strict` session cookie, login lockout after 10 failures in 15 minutes.
- [x] Every mutating action writes to `audit_logs`.
- [x] Telephony webhooks: HMAC-SHA256 over the raw body, constant-time comparison, fail closed without a secret.
- [x] Live calling kill switch (`LIVE_CALLING_ENABLED`), exact-text launch confirmation, pause/resume.
- [x] Do-not-call, consent, duplicate-contact, cooldown, calling-window and retry rules, re-checked at dial time.
- [x] Knowledge base: only approved entries are spoken; new and edited entries are drafts until approved.
- [x] Production configuration validation: refuses memory storage and the mock voice provider.
- [x] Error responses never include stack traces or SQL details.

## 2. BLOCKERS for live calling

- [ ] **BLOCKER – Sarvam AI voice adapter.** `server/src/providers/voice/sarvam.ts` is a fail-closed stub. Implement the speech-to-text and text-to-speech calls against Sarvam's official API docs, test with a real key, then set `liveReady` to true.
- [ ] **BLOCKER – Exotel telephony adapter.** `server/src/providers/telephony/exotel.ts` does not place calls and does not parse status events. Implement dialing, status-callback mapping and webhook authentication against Exotel's official API docs, and test with real credentials.
- [ ] **BLOCKER – Live media bridge.** Audio must flow between the telephone call and `handleSupplierAudio` (speech-to-text, the engine, text-to-speech). This is not built. The engine entry point is ready for it.
- [ ] **BLOCKER – Native-speaker review** of the Hindi, Tamil, Telugu and Malayalam scripts (see TESTING_CHECKLIST.md, section D).
- [ ] **BLOCKER – Approved knowledge base.** Bulkskart must approve each answer: fees, registration steps, financing, customer counts. Until then the agent says it does not know. Seeded fee entries are drafts.
- [ ] **BLOCKER – Compliance sign-off.** Confirm with counsel the consent basis for B2B outreach, the DND/NCPR scrubbing requirement for telemarketing in India, the calling-hours rules, the recording-consent rules, and the data-retention period. The app stores consent records and a recording flag, but has no recording pipeline.
- [ ] **BLOCKER – Messaging integration** for sending the website link (WhatsApp or SMS). Link requests are currently queued as follow-up tasks and are never reported as sent.

## 3. Required before scaling beyond one instance

- [ ] **Scheduler concurrency.** The scheduler reads due contacts and dials in application code. Two API instances would dial the same contact twice. Before running more than one instance, claim contacts in one transaction with `SELECT … FOR UPDATE SKIP LOCKED`, or run the scheduler as a single worker.
- [ ] **Transactions.** Dialing currently writes the call, the contact and the provider result as separate statements. Wrap each step in a transaction, or make the provider call idempotent using the call id.
- [ ] **Pagination.** Overview, usage and the supplier list read whole tables into memory. Add pagination and database-side aggregates before the tables grow beyond a few thousand rows.
- [ ] **Rate limiting** on all API routes and on webhooks, not only on login.
- [ ] **Admin accounts.** The app has one admin defined by environment variables. Add named users with roles, MFA, or Supabase Auth / SSO.
- [ ] **Content-Security-Policy** for the dashboard, and a security-header review (for example with a Helmet-equivalent middleware).

## 4. Operations

- [ ] Docker image built and run in CI. (The Dockerfile was not built in the environment this was developed in, because no Docker daemon was available. The production runtime was checked by running `dist/` with a pruned `node_modules`.)
- [ ] CI runs `npm run typecheck`, `npm test` and the PostgreSQL integration tests on every push.
- [ ] Structured logging (JSON), request ids, error tracking, and alerts for webhook signature failures and for failed dials.
- [ ] Backups and point-in-time recovery enabled on the Supabase project. Restore tested.
- [ ] Retention policy for `audit_logs`, call transcripts and recordings.
- [ ] Secrets stored in the hosting platform's secret manager, rotated on a schedule. Never committed. Never in the frontend.
- [ ] Runbook: how to pause all campaigns (`POST /api/campaigns/:id/pause`), how to set `LIVE_CALLING_ENABLED=false`, and how to handle a complaint from a supplier.
- [ ] Load test of the scheduler and webhook endpoints at expected peak volume.

## 5. Go-live sequence

1. Complete every BLOCKER above.
2. Run the full TESTING_CHECKLIST.md.
3. Launch a simulated campaign and review its transcripts with the sales team.
4. Launch a live campaign to a small internal test list of numbers owned by Bulkskart staff, with consent recorded for each.
5. Review the first 50 live call outcomes and transcripts. Fix any unacceptable replies.
6. Expand in stages, watching complaints, opt-outs and call quality.
