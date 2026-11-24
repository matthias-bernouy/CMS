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

There is no automatic conversion of Forms 1.x state, reads or aliases. Existing
1.x pins are not executable on the new runtime. This includes announced Provider
implementations even when Forms is not selected: runtime recovery checks every
advertised exact implementation, so such an existing instance can refuse the new
image before administration is available. Historical 1.x release bytes
remain archived under the surface's `compatibility/archived/forms-v1.json`,
outside the active retained-executor inventory. No Forms 1.x data migration tool is supplied in this change. Existing data needs
a separately reviewed migration or fresh state before an instance can use 2.x;
merely replacing an image is not a migration. New installations use the fresh
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
