# Upgrade preflight regressions, 2026-11-25

## Observed failures

An existing CLI-managed 1.0.22 installation refused the 1.0.23 maintenance plan
with `MAINTENANCE_PREFLIGHT_FAILED`. No upgrade apply was requested during the
investigation. The applied stack file remained unchanged and services stayed on
1.0.22.

The first underlying error was `resolution_failed` while validating an older
Provider manifest. That manifest still declared `ulvia/repository@1.3.0`, although
the instance did not select Registry and the target image offered Registry 1.4.0.
The migration preview reconstructed only the source execution and selected
contracts. Revalidating the entire old manifest then failed on its omitted claim.

After correcting that catalogue closure, consumer inspection exposed another
error: `Invalid native root "strong" for site bloc "strong"`. The source serializer
incorrectly applied component carrier-root restrictions to already validated
native rich-text nodes.

## Changes

The migration preview loads every exact implementation referenced by the approved
source manifest, plus the previously loaded selections and their ancestors.
It continues to verify exact digests, lifecycle rules and mandatory dependencies.
Loading metadata does not select Registry or grant additional executable support.
Missing source manifests/releases now have explicit `FORMS_MIGRATION_*` refusals.

The serializer checks the carrier-root allowlist only for component Bloc nodes.
Native nodes still pass the existing native tag, attribute, parent/context and
void-child validation. Dynamic expressions and unsafe attributes remain refused.
No HTML allowlist, escaping rule, binding permission or persisted data is changed.

## Regression evidence

- The Mongo migration fixture now uses the exact archived Registry 1.3.0 release
  as an unselected old-manifest claim. Its two documentation fixtures are checked
  against the archived release's declared hashes when admitting the bundle.
- Before the preview fix, two of the three migration tests failed with the same
  manifest resolution error as the deployed planner.
- With the fix, both historical Forms 1.0.0 and 1.1.0 migrate into executable Forms
  2 metadata. The tests retain foreign selections, translated denied capability
  grants, old workflow consumer refusals and unfinished-transition refusals.
  Registry remains unselected after migration.
- Before the serializer fix, creating a site Bloc containing native `strong`,
  `em` and `code` failed. Afterward it creates and publishes the expected markup.
  Tests still refuse a component using `strong` as its carrier root and a native
  `strong` outside its allowed rich-text context.
- The final focused Content/Repository run passed 55 tests with 153 assertions,
  including native markup policy, document reuse and collection upgrade usage.

## Read-only deployment diagnostic

The exact published Provider 1.0.23 image was run as an ephemeral Compose worker
with the two candidate source files mounted read-only. Only `plan` was invoked;
no migration apply, notification retry, notification deletion or installed-image
replacement was performed. The applied stack file retained its original bytes.

The corrected plan advanced to `FORMS_EMAIL_UNRESOLVED`. A separate projected
read found unresolved notification state. This is the previously specified
business refusal, not a condition to bypass: uncertain or unresolved sends need
an explicit resolution before conversion. The investigation did not change them.

## Impact and limits

This is an offline planner/source-serialization change. It adds bounded metadata
reads for previously omitted source-manifest claims and their ancestors, without
hydrating business payloads for that closure. The serializer change adds no I/O,
cache or authority state. A complete preflight inventory still examines retained
content as required by the existing migration policy.

The published 1.0.23 image remains unchanged. Shipping these fixes requires a new
runtime release. The diagnostic source mounts are not a supported upgrade path
and must not be used to bypass the target-image or backup checks.

Validation started from a clean checkout passing all ten `bun run check` gates.
The final check also passed all ten gates; local report links and `git diff --check` passed.
The final general suite passed 4,768 tests, with 165 gated skips and no failures.
The gated stages subsequently exercised those integrations, including Forms Mongo
migration, Access/Workflow business journeys, maintenance presentation, browser
capture, native shared hosting/backup/restore and TLS acceptance.

The full `bun run verify` invocation exited nonzero solely because its historical
crash journey could not allocate a Docker network: the local default address
pools were exhausted before the old stack could start. The same real historical
journey was rerun successfully with two explicitly allocated, conflict-checked
`10.253.x.0/24` test networks. Only the disposable fixture network preparation was
extended; CLI commands, image/data restoration, API calls and crash assertions
remained real. Its own cleanup removed the owned networks. No unrelated Docker
network was removed and daemon address-pool configuration was not changed.

That retry passed all three crash cases: partial conversion followed by old
binary/data restoration, paused target Provider death followed by rollback, and
CLI death after activation followed by retention of new writes on resume.

Targeted final-source tests also passed: three Forms metadata integration tests
and 55 HTML/collection-upgrade tests (153 assertions). Relevant test sources are
[Forms metadata migration](../../packages/runtimes/ulvia-provider-server/tests/provider-contracts/native/bootstrap/migrations/forms.mongo.test.ts),
[site Bloc publication](../../packages/features/content/tests/blocs/catalogue/siteBlocContracts.test.ts),
and the [historical crash journey](../../packages/runtimes/ulvia-cli/tests/stack/maintenance/upgrade/journey.test.ts).

The preview remains one cohesive 174-line operation. The existing 188-line
serializer remains together; its change adds no lines. No directory-fanout error
was introduced.
