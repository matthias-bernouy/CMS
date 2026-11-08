# Infrastructure Tooling

Run these tools from the workspace root. Infrastructure builds and packages the
runtime applications; executable composition and environment reads stay in
`packages/runtimes/`. No GitHub Actions workflows are configured.

| Path | Responsibility |
| --- | --- |
| `cli/build.ts` | Bundle the private CLI sources into the public `@cyaxis/ulvia` npm archive, verify it and write a SHA-256 receipt. Publication is a separate command. |
| `images/build.ts` | Build, inspect and explicitly publish the separate Edge and Provider images with exact version, component and stack-API labels. |
| `images/edge/` | Stateless Edge Dockerfile and image guide. |
| `images/provider/` | Stateful Provider Dockerfile, SDK system bootstrap and packaged local embedding model. |
| `models/` | Pinned model manifest, bounded downloads and verified build cache; see the [model guide](models/README.md). |
| `releases/ulvia.release.ts` | Trusted local SDK entry generating contracts and the Provider manifest into the CLI release cache; it does not publish. |
| `bootstrap.ts` | Stage the generated system snapshot for the Provider and the matching SDK runtime metadata. No starter collections are bundled. |
| `execution-support.ts` | Generate exact supported contract/version/digest pins from the compiled manifest. Installed catalogue entries alone cannot add executable support. |
| `operations/` | Optional headless-host mitigation script and systemd unit; see [host diagnostics](../docs/development/page-performance.md#cirrus-framebuffer-stalls-on-a-headless-vps). These are not installed by ordinary startup. |

## Commands

```sh
bun run generate:official-bootstrap
bun run release:official
bun run images:build --version <stack-version> all
bun run cli:build --version <cli-version> --stack-version <stack-version>
```

These prepare local artifacts. `images:publish`, `cli:publish` and `ulvia push`
are explicit publication actions with their respective registry credentials.
Image and CLI versions are independent from contracts, manifests and instance
system installations. A local build never updates a running installation.

See [development](../docs/development/README.md) for release commands and checks,
[SDK releases](../docs/development/sdk-releases.md) for generated artifacts and
[installation](../docs/installation/README.md) for operator workflows.
