# Private staging catalog selection

The catalog tool assembles approved revisions into an ordered, immutable staging release. A selection or rollback controls the **next private build**. The existing deployment remains active until that build passes QA and is explicitly deployed to the protected staging project. Server authentication and reviewer roles are still pending; operator labels and the private filesystem retain the trust model described in README.md.

Use the private review vault and catalog registry outside the player source checkout:

```powershell
python workers/content-review/catalog.py --vault ../PD3-assets/reviews --registry ../PD3-assets/staging-catalog build DIGEST_A DIGEST_B
python workers/content-review/catalog.py --vault ../PD3-assets/reviews --registry ../PD3-assets/staging-catalog status
python workers/content-review/catalog.py --vault ../PD3-assets/reviews --registry ../PD3-assets/staging-catalog activate RELEASE_ID --expected none --actor "Operator name" --note "Reviewed staging selection"
```

Only the first selection uses `--expected none`. Later changes must supply the current `eventId` from status. Picture order contributes to the release ID because it controls sequential unlock. Duplicate picture IDs/revisions, pending/rejected approvals, and modified stage/image/provenance files are rejected.

```powershell
python workers/content-review/catalog.py --vault ../PD3-assets/reviews --registry ../PD3-assets/staging-catalog rollback --expected CURRENT_EVENT_ID --actor "Operator name" --note "Restore previous tested selection"
python workers/content-review/catalog.py --vault ../PD3-assets/reviews --registry ../PD3-assets/staging-catalog export --output ../PD3-assets/build-input/UNIQUE_BUILD_ID
```

Rollback revalidates the previous release and its approvals. Each successful change records the actor, reason, previous selection, timestamp and a new event ID. A returned-to release gets a new event ID, so old commands cannot pass the concurrency check after a rollback. Selection is serialized by a private lock and committed by atomic replacement of `active.json`. An interrupted pointer write retains the old selection; an unreferenced receipt can remain after an interruption. A leftover lock fails closed and requires a trusted operator to confirm no process is using it before removing it. No automatic stale-lock takeover occurs.

The export contains `stages.ts`, image files under `qa/`, and a catalog receipt. Metadata, image bytes, geometry and approval provenance are rechecked against the private vault at build, selection, rollback and export. Existing output directories are never overwritten. Only staging is supported.

PD3-assets integrates this through `qa/prepare_preview.py selected PLAYER`: without a `staging-catalog` directory it builds the existing three-stage private QA baseline; once the directory exists, a valid selected approved catalog is required. Missing/corrupt selection or revoked/changed approval fails the build instead of falling back. The builder copies only verified images/geometry and the selected receipt into the private player snapshot. CI first builds and plays generated synthetic A → B → rollback A, then restores and verifies the actual selected catalog or existing QA baseline. Synthetic approvals never apply to real images.

## Local game progress across content revisions

Stages can supply a 64-character SHA-256 `version`. New approved stages use the exact reviewed content digest; the existing private QA baseline derives versions from its manifest and verified image hashes without claiming new review approval.

Normal sessions retain `contentVersion` in IndexedDB and v2 backups. Resume requires an exact match, including transitions to or from unversioned legacy content. If the revision changes, reused answer IDs, elapsed time and used hints from the old attempt are discarded. The play screen explains the fresh start. The lobby offers Continue only for a matching revision.

Historical records, stars, unlocks and the wallet remain keyed by stable picture ID; a revision does not earn another first-clear grant. Legacy unversioned sessions continue against unversioned stages. Older clients/backups that omit the optional version fail closed for versioned stages rather than restoring stale answer positions. Database and backup versions remain compatible. This is local practice progress and does not authorize ranked records.

Seven catalog tests exercise approval gates, deterministic ordering, exact rollback/export, real concurrent selection, stale tokens, byte/provenance tampering, interrupted pointer writes and private/staging output boundaries. Player tests cover same-version restoration and changed-version reset with retained rewards.
