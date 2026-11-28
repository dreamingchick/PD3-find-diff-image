# Studio

The initial private authoring tool runs at `/studio` inside `apps/player`, sharing the canvas interaction implementation. This directory remains reserved for a future separately deployed administrator application.

Implemented: local image-pair loading, linked rectangular answer editing, pixel QA, isolated test play, IndexedDB drafts and private JSON export/import. See [STUDIO.md](../../docs/STUDIO.md) for boundaries and validation.

Protected staging requires Vercel Authentication for every path and asset. Separate administrator roles, server storage, approval and publication are pending; this client route is not an authorization boundary by itself.
