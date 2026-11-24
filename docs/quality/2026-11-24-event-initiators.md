# Event initiator provenance — 2026-11-24

Task worktree: `/home/matthias/.codex/worktrees/contract-events-workflow-manifests/CmsCore`, branch `codex/contract-events-workflow-manifests`, base `66d25ba9b3ff1cc5c00dc1ed091d28e66aea32bf`. This increment is uncommitted and includes no remote publication. Earlier dated reports describe earlier checkpoints, not this validation.

## Implemented behavior

- Standard optional `initiator: { kind, reference }` metadata is shared by Gateway and SDK Event receivers. User, anonymous and explicitly captured system origins are distinct; absence means unknown.
- CMS capture accepts the verified source invocation/delegation, resolves its receiving Provider alias internally and encrypts scoped claims. Callers cannot supply an arbitrary CMS subject. Proofs bind instance/site, source installation/contract, stable Event declaration and producer occurrence.
- `initiators.capture` is a public-binding capability with an additional verified source-installation guard. Ordinary browser callers, including administrators, cannot capture for another source. Deferred SDK producers capture before committing their business intent and publish its retained proof later.
- `initiators.resolve` is an administrator capability. A current administrator resolves to a selected target Provider alias; machine Providers are limited to their own installation. It returns no internal CMS subject and creates no execution grant. Non-user references do not resolve to users.
- Native Forms captures before durable acceptance. Its persisted Event intent requires an explicit nullable `initiatorProof`. Reopening never invents or backfills an author. Publication and replay include a keyed actor identity in the publication fingerprint, independent of randomized encrypted reference bytes.
- Owner-scoped causal republication can retain the initiating actor through `causeDeliveryId`; it cannot be combined with an explicit proof. Inheritance reads one bounded outbox metadata projection without hydrating business payloads.
- Workflows receive typed common metadata and must guard its optional presence. Execution retains the workflow's approved administrator authority. Common metadata does not change dynamic answer schemas or Event filters.

Public Gateway capabilities execute anonymously even with a browser cookie. Verified submitters therefore require an authenticated form and `forms.submit-authenticated`. No Gateway authentication policy was changed to infer an actor from cookies or payload fields.

## Validation

The initial `bun run check` passed all ten checks. The complete `bun run verify` finished with exit 0 after the runtime changes: its ordinary suite reported 4,626 passes, 143 explicit skips and zero failures; enabled Mongo, browser, Forms and TLS stages passed separately. The real Forms journey passed 193 assertions, including a signed member submission, Provider restart, retained user provenance, administrator alias resolution, non-administrator and foreign-instance refusals, forged input rejection and plain-browser capture refusal.

After correcting the optional performance fixture to submit an authenticated form, `bun run check` again passed all ten checks. That correction affects scenario preparation, not production behavior. Formatting and `git diff --check` passed.

Focused evidence:

- `packages/runtimes/ulvia-provider-server/tests/provider-contracts/native/authority/origins/provenance.test.ts`: five tests / 41 assertions covering restart, alias translation, tampering, foreign tenant/key/source/declaration/occurrence, anonymous/system/unknown distinctions, revoked administration, recipient scope and causal inheritance.
- `packages/features/forms/tests/events/initiator.mongo.test.ts`: retained original proof after reopening, no recapture on idempotent replay, missing mandatory persisted field refusal and capture failure without submission insertion.
- `packages/features/events/tests/subscriptions/initiator.mongo.test.ts`: rejected proof before publication writes, same-actor recapture deduplication, changed-actor conflict and delivery of the original reference after payload filtering.
- `packages/platform/sdk/tests/contracts/events.test.ts`: typed producer capture/enqueue, inherited Event identity and ambiguous/unhosted proof refusal.
- Existing publication operation-budget tests still passed: the isolated feature-store path uses five operations for zero-subscriber publication and two for replay. This excludes runtime route/authorization reads. Proof verification adds authenticated decryption and an HMAC, without a separate provenance database lookup. See [implementation notes](../development/event-initiators.md).

The performance plan contains 313 executors and 2,332 scenarios with no missing definitions/budgets. A separate measured run selected only the two new nominal initiator scenarios. It failed during isolated stack/MCP fixture preparation, before either scenario executed (`assessment-fixture-failed`, zero samples). No latency, throughput or budget-success claim is made. Its report remains under `artifacts/performance/runs/20261124T133641Z-66d25ba9b3ff-17657dd1/`.

The complete Forms integration journey remains in one test to share its owned instance, SMTP capture, sessions and restart lifecycle. Its file-size warning was reviewed; the reusable Event-to-run observation fixture lives in a separate module. The runtime provenance service is 176 lines and remains cohesive. No directory-fanout error remains.

## Local preview

The separate local-only Git repository is `/home/matthias/.codex/worktrees/workflow-lab`, without a remote. The updated preview is `http://127.0.0.1:4318/`, using ignored private state under `.state/initiators/`. The original `4317` stack and data were preserved. Only the new stack's networks received explicit free private subnets after automatic Docker pools were exhausted; no existing network was removed or modified.

The editor exposes common metadata from the installed receiver's admitted schema, explicit public/authenticated Form access, and an ordinary test member. Its normal email confirmation runs against the local SMTP capture, without disabling verification or granting administrator privileges. The tester snapshots FormData before disabling controls and reads the exact immutable Form version when choosing the submission capability.

Browser validation published a guarded metadata workflow, submitted public and authenticated Forms, and replayed stable submission IDs. Final observed state: three successful runs, three delivered Event intents, one active trigger, three workflow notifications (two anonymous, one user), and one local verification email. Replaying the authenticated submission did not create a fourth run or notification. Updating the Form publication to authenticated access preserved compatibility of the metadata-only workflow.

The laboratory syntax/API/isolation checks passed, as did six editor tests / 21 assertions. The screenshot at `.state/initiators/provenance-verified.png` shows the authenticated `user` notification and three delivered intents. No mail was forwarded externally. Temporary invalid-input and fixture-setup refusals are retained in the local logs; they produced no workflow runs.

## Remaining boundaries

Other producers must supply the SDK's trusted capture port and persist its proof with their business mutation; plain background publication cannot reconstruct a lost user context. References are identifying metadata, not credentials, and depend on retained instance keys and current resolution authorization. Causal lookups are limited by existing delivery-metadata retention. There is no Event-history API, external webhook integration or Commerce/purchase Provider in this increment. A verified-purchase workflow still needs an authorized business capability from its Commerce Provider. No exhaustive performance assessment or independent security audit is claimed.

Persistent validation logs: `/home/matthias/.codex/logs/CmsCore-event-initiator-2026-11-24-*.log`.
