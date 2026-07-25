# `@bernouy/cms-repository-server`

This runtime serves the global integration registry from a persistent
filesystem root. It owns two listeners:

- the public-read listener mounts anonymous `GET`, `HEAD`, and `OPTIONS`
  repository routes under `/.cms/repository`;
- the internal management listener mounts injected write routes behind one
  management service credential.

The runtime keeps an immutable in-memory catalog snapshot. A failed refresh
does not replace the last valid snapshot: reads remain available, readiness
stays true, and health becomes degraded. An initial snapshot failure prevents
the production listener startup.

The image deployment and empty-volume bootstrap policy are documented in
`infra/images/cms-repository/README.md`.
