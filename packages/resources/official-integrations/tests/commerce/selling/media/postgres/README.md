# Commerce media PostgreSQL contract

This contract is destructive and must target a disposable PostgreSQL database.
It installs the complete Commerce 1.0.0 SQL bundle, replays it, simulates an
existing pre-change media schema with historical rows, upgrades it, and replays
the bundle again.

Run only this contract from the repository root:

```bash
ALLOW_POSTGRES_CONTRACT_SCHEMA_RESET=cmscore-postgres-contracts \
DATABASE_URL=postgres://postgres:...@127.0.0.1/cmscore_contracts \
  bun run packages/resources/official-integrations/tests/helpers/runPostgresContracts.ts \
  --filter commerce-media
```

The runner rejects remote hosts and databases whose name does not start with
`cmscore_contracts`, in addition to requiring the exact reset confirmation
above. These checks are mandatory because the contract drops the Commerce
schema.

The command verifies intrinsic dimensions, the one-time historical backfill,
immutable Storage identity, retained detached metadata, non-destructive
replace/remove responses, download denial, RLS, and grants. It then runs two
executable rollout proofs:

- the exact Commerce Edge tree from commit `fa3b7472` executes product and offer
  replacement and removal against the current SQL bundle;
- an existing Commerce installation goes through the real rerun lifecycle and
  real Supabase connector deployer, proving that the current SQL is submitted
  before the current Edge Function.

The legacy test uses a real disposable PostgreSQL database and the real Edge
handler. It emulates only the PostgREST transport that invokes those database
functions and the Storage HTTP transport. Its Storage object set and the
database are both inspected after every operation, so a legacy
`removeReturnedObject` call would make the test fail.

The rerun test emulates the Supabase Management API because it must not deploy a
connector remotely. Definition loading, installation persistence, forced rerun,
SQL assembly, function bundling, and deployment ordering are production code.
It does not prove remote Management API availability or a live Supabase rollout.
The dedicated PostgreSQL CI job retains Git history (`fetch-depth: 0`) so the
pinned legacy artifact can be extracted rather than approximated by a copied
fixture.

## Existing installations

Changing files inside Commerce 1.0.0 does not itself reconcile an already
installed connector. After deploying the updated repository, explicitly rerun
the tracked Commerce installation from Control or call:

```text
POST /api/integrations/installations/rerun?id=<installation-id>
```

The rerun must finish before the new Edge Function is considered active. SQL is
applied before the function artifact, so legacy attach signatures remain
callable and replace/remove results expose no retained Storage coordinates that
the previous Edge Function could delete.

This compatibility is deliberately narrow. The previous function still reads a
product media row without checking `detached_at`, parses uploads before target
authorization, and cannot distinguish an attach rejection from an ambiguous
committed response. Minimize the SQL-before-function window and do not use that
artifact as the routine rollback. Roll back CMS image delivery with the two CMS
feature switches while keeping the hardened Commerce Edge Function. Apply a
forward-compatible Edge hotfix if its upload or lifecycle behavior regresses.
