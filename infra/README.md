# Infrastructure Tooling

Run these tools from the workspace root. Infrastructure builds and packages the
runtime applications; the CLI archive embeds and ships its co-versioned stack
release with exact deployment definitions. Executable composition and environment reads stay in
`packages/runtimes/`. No GitHub Actions workflows are configured.

| Path | Responsibility |
| --- | --- |
| `cli/build.ts` | Bundle the private CLI sources into the public `@cyaxis/ulvia` npm archive, verify it and write a SHA-256 receipt. Publication is a separate command. |
| `images/inspection.ts` | Shared official image references and component/API/version/revision/identity validation for builds and publication. |
| `images/build.ts` | Build and inspect the separate Edge and Provider images with exact version, component and stack-API labels. |
| `images/edge/` | Stateless Edge Dockerfile and image guide. |
| `images/provider/` | Stateful Provider Dockerfile, SDK system bootstrap and packaged local embedding model. |
| `models/` | Pinned model manifest, bounded downloads and verified build cache; see the [model guide](models/README.md). |
| `releases/ulvia.release.ts` | Trusted local SDK entry generating contracts and the Provider manifest into the CLI release cache; it does not publish. |
| `bootstrap.ts` | Stage the generated system snapshot for the Provider and the matching SDK runtime metadata. No starter collections are bundled. |
| `execution-support.ts` | Generate exact supported contract/version/digest pins from the compiled manifest. Installed catalogue entries alone cannot add executable support. |
| `operations/` | Optional headless-host mitigation script and systemd unit; see [host diagnostics](../docs/development/page-performance.md#cirrus-framebuffer-stalls-on-a-headless-vps). These are not installed by ordinary startup. |

## Commands

```sh
bun run build
bun run build --version <version>
bun run publish --version <version>
```

Without `--version`, `build` generates the official bootstrap and runtime metadata,
then compiles the workspace and browser assets. A versioned build also creates
both images and the CLI under one distribution version and seals their identities,
contracts and assets under `artifacts/distributions/<version>/`.

`distribution/` completes the existing CLI receipt with image identities and a
single catalogue fingerprint, then orchestrates publication. The archive and sole
receipt are written directly under the versioned distribution; there is no separate
distribution manifest or duplicated CLI output. `publish` uses only that snapshot.
Its `runtime` phase publishes and verifies the images and exact CLI archive under
a preparation npm tag, without contacting the Ulvia Repository. Its `catalogue`
phase verifies the published runtime, sends declarations through the saved
Repository publisher connection, then promotes the npm release channel. The
default `all` phase runs both. Repeating the same phase with identical artifacts
reconciles partial completion. Publication never compiles sources or discovers
unrelated resources in the personal CLI cache. See [phased publication](../docs/development/publication.md)
for receiver upgrades, credentials, registry checks and concurrency limits.

Contract and Provider manifest versions evolve independently of the distribution.
Neither build nor publish upgrades running installations. The generic trusted
`releases/ulvia.release.ts` entry remains available through `ulvia release` for
explicit manual resource preparation. `workspace.ts` orchestrates `check`, `test`,
`verify`, the separate measured `perf` command and the source CLI, preparing
each prerequisite once. `perf --list` validates and lists exact scenario IDs
without building images; repeated `--scenario <id>` flags select a measured subset.

See [development](../docs/development/README.md) for release commands and checks,
[SDK releases](../docs/development/sdk-releases.md) for generated artifacts and
[installation](../docs/installation/README.md) for operator workflows.
