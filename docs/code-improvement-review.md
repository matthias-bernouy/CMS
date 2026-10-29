# CmsCore code improvement review

Review date: 2026-10-29. Base commit: `2bd0d3ae71e01cd303a7abd0cf247dfda28dbf1c`.
Evidence comes from the current working tree, including changes already present when this review started.

## 1. Actual scope and limitations

This is a static, read-only review with one documentation output. No application code, tests, configuration, dependencies or external data were changed. Existing local changes were preserved.

The initial survey covered all 23 package manifests across Foundation, Features, Surfaces and Runtimes, the root instructions, package map, root scripts and quality-check entrypoint. Deeper inspection covered:

| Area | Sources and callers actually examined |
| --- | --- |
| File lifecycle | `cms-files` service, namespace authority, upload manager, catalogue, access/signing, stream measurement, memory/Mongo stores and existing lifecycle tests. |
| File integration | Ulvia Provider file capability adapters and tests, official Files command declarations, `CmsFileWorkspace`, Provider store composition and instance lifecycle/recovery wiring. |
| Images and storage | Real derivative scheduler, Sharp adapter, blob contracts, local/S3 storage adapters and detached file streams. |
| Content delivery | Content reader/revision assembly, normal and fallback Page rendering, runtime cache composition, cache helpers and fallback/access tests. |
| Gateway networking | Node transport request/response handling, DNS/address selection, authorization-header construction, HTTP response bounds and abort handling. |
| Authentication | Local credential/session/PAT resolution, OAuth consent/exchange/refresh/list/revoke implementation, memory/Mongo OAuth stores, Mongo one-time-token reservations and OAuth test sources. |
| Collection upgrades | Upgrade service, process-local permits, usage inventory, shared execution/recovery flow and write-fence wrapper. |

Applicable package `AGENTS.md` files were read for the inspected packages that provide them. Findings below are deliberately concentrated where the evidence is strongest; this is not an exhaustive audit of every source file or a full security assessment.

**Evidence terminology:** “confirmed by inspection” means the cited control flow permits the described result under the stated inputs/interleaving. It does not mean the scenario was executed. Operational frequency, deployed exposure and latency/memory impact have not been measured. Priorities are P1 (address first: authorization/data integrity) and P2 (important reliability/capacity/correctness). Effort is relative implementation and verification effort, not a time commitment.

No tests, build, formatter, dependency installation, database operations, network requests or benchmarks were run. In particular, the current [check-all entrypoint](../quality/ci/check-all/index.ts), lines 50–63, persists reports under `artifacts/check-all`; root `verify` also builds/generates artifacts. Those commands would violate this review's single-file constraint. Test names below describe existing coverage inspected or future verification, never a passing result from this review.

No restructuring is justified by the inspected package manifests: their declared workspace dependencies follow the documented layer direction. This does not prove every source import or public export is correct. The sampled OAuth flow already uses revision checks for single-use exchange/rotation and live administrator checks, with focused tests in [authorization.test.ts](../packages/features/cms-auth/tests/oauth/authorization.test.ts) and [refresh.test.ts](../packages/features/cms-auth/tests/oauth/refresh.test.ts). The sampled collection upgrade flow already checks reviewed plans, permits, state digests and maintenance ownership. Preserve these mechanisms; this review establishes no actionable defect requiring their replacement.

## 2. Priority summary

| ID | Priority / confidence | Improvement | Status | Effort |
| --- | --- | --- | --- | --- |
| R1 | P1 / High | Authorize the target file's namespace before deletion | Confirmed by inspection | Low |
| R2 | P1 / High | Make interrupted upload publication recover without deleting live bytes | Confirmed failure-recovery defect | Medium–High |
| R3 | P1 / High | Patch derivative metadata without restoring stale file state | Confirmed race under the stated interleaving | Medium |
| R4 | P2 / High | Give shared derivative blobs a safe deletion lifecycle | Confirmed collision/deletion defect | Medium |
| R5 | P2 / High | Cancel and settle upload measurement when storage fails early | Confirmed hang path with a non-consuming failed writer | Low–Medium |
| R6 | P2 / High | Include Page and rendering revisions in fallback cache identity | Confirmed stale-cache defect | Low–Medium |
| R7 | P2 / High | Replace quota enumeration with atomic, recoverable accounting | Confirmed scan cost and concurrent-check gap | High |
| R8 | P2 / High | Wire expired-upload cleanup into the runtime lifecycle | Confirmed missing in-repository wiring | Medium |

