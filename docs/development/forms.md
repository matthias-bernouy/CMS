# Optional Forms 2.x

`@bernouy/forms` owns configurable drafts, immutable publications, retained
submissions and durable `submission.created` intents. `ulvia/cms.forms@2.0.0`
has sixteen capabilities. Administration uses HTTP/MCP; public submission and
schema resolution use their declared HTTP bindings. No form editor is bundled.

## Selection and breaking change

Forms remains optional. Discover and select an exact approved implementation
through Installations. Forms requires Events publication, not Emailer. The
2.0.0 contract removes `draft.notification`, notification outcomes,
`submissions.retry-notification`, `EMAILER_UNAVAILABLE` and the email-specific
`deliveryMayComplete` deletion result. Forms retains no recipient/template state.

Ordinary startup and readers do not convert Forms 1.x state or introduce aliases. Existing
1.x pins are not executable on the new runtime. This includes announced Provider
implementations even when Forms is not selected: runtime recovery checks every
advertised exact implementation, so such an existing instance can refuse the new
image before administration is available. Historical 1.x release bytes
remain archived under the surface's `compatibility/archived/forms-v1.json`,
outside the active retained-executor inventory. `ulvia upgrade` now owns an explicit offline migration for the exact archived
Forms 1.0.0 and 1.1.0 releases. Unknown versions/digests refuse. Merely replacing
an image outside that protected command remains insufficient. New installations use the fresh
2.x contract and state format.

## Persistence and recovery

The Mongo adapter uses majority reads and journaled majority writes with atomic
single-document changes on standalone Mongo. Submission receipt, validated answers
and Event intent are inserted together. Original initiator proof and causation
survive retries. The stable submission receipt is the Event occurrence identity.
Exact replay does not capture a second origin or insert another intent.

The background worker publishes Event intents with bounded batches of twenty-five
records and clears expired answers/intents, even without an Event publication port.
Receipts retain seven-day replay protection. While the Provider is down, payload
erasure waits for recovery or Mongo TTL; private reads refuse expiry immediately.
Mongo TTL is asynchronous. Deletion erases unclaimed local intents. An in-progress Event publication may
still finish; deletion cannot undo an accepted Event or a downstream effect.

Submission BSON remains bounded at 256 KiB, reserving maximum Event lease/attempt
and revision growth. Form/request bounds remain 64 KiB. Summary lists retain one
projected `limit + 1` read and page sizes up to one hundred. The per-form admission
guard remains six hundred attempts per minute. It is not per-client fairness.
Normal submit/read paths add no Emailer probes; form publication no longer resolves
or authorizes Emailer. All notification calls move to an explicitly active Workflow.

## Optional notification workflow

The generated local catalogue includes `ulvia/form-submission-email@1.0.0` from
`@bernouy/official-workflows`. It requires Forms 2.x, Email Templates 1.x and Emailer
1.x. Configure the form, recipient and an exact template publication, then validate,
publish and activate using the ordinary Workflow administration APIs. No automatic
activation or remote publication occurs. Template variables are `submissionId`,
`formId`, `receivedAt`; answer fields require explicit custom mappings.

Failures and uncertain sends belong to Workflow run diagnostics/reconciliation.
Forms acceptance is independent of those effects. See the
[catalogue guide](../../packages/features/workflow-library/README.md).

`bun run verify` covers standalone Mongo persistence/retention and the native
Forms/Event/Workflow/SMTP browser journey, including isolation, replay and Provider
restart. Real performance measurements remain separate under `bun run perf`.


## Explicit Forms 1.x migration

Use `ulvia upgrade --version VERSION --plan` to inspect the target image's plan,
then `ulvia upgrade --version VERSION` to perform its cold-backup migration.
See [deployment lifecycle](deployment-lifecycle.md) for downtime, activation and
rollback boundaries. No migration runs implicitly in a Forms reader or ordinary
Provider startup. Forms 1.x receives no executable compatibility adapter.

Form IDs, drafts, revisions, immutable publications, retained answers, statuses,
receipt identities/nonces, original principals and replay deadlines are preserved.
Legacy 1.0 submissions receive no synthesized historical Events; existing 1.1
Event intents retain their original proof and causation. Email retry scheduling is
removed. All email intents must be accepted, with no unresolved completion flag:
`pending`, `sending`, `blocked`, `failed` and `unknown` refuse before conversion.
Resolve these outcomes using the original image before retrying the upgrade.

Draft and publication notification settings are exported privately under the
checkpoint's `migration/forms-v1-email-settings.ndjson`. The export contains
instance/form/publication references and settings, not submission answers.
Nothing automatically creates or activates notification Workflows. Administrators
must configure the official optional notification Workflow and verify its result.

Capability identity is stable across releases: Forms 2 operations whose wire
schema/error set changed use new `*-v2` IDs and `/forms/v2/...` or
`/submissions/v2/...` HTTP bindings. Dynamic-schema resolver/choice capabilities
and `submission.created` retain their compatible IDs. The migration admits a
catalogue-only Forms 1.2.0 retirement release before Forms 2; it does not select or
execute it. Historical immutable releases are retained and ordinary catalogue
lifecycle checks remain enabled. SDK-generated metadata and current authored
callers use the new IDs. Old collection consumers and active Forms 1.x Workflow
call plans must be upgraded/retired and their runs finished before migration.

The operator also updates the affected instance's native manifest approval,
observations, exact selections and retained system plan. Foreign installations and tokens are retained. When native Forms is selected, existing denials move to the exact replacement
`*-v2` action so renamed capabilities cannot reopen forbidden actions. Denials for
fully retired operations without replacements are omitted because those operations
no longer exist. Foreign Forms selections retain their original policy. Other simultaneously changed contracts must remain
consumer-compatible. Incomplete instance/site transitions and incomplete usage
inventories block the plan. The cold checkpoint recovers partial metadata/data
writes; no Mongo replica set is required for this offline operation.
