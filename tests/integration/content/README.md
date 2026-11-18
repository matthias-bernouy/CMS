# Content lifecycle regression tests

Run the fast domain and wire regression suites from the workspace root:

```bash
bun test ./packages/features/content/tests/blocs/catalogue/editing \
  ./packages/features/content/tests/application/mongo/references \
  ./packages/surfaces/ulvia-provider/tests/capabilities/content/editing/errors.test.ts \
  ./packages/features/repository/tests/collections/admission/examples/bootstraps/execution/reuse/authority.test.ts
```

Run the real standalone Mongo tests separately:

```bash
ULVIA_RUN_CONTENT_LIFECYCLE=1 bun test ./tests/integration/content
```

Docker and local loopback listeners are required. Each test owns a temporary
pinned Mongo container and removes it and its volumes in `finally`. Ordinary
`bun test` discovery skips these Docker journeys unless the flag is set.
`bun run verify` enables the flag and runs them in a separate acceptance stage.
Their failures remain fatal to verification while allowing later diagnostics.

The suites protect these observable properties:

- Explicit operator upgrades preserve authored data, resume durable progress and
  keep partial projections unavailable. The CLI exercises prefix isolation,
  mandatory offline acknowledgement and inspected-token recovery against Mongo.
- Command evidence releases pre-send failures and exact Page reconciliation,
  while sent unknown outcomes retain the fence. Alternate mutation APIs cannot
  bypass ownership; unsupported aggregation writes refuse before execution.
- Existing compositions beyond new structure limits remain readable and can be
  reduced; identity reads allow safe deletion beyond the source byte limit.

- Pre-write validation, ownership refusals and Page deletion-intent conflicts
  leave business state unchanged and the instance writable.
- A process lost during read-only validation leaves a recoverable lease;
  an indeterminate persistence result retains its committing fence.
  Definitive driver argument, serialization and atomic constraint refusals
  release it. Missing projection-format evidence refuses without repairing data.
- Metadata-only Page updates and archive/restore avoid the reference fence.
  Pure invalid drafts are refused before acquiring it. Page and draft reference
  writes still serialize with composition deletion.
- Creation and editing agree at and beyond the 64-level and 16,384-node limits,
  in both memory and Mongo adapters. The real Mongo journey also round-trips
  editing and deletion at the maximum supported structure depth.
- Recreating the same published tag changes catalogue/rendering revisions and
  invalidates actual warm initialization validation.
- Deletion uses the canonical reference-scanner semantics, gives an accurate
  revision conflict and cannot silently deadlock nested reference operations.
- Wire errors are declared and retryable for unavailable writes, while semantic
  draft conflicts explain the needed correction instead of reporting tag reuse.
- Mongo reverse-reference lookup work stays bounded with 512 unrelated Blocs:
  the query observed during actual deletion is explained by Mongo, with a budget
  of 32 examined documents. An ID projection alone does not satisfy this budget.

New tests assert the required behavior. Do not mark known failures as expected,
skip them, loosen their bounds or change their assertions to preserve a bug.
Refactoring duplication and avoiding redundant validation still require source
review; these tests intentionally do not prescribe validator call counts or a
particular private helper layout.
