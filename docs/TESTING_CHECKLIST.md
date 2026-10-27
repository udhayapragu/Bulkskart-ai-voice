# Testing checklist

Work through this list in order. Each stage can be verified before the next one starts.

## A. Automated tests (run before every push)

| Check | Command | Expected |
| --- | --- | --- |
| Server types | `cd server && npm run typecheck` | No output, exit 0 |
| Server unit and API tests | `cd server && npm test` | 92 passed, 4 skipped (the skipped tests need a database) |
| Server with PostgreSQL | `TEST_DATABASE_URL=postgres://… npm test` | 96 passed. **Wipes the database at that URL. Use a disposable test database only.** |
| Dashboard types | `cd web && npm run typecheck` | No output, exit 0 |
| Dashboard tests | `cd web && npm test` | 5 passed |
| Dashboard build | `cd web && npm run build` | Writes `web/dist` |
| Server build | `cd server && npm run build` | Writes `server/dist` |

## B. Safety rules (must all pass before any live campaign)

- [ ] A campaign cannot launch unless the confirmation text matches exactly (`LAUNCH <campaign name>`).
- [ ] A live campaign cannot launch while `LIVE_CALLING_ENABLED=false`.
- [ ] A live campaign cannot be created while the telephony provider is `mock`.
- [ ] A supplier on do-not-call is never dialled, including after a contact was enrolled before the flag was set.
- [ ] A supplier without granted consent is blocked when "Only call suppliers with granted consent" is on.
- [ ] Nothing dials outside the campaign's calling window (IST by default). The dashboard shows "outside calling window".
- [ ] The same supplier is not enrolled twice in one campaign (the response reports "Already enrolled").
- [ ] The same phone number in different formats (`+91 98765…`, `098765…`) creates one supplier.
- [ ] A supplier called within the cooldown period (default 24 hours) is skipped.
- [ ] A failed attempt is retried after the configured delay and marked exhausted after `max_attempts`.
- [ ] A webhook without a valid HMAC signature is rejected with 401.
- [ ] A replayed terminal status callback does not reopen a finished call.

## C. Conversation behaviour (simulator, every language)

Run each scenario from **Voice agent → Run a simulated call**. Check the transcript on **Call history**.

- [ ] `interested-en`: identifies as Bulkskart's AI assistant, asks about a convenient time, explains the platform, asks for products, offers the website link. Outcome **Interested**.
- [ ] `callback-hi`: a busy supplier is offered a callback. Outcome **Callback Requested** with the stated time recorded.
- [ ] `stop-ta`: asking not to be called ends the call. Do-not-call is set and the supplier is suppressed from campaigns.
- [ ] `human-te`: a request for a person hands off. A "Human handoff" follow-up appears under **Lead statuses**.
- [ ] `not-interested-ml`: outcome **Not Interested**, with no further sales questions.
- [ ] A question with no approved answer gets "I do not have confirmed information…" and appears as an unanswered question in the summary.
- [ ] A draft knowledge-base entry is never spoken, even when its keywords match.
- [ ] The agent never states a fee, approval, customer count or guarantee that is not an approved knowledge-base entry.

## D. Native-speaker review (required before live use)

- [ ] Hindi script reviewed and approved by a native speaker.
- [ ] Tamil script reviewed and approved by a native speaker.
- [ ] Telugu script reviewed and approved by a native speaker.
- [ ] Malayalam script reviewed and approved by a native speaker.
- [ ] Each script reads naturally when spoken aloud (text-to-speech check).

## E. Dashboard (manual, desktop and phone width)

- [ ] Sign-in works. A wrong password shows an error. Ten failures lock sign-in for 15 minutes.
- [ ] Every page loads: Overview, Supplier contacts, Lead statuses, AI campaigns, Call history, Voice agent, Languages, Knowledge base, Usage & cost, Integrations & health.
- [ ] Every mock call is labelled **Simulated**, and no page shows a simulated call as a dial.
- [ ] No horizontal scrolling at 390 px width (phone). The sidebar becomes a top bar.
- [ ] "Sign out" ends the session. Going back to a protected page redirects to sign-in.

## F. Database and security

- [ ] `npm run migrate` applies `001_init.sql` once. Running it again reports "already up to date".
- [ ] Every table has Row Level Security enabled (`select tablename, rowsecurity from pg_tables where schemaname='public';`).
- [ ] With the Supabase **anon** key, a REST request to `/rest/v1/suppliers` returns no rows.
- [ ] The service-role key and `DATABASE_URL` do not appear in any file under `web/` or in the built `web/dist`. Check with `grep -r "DATABASE_URL\|SERVICE_ROLE" web/dist` (no output expected).
