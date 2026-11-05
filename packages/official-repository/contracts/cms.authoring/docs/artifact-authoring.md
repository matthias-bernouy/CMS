# Author contracts and Provider manifests

Use this workflow to prepare, publish and retrieve editable contract or Provider
manifest sources through CMS Authoring. Publication, installation and deployment
are separate actions. A Provider manifest describes an implementation; it does
not contain or deploy its server code.

## Prepare sources

Use a complete source snapshot with files: [{path, content}] and optional exact
fixture asset references. Each content is a string. Follow
[contract sources](contract-source.md) or [Provider manifest sources](provider-manifest-source.md).
Use prepare-contract or prepare-provider-manifest. Preparation writes only a
private, instance-scoped temporary workspace; it does not import dependencies
into the CMS, install resources or publish anything.

Contract compilation assembles capability fragments, mocks, documentation and
fixture bytes using the same compiler as the CLI. A specialized contract must
resolve its exact parent lineage. Provider manifests must resolve their exact
implemented contracts, capability requirements and delegation claims.

Dependencies already available in the host catalogue can be used directly.
The configured Repository can supply missing public contracts. Provider
requirements are checked against its current published catalogue when connected.
These read-only lookups use at most 64 contract releases, 64 catalogue queries,
128 HTTP requests, four requests in flight and 8 MiB of response metadata per
preparation. A version listing must fit one bounded page of 64 releases.
Unavailable dependency transport returns CORE_UNAVAILABLE, rather than claiming
that the source is invalid.

Inspect valid and every diagnostic. valid: false has no publishable preparation.
A successful result identifies a preparationId, digest, sourceDigest, publisher,
resource ID and version. Preparation validates the current sources and references;
the receiving Repository still checks authoritative publication history,
namespace ownership, current references and immutable release bytes at commit.

## Publish the exact candidate

Read get-connection and the live namespace inventory. Configure the Repository
account PAT through configure-connection when needed. Source preparation alone
does not grant namespace ownership or permission to publish.

Use publish-contract or publish-provider-manifest with the exact preparationId
and expectedDigest. A preparation of another kind, instance or Repository,
an expired preparation, changed sources or changed fixture bytes is refused.
Private sources are retained after the immutable release is published. Changed
published content requires a new permitted version; an existing release cannot
be overwritten.

A retryable error can return publicationState: sources-pending or unknown,
together with the exact preparationId and digest. sources-pending means that the
release is published and private source retention needs completion. Restore
access, then retry the same capability, preparation and digest. Do not prepare
changed content or select a new version just to retry. Repository receipts make
an exact retry idempotent; a local receipt permits source completion without
recompilation or another artifact upload. Namespace ownership is checked again.
A non-retryable source refusal can retain the same published-state fields.

## Retrieve and edit

Use get-contract-sources or get-provider-manifest-sources with namespace, the
full namespaced resource ID and its version. The configured account must still
own the namespace. A null result means that no retained source snapshot was
returned, even if a public compiled release exists.

Preserve immutable fixture references when preparing the next version. Contract
fixture references retain the exact published contract, release digest and asset
ID instead of depending on another site's private file generation.

All preparations share the existing limit of 64 unexpired workspaces and expire
after seven days. discard-preparation removes one unpublished preparation. This
ephemeral storage is not a permanent editing repository; retained published
sources are the durable editing source.

## Verify and finish

Read the published release and sources back and compare their exact digest with
the preparation. Verify dependent publications separately. Report whether the
resource is prepared, published, installed or deployed, and preserve the user's
publication boundary. No authoring action implicitly changes site selections,
starts a Provider or expands execution grants.
