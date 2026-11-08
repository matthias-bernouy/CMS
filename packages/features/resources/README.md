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
