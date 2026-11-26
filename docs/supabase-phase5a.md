# Phase 5A — Supabase database foundation

Runtime data now loads from Supabase via server actions + service role (RLS remains deny-all for the anon key). The mock `localStorage` seed is cleared on first client load and is no longer the live source of truth.

## Environment variables

| Variable | Client? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon key — **unsafe for data** until Auth + allow policies (Phase 5E). RLS denies all business rows in 5A. |
| `SUPABASE_SERVICE_ROLE_KEY` | **no** | Server-only. Never commit. Never `NEXT_PUBLIC_*`. |
| `DATA_BACKEND` | optional | Prefer `supabase`. Legacy `mock` is unused by the live UI path. |

Use separate Supabase projects for local / preview / production. Do not apply unreviewed migrations to production.

See [`.env.example`](../.env.example).

## Tables

- `companies`, `customers` (`company_id` nullable), `sites`
- `profiles` (roles `manager` | `team_leader`), `technicians` (catalog only)
- `systems` (TS `Domain`), `components`, `checkbox_definitions`
- `work_diaries`, `work_diary_workers`, `work_diary_items`, `work_diary_checkbox_selections`
- View `work_diaries_for_leader` — omits `work_order_number`, `company_id`, `customer_id`

No `sub_sites` table. Free-text `work_diaries.sub_site_name` only.

## Dual-role identity (e.g. Yaniv Tal)

Excel may list the same person as both manager and team leader.

Schema rules:

- One row in `profiles` **per application role**.
- Shared `person_id` links those rows as the same human.
- `identity_number` is globally unique when present (typically on the team-leader row only).
- `email` is globally unique when present (typically on the manager row).
- `auth_user_id` is unique per `(auth_user_id, role)` so one Supabase Auth user can own both role profiles later.
- Do **not** invent a fake identity number for managers.
- Do **not** invent `company_id` when Excel has no association (`NULL` = unresolved).

Phase 5B import must create two profiles with the same `person_id` for Yaniv. Phase 5E maps both to one `auth.users` id.

## Company ↔ customer

Customers are **independent** of companies. `customers.company_id` remains nullable for legacy rows, but the app always writes `NULL` and does not filter customers by company. Any company may be paired with any customer on a work diary.

## Signature amendment (preferred)

Submitted diaries stay `status = submitted`.

RPC `update_work_diary_signature(diary_id, name, data_url)` updates **only**:

- `site_manager_name`
- `site_manager_signature_data_url`

Triggers reject any other column change and reject child-table mutations while not pending.

Clients cannot set `signature_capture_only`, `status`, or timestamps via ordinary UPDATE.

## Workflow RPCs

| Function | Behavior |
|---|---|
| `submit_work_diary` | pending → submitted; sets `submitted_at`; clears signature flag |
| `update_work_diary_signature` | signature fields only on submitted diaries |
| `cancel_work_diary` | sets `cancelled` + `cancelled_at` |

All are `SECURITY DEFINER` with `search_path = pg_catalog, public`, `REVOKE` from `PUBLIC`, `EXECUTE` granted to `service_role` only in Phase 5A.

## RLS / privileges (5A)

- RLS enabled on all business tables.
- Restrictive deny policies for `anon` and `authenticated`.
- Table privileges revoked from `PUBLIC`, `anon`, `authenticated`.
- `service_role` retains access for trusted server code and tests.
- Development role switcher must never be treated as database authorization.

## How to apply (no Docker)

1. Open your **development** Supabase project (not production).
2. Go to **SQL Editor**.
3. Paste the full contents of [`supabase/migrations/20261124090000_phase5a_foundation.sql`](../supabase/migrations/20261124090000_phase5a_foundation.sql).
4. Run once.
5. Optional: paste and run [`supabase/tests/phase5a_guards.sql`](../supabase/tests/phase5a_guards.sql) in the same project to verify guards (it rolls back).

Do not apply unreviewed SQL to production.

## App verification (always)

```bash
npm run typecheck
npm run lint
npm run build
```

The UI remains on the mock repository until Phase 5C/5D.

## Local auth (manager OTP + team-leader ID)

1. In Supabase Auth → URL configuration, set Site URL to `http://localhost:3000`.
2. Auth cookies use a long `maxAge` (~400 days). Session survives minimize/close/PWA relaunch; only the in-app **התנתק** button signs out.
3. In Supabase Auth settings, keep refresh tokens enabled (default). Optionally raise JWT expiry; refresh cookies keep the user signed in either way.
4. Paste [`supabase/migrations/20261124093000_auth_profile_select.sql`](../supabase/migrations/20261124093000_auth_profile_select.sql) (optional; app uses service role for profile reads).
5. `.env.local`: URL, publishable/anon key, service/secret key, `NEXT_PUBLIC_DEV_ROLE_SWITCHER=false`, plus `GMAIL_*` for manager OTP mail.
6. `npm run dev` → login screen.

Team leaders authenticate by identity number (server creates a session; no email needed).
Managers receive a 6-digit email OTP via Gmail SMTP from the Next.js server.

## Unresolved before Phase 5B

- Excel workbook path is outside the repo; keep under gitignored `/import/`.
- No company↔customer or company↔leader links in Excel.
- Near-duplicate checkbox labels (`עבודה בגובה` / `עבודה בגובים`) — import both.
- Possible technician phone length anomaly — import as text, flag in report.
- Preserve Excel typos in component units (e.g. `קופמלט`).
- Real PII must not land in committed seed SQL.
