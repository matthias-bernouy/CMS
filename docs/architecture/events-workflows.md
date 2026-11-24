# Contract Events and Workflow Manifests

## Ownership and deployment

Contracts declare public business events beside capabilities, with the same `ulvia-schema/v1` value language. An event belongs to its declaring contract, including when inherited. For example, `ulvia/cms.forms` declares `submission.created`; a Provider implements its emission. Event names and producer occurrence IDs have different purposes: the name selects a typed fact, while one stable occurrence ID identifies that fact across publication retries.

`@bernouy/cms-events` owns installed source metadata, publication receipts and subscriptions. `@bernouy/workflows` owns portable manifest validation, instance installations, immutable published execution plans, triggers and runs. `@bernouy/repository` owns catalogue publication, discovery and configured Repository sources for the new `workflow` artifact kind. The SDK compiles official contract definitions and provides typed emitters and receiver and generic schema-resolution helpers.

The official Provider surface receives services through ports. `ulvia-provider-server` supplies Mongo stores, encryption, verified Gateway authority, source discovery and background recovery. Events and Workflow are selected on new CMS instances; Forms remains optional. Existing instance changes use explicit installation/upgrade operations. No administration collection or editor is bundled.

Gateway remains the generic invocation transport and identity authority. Its `events` export supplies neutral bounded envelopes and durable delivery machinery. This implementation does not observe Gateway calls as event sources, create external webhooks, or expose a generic event-history API.

## Emission and delivery

A Provider uses `eventsFor(feature, durablePublisher)` from `@bernouy/ulvia-sdk`. The host supplies durable publication-intent storage. Persist that intent with the accepted business change and reuse the producer occurrence ID when retrying; the SDK cannot make an external business database and Events atomic.

Events derives the source from the admitted selected contract and verifies the authenticated source installation. Its declaration fingerprint includes the event schema, sensitivity and filter keys, excluding unrelated contract capabilities and documentation. Equal declarations across contract releases resolve to the same immutable source; schema queries still pin the exact current admitted capability release. Callers cannot register arbitrary schemas or choose another installation's identity. Publication validates the original payload against the admitted schema, then filters sensitive data. A wholly sensitive event delivers metadata without its data. Resource field sensitivity participates in projection too.

Publication stores a durable receipt and freezes its recipient set before acknowledgement. A recoverable single-document membership commit orders subscription revisions; interval history lets later bounded scans use the original committed generation without a Mongo transaction. Each handoff page is durable before dispatch and its cursor advances only after the shared outbox accepts its stable batch identity. A retry returns that original receipt, including across a compatible selected contract release; it does not enroll later subscribers. The producer ID is scoped by owner and event type. Changing its payload is a conflict. Empty recipient sets also retain a receipt.

Subscriptions belong to a site, Provider installation and logical consumer contract. Their mutation and cursors remain owner-scoped. The official Workflow adapter uses its own trusted subscription authority after administrator validation. Public metadata discovery is distinct from event payload access. Internal schema queries and delivery use narrowly checked system identities; event JSON and request headers convey no authority.

Gateway pushes `ulvia-event/v1` to a contract capability with the standard receiver schema. The envelope includes occurrence/delivery/subscription identities, source contract and installation, resolved-schema identities/versions when present, projected payload JSON and bounded causation. A receiver commits its inbox before acknowledging. Delivery retries can happen; durable inbox receipts prevent duplicate workflow runs.

The runtime distributes a frozen recipient set in durable batches of at most 64, bounds delivery records to 2 MiB and keeps payload retention to 24 hours. Delivery has fenced leases and retries for the 24-hour window. These are delivery limits, not an exactly-once guarantee for external side effects or an indefinite event archive.

## Shared dynamic schemas

`resolved` is a native `ulvia-schema/v1` node, usable in event data and capability inputs/outputs. Each node declares its resolver, named selector references, optional version reference and optional picker capability. References use required static root JSON pointers (`source: "value"`), or the original capability input (`source: "input"`). Homogeneous arrays/maps can contain resolved nodes, but this V1 does not correlate each item's selector with its own item value.

A resolver is a declared synchronous query marked `schemaResolver: {selector: ...}`. Its wire protocol accepts `selectorJson` and optional `version`, and returns `resourceId`, `version`, `digest`, `schemaJson` and stable field identities/properties/labels/sensitivity. The shared engine parses the concrete schema, forbids binary and nested resolved schemas, validates descriptor identities/digest and checks a requested version exactly. `schemaDescriptorWire` creates this standard response without feature-specific serialization or hashing. Returning a string is not sufficient proof of a valid schema.

