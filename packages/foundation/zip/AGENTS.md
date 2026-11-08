# @bernouy/zip

Generic Foundation ZIP codec; no CMS, contract, catalogue or installation knowledge.

- Never extract into a filesystem. Return immutable Blobs and captured relative paths.
- Snapshot mutable byte arrays, options and writer entries before the first asynchronous step.
- Materialize filesystem-backed Blobs under observed byte limits before verification.
  Returned archive bytes must be owned and independent of later filesystem changes.
- Use lazy central-directory iteration, one decompression stream at a time, with both
  declared and observed entry/aggregate limits. Check CRC32 explicitly; yauzl does not.
- Refuse encrypted entries, links/special files, traversal, ambiguous paths, duplicates
  and file/directory collisions. Bound path bytes, nesting and total entries, including directories.
- Propagate caller cancellation, destroy borrowed streams and close the reader on every exit.
- Construction uses stored entries and fixed DOS metadata, sorted by normalized path.
  No environment reads, source scanning, publishing, or implicit repair belongs here.
- Hosts own cross-request concurrency/retention and archive trust/authorization policy.
