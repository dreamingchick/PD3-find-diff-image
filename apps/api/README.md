# API
Planned authoritative session validation and leaderboard. Production answers must remain private. Prototype sample is excluded from competition.
# Administrator backend increment

The private web review inbox uses Supabase Auth, PostgreSQL RLS/RPCs and private Storage; the migration and operating contract live in `supabase/`. The frontend remains statically deployable. `scripts/validate-inbox.mjs` connects the independent Python pixel validator to a trusted server queue.

This implements authorization contracts and adapters, with hosted provisioning/account bootstrap still required. It does not implement ranked gameplay APIs or automatically deploy approved web decisions. See [backend setup](../../supabase/README.md).
