# Development progress
DEV-001–006: baseline and Canvas integration CI passed; real device interaction not verified.
DEV-011: scoring, stars, stage catalog and IndexedDB integration committed; CI 45984593401 success. Previous intermediate commit f223888 failed because caller omitted source/answers; fixed in 430a9c5.
DEV-007–010: local 3-pair draft composite, 18 candidate regions, lossless WebP/Base64 export; 0 changed pixels outside boxes. Semantic review and asset transfer remain blocked. Strict QA validator and synthetic tests added. No competition data published.
DEV-012: no production deployment or paid resources; staging pending.

DEV-013 (2026-11-27): verified private run 46008613254 and transport commit daa6daed457ee062b7fe72d60bc512acf17a8c93. All six reconstructed images match source bytes and hashes. Protected staging three-stage baseline READY (deployment dpl_65YVphHhD5DHo447b1RH8Bpy64jx); authenticated HTML 200 and unauthenticated page/image redirect to Vercel SSO. Image semantics remain draft.
DEV-014: local chapter labels, sequential stage unlock, configurable prior-star requirements, max stars across modes counted once, versioned JSON backup/restore, strict input validation and stale session answer filtering. Keyboard aiming (arrows/Shift-arrows/Enter), focus indicators, and image-load redraw fix. Strict TypeScript and locked dependencies committed.
Validation: 16 engine/progress tests, 3 Python image QA tests, strict Next build, 4 desktop/mobile browser journeys passed. CI now uses npm ci and repeats browser journeys. Browser checks cover sample completion, star totals, keyboard input, IndexedDB reload, backup download/restore, rejected corrupt import and viewport overflow.
Remaining: coin/EXP growth and collection rewards, Studio, daily/server ranking, 30 approved stages, full accessibility/localization, integration/security/performance review and v1.0 approval. No claim of v0.2/v1.0 completion. Local imported progress must never authorize ranked records.

DEV-015: mobile portrait puzzle frames now fill the available content width with the existing 16px page gutters. Removed the 35vh width cap, retaining square images and the desktop two-column layout. Existing desktop/mobile browser journeys now also check square proportions, near-full mobile width and desktop side-by-side placement.

DEV-016: found-answer rings use a 5 CSS-pixel fluorescent lime stroke (#d9ff00) over an 8 CSS-pixel dark outline (#16302a). Width is independent of device pixel ratio and zoom, so high-density mobile screens retain a clear marker. Hint styling and answer hit regions are unchanged.