All eight warrant behavioral fixes and focused tests. No speculative stylistic refactor is included.

## 3. Detailed findings

### R1 — File deletion does not verify ownership of the target generations

**Priority:** P1. **Confidence:** High; confirmed by inspection. **Effort:** Low.

**Evidence and callers.** [FileCatalog.delete](../packages/features/cms-files/src/core/FileCatalog.ts), lines 141–150, verifies that the key belongs to the supplied `namespaceId`, then loads generations by `fileId` alone. It never compares their `namespaceId` with the authorized namespace. [FileAccess.deleteRecord](../packages/features/cms-files/src/core/FileAccess.ts), lines 135–138, deletes metadata and bytes without another authorization check. Both stores implement generation lookup without a namespace filter. The [Provider adapter](../packages/surfaces/ulvia-provider/src/capabilities/files.ts), lines 155–163, forwards the three caller arguments; the [workspace adapter](../packages/runtimes/ulvia-provider-server/src/runtime/stores/CmsFileWorkspace.ts) supplies its own namespace credentials but accepts a caller-selected file ID.

**Scenario and consequence.** Create namespaces A and B in one instance, publish a file in B, then call `deleteFile(A.id, A.key, B.fileId)`. Every explicit guard accepts this request and B's generations are deleted. The authored official [Files delete declaration](../packages/official-repository/contracts/ulvia.cms.files/capabilities/commands/delete-file.json) requires `access: "admin"`; this is a namespace authority violation for an otherwise admitted caller, not evidence of unauthenticated or cross-instance access. Actual HTTP exposure depends on the runtime's admitted release and authentication.

**Minimal change.** Reject missing or foreign generations before any mutation, comparing every returned record with the authorized namespace. Prefer a namespace-scoped store lookup where practical, while preserving the service check for injected adapters. Keep the existing safe `NOT_FOUND` outcome.

**Regression risks and required verification.** Extend [management.test.ts](../packages/features/cms-files/tests/management.test.ts), whose existing management test deletes only an owned file, and [FileCapabilities.test.ts](../packages/surfaces/ulvia-provider/tests/capabilities/FileCapabilities.test.ts). Cover wrong namespace, invalid/revoked/read-only keys, missing IDs, and successful owned deletion. Snapshot metadata and original/variant bytes before refusal and prove no changes. Repeat across memory/Mongo adapters and use separate instance compositions to confirm an ID from another instance remains inaccessible. No additional successful-path read is needed if ownership is checked on the already loaded generations.

### R2 — Retrying an interrupted completion can delete its published original

**Priority:** P1. **Confidence:** High; confirmed failure-recovery defect. **Effort:** Medium–High.

**Evidence and callers.** [UploadManager.complete](../packages/features/cms-files/src/core/UploadManager.ts), lines 117–149, reserves a file ID, persists the File record, then separately marks the upload completed. Its existing-generation branch at lines 123–127 always deletes `upload.blobKey`. The File record uses that same key at line 137. The [Mongo store](../packages/features/cms-files/src/default-implementation/MongoCmsFilesStore.ts), lines 55–56, 75–76 and 131–134, performs independent unconditional replacements; the store contract has no publication claim/CAS. `CmsFilesService.completeUpload`, the Provider `upload.complete` adapter and the workspace completion path all reach this logic.

