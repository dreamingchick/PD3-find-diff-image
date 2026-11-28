# Private Studio increment

Open `/studio`, or Settings → 콘텐츠 스튜디오 열기, on the authenticated staging project. The generic tool is public source; private images, regions and exported drafts belong only in the private asset repository or local storage. No uploads, paid resources, publication or catalog mutation occur from this editor.

## Authoring flow

1. Start from an existing catalog pair, a saved draft, or two local PNG/WebP files. Images must be opaque square images, 256–2048px and at most 16MB each.
2. Enter the picture ID, title, chapter, difficulty and challenge time. Draw linked rectangles on either picture, then select a region to edit its pixel coordinates, difficulty and change type. Drawing captures touch only while the drawing control is active; normal editor scrolling is retained.
3. Run pixel QA. Easy/normal/hard require exactly 5/6/7 nonoverlapping regions, with positive size inside the image. Every region must contain changed pixels, with zero changed pixels outside the declared regions and no transparency. Shared boundaries are rejected to avoid ambiguous hit regions. Chunked comparison yields to the UI and supports cancellation. The optional overlay shows registered changes in magenta and outside changes in red.
4. Test play reuses the player's canvas, gestures, answer judgment and hint spotlight. Test state is isolated: it cannot persist game records, coins, EXP or hint stock.
5. Export a private `.pd3.json` package after pixel QA passes. This contains both images, SHA-256 digests, metadata, regions and the QA report. It is a private review draft, not a published stage.

## Persistence and trust

Drafts autosave after 600ms of inactivity in the separate `pd3-studio` IndexedDB database. Draft identity is independent of the editable picture ID. Draft and list metadata writes are atomic; deletions require confirmation. The saved-draft selector supports multiple drafts. Game progress remains in `pd3-progress`.

Import accepts only bounded private packages (50MB maximum), PNG/WebP data URLs and supported metadata/geometry. Decoded image dimensions and SHA-256 digests are rechecked. Incoming QA/review flags are discarded. Any edit, image replacement, restoration or import requires fresh pixel QA before export or test play. Failed imports preserve the existing draft.

Change types are add, remove, color, size, move, rotate, shape, detail and count. Unclassified answers and more than two of one type are review warnings; manual semantic confirmation stays disabled while these remain. Pixel-passing drafts can still be exported with semantic review marked pending. Pixel QA does not prove visual coherence or human difficulty.

## Scope remaining

Only the same rectangle on both images is editable in this increment. Unequal per-side boxes and nonrectangular regions are rejected rather than converted silently. Circular sample targets can be initialized as bounded pixel rectangles and must pass QA again.

Server draft storage, administrator roles beyond staging SSO, server approval workflows, runtime publication, polygon/circle editing, image generation and production deployment remain pending. Keep whole-project authentication enabled for staging, including `/studio`, static assets and exported route files. Public release needs separate approval.

## Review requests and private staging bundles

The editor can now generate a **검수 요청 파일** after current pixel QA, complete test play, change classification and manual visual confirmation. It includes a SHA-256 content revision covering normalized metadata/regions and both ordered image names/digests. Downloads are not server submissions; the file must be transferred privately. Editing, restoring or importing clears local review/test evidence. A partial test is insufficient. Downloading a plain draft remains possible before review readiness.

The offline [private review worker](../workers/content-review/README.md) independently decodes and checks each request. It stores immutable content revisions and a single explicit approval/rejection decision per revision. Only approved revisions can produce a private staging bundle, with a final image/pixel/digest recheck and matching provenance. It never modifies the active catalog or deploys a site. Its reviewer labels are trusted local operator declarations, not authenticated identities. Server roles and approval enforcement require a future identity/storage integration.

Seven synthetic Python tests cover the review boundary, including actual concurrent decision writes and changed-content rejection. Two additional core tests cover canonical cross-runtime revisions and readiness; four additional browser cases cover request gating, partial versus complete test play, digest binding and edit/import invalidation. The full suites now have 32 Node tests, 64 browser cases, plus 7 review-worker and 3 image-pipeline Python tests.

## Verification

Eight core tests cover validation, overlap/bounds, normalized judgment, chunked comparison and heatmaps, transparency/outside changes, defensive package parsing and ownership of parsed data. Sixteen browser cases across four viewports cover mouse/touch drawing, import/export, image digest mismatch, QA invalidation, autosave/reload, confirmed deletion and test-play isolation. Existing game and economy cases remain in the full suite. Private image integration is checked independently in PD3-assets.
