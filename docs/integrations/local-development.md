# Local integration development

`ulvia dev` runs a real persistent CMS development environment. It is intended
for testing integration behavior that mocks cannot prove: PostgreSQL
migrations, RLS, Auth, Storage, Edge Functions, MongoDB content, source
bindings, page rendering, restart recovery, and upgrades.

## Persistent state

Ulvia stores application data under `$XDG_DATA_HOME/ulvia` or
`~/.local/share/ulvia`. `ULVIA_DATA_DIR` can select another absolute directory.
The directory is not a cache and should not be committed.

```text
ulvia/
├── repository/       immutable locally pulled and released packages
└── dev/
    ├── cms-files/    CMS-managed local files
    ├── mongo/        persistent CMS content and installation state
    └── supabase/     persistent PostgreSQL, Auth, Storage, and functions state
```

No repository HTTP server is required as a separate command. While `ulvia dev`
is running, it exposes the persistent local repository to its CMS through an
internal loopback bridge.

The repository contains only coordinates explicitly pulled or released on
this machine. It is not a checkout mirror and it does not fetch a missing
package during an install. Pull remote history deliberately; release current
source deliberately.

## Workflow

Audit from a fresh isolated data directory, store the verified packages in its
local repository, then start the persistent stack:

```bash
export ULVIA_DATA_DIR=/tmp/ulvia-my-change
bun run ulvia -- audit --all
bun run ulvia -- release --all
bun run ulvia -- dev
```

`audit --all` proves the candidates without storing them. For each coordinate
not already stored with identical bytes, `release --all` runs the same gate and
writes it in dependency order. Identical local coordinates are no-ops. `dev`
consumes those exact local packages; it does not need a repository server or
fetch a missing coordinate remotely.

Use another terminal to inspect it:

```bash
bun run ulvia -- dev status
bun run ulvia -- dev credentials
```

Control is served at `http://127.0.0.1:5100` and Delivery at
`http://127.0.0.1:5101`. Install `ulvia@1.0.0` as the theme-only contract, then
install `mossa@1.0.0` with the smallest useful resource selection. Ulvia has no
resource selection or bloc catalogue. Confirm that a source-free Mossa
selection installs no source, then activate a source-backed Mossa resource and
confirm that only its transitive resource and source dependency closure is
added.

Open Sources to configure an installed provider's Connection settings. Select
vault references and published pages through the generic fields, then Save.
Save performs application and runtime synchronization; use Health to inspect
readiness, freshness, and any declared recovery action. Installation success
alone does not mean provider credentials have been configured.

The complete current source set is `commerce`, `user-account`, `consent`,
`forms`, `newsletter`, `emailer`, `stripe-connect`, `mondial-relay`,
`commerce-negotiation`, `commerce-stripe-payments`,
`commerce-mondial-relay-delivery`, and
`commerce-mondial-relay-fulfillment`. `forms` is exercised as a data source;
there is no `forms-renderer` bloc.

For concurrent worktrees, override the five listeners independently with
`ULVIA_DEV_CONTROL_PORT`, `ULVIA_DEV_DELIVERY_PORT`,
`ULVIA_DEV_REPOSITORY_PORT`, `ULVIA_DEV_SUPABASE_MANAGEMENT_PORT`, and
`ULVIA_DEV_MONGO_PORT`. The CLI rejects duplicate and out-of-range ports.

A meaningful local acceptance pass should:

1. install a selected collection and inspect the authoring catalogue;
2. create real business data through a CMS Source endpoint;
3. create and publish a page containing several active blocs;
4. load the page through Delivery and exercise its source-bound behavior;
5. restart `ulvia dev` against the same data directory;
6. prove the page, selection, installations, and business data survived;
7. upgrade a source and prove its saved settings, selected secret references,
   applied runtime values, data, and observable endpoints still work;
8. upgrade a collection and prove old selections remain exact and new
   resources remain inactive.

For a complete site reconstruction, also use the
[site acceptance guide](./site-acceptance.md). The downstream site repository
owns its seed, branding, pages, business scenarios, and desktop/mobile visual
checks. CmsCore intentionally contains no customer-site fixture.

Stop the persistent infrastructure explicitly when it is no longer needed:

```bash
bun run ulvia -- dev stop
```

Stopping the foreground `ulvia dev` process stops the CMS and its loopback
bridges, but deliberately leaves MongoDB and Supabase available for a restart.
`dev stop` stops those persistent services without deleting their data.

## Audit versus development

`ulvia audit` creates disposable MongoDB and Supabase environments for every
fresh-install and upgrade scenario. It is deterministic and is the release
gate. `ulvia dev` is a persistent site used for integrated product behavior and
manual or automated acceptance checks. Both use the same CMS runtime and local
package format, but their state lifecycles are intentionally different.

Neither command accepts a `--from` version. The audit derives applicable older
versions from the immutable coordinates already present in the local
repository. Use a separate `ULVIA_DATA_DIR` when a clean site or an isolated
history is required.

Neither command needs production Supabase credentials. The local runtime
creates its own keys and keeps service credentials inside its composition
boundary. Docker and the Supabase CLI runtime must be available.

This local-first loop intentionally stops before `ulvia push`. It is not
evidence that a remote verifier, remote repository deployment, or production
consumer has been exercised.