**Scenario and consequence.** Let `putFile` succeed and the following `putUpload(completed)` fail before changing the upload. On retry, the reserved file ID and hash resolve the File just published. The existing-generation branch deletes its live original, then returns that File's reference. Metadata advertises a published generation whose bytes are gone. This differs from a new upload of identical content, whose temporary key can legitimately be discarded. Concurrent completion also lacks exclusive ownership: two calls reading an unreserved upload can choose different file IDs pointing at one blob.

**Minimal change.** First prevent deletion when the existing File references the upload's blob. Then introduce a durable conditional publication claim with one reserved identity and a recoverable outcome, implemented consistently in memory and Mongo. Coordinate completion and cleanup through that ownership. The official [completion declaration](../packages/official-repository/contracts/ulvia.cms.files/capabilities/commands/complete-upload.json) declares idempotency `none`; the issue is unsafe partial-write recovery, not a claim that every repeated completed request must succeed. No contract release rewrite is needed for the basic integrity fix.

**Regression risks and required verification.** Extend the replacement scenario in [management.test.ts](../packages/features/cms-files/tests/management.test.ts). Inject failures before and after each publication write; retry and read the original bytes, not just the returned reference. Use barriers for two completions and completion versus expiry cleanup. Check one identity, stable generation ordering, intact older generations, and safe identical-content deduplication with a different temporary key. Mongo tests must include an acknowledged/uncertain write outcome. Existing tests cover sequential replacement, not these schedules.

### R3 — Derivative completion can undo privacy changes or resurrect a deleted file

**Priority:** P1. **Confidence:** High; confirmed race under the stated interleaving. **Effort:** Medium.

