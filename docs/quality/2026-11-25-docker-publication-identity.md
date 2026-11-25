# Docker publication identity correction

Date: 2026-11-25. Base: `7e9af56b2` on `v1.0.23`.

## Observed failure and correction

Docker 29.1.3 reported the Edge `1.0.23` image ID as the OCI index digest
`sha256:9de19c31f192d34d3dca2f2c55eed868e3b138e90b02b06df87e5f6241d61b95`.
The public registry held that exact index, whose runtime config digest was
`sha256:1394066aa1e0e4ec8ac40e12ffaeeaaeed31465ab4364893560985772aa211f2`.
Comparing these different addresses incorrectly rejected the first successful
upload during its confirmation read. The publisher had performed one push.
The earlier [publication report](2026-11-25-publication-phases.md) records
synthetic Docker writes; it did not establish this real transition.

The reader now validates the same bounded manifest graph before matching the
recorded Docker ID against its index, runtime manifest or config address.
Index-pinned receipts still refuse a changed index even with an identical config;
matching an index digest cannot bypass child/config validation. Ambiguous indexes,
missing children and malformed runtime manifests remain refusals. The receipt
format and image inspection remain unchanged. The existing build can resume
without rebuilding or rewriting its receipt.

## Validation

- Frozen dependency installation and initial `bun run check`: all ten gates passed.
- Publication and workspace regression tests passed, including all three Docker
  store identity kinds, changed-index refusal, malformed graph refusal and retry.
- A real Docker build with provenance, actual push to a disposable loopback
  Distribution Registry 3.0.0 and verified retry passed. A changed receipt refused
  without another push. The registry image is pinned by digest. The same scenario
  is now a required `bun run verify` stage.
- Read-only Docker Hub checks accepted the existing Edge receipt; Provider was
  absent at the time of that probe. The original archive, catalogue, image labels
  and IDs also passed the receipt preflight without modifying the build.
- Full `bun run verify` completed successfully: 4,751 general tests passed,
  165 gated skips, zero failures. The required real Docker publication stage,
  browser and Mongo journeys, historical crash upgrade (250 assertions),
  account/Forms workflows (165/173 assertions), shared-hosting browser restart
  (2,457 assertions) and fresh/restart TLS (18/19 assertions) passed.
- Final `bun run check`: all ten gates passed.

The native transport redirects metadata reads and upload commands to the local
registry and supplies a test pull token. It exercises actual Docker image-store
identity, Registry upload and post-write reconciliation, not Docker Hub credentials
or npm publication. No Docker Hub push, npm publication or server upgrade was run.
The main checkout's existing archive and receipt were left untouched.

## Cost and shape

The fix adds constant-time address comparisons after the existing bounded graph
reads. It adds no network request, persistent state, reader backfill or runtime
request-path change. The new required native test needs Docker and the pinned
public registry image. The verification stage list remains cohesive at 158 lines;
its file-size INFO was reviewed without an artificial split.
