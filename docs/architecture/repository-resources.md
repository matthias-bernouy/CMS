# Repository Resource Identities And Release Channels

Contracts, Provider manifests and collections use complete `namespace/name`
identities. `contractId`, `providerId`, `collectionId` and a Repository resource
reference's `id` contain that complete identity. `publisherId` must equal its
namespace. Transferring a namespace changes its account owner, not the stored
identity of its releases.

`ulvia/primary-provider` and `other/primary-provider` are independent Providers.
Exact versions, digests, yanks, selections, invocation routes and identity aliases
retain the namespace. Authored folders and filesystem storage use the local
name below the publisher directory; a slash identity is never a relative path.
The CLI prints and accepts `example/ui@1.0.0`, with the namespace once.

## Official Names

| Resource | Identity |
| --- | --- |
| Provider manifest | `ulvia/primary-provider` |
| CMS contracts | `ulvia/cms.content`, `ulvia/cms.access`, `ulvia/cms.files`, etc. |
| Connection contracts | `ulvia/provider.connections`, `ulvia/provider.cms-instances` |
| Repository contract | `ulvia/repository` |

The resource kind is part of a Repository coordinate. A contract and a collection
can share an identity. No official collection is bundled with the workspace.

Collection names remain nonreserved kebab-case. HTML/CSS identifiers use
`resourceRuntimeNamespace(collectionId)` and a `--` member separator:
`example--ui--card`, `example--ui--accent` and `example--ui--selection`.
The shared helper escapes publisher punctuation so different namespaces cannot
produce the same prefix. Text and asset expressions keep canonical ownership,
for example `{{ cms.i18n.example/ui.submit }}` and
`{{ cms.asset.example/ui.icons/check.svg }}`. Local translation and text IDs
remain local IDs.

Native calls use `/.cms/call/ulvia/cms.content/<binding-path>`; logical calls use
`/.cms/query/ulvia/cms.content/pages.list` or the corresponding mutation route.
Resource identities used as one binding parameter are URI-component encoded,
for example `ulvia%2Fcms.content`. Authored MCP names are also scoped by complete
contract identity and binding ID; clients must discover the emitted tool name.

## Stable And Beta

The channel derives from canonical SemVer. `1.0.0` is stable;
`1.1.0-beta.1` is beta. The beta filter also includes `alpha`, `rc` and any other
SemVer prerelease. There is no mutable `beta` flag, namespace suffix, separate
collection identity or floating release pointer.

- Repository search defaults to `channel: "stable"`; `"beta"` and `"all"` are
  explicit alternatives. The latest stable and latest prerelease are retained
  independently, so a newer beta cannot hide stable discovery.
- Historical catalogue listing defaults to all releases and accepts the same
  channel filters. Filters participate in pagination cursor identity.
- Available collection installation discovery defaults to stable. Its channel
  input permits prereleases explicitly and returns release-channel metadata.
- Exact downloads, installed releases, Provider approvals and contract selections
  retain their exact versions and digests. A new beta never upgrades a site.

Promotion publishes a new stable SemVer release through ordinary admission;
`1.1.0-beta.2` remains immutable when `1.1.0` is published. Stable maintenance is
not blocked by a newer prerelease. Preview versions must increase within their
release target; a prerelease cannot be added behind that target's stable release.
Existing stable-line compatibility and resource-identity guarantees still apply.
New preview-only capabilities or collection members may evolve before they are
stabilized, but preview status cannot weaken an already stable identity.
Provider manifest comparisons describe claims and do not promise behavioral
compatibility; changed exact manifests still require explicit approval.

## Baseline And Remaining Work

This is a fresh catalogue and instance baseline. Old unqualified IDs, old
publisher names and previous persisted state are rejected; no aliases or silent
backfills are provided. Deployments need fresh state and exact artifacts built
from this baseline. This source change does not publish or deploy those releases.

Official contracts and the Provider manifest are generated from SDK features;
`infra/releases/ulvia.release.ts` is the trusted local build entry. The offline
bootstrap contains system API artifacts only. Application profile IDs are `ulvia`
and `repository`; profiles are not a fourth Repository resource type. Collections
remain ordinary authored, published and installed Repository resources.