**Evidence and callers.** [CmsImageDerivatives.enqueue/process](../packages/features/cms-files/src/imageDerivatives.ts), lines 26–32 and 44–92, retains the upload-time File snapshot, performs asynchronous I/O/transforms, then writes `{ ...file, width, height, variants, updatedAt }`. [MongoCmsFilesStore.putFile/#put](../packages/features/cms-files/src/default-implementation/MongoCmsFilesStore.ts), lines 75–76 and 131–134, replaces the entire document with `upsert: true`; the memory adapter also replaces the complete record. [Provider store composition](../packages/runtimes/ulvia-provider-server/src/runtime/stores/providerStores.ts), lines 135–146, uses this real scheduler. Meanwhile `FileCatalog.update`, `setVisibility` and `delete` mutate the same generations.

**Scenario and consequence.** Start derivative processing for a public image, pause the transformer, make the file private, then let processing finish. The final write restores the captured public visibility. A rename is similarly lost. If deletion occurs after the source is read, the final upsert recreates deleted metadata and can expose newly generated variants. This concerns subsequent server authorization, independently of bytes already cached while the file was public.

**Minimal change.** Add a conditional, non-upserting derivative-metadata update for an existing `(namespaceId, fileId, generation)` that modifies only derivative fields. Preserve current name/visibility and never recreate deleted records. Handle deletion/job ownership and newly written orphan variants explicitly; a reread followed by full replacement still races.

**Regression risks and required verification.** Test the actual scheduler with a barrier-controlled transformer: rename, public-to-private, private-to-public, file deletion and namespace deletion while work is pending. Assert authoritative metadata and anonymous/private read outcomes, plus cleanup of unreferenced variants. [providerContract.test.ts](../packages/features/cms-files/tests/providerContract.test.ts), lines 128–138 and 240–250, injects `addTestVariant` rather than `CmsImageDerivatives`, so its variant assertions do not cover this behavior. Also validate background-job shutdown before closing its store; per-file decoder limits do not establish a worker-concurrency bound.

### R4 — Deleting one image removes derivative bytes still referenced by another

**Priority:** P2. **Confidence:** High; confirmed by inspection. **Effort:** Medium.

**Evidence and callers.** [CmsImageDerivatives.process](../packages/features/cms-files/src/imageDerivatives.ts), lines 68–83, keys variants by content hash, encoder identity and width, with no file or namespace identity. Identical images using the same profile therefore share keys. [FileAccess.deleteRecord](../packages/features/cms-files/src/core/FileAccess.ts), lines 135–138, unconditionally deletes each referenced variant. Both individual file deletion and `NamespaceAuthority.delete` use this method. `FileCatalog.readRepresentation` later loads the key retained in the surviving file's metadata; it does not regenerate a missing variant.

**Scenario and consequence.** Upload the same image as files A and B, process both, then delete A. B still lists its representations, but reads fail because A's deletion removed their shared blobs. This also crosses namespaces within the same instance. Originals have distinct upload keys and need not be affected.

**Minimal change.** Choose one consistent ownership model: use file/generation-scoped derivative keys for independently deletable copies, or retain deduplication with durable reference accounting/reachability garbage collection. For the smaller fix, scope newly produced keys to the file and handle historical shared keys conservatively; changing the key builder alone does not make old references safe to delete.

**Regression risks and required verification.** Add real-scheduler tests for identical bytes in two file IDs, within one namespace and across namespaces. Delete each file/namespace in both orders, then read every surviving representation. Cover partially generated profiles and retry/restart. Preserve encoder-version separation and immutable representation responses; do not replace the keys with an identity that allows transformed bytes to overwrite a previously published representation.

### R5 — Early blob-write failure can leave upload error handling waiting forever

**Priority:** P2. **Confidence:** High for the described adapter/source behavior. **Effort:** Low–Medium.

**Evidence and callers.** [UploadManager.write](../packages/features/cms-files/src/core/UploadManager.ts), lines 81–98, catches `blobs.put` errors and awaits `measured.result` before cleanup. [measureStream](../packages/features/cms-files/src/core/streams.ts), lines 17–49, settles that promise only on EOF, read failure or wrapper cancellation. The caller does not cancel it when storage fails. The real [LocalFsBlobStore.put](../packages/foundation/blob-store/src/adapters/LocalFsBlobStore.ts), lines 15–20, can fail in `mkdir` before it consumes the supplied stream. The measurement reader also has no release path at EOF/error, and oversize rejection does not cancel the upstream source.

**Scenario and consequence.** Supply a stream with more data than the wrapper's initial prefetch, and let the writer reject without consuming it. The wrapper never reaches EOF, `measured.result` remains pending, and `writeUpload` does not reject or reach blob cleanup. An upstream producer can remain locked/open. The Provider upload adapter waits on this service call, so a recoverable storage problem can become a hung operation.

**Minimal change.** Give stream measurement an explicit failure/cancellation cleanup path; settle it and cancel upstream before awaiting its outcome when the sink fails. Release the reader exactly once on completion, error and cancellation, and preserve the original storage failure if cleanup also fails. Coordinate cancellation with the actual consuming reader when the wrapper is locked.

**Regression risks and required verification.** Extend [service.test.ts](../packages/features/cms-files/tests/service.test.ts), where `upload tokens are bounded to their session and exact declared size` currently covers size rejection. Use an immediate-rejection writer and a partially consuming failed writer, plus a source with observable cancel/release behavior. Require prompt rejection with a bounded deadline, no leftover partial blob, unchanged publication state and no unhandled rejection. Repeat EOF, oversize and consumer-abort cases; avoid tests that consume everything before injecting the fault.

### R6 — Fallback Page caches ignore edits to the Page and rendering settings

**Priority:** P2. **Confidence:** High; confirmed by inspection. **Effort:** Low–Medium.

**Evidence and callers.** [renderRef](../packages/features/cms-content/src/pages/delivery/http/pages/renderRef.ts), lines 71–82, caches by Page path and `getContentRevision()` only. [createContentReader](../packages/features/cms-content/src/application/core/createContentReader.ts), line 65, derives that revision from text contributions, not Page edits or system/site-Bloc revisions. The normal [serveRenderablePage path](../packages/features/cms-content/src/pages/delivery/http/pages/serveRenderablePage.ts), lines 122–147, includes Page identity/revision, rendering artifact revision and metadata. Runtime [createPublicDelivery](../packages/runtimes/ulvia-provider-server/src/runtime/content/publicDelivery.ts), lines 22–24, shares an `InMemoryCache` without TTL across requests. No fallback cache invalidation path was found in the inspected Content/Provider sources.

**Scenario and consequence.** Warm a configured published 404 Page, edit its content without changing its path or collection text contributions, and request another missing path. Access and visibility are checked against the current Page, but the old cached HTML is returned. Changes to site rendering settings or site-owned Blocs can also leave that HTML stale. `Cache-Control: public, no-cache` causes client revalidation; it does not invalidate this server cache. The 410 branch already bypasses this cache.

**Minimal change.** Reuse the existing Page/rendering revision inputs when constructing a fallback-specific key, including any rendering metadata that actually affects its output. Reuse a narrow cache-identity helper if useful; do not merge fallback authorization/indexing behavior with the normal Page flow merely to share code.

**Regression risks and required verification.** Extend [renderRef.test.ts](../packages/features/cms-content/tests/pages/delivery/rendering/renderRef.test.ts) and [native/resources.test.ts](../packages/features/cms-content/tests/pages/delivery/native/resources.test.ts), which cover draft/restricted fallbacks but not warm-cache edits. With one production-mode cache, warm and then edit the Page, settings and site Bloc independently. Assert changed body/ETag, a hit for an unchanged repeat, and unchanged 403/404/500/503 semantics. Preserve access rechecks, draft exclusion and the `restricted system fallbacks cannot expose a Page to anonymous callers or a shared cache` case. No authorization bypass is inferred from this stale-content defect.

### R7 — Quota checks enumerate namespace contents and do not reserve capacity atomically

**Priority:** P2. **Confidence:** High for the scan and check/write race; production cost unmeasured. **Effort:** High.

**Evidence and callers.** [NamespaceAuthority.assertQuota](../packages/features/cms-files/src/core/NamespaceAuthority.ts), lines 154–162, loads up to `maxFiles + 1` complete generation records and sums sizes for every new completion. [UploadManager.complete](../packages/features/cms-files/src/core/UploadManager.ts), lines 129–149, checks quota before independently writing the File. The default quota in [CmsFilesService](../packages/features/cms-files/src/service.ts), lines 30–34, permits 100,000 records. [MongoCmsFilesStore.listFiles](../packages/features/cms-files/src/default-implementation/MongoCmsFilesStore.ts), lines 93–100, sorts and materializes those rows; its declared index at lines 23–24 does not include `createdAt`.

**Scenario and consequence.** With room for one more stored generation, two independent completions can both observe the same usage, pass and then both publish. Separately, ordinary sequential uploads repeatedly transfer all preceding generation metadata into the process. Up to the configured cap, quota accounting alone materializes `N × (N - 1) / 2` previous records over N new generations: 49,995,000 at N = 10,000. This is a static operation-volume calculation, not a benchmark. One logical list may require multiple Mongo cursor batches.

**Minimal change.** Introduce atomic per-namespace byte/count reservations tied to the durable publication operation from R2. Convert/release reservations on a known commit outcome and on deletion, with reconciliation for interruptions and existing records. Preserve or explicitly decide whether `maxFiles` counts retained generations or logical file IDs; the current code counts generations. An aggregate sum avoids client hydration but still does not solve atomic admission or repeated server scans.

**Regression risks and required verification.** Add memory/Mongo quota tests for two simultaneous last-slot/last-byte uploads, exact boundaries, deduplication, replacement generations, deletion, aborted writes and uncertain commit recovery. A refusal must publish nothing and must not leak a reservation. Instrument rows/documents loaded and operations per completion: current accounting does one namespace read plus one O(N) materializing list; the target is a bounded number of conditional counter operations per attempt with no history enumeration. Measure Mongo examined documents, transferred bytes and latency at increasing namespace sizes before claiming a performance gain. Historical migration/reconciliation is the main rollout risk.

### R8 — Expired-upload cleanup exists as an API but is not mounted in the Provider runtime

**Priority:** P2. **Confidence:** High for repository wiring; external operations are unknown. **Effort:** Medium.

**Evidence and callers.** [UploadManager.cleanupExpired](../packages/features/cms-files/src/core/UploadManager.ts), lines 154–170, can delete abandoned blobs and upload records in a bounded batch; [CmsFilesService](../packages/features/cms-files/src/service.ts), lines 137–139, exposes it. A repository-wide symbol search found calls only in tests, not a runtime or capability caller. [Provider composition](../packages/runtimes/ulvia-provider-server/src/runtime/stores/providerStores.ts), lines 130–147, creates the service. [ProviderInstanceHost](../packages/runtimes/ulvia-provider-server/src/runtime/instances/composition/ProviderInstanceHost.ts), lines 301–309 and 338–343, starts/stops operation recovery but no upload sweeper. [MongoCmsFilesStore](../packages/features/cms-files/src/default-implementation/MongoCmsFilesStore.ts), lines 23–24 and 63–67, declares no TTL and excludes completed uploads from cleanup selection.

**Scenario and consequence.** Write a blob and abandon the upload without finalizing it. Token expiry stops further writes, but no in-repository scheduled cleanup removes the bytes. Repeated abandoned sessions can grow storage independently of published-file quotas. Completed session metadata also accumulates because it is neither selected nor expired. An out-of-repository maintenance service could change deployed retention, but none is established by this checkout.

**Minimal change.** Add runtime-owned bounded maintenance with startup/periodic execution, explicit error reporting and shutdown coordination. Ensure idle/evicted instances have an eventual cleanup path without keeping every composition resident. Fix R2's completion/cleanup ownership race before enabling it. Define a separate retention policy for completed upload metadata that preserves whatever recovery evidence the new publication state machine needs. Do not put a timer in the feature service or a composition choice in the surface. Avoid a blanket TTL that removes unpublished metadata before its blob can be reclaimed.

**Regression risks and required verification.** Extend the `expired uploads are cleaned and public limits reject invalid input` test in [management.test.ts](../packages/features/cms-files/tests/management.test.ts), and add runtime lifecycle tests. Restart/reopen an instance with expired pending/uploaded sessions, drain multiple bounded batches, preserve live published originals, and verify eventual session-record retention limits. Cover completion versus cleanup, blob-delete failure/retry, namespace removal, instance isolation and shutdown while maintenance is active. Inspect Mongo query plans before adding an expiry/state index; batch size alone does not bound documents examined.

## 4. Recommended implementation order and dependencies

1. **R1: close the namespace deletion gap.** Small, independent change with direct authority/state-preservation tests; it need not wait for storage redesign.
2. **R2: stabilize publication and recovery.** Start with the live-blob deletion guard, then implement durable ownership. This supplies the shared foundation for quota reservations and safe cleanup, rather than adding unrelated locks to each caller.
3. **R3 and R4: repair derivative lifecycle.** Add a non-upserting metadata patch and an explicit blob-ownership policy. Keep these changes in Files and its adapters; generic Sharp/blob adapters should not acquire CMS authorization responsibilities.
4. **R5 and R6: fix failure handling and fallback freshness.** Both can be separate focused changes independent of publication accounting. Reuse the existing stream/revision seams and retain their public behavior.
5. **R7: add recoverable quota reservations.** Build on R2; account for R3/R4 deletion semantics and reconcile historical usage before relying on counters.
6. **R8: activate retention.** Deploy only after completion/cleanup coordination is proven. Define metadata retention with R2 and bounded worker/resource ownership with the instance lifecycle.

For each future code change, follow the repository's before/after validation loop in that task's workspace, run focused behavioral tests first and then the required `verify` checks. Real Mongo failure/interleaving tests, storage-failure tests and load measurements remain required before the corresponding fixes can be called verified. This report does not claim global checks are passing or that unreviewed packages are defect-free.

The only deliverable of this review is this Markdown file. Final verification compared tracked and non-ignored untracked file contents with the starting snapshot: only `docs/code-improvement-review.md` was added or changed. All 40 local source links resolved, and the report-scoped whitespace check passed.
