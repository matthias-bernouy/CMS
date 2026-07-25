# @bernouy/cms-integration-packages

Feature package for deterministic integration version packages.

## Boundaries

- The root export owns adapter-light envelope, canonicalization, digest, and
  package reader contracts.
- Filesystem and HTTP implementations live behind explicit package subpaths.
- This package must not mount routes, choose persistence adapters, or depend on
  surfaces and runtimes.

## Rules

- Package parsing fails closed on malformed JSON, duplicate object properties,
  invalid paths, malformed encodings, and configured limit violations.
- Preserve string contents exactly. Unicode normalization is not part of the
  package protocol.
- Only the shared RFC 8785 canonicalizer may produce digest input.
- Keep filesystem-only imports out of the root export.
