# CMS authoring

Prepare, validate and publish immutable collection, contract and Provider manifest releases through a configured Repository. This contract does not host the registry or deploy Provider implementations.

## Connect an account

Create a personal access token in the target Repository account area. An ordinary Repository account can own namespaces and publish; it does not need CMS administrator privileges. Managing this CMS instance's authoring connection remains an administrator operation.

Call `configure-connection` with the PAT. The runtime controls the target origin. It verifies the Repository identity and authenticated namespace inventory before atomically storing the connection in the encrypted authoring secret namespace. A refused configuration preserves the previous connection. The plaintext token is never returned by this contract.

`get-connection` returns only the configured origin, Repository identity and configuration status. A configured connection may later become invalid if its token expires or is revoked. Every protected remote request checks the pinned identity before resolving its PAT and refuses redirects. A changed Repository identity requires an explicit disconnect before reconnecting.

`disconnect-connection` removes the local credential. It does not revoke the remote PAT; revoke it through the Repository account area when required.

## Namespaces and publication

- `list-namespaces` reads the remote account inventory, bounded to 32 names. Follow `nextCursor`. Transferred names disappear from this account's inventory; suspended names remain reserved and cannot publish.
- `claim-namespace` claims an available name for the authenticated Repository account.
- `prepare-collection` validates and builds a complete collection source snapshot. Preparation does not require publication credentials.
- `publish-collection-operation` submits durable publication of the exact prepared digest. Follow `get-publication-operation`; the Repository compiles and retains verified sources before exposing the release. It does not install the release. The synchronous `publish-collection` keeps its existing response shape.
- `get-collection-sources` reads the private source snapshot for a namespace currently owned by the configured Repository account.
- `prepare-contract`, `publish-contract` and `get-contract-sources` provide the equivalent contract workflow, including versioned Markdown documentation and fixture assets.
- `prepare-provider-manifest`, `publish-provider-manifest` and `get-provider-manifest-sources` provide manifest authoring against exact contract pins.
- `discard-preparation` removes an unpublished local preparation of any supported kind; published releases remain intact.

Read [artifact authoring](artifact-authoring.md), [contract sources](contract-source.md) and [Provider manifest sources](provider-manifest-source.md) before these workflows.

Durable collection publication checks the current local administrator grant before queueing and again in recovered workers.

The remote Repository checks account ownership and namespace revision for every protected upload stage. Namespace transfer, token expiration or token revocation can prevent an in-progress publication from completing. Reconnecting to another account does not transfer ownership or resume another account's upload.

## Errors and verification

Discover the selected capability schemas before calling tools. Documentation does not grant execution rights. Branch on declared error codes rather than translated messages. A transport failure can leave a mutation outcome unknown; inspect remote state before repeating it.

Read back the published release and its digest. Verify installation separately when the workflow also requires using the release on this site. Report any checks that could not be performed.


Use `get-source-snapshot` through its HTTP or MCP binding with `kind`,
`namespace`, `id` and `version` for private sources up to 8 MiB. The kind is
`collection`, `contract` or `provider-manifest`; administrator and connected
Repository account checks still apply. Existing kind-specific source getters
retain their 1,048,576 UTF-16-unit output bounds and refuse larger snapshots.
