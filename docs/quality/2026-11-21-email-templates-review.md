# Email Templates implementation review

Date: 2026-11-21. Task branch: `codex/email-templates`, based on `v1.0.22`
at `7496cce8e`. Application implementation: `063599155`, completed by
`33ca3ce13` and `5282754b3`. Work remained in its separate worktree; no publication or merge
into the original checkout was performed.

## Delivered behavior

- `@bernouy/email-templates` publishes `ulvia/cms.email-templates@1.0.0` through
  the official SDK inventory. It owns bounded drafts, immutable publications,
  preview/render and archive. It never sends email or stores rendering values.
- `ulvia/cms.access@1.1.0` owns the two account-purpose associations and their
  administrator HTTP/MCP configuration operations. The official implementation
  requires exact-compatible Templates publication reads/render and Emailer send.
- Primary Provider manifest `1.10.0` is generated from that inventory. The exact
  Access 1.0 release remains a reviewed compatibility snapshot; current schema
  changes are a compatible minor addition, not a rewrite of its published digest.
- Explicit provisioning installs two ordinary English template publications with
  deterministic consumer/purpose/locale identities and read-only origin metadata.
  Crash recovery does not duplicate them or overwrite configured associations.
- Production account composition has no built-in/custom switch or fallback.
  Templates and Emailer are selected through the admitted Gateway and live machine
  grants. Source installation/endpoint/account/observed-instance identity is fenced
  before dispatch; Provider changes require explicit reassociation.
- Consumers own their associations independently. Archive blocks new associations
  when observed by validation; existing pinned versions remain renderable. An
  already validated association write can finish during a concurrent archive.
- Preview has an HTTP/MCP API. No visual editor, collection or Page is installed.
  Other languages can be authored and selected explicitly; initial seeds are English.

See [architecture](../architecture/email-templates.md) and the published
[feature workflow](../../packages/features/email-templates/docs/overview.md).

## Authorization, input and lifecycle evidence

- [Domain tests](../../packages/features/email-templates/tests/lifecycle.test.ts):
  immutable versions, CAS/replay, instance separation and bounded summary pagination.
- [Rendering tests](../../packages/features/email-templates/tests/render.test.ts):
  unknown/duplicate/missing variables, URL validation, single-pass substitution,
  output bounds, header injection and unsupported HTML. Regression inputs include
  scripts/links/event attributes placed after an explicit closing body tag.
  The renderer validates the complete wrapper and serializes accepted body markup.
  Creation and draft updates also recheck source bounds after normalization, before
  any write; entity expansion cannot persist an unreadable oversized document.
- [Installation identities](../../packages/features/email-templates/tests/installation.test.ts):
  consumers, purposes and locales do not share installation identities; a mismatched
  trusted origin refuses before a template write.
- [Account associations](../../packages/features/auth/tests/email/templates/associations.test.ts):
  incompatible variables refuse without configuration changes, source changes require
  reassociation, exact retries converge and existing archived references still render.
- [Token failure](../../packages/features/auth/tests/email/templates/failure.test.ts):
  composition failure invokes no Emailer and consumes only its own token, preserving
  a concurrent newer token. Raw tokens are not separate template variables.
- [Emailer wire adapter](../../packages/runtimes/ulvia-provider-server/tests/authentication/templates/delivery.test.ts):
  the internal authored message is checked against the actual public `toEmail` /
  `toName` capability schema; false acceptance is rejected.
- [Provisioning recovery](../../packages/runtimes/ulvia-provider-server/tests/authentication/templates/initialize.test.ts):
  interrupted initialization resumes and preserves customized drafts/associations.
- [Signed remote Provider](../../packages/runtimes/ulvia-provider-server/tests/authentication/templates/http.test.ts):
  real HTTP publication/render requests carry signed machine provenance; revocation
  prevents further backend calls. No local renderer bypass satisfies this test.
- [Gateway target fence](../../tests/integration/gateway/invocation/target.test.ts):
  installation, endpoint, account and observed-instance mismatches refuse before
  dispatch. Ordinary callers without that optional trusted constraint still work.

## Persistence and cost

The production adapter is instance-private Mongo. At most 100 unique integer
storage slots enforce capacity across processes; 32 publications per template and
64 KiB per content snapshot bound retained content. Creation projects at most 101
slot identifiers per attempt and retries at most 16 insertion races. Publication
is one document CAS, without a replica-set transaction requirement.

[Real Mongo evidence](../../tests/integration/email-templates/mongo.docker.test.ts)
checks immutable persistence/reopening, cross-instance refusals and a capacity race:
four independent writers compete for two free slots, exactly two succeed and the
collection stays at 100 records. The monitored render/list pair performs exactly
two `find` commands. Publication projection loads one `$slice` snapshot; a two-item
list requests at most three projected summaries, without version bodies. Rendering
values do not appear in persisted business documents or query command payloads.

An enabled account send adds two admitted Templates requests and one Emailer
command, replacing local composition/delivery domain calls. Association reads,
Gateway authority/catalogue checks and SMTP transport remain additional work;
these counts are not total Mongo-operation or latency claims. No cache is added.
The source facade remains cohesive at 163 lines (informational size guidance).
Existing larger Gateway/runtime files retain localized changes rather than an
unrelated structural rewrite.

## Validation

- Initial frozen dependency installation and `bun run check`: 10 passed, 0 failed.
- Final `verify` static checks: 10 passed, 0 failed.
- General suite: 4,493 passed, 92 skipped, 0 failed across 1,192 files.
  Opt-in browser/Mongo/TLS journeys run in their dedicated verification stages.
- Dedicated collection browser stage: 4 passed. Capture/browser stage: 11 passed.
- Dedicated Mongo stage: 17 passed, including the new Templates capacity/read test.
- Performance plan: 249 executors, 1,933 scenarios, no missing definitions/budgets.
  The eleven new capabilities have 104 executable HTTP/MCP/variant scenarios.
  Compatibility validation passes with `measuredPerformance: false`.
- Targeted full-installation acceptance passes on the final application code:
  the customized archived verification publication and default reset publication
  arrive at a controlled synthetic-only SMTP sink. Confirmation and password reset
  consume those real messages; login succeeds with the replacement password.
  Associations persist through restart and two Edges remain coherent.
- Final `bun run verify`: exit 0 on application commit `5282754b3`.
  Full installation/SMTP/browser/restart acceptance passes again (215 assertions).
  Real Pebble certificate journeys pass on fresh and restarted shared state across
  both TLS entrypoints (18 and 19 assertions respectively).

The final validation log is retained outside tracked source at
`/home/matthias/Documents/Codex/2026-11-21/CmsCore-email-templates-verify-release.log`.
No measured performance campaign or production deployment is claimed.

## Release and recovery constraints

Existing instances need an explicit admitted plan upgrade; startup/reads never
backfill missing templates or account configuration. A missing selected service,
revoked grant or missing exact publication fails visibly without fallback.
Publication is independent of activation; administrators can reselect a previous
compatible version. There is no permanent deletion or implicit history pruning in
V1, and archived templates still consume the bounded retained capacity.
