# Initialize ordinary site resources

Use `initialization.entry` for the minimal public pending flag. Only the trusted
instance scope is read; no accounts, review payloads or receipt data are exposed.
Missing mandatory initialization state refuses without provisioning or repair.

A current site administrator calls `initialization.plan` with `choice` set to
`empty` or `base`, and a canonical locale. `base` refers only to the host's local
configured ZIP. There is no repository search, installable resource release,
version selection, upgrade or uninstall workflow.

The plan returns `planDigest` and `reviewJson`. Review the exact resource counts,
Page paths, publication visibility and content hashes, selected capability requirements, theme hash and
browser authority. Planning validates the disposable candidate without live writes.

Call `initialization.apply` with the unchanged `reviewJson` and a fresh idempotency
key. For browser authority requiring acknowledgement, send the exact
`browserRiskDigest` as `browserRiskAcknowledgement`; otherwise use null. The default
executor is a durable operation: the host owns its queue, receipts, worker lease,
maintenance fence, archive retention and recovery. Authorization precedes receipt
access and is repeated in recovered execution. Replays by revoked administrators
are refused even when an operation previously completed.

Poll `initialization.status`. It returns bounded progress, the exact retained review
needed for a retry, and the latest operation status. A retry uses the same review
and acknowledgement. Changed execution, conflicting entities and missing completed
resources refuse without replacing or repairing the site. Unexpected failures keep
technical causes private.

Completed resources are ordinary persisted Blocs, assets, texts, theme settings
and Pages. Rendering and completed replay require neither the source ZIP nor a
preparation worker. Public asset delivery and the native setup UI are separate host
integrations; availability of an admitted contract alone does not prove they are
mounted or selected.
