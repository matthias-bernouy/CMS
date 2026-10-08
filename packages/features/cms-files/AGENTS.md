# cms-files

This feature implements the provider-neutral ulvia.cms.files domain.

- Namespace credentials are the authority boundary. Creator identity is audit metadata only.
- Never return a stored verifier or internal signing key.
- File generations and public URLs are immutable.
- Read and write bytes as streams and preserve backpressure.
- Image processing belongs here or in an adapter used by this package, never in cms-gateway.