The CMS Gateway seals each resolver result through CMS-owned durable authority, even when an external Provider does not implement the SDK's sealing. `MongoSchemaVersions` is the optional adapter wired by the CMS Provider runtime. Its atomic identity includes site, Provider installation, Provider instance, declaring contract, resolver, resource and version, but not the contract release version. One digest is permitted per identity; inherited aliases share that declaring identity. Labels do not enter the digest. A stateless Edge calls the resolver normally, then obtains confirmation through the admitted control-only `gateway.schemas.seal` capability. That authority rechecks the actor, exact selected source and current route before persisting. It accepts no site identity from the wire. The SDK Provider receiver independently seals its own results before returning them, including direct resolver queries. Edges keep no independent durable seals.

The Gateway validates resolved inputs before command dispatch/audit start and resolves outputs before acceptance. Resolver calls retain actor authorization, exact release targeting and route fences. The receiver independently validates before business execution, rechecks the resolver's host policy and guard, and validates terminal synchronous output. SDK local execution needs an explicit resolution authority. Default durable SDK workers and retained dynamic output projection require a host resolution port, revalidate on recovery and refuse registration without that port. Static paths retain their existing authorization/network/persistence operation counts.

Resolution is bounded to 32 slots, 16 KiB per selector, 256 KiB per descriptor schema and 2 MiB of descriptor responses per resolution. Returned schemas use the shared bounded native parser. Repeated identical queries share a cache only within that resolution. There is no persistent mutable schema cache.

Events declares independent `filterKeys`, at most eight required nonsensitive static scalar fields (routing strings have at most 256 UTF-16 units). Subscriptions supply an optional object `filterJson`; the empty filter matches all occurrences. Publication computes at most 256 canonical filter-key hashes and scans matching subscription history through the existing membership generation/index. Neither filtering nor a subscription invents a data schema. Event envelopes carry a bounded `schemas` list of path, resolver, resource identity, version and digest; concrete schema bytes are not copied into every message.

Forms derives a concrete schema from published fields. Its `answers` node names `forms.describe-submission`, takes `/formId`, pins `/formVersion`, and exposes `forms.list-submission-sources` as its picker. The event independently declares `filterKeys: ["formId"]`. Its public array-based submission input remains unchanged.

A workflow selects the form using its trigger filter:

```json
{
  "kind": "event",
  "contractId": "ulvia/cms.forms",
  "eventType": "submission.created",
  "filter": {
    "kind": "object",
    "fields": { "formId": { "kind": "parameter", "path": "/formId" } }
  }
}
```

Publication resolves the selected event schema and all dynamic capability schemas, checks mappings and freezes concrete views with their witnesses. Selector values must be available from literals/parameters; a future-step/manual-input selector or future-response selector is refused with a diagnostic in this V1. Capability output nodes may reference known original input. Ordinary direct invocations can resolve actual runtime inputs. Unknown schemas never become an `ANY` binding. See the [authoring guide](../development/resolved-schemas.md) and [contact manifest](../../packages/features/workflows/examples/contact-notification/definition.json).

## Portable publication and execution

A workflow manifest uses `kind: "workflow"` and `format: "ulvia-workflow-manifest/v1"`. It declares identity/version, compatible contract requirements, referenced capability/event IDs, and a `ulvia-workflow/v1` definition. No executable assets are admitted. The CLI supports release, push, pull, yank and restore; Repository exposes four-kind discovery via `artifacts.list/search` and publication via `artifacts.commit`. Previous contract versions retain their prior outputs.

An administrator installs an exact repository/publisher/workflow/version/digest reference, supplies typed parameters, validates and publishes. Installation does not activate a trigger. A trigger selects that immutable publication. The same package can have independent installations with different form IDs or recipients. Local definitions remain available through the administrator API.

V1 supports JSON calls, conditions, comparisons, existence checks, literals, object/array construction, typed parameters, manual inputs, event data, step outputs and declared-error branches. It has no arbitrary scripts, loops, parallel execution, delays, raw HTTP calls or binary steps. External integrations need admitted Provider capabilities and business events.

Each run retains its accepted plan and data. Calls recheck administrator authority and the selected destination. Checkpoints preserve completed work, operation references and keyed command identities across restart. A non-idempotent call with an unknown outcome suspends for explicit resolution. Cancellation cannot recall a dispatched side effect.

