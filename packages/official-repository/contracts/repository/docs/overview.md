# Ulvia Repository

The Repository publishes immutable contract, provider and collection releases. Public catalogue, search, namespace metadata, publication state and downloads require no account.

## Public catalogue

Use `catalogue-list` for bounded pages of public release metadata. Optional `publisherId`, `id` and `version` filters match exact coordinates and apply before pagination. A cursor belongs to its resource kind and filters; changing those values requires starting a new page sequence. Resource details and a namespace's public publications use this same metadata API. Exact immutable downloads remain available through the release and asset capabilities, including after a release is yanked from new catalogue discovery.

## Accounts and namespaces

Register and authenticate through the selected `ulvia/cms.access` contract. Ordinary accounts can manage their own personal access tokens and claim up to 32 namespaces without administrator rights. Protected registry capabilities use the verified account identity; request bodies never select the acting account.

Read `namespace-list` for your own inventory. Public namespace metadata omits internal account identifiers. Claiming an existing namespace does not reassign it. An owner may explicitly transfer it to another existing account, using its current revision. Suspension preserves the reservation, and transferring a suspended namespace does not reactivate publication. Owners must transfer their namespaces before their accounts can be deleted.

## Publication

Read the current namespace revision, then begin a staged publication. The server binds the upload to the authenticated account, namespace and revision. Every asset, status, abort and commit operation checks that binding and current ownership. Transfer or suspension prevents continuation using the old revision. Revoked or expired PATs cannot authenticate subsequent calls.

Stream each declared asset with its exact SHA-256 digest and byte length, then commit. Assets remain private until the immutable registry accepts the complete release. A retry can resume only the same account and ownership revision. Private collection sources require current namespace ownership and are not public download assets.

## Errors

Use declared error codes. `REJECTED` indicates invalid data, unavailable ownership, a stale revision or a quota refusal. Reread current state before retrying. Technical failures use `CORE_UNAVAILABLE`; they do not grant permission to bypass checks. Clients must bind Access PAT credentials to the expected Repository origin and identity and must refuse redirects when sending credentials.
