# Online Sync Stack and Implementation Plan

## Current State (from this codebase)
- UI: React + TypeScript (`src/`)
- Desktop shell: Tauri 2 (`src-tauri/`)
- Local data: SQLite (`shop.db`) with Rust `sqlx` commands
- Auth: local user table + localStorage session
- Main entities: `users`, `shop_settings`, `customers`, `orders`, `order_items`

This is good for single-device offline use, but not enough for multi-device sync.

## Recommended Stack (best fit for your project)
- Database: PostgreSQL (managed with Supabase)
- Auth: Supabase Auth (JWT)
- Authorization: Row Level Security (RLS) by `shop_id` tenant
- Realtime updates: Supabase Realtime (optional but recommended)
- Server logic: Supabase Edge Functions (TypeScript) for business rules and sync endpoints
- Desktop client: keep current Tauri + local SQLite for offline cache
- Mobile client: React Native (Expo) using same backend and auth

Why this stack:
- Fastest path from local-only to cloud multi-device
- Less backend ops than self-hosting everything
- Works with both desktop and mobile
- Strong security model with RLS

## Core Best Practices (must follow)
1. Server is source of truth. Local SQLite is a cache + offline queue.
2. Use UUIDs for all sync entities (not auto-increment IDs across devices).
3. Add `shop_id` to every sync table for multi-tenant isolation.
4. Add `updated_at`, `deleted_at` (soft delete), and `version` for sync/conflict control.
5. All writes use idempotency keys.
6. Never expose service role keys in client apps.
7. Enforce all access with RLS + JWT claims.
8. Keep `order_id` / `customer_id` as display codes, not primary keys.

## Data Model Changes

### Cloud PostgreSQL tables
- `shops(id uuid pk, name, created_at, ...)`
- `users(id uuid pk, shop_id uuid, role, ...)`
- `customers(id uuid pk, shop_id uuid, customer_code text, ... , version bigint, updated_at timestamptz, deleted_at timestamptz null)`
- `orders(id uuid pk, shop_id uuid, order_code text, customer_id uuid, status, ... , version bigint, updated_at timestamptz, deleted_at timestamptz null)`
- `order_items(id uuid pk, shop_id uuid, order_id uuid, ... , version bigint, updated_at timestamptz, deleted_at timestamptz null)`
- `sync_cursor(shop_id uuid pk, last_seq bigint)`
- `change_log(seq bigint, shop_id uuid, entity text, entity_id uuid, op text, changed_at timestamptz, payload jsonb)`

### Local SQLite additions (desktop and later mobile)
- Add `uuid TEXT` to each entity table (unique)
- Add `shop_id TEXT`
- Add `version INTEGER DEFAULT 0`
- Add `updated_at TEXT`
- Add `deleted_at TEXT NULL`
- Add `sync_state TEXT` (`pending_create|pending_update|pending_delete|synced|failed`)
- Add `last_error TEXT NULL`

### Local outbox table
- `sync_outbox(id TEXT pk, entity_type TEXT, entity_id TEXT, op TEXT, payload_json TEXT, base_version INTEGER, idempotency_key TEXT, created_at TEXT, retry_count INTEGER, next_retry_at TEXT)`

## Sync Protocol Design

### Push (client -> server)
- Endpoint: `POST /sync/push`
- Body: batch of outbox events
- Server validates JWT + `shop_id`, applies transactionally, returns:
  - accepted events
  - rejected events with reason
  - new canonical versions

### Pull (server -> client)
- Endpoint: `GET /sync/pull?cursor=<last_seq>`
- Returns ordered `change_log` events since cursor.
- Client applies events to local DB and advances cursor.

### Conflict handling
- Use optimistic concurrency: each update sends `base_version`.
- Server rule:
  - if `base_version == current_version`: apply and increment version
  - else return conflict with server record
- Client policy:
  - default: server wins + show conflict banner for edited form
  - custom rule for status progression if needed (example: `shipping` cannot move back to `pending` without explicit override)

### Delete handling
- Never hard-delete during sync path.
- Use `deleted_at` tombstones.
- Physical cleanup with scheduled retention job (for example, 30 to 90 days).

## Security Plan
1. Add `shop_id` claim to JWT.
2. RLS policy on every table: `shop_id = auth.jwt()->>'shop_id'`.
3. Split roles: `owner`, `staff`, `viewer`.
4. Audit log for critical actions (delete, restore, export).
5. Rate-limit sync endpoints and use short-lived access tokens + refresh tokens.

## Performance and Reliability
- Batch size: start with 100 events per push/pull.
- Sync trigger: on app start, every 15 to 30 seconds, and after local writes.
- Backoff retries: exponential with jitter (5s, 10s, 20s, 40s...).
- Include a `device_id` to track bad clients.
- Keep sync idempotent so retries are safe.

## Rollout Plan (phased)

### Phase 1: Cloud foundation
- Provision Supabase project.
- Create PostgreSQL schema with UUID keys and audit columns.
- Enable RLS and JWT claims by `shop_id`.
- Set up Auth (email/password first, add phone/OAuth later).

### Phase 2: Backend sync APIs
- Build Edge Functions:
  - `sync_push`
  - `sync_pull`
  - `sync_health`
- Add validation, idempotency table, and conflict responses.
- Add integration tests for push/pull and conflict scenarios.

### Phase 3: Desktop app migration (Tauri)
- Add local migration to include UUID/version/sync columns + `sync_outbox`.
- Wrap existing create/update/delete commands:
  - write local data
  - append outbox event
- Implement background sync worker in Rust:
  - push pending
  - pull remote changes
  - mark sync state

### Phase 4: Mobile client
- Build Expo app with same entities and auth.
- Reuse same sync contracts (`sync_push` / `sync_pull`).
- Start online-only mode first; add offline cache second.

### Phase 5: Cutover and hardening
- Dual-run period: keep local flow and verify server parity.
- Add dashboards: sync latency, conflict rate, failed events, retry depth.
- Add backups + restore runbook for cloud DB.
- Remove legacy local-only auth flow after stable production period.

## Concrete Changes Needed in This Repository
1. Add new migration files in `src-tauri/migrations/` for UUID + sync metadata columns.
2. Add Rust sync module (for example `src-tauri/src/sync/`) and register commands in `src-tauri/src/lib.rs`.
3. Add settings for server URL, project key, and device ID storage.
4. Update frontend data APIs (`src/api/*.ts`) to show sync state and conflict errors.
5. Replace localStorage auth with token-based auth.

## Suggested Timeline
- Week 1: Cloud schema + auth + RLS
- Week 2: Sync APIs + tests
- Week 3: Desktop outbox/inbox sync worker
- Week 4: Mobile MVP + production hardening

## MVP Scope (recommended first release)
- Sync only `customers`, `orders`, `order_items`
- Single shop tenant
- Basic conflict policy (server wins)
- Manual "Sync now" button + background sync
- Read-only mobile dashboard first, then write support

## Risks to watch
- Existing integer IDs conflict across devices if used as global IDs
- Clock differences can break timestamp-only conflict logic (use `version`)
- Missing RLS policies can leak tenant data
- Network flakiness can duplicate writes if idempotency is missing

## Decision Summary
For your current Tauri + local SQLite app, the most pragmatic production path is:
- Supabase (PostgreSQL + Auth + RLS + Realtime) as cloud layer
- Keep local SQLite for offline desktop speed
- Add outbox/inbox sync protocol with versioned conflict handling
- Build mobile client on the same APIs
