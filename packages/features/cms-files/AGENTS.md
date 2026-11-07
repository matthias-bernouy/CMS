# cms-files

This feature implements the provider-neutral ulvia/cms.files domain.

- Namespace credentials are the authority boundary. Creator identity is audit metadata only.
- Never return a stored verifier or internal signing key.
- File generations and public URLs are immutable.
- Read and write bytes as streams and preserve backpressure.
- Image processing belongs here or in an adapter used by this package, never in cms-gateway.

- `./feature` owns all 27 capability definitions, default execution, Zod schemas and
  Markdown documentation. The surface selects the complete feature with injected
  `files` and `workspace` ports; do not reintroduce a separate capability registrar.
- Keep namespace.get restricted to declared public metadata; the managed workspace
  includes creator audit metadata but never namespace credentials or stored verifiers.
- Binary executors preserve streams, Range/If-Range, length, ETag, cache policy and
  content disposition. Cancel an acquired stream if response construction fails.
- Namespace deletion/file mutation must verify target ownership before any mutation.
