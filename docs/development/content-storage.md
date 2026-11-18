# Mongo Content reference maintenance

This guide is for operators and adapter developers. Agent-facing Content
documentation is maintained separately under `packages/features/content/docs/`.

Existing Bloc catalogues need an explicit upgrade to the reverse-reference
projection before this Content adapter can open them. Startup never backfills
authored records. The operator command is available from the workspace root:

```bash
bun run content-storage status --uri-file /run/secrets/mongo-uri --database instance_db
```

The regular secret file contains the complete Mongo URI (maximum 4 KiB). The
database is mandatory and is never inferred from the URI. Add `--prefix literal_`
to all commands when Content uses a collection prefix. Connection strings are
not command arguments or command output. The operator account needs access to
the instance collections and permission to inspect active operations using
`$currentOp` with `allUsers: true`; insufficient permissions refuse maintenance.

## Upgrade a populated instance

Back up the database. Stop **all** instance writers, including Provider processes,
background workers and operator scripts. Wait for their Mongo commands to settle.
The command also checks active Mongo operations, but this check cannot prevent an
independent process from starting later; `--writers-stopped` acknowledges this
operator responsibility. Keep writers stopped throughout maintenance.

```bash
bun run content-storage upgrade-references --uri-file /run/secrets/mongo-uri --database instance_db --writers-stopped
```

The upgrade streams one record at a time, computes only `contentReferences`, and
preserves all authored data and revisions. It records a durable cursor in
`content_metadata` and checks the entire projection before publishing readiness.
Malformed source refuses rather than inventing missing fields. If interrupted,
inspect the error, correct the reported source when necessary, then rerun the
same command. A maintenance lease may need up to 30 seconds to expire after a
crash. A partial upgrade remains unavailable to startup. Repeating a completed
upgrade verifies the projection without rewriting business records.

Only after successful completion, restart the Provider. Normal initialization
creates the reverse-reference index. Test opening, saving and publishing a draft
before restoring ordinary traffic.

## Recover an uncertain reference write

An acknowledged pre-send failure releases the lock. A sent command whose result
is unknown retains the committing fence. A Page insert can reconcile its own
exact persisted result and release that uncertainty automatically. Expiry alone
never authorizes another writer to cross an uncertain commit.

Stop all writers and wait for commands to settle as above. Run `status`, inspect
the affected operation, and copy the exact `fence.token`. Then run:

```bash
bun run content-storage recover-references --uri-file /run/secrets/mongo-uri --database instance_db --site-id default --expected-token inspected_token --writers-stopped
```

Recovery requires a ready projection format. It claims the inspected fence under
a new token, verifies all stored projections and published Bloc references,
including installed collection resources resolved for the explicit site, then
removes only its own fence. Drafts may retain unresolved future dependencies.
Pages, including drafts, must reference available publications.

The shipped Provider uses installation scope `default` within each instance
database. Custom composition roots must supply their actual scope as `--site-id`.

A changed token refuses without releasing its owner. An audit failure retains
the new fence and reports its token: repair the reported inconsistency, inspect
`status` again and retry with that token. Do not blindly delete the lock document.
This command audits the reference graph; it does not roll back business writes
or replace ordinary Page route-journal recovery during startup.

## Adapter composition

Reference writes require a `MongoClient` constructed with
`{ monitorCommands: true }`. The adapter correlates each actual business command
with a unique technical comment to distinguish pre-send errors from uncertain
results, including retries. It does not infer that distinction from an exception
class. The Provider runtime supplies this option. Custom composition roots must
supply it too; otherwise a reference write refuses before mutation.

The public operator APIs are exported from
`@bernouy/content/mongo/maintenance`. They require `writersStopped: true` and an
explicit token for fence recovery. They never run implicitly during startup.

## Reference-write implementation

Reference-producing writes and deletion share an instance-scoped lease.
Reference validation occurs inside it; pure snapshot validation occurs before
acquisition. Metadata-only Page changes and archive/restore do not acquire this
lease. Nested reference/publication operations refuse rather than deadlocking.
Acquisition has a five-second deadline with exponential polling capped at 250 ms.

Mongo Page and Bloc deletion queries use compound reverse-reference indexes,
bounded ID projections and a one-second deadline per query. Bloc
`contentReferences` values are derived from dependencies and the canonical
inline-reference scanner when records are stored, avoiding HTML scans during
deletion. Missing format evidence refuses without implicit projection backfills.

The lease enters non-stealable committing immediately before a Mongo mutation.
Read-only failures release it. A sent write with an indeterminate result retains
the fence until exact outcome reconciliation or explicit offline recovery.
Catalogue and rendering revisions include the composition definition identity,
so recreating a published tag changes those revisions even if its numeric
published revision starts at one again.
