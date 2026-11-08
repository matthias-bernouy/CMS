# @bernouy/zip

Generic bounded ZIP construction and decoding for in-memory artifacts. There are no
CMS models, filesystem extraction, network operations or catalogue/version semantics.

`writeZip(entries, { limits, signal })` captures source paths and mutable bytes before
asynchronous work, sorts paths and emits stored entries with fixed DOS metadata.
`readZip(bytesOrBlob, { limits, signal })` iterates the central directory lazily and
returns immutable entry Blobs after size and CRC32 verification. Stored and deflated
files are supported; encrypted entries, links and special files are refused.

Both entry and aggregate bytes/counts are bounded, including observed decompressed
bytes. Paths must be relative, NFC-normalized and free of traversal, duplicates,
file/directory collisions and control characters. Empty directories count toward the
entry limit but are omitted from the decoded files. Cancellation destroys the active
stream and closes the reader. Nothing is extracted or executed.

Defaults bound archives and total uncompressed content to 64 MiB, individual files
to 16 MiB, entry count to 2048, path bytes to 1024 and nesting to 32. Hosts must also
bound concurrent requests and retained artifacts, and own authorization and content
trust. CRC32 is integrity evidence, not a signature or a trust decision.
