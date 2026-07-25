# @bernouy/cms-repository-management

Authenticated HTTP surface for integration-registry publication and operational
management.

## Boundaries

- This package mounts management endpoints onto an injected `Runner` and
  consumes registry contracts through published feature exports.
- Keep the public read surface in `@bernouy/cms-repository`; anonymous CMS
  instances must not depend on this package.
- Do not import filesystem, database, network, or runtime adapters. Composition
  roots inject registry implementations, credentials, and rate limiters.

## Rules

- Authenticate management requests before rate-limit accounting or body reads.
- Rate-limit authenticated service principals rather than bearer-token values.
- Return stable, sanitized management errors and never expose credentials or
  raw adapter failures.
- Keep publication validation and mutation in feature packages; surface handlers
  only parse HTTP input, delegate, and map results.
