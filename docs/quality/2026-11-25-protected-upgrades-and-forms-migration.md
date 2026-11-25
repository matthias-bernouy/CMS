# Protected upgrades and Forms migration — 2026-11-25

This report covers the explicit Forms 1.x → 2.0 operator migration, complete local
installation backups, resumable restoration and automatic upgrade orchestration.
All executed mutations used disposable test installations or isolated MongoDB.
No user installation was migrated and no remote release was published.

## Implemented behavior

`ulvia upgrade` acquires the root and local Repository native leases, records a
private durable journal, stops writers, captures/verifies a cold checkpoint, runs
the target image's known maintenance recipe, checks the paused Provider and Edges,
records the activation boundary and releases business work before opening proxy
traffic. A failure before activation restores data and exact saved deployment.
At/after activation, recovery resumes the recorded target without recopying data.

Independent `backup create`, `backup verify` and `backup restore --yes` operate on
Mongo files, CMS files, keys, credentials, certificates, local catalogue and exact
Compose/image state together. Restore retries preserve native lock inodes and do
not recopy data after the restored runtime may have accepted new writes. A verified
backup remains usable when live deployment metadata was partially removed.

The Forms recipe recognizes only exact archived 1.0.0/1.1.0 pins. It preserves
forms, publications, answers and receipt/replay identities; exports draft and
publication email settings; refuses unresolved email outcomes; and never
synthesizes historical 1.0 submission Events. It upgrades native approvals,
observations, selections and retained plans through the existing domain stores.
Active transitions and incompatible consumers block the plan.

Forms 2 operations with changed schemas/error sets use new `*-v2` capability IDs
and versioned HTTP paths. Dynamic-schema protocols and the submission Event keep
their compatible identities. A catalogue-only 1.2.0 retirement release supplies
historical lifecycle evidence before ordinary Forms 2 publication. It is never
selected or mounted as an executor. Normal catalogue admission remains strict.
Current authored callers and SDK-generated artifacts use the corrected IDs.

Foreign Provider installations/selections stay independent. Old foreign Forms
Workflow targets do not block the native migration. Native action denials move to
their exact replacement IDs rather than reopening previously forbidden actions.
Denials for completely removed operations disappear with those operations.

## Reproducible evidence

- Initial `bun run check` in the task worktree: ten checks passed before edits.
- [Conversion tests](../../packages/features/forms/tests/migration/conversion.test.ts)
  and [standalone Mongo migration](../../packages/features/forms/tests/migration/mongo.test.ts):
  both legacy formats, lossless retained data, export and refusal before writes.
- [Native metadata migration](../../packages/runtimes/ulvia-provider-server/tests/provider-contracts/native/bootstrap/migrations/forms.mongo.test.ts):
  ordinary current execution/retention accepts migrated approvals, exact plans and
  selections; source-plan changes, unfinished transitions and native Workflow
  consumers refuse; foreign selections and replacement denials remain effective.
- [CLI maintenance tests](../../packages/runtimes/ulvia-cli/tests/stack/maintenance/commands.test.ts)
  and [deployment tests](../../packages/runtimes/ulvia-cli/tests/stack/deployment/workflow.test.ts):
  two release versions, preactivation rollback, postactivation resume, unchanged
  live state on corrupt backups, normalized destinations, damaged live launch
  metadata and interrupted restore/opening recovery.
- [Tree worker tests](../../packages/runtimes/ulvia-cli/tests/stack/maintenance/tree.test.ts):
  streaming capture, source/link/path refusals, integrity refusal before deletion
  and lock inode retention.
- [Bundled CLI test](../../packages/runtimes/ulvia-cli/tests/stack/deployment/frozen-start.test.ts):
  a newer fully bundled CLI creates/verifies a backup using old frozen deployment
  artifacts; the serialized worker executes without ambient module bindings.
