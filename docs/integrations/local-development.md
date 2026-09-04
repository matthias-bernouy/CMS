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

Release current packages into the local repository, then start the stack:

```bash
bun run ulvia -- release --all
bun run ulvia -- dev
```

Use another terminal to inspect it:

```bash
bun run ulvia -- dev status
bun run ulvia -- dev credentials
```

Control is served at `http://127.0.0.1:5100` and Delivery at
`http://127.0.0.1:5101`. Install the Ulvia collection with the smallest useful
resource selection. Confirm that a source-free selection installs no source,
then activate a source-backed resource and confirm that only its dependency
closure is added.

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
7. upgrade a source and prove its data and observable endpoint still work;
8. upgrade a collection and prove old selections remain exact and new
   resources remain inactive.

For a complete site reconstruction, also use the
[site acceptance guide](./site-acceptance.md). It covers the boundary between a
collection and site-owned branding, fictional marketplace data, safe provider
simulation, and desktop/mobile screenshot comparisons.

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
