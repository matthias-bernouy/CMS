# Official Repository

- Keep releases declarative, immutable and reviewable.
- Publish contracts before manifests or collections that reference them.
- Do not add environment reads, listeners, persistence adapters or runtime code.
- Provider implementations belong outside this directory.
- Generic examples and protocol fixtures belong with the feature that tests them.
- Split collection administration copy into focused JSON objects below
  `translations/<locale>/`; paths organize authorship and never prefix keys.
- Theme category files may be grouped recursively below `theme/`. Keep their
  filename and internal stable ID equal; `theme/definition.json` owns ordering.