## Changes and warnings across Providers

Resource owners may modify or remove their resources independently. There are no source-side workflow reservations, cross-Provider locks, or new MongoDB replica-set prerequisites. Background checks page active triggers, and event acceptance checks again. Detection is eventual.

A consumed schema incompatibility suspends new starts with a code and path available from `triggers.list`. Renaming labels, adding fields or removing unused fields remains compatible. Whole-object mappings consume the whole object. Merely testing whether an object exists does not consume all of its children. Temporary transport/resolver outages defer validation and retry rather than recording permanent incompatibility.

After repair, an administrator validates and explicitly reactivates through `triggers.update`. Suspended deliveries are acknowledged without creating runs and are not replayed on reactivation. Accepted runs retain their plans; an incompatible next call suspends the run before dispatch. `runs.resume` validates remaining calls and continues checkpoints. Closing a source that emits no more events does not itself imply a schema incompatibility diagnostic.

This is an API and runtime implementation. The administration collection must render its diagnostics and provide the editor, resource selection and reactivation controls.


## Delivery and retention policy

The official runtime retries transient delivery failures for 24 hours from acceptance. Delays grow from five seconds to one hour; there is no earlier fixed attempt-count cutoff. Expired pending deliveries expose `DELIVERY_EXPIRED`. The administrator-only `deliveries.list` projects owner-scoped delivery metadata without loading event payloads or exposing selectors/targets. It is a diagnostic API, not an event-history reader.

Payload documents have an independent 24-hour Mongo TTL. Their read path also enforces expiry before returning values, because physical TTL removal is asynchronous. Publication receipts and shared-outbox metadata use a 30-day TTL. Whole sensitive facts still have no payload. A terminal handoff clears its payload earlier; interrupted cleanup remains bounded by the payload TTL.

Installed plans are prepared before one durable publication decision in the installation document. Prepared plans remain inaccessible, including to existing-run lookups. Confirmation activates the immutable plan, then clears the pending decision. Configuration/removal cannot replace a pending decision. Readers and background recovery finish committed confirmations without recompilation. Local draft publication uses one CAS decision and preserves its unfinished intent against concurrent edits.

Old subscription-generation deliveries are acknowledged without runs and cannot suspend replacement triggers. Resource resolution also seals `(source owner, event type, resource ID, version)` to one validated schema digest; a conflicting descriptor is refused independently of Provider boundaries.

Terminal succeeded/failed/cancelled runs are purged after seven days, including encrypted roots, chunks and orphan writes within that run scope. A durable purge marker fences resumes and late writers before deletion. Checkpoint CAS prevents a purge from deleting a concurrently resumed run. Queued/running/waiting/suspended/uncertain runs retain their recovery data. A payload-free inbox tombstone preserves event deduplication for 30 days from run acceptance. Definitions, installed parameters, plans, source declarations, schema seals and current subscription configuration have separate domain lifecycles. There is no automatic erasure of those configurations when a business resource is deleted.


Run-value scopes are registered before encrypted chunk writes and marked accepted after durable run/inbox insertion. Unaccepted scopes older than seven days are checked in bounded pages. Cleanup first reserves an otherwise absent run identity with a durable tombstone; a concurrent real run insert wins or is refused atomically. Existing accepted/waiting/suspended runs are preserved even if their scope-acceptance update was interrupted. Orphan cleanup resumes from its pending marker and also removes chunks whose root write never completed. The same cold-instance metadata discovery opens instances with due orphan scopes or interrupted cleanup.

## Shared authoring and optional official workflows

`@bernouy/ulvia-workflows` owns the Platform language, graph validation and manifest
admission. The SDK exports pure `defineWorkflow` authoring and build-only
`compileWorkflow`; the feature engine reuses those same validators. No SDK import
depends on a feature runtime. Contract requirements still require catalogue
witnesses, and instance publication still resolves current dynamic schemas.

`@bernouy/official-workflows` supplies the optional
`ulvia/form-submission-email@1.0.0` artifact through the CLI-generated catalogue.
Its presence does not install or activate a trigger. Forms 2.x emits Events and
retains answers without any Emailer worker or notification settings. The official
workflow renders an explicitly selected Email Template publication before invoking
Emailer. It passes submission metadata; approved answer mappings require an
explicit custom variant. See [catalogue usage](../../packages/features/workflow-library/README.md).
