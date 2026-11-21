# Email templates and account composition

The official `ulvia/cms.email-templates@1.0.0` contract belongs to
`@bernouy/email-templates`. Templates owns drafts, immutable publications and pure
rendering. Consumers own purpose-specific associations and delivery decisions.
`ulvia/cms.access@1.1.0` adds administrator association reads/writes. Its official
implementation requires `templates.get-version`, `templates.render` and
`emailer.send`; it does not require access to template drafts or administration.
The generated primary Provider manifest is version `1.10.0`.

## Isolation and lifecycle

Runtime composition fixes the instance-private database and uses exact selected
contracts and current machine authority through the normal Gateway. Associations
contain an exact template UUID/publication version and a source fingerprint of the
selected installation ID, endpoint, account ID and observed instance ID. A source change requires explicit
reassociation. Gateway's trusted `expectedTarget` fences that target before dispatch;
it grants no authority and is never forwarded as capability input.

Each consumer stores its own associations. The Access-owned defaults use deterministic
installation UUIDs derived from consumer contract, purpose and locale, with read-only
origin metadata. Names never confer authority. Explicit provisioning installs and
publishes ordinary templates, then initializes associations without overwriting
existing configuration. Startup composition and reads never recreate missing data.
Existing ready instances need an explicit admitted system-plan upgrade. Its reviewed
target retains enabled families and closes mandatory dependencies from the exact
shipped manifest, including inherited capabilities and newly required Templates.
Optional Hosting/Registry are not enabled implicitly; operator transports stay excluded.
After selecting the target and pairing the official Provider, the durable `contracts`
step initializes missing account publications/associations before readiness when
the transition introduces Templates. Registry activation and later upgrades do not
recreate missing mandatory account state. An
interruption leaves that step unfinished and retries initialization idempotently.
It never reinitializes an existing setup, administrator or Repository configuration.
The provisioning checkpoint remains authoritative during crash recovery.

Publications are immutable; activation of another version is an explicit consumer
configuration write. Archive blocks edits/new associations, while existing exact
references continue rendering. Association writes already validated before a concurrent
archive may finish; there is no distributed transaction between consumers and Templates. No permanent deletion or implicit language fallback
is provided. Initial Access templates are English; other locales can be authored
and associated explicitly. No collection, Page or visual editor is installed.

## Storage and bounds

The Mongo adapter stores metadata and the current bounded draft in
`email_templates_v1`, keyed by the template UUID. Immutable publications have
separate documents in `email_template_publications_v1`, keyed by
`<template UUID>@<version>`. There is no total template or publication quota, slot
allocator or creation-time catalogue scan. Model documents do not grow with history.
Version and revision counters use safe integers up to `Number.MAX_SAFE_INTEGER`
(9,007,199,254,740,991). Exhaustion refuses before a mutation with `COUNTER_EXHAUSTED`.

Publication uses three durable steps without a multi-document transaction:

1. Reserve the current draft with a model revision CAS and a small pending marker.
2. Insert its immutable publication document. Exact duplicate operations converge;
   a disagreeing immutable row fails without overwrite.
3. Advance the model's visible version/revision and clear the pending marker by CAS.

A staged row is invisible until the final CAS. An interrupted operation resumes by
retrying `templates.publish` with the same ID and expected revision, including after
restarting the process. Other draft/archive mutations refuse while publication is
pending; readers never finalize writes. Already committed versions remain readable.
There is no lease, expiry, automatic cleanup or background recovery. This replaces
the unpublished embedded-history prototype; no old-format reader or backfill is provided.

Each content snapshot retains at most 32 variables and 64 KiB of serialized source;
drafts share that source bound. Lists project at most `limit + 1` summaries
(limit <=100), never draft/publication bodies. One version read loads a model
visibility marker followed by one exact publication document, independently of the
number of retained versions. Draft reads load no publication documents. Queries
have a 2-second Mongo maxTimeMS. Keyset `after` UUIDs are exclusive boundaries,
not stable snapshot cursors.

`account_email_configuration_v1` stores the exact two associations and CAS revision.
Its revision and association versions also use safe integers; revision overflow
refuses before a write. Missing/malformed persisted fields fail. Updates validate
compatible variables,
required text action token and HTML action href before writing. Replays of the
last exact CAS target do not create another revision.

## Rendering and sensitive data

Variable values are bounded strings of declared text, HTTP(S) URL or UTC date-time
kind. Unknown/duplicate values and missing required variables refuse. Substitution
is single-pass; subjects reject CR/LF. Sources use only exact `{{name}}` tokens.
HTML is parsed inertly with an explicit element/attribute allowlist, at most 2048
nodes and depth 24. Dynamic hrefs consist of a whole URL token. No CSS, images,
forms, scripts, raw HTML values or network reads are supported. Rendered JSON is
bounded to 256 KiB. Before substitution, a preflight counts expanded UTF-16 characters
and serialized UTF-8 JSON bytes, including HTML entities, JSON escapes and surrogate
pairs across substitutions. Oversized expansion refuses before allocating complete
output strings. Accepted HTML values are escaped once per distinct referenced name.
Published feature docs enumerate the allowed HTML elements.
Preview clients must isolate HTML rather than insert it into an administrator DOM.

Values and rendered messages are never stored by Templates, and content/value DTO
strings are marked sensitive for captures. Account links are generated by Access;
raw tokens are not passed as independent variables. A composition failure consumes
only its own newly minted token, preserving a concurrent newer token.

There is no built-in/custom mode or legacy composer fallback. The selected Emailer
receives the rendered outbound message through the ordinary admitted invocation.
A template failure does not invoke Emailer. A Gateway-validated `EMAIL_DISABLED`
refusal from `emailer.send` becomes `EmailDeliveryDisabledError`, preserving the
account policy for disabled remote Emailers and disablement after an enabled check.
Other refusals remain failures without exposing Provider diagnostic output.

## Cost and validation

Before this feature, official account composition/delivery called local services.
An enabled account send now reads one association document and performs two admitted
Templates queries (publication and render) plus one Emailer command. Source/route
and machine grants are rechecked rather than cached. Each publication query/render
loads two bounded documents (visibility marker and exact snapshot), so the two
Templates queries require four Mongo point reads instead of two in the embedded
prototype. It does not hydrate the version history. No rendered-content or
publication cache is introduced.

Focused tests cover isolation, provenance, CAS/replay, immutable publication,
archiving, source switching, compatibility, token failure and signed HTTP rendering.
`verify` includes real Mongo concurrent publication, growth, projection and
interrupted-write recovery checks and the shared-hosting browser journey for preview, association, authorization/isolation and restart.
The performance harness includes every new capability/binding/required variant;
scenario declarations are not latency or throughput measurements.
