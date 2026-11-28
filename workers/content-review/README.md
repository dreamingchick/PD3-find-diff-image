# Private review gate

An offline tool for a trusted operator on the private asset workstation. Install the existing `workers/image-pipeline/requirements.txt` dependencies. No account, network, hosting or paid resource is created.

Studio's **검수 요청 파일 만들기** requires classified changes (at most two of each type), current pixel QA, a complete test play and manual visual confirmation. The downloaded request is still private and is not automatically submitted or approved.

Use explicit private paths outside the player source checkout:

```powershell
python workers/content-review/review.py --vault ../PD3-assets/reviews submit ../PD3-assets/incoming/example.review.json
# The returned 64-character digest identifies the exact content revision.
python workers/content-review/review.py --vault ../PD3-assets/reviews decide DIGEST --decision approved --reviewer "Reviewer name" --note "Review outcome"
# Use rejected for a failed visual review; decisions cannot be overwritten.
python workers/content-review/review.py --vault ../PD3-assets/reviews stage DIGEST --output ../PD3-assets/approved/DIGEST
```

Reviewers must inspect the images/regions and play the imported draft before making a real decision. Do not use synthetic-test approvals for real content. The reviewer name is an audit label entered by the trusted local operator; it is not a verified account or an authorization role. The private vault and local filesystem are the trust boundary. Server authentication and enforceable reviewer roles remain pending.

Submission rechecks metadata, shared rectangular geometry, answer/type counts, image size/format/transparency, SHA-256 digests and exact changed-pixel coverage from the actual image bytes. Browser QA flags are ignored. The content digest covers the normalized draft and both ordered image names/digests. Requests without a matching digest and completed local author checks are rejected. This proves consistency of the request, not that a human performed the claimed checks.

Requests are stored under their content digest. Resubmission is idempotent and retains any decision. Decisions include the digest, reviewer label, note and timestamp; complete decision files are installed atomically without replacement. Editing content requires a new digest and a fresh decision. Staging export validates the stored bytes and approval again and refuses existing output directories. Keep requests, decisions and exports in PD3-assets or another private location; the tool rejects outputs within its player source checkout.

The output contains versioned images, `stage.json` with normalized player geometry, and `provenance.json`. It is an **approved private staging bundle**, not an active deployment or runtime catalog update. Only target `staging` is supported. Production export, automatic publication, server roles, durable server storage and ranking trust are outside this increment.

For ordered release assembly, selection, rollback and private player build inputs, see [CATALOG.md](CATALOG.md). The separate catalog tool consumes these approved revisions and rechecks their bytes/provenance throughout that flow.

Validation:

```powershell
python -m unittest discover -s workers/content-review -p 'test_*.py'
```

Tests use only generated synthetic images in temporary directories. They cover pending/rejected export blocks, digest and image tampering, invalid geometry/types, output limits, idempotency, concurrent decisions and parity with the browser's canonical digest.
