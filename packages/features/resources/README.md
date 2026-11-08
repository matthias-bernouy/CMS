# @bernouy/resources

Validates one-time resource ZIPs containing `resources.json` and declared `assets/`
files. The format contains ordinary compiled Content Blocs, theme settings, static
text catalogues, Page seeds and asset metadata. It has no installed release identity,
version, dependency graph, update or uninstall lifecycle.

`writeResourceArchive` creates a deterministic ZIP and verifies it before returning.
`readResourceArchive` requires the SHA-256 of the exact expected archive and verifies
paths, counts, bytes, CRC32, strict JSON, Content artifacts and each asset's hash/media
signature. Both APIs perform no Content writes and execute no browser artifact.

Archive verification is not authorization to import. The host must separately review
browser authority, validate the complete candidate against current selected execution,
authorize the actor and scope, and own durable fenced application and crash recovery.
No runtime import or setup endpoint is mounted by this package yet.

`./storage` exposes ordinary resource asset/text services and the Content text read
adapter. `./memory` and `./mongo` expose explicitly composed metadata adapters; hosts
supply their Blob store and instance/site scope. Asset bytes are immutable and exact
retries refuse inconsistent metadata or missing stored data. Text defaults and site
overrides use verified content revisions and atomic compare-and-replace writes.

Default text sources are bounded to 256 KiB, each stored source plus overrides to
512 KiB, and snapshots to 32 namespaces. Mongo snapshots query at most 33 records
to detect an exceeded namespace budget; batched asset lookups load only requested
metadata. These stores do not mount an import endpoint or provide import authority.