- [Maintenance gate](../../packages/runtimes/ulvia-provider-server/tests/provider-contracts/native/bootstrap/migrations/maintenance.test.ts):
  HTTP business requests and recovery remain blocked until release; cancellation
  leaves startup recovery stopped.
- [Native hosting journey](../../packages/runtimes/ulvia-cli/tests/stack/edge-smoke.browser.test.ts):
  actual Docker cold capture/verification, a protected target reconciliation using
  the same exact candidate images, activation, complete restoration, persisted
  Page/account-template reads and a subsequent two-Edge deployment. The first
  native run passed with 223 assertions. Distinct-version failure injection is
  tested separately through CLI subprocesses and the Docker peer fixture.
- Native Forms/Event/Workflow/SMTP journey: 231 assertions passed after capability
  renaming. Native Access/security-email/business-workflow journey: 165 assertions
  passed. Real HTTPS/Pebble certificate permission and restart journeys passed.

The complete verification command includes these Mongo, browser, Docker and TLS
stages through `infra/workspace.ts`. Focused regression checks also covered the
reviewed new Forms digest, changed upgrade failure expectations and portable
source archive integrity. A real performance measurement campaign was not run.

## Final verification

`bun run verify` completed with exit code 0 on implementation commit `b579f8bb7`,
rebased onto `3ad355e3e`, in the original task worktree on 2026-11-25. The retained
operator log is `artifacts/forms-migration-verify-final.log` in that worktree.

| Stage | Result |
| --- | --- |
| Static checks | 10 passed, including architecture, typecheck, style and dead code |
| General test suite | 4,688 passed, 160 gated/skipped, zero failures across 1,271 files |
| Dedicated collection browser tests | 4 passed |
| Dedicated capture/browser tests | 11 passed |
| Content/observability/email-template integration | 18 passed |
| Access/Forms/Events/Workflow standalone Mongo | 39 passed, including migration and replacement-denial cases |
| Native Access, Forms and complete hosting/backup journeys | All three passed |
| Real HTTPS/ACME permission and certificate restart | Both passed |
| Static performance inventory/harness | 314 executors, 2,343 scenarios, no missing definitions or budgets |

The gated tests above are not claimed as executed by the general stage; dedicated
stages explicitly opt into their supported Mongo/browser/native journeys. Native
Forms completed with 195 assertions in this final run. Earlier assertion counts
in this report describe the recorded first native run, not a deterministic budget.

## Boundaries and review notes

Backup/restore authority is local operator filesystem/Docker access, not a tenant
capability. Receipts validate private bounded snapshots before destructive work;
worker failures sanitize business data from CLI diagnostics. Helpers have no
network and retain only required filesystem capabilities. No new remote transport
or administrator bypass is introduced.

Normal HTTP dispatch adds one cached gate read and URL-path parse, with no Mongo
or filesystem read per request. The process probes its marker every 100 ms.
Migration cursor batches are 25 documents, with 64 KiB form and 256 KiB submission
bounds; instance metadata streams in batches of 50. Copy hashing uses one 1 MiB
buffer, one file at a time. Inventory is bounded to 50,000 entries, 64 MiB manifest
and 1 TiB per file. Large-installation downtime/throughput was not measured.

The serialized tree worker remains one cohesive function above the file-size
review threshold: splitting it across module closures would invalidate subprocess
serialization. Provider startup wiring remains in its existing composition root.
Directory-fanout errors must remain zero; informational eight-entry directories
are reviewed without mechanical regrouping.

Snapshots are private plaintext and currently restore to the same absolute data
path. Exact old image digests must be cached or retrievable; Docker image archives
are not exported. No automatic checkpoint pruning or external-service rollback
is implemented. Emails/external effects cannot be undone. Legacy email settings
require explicit Workflow configuration after migration. Full historical binary
rollout and actual machine power loss were not replayed; source conversion and
metadata recovery use standalone Mongo, while the native deployment journey uses
current candidate images and separate failure-injection tests.
