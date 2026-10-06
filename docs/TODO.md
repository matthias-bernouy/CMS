# Deferred Platform Work

This document records intentionally deferred work whose current assumptions
must remain visible while the platform evolves. It is not a description of
implemented behavior.

## Collection JavaScript Isolation

**Status:** deferred while every installable collection is official,
first-party and reviewed with the CmsCore release. Collection JavaScript is
currently trusted and may execute in the Control or Delivery document. Shadow
DOM and collection namespaces provide encapsulation, not a security boundary.

Revisit this before admitting any third-party, remotely published or otherwise
unreviewed collection. Do not solve it with one visible iframe per Bloc. The
target architecture is:

- Ulvia owns the real page DOM and registers trusted generic custom elements;
- declarative behavior is the default and requires no collection JavaScript;
- behavior that needs collection code runs in one lazy isolated realm per
  immutable collection release, not per Bloc instance;
- the isolated code exchanges bounded structured events and state with the host
  and receives no direct reference to the page DOM;
- network, provider, file and navigation effects go through declared Ulvia
  capabilities rather than direct browser APIs;
- visible sandboxed iframes are reserved for genuinely autonomous embedded
  applications, not normal cross-collection composition;
- main-document execution is an explicit site trust decision for a precise
  publisher and release digest, never a hard-coded privilege of one collection;
- timeouts, termination, CSP, integrity checks, failure isolation and audit
  events are part of the execution boundary.

Likely implementation direction: a platform-owned renderer in the main
document plus a lazily created Worker or equivalent isolated realm for each
release that needs custom behavior. The exact browser boundary must be
validated with prototypes before it becomes a collection protocol contract.

Exit conditions:

- two unrelated collections cannot read or mutate each other's state or DOM;
- a collection cannot access the surrounding Control or Delivery document;
- a collection cannot bypass the capability gateway for external effects;
- many instances of one collection share one bounded runtime;
- mixed-collection slots, native forms, focus, accessibility and container
  queries continue to work in the real document;
- a crashed or non-responsive collection runtime can be terminated without
  making the rest of the page unusable.

## Browser Host ABI

**Status:** trusted official collections currently use the mutable
`window.cmsRuntime` host object. This is an implementation seam, not yet a
versioned compatibility contract.

Before independently updating the host and installed collection releases,
publish an explicit browser ABI version, reject unsupported ABI requirements at
admission or activation, and retain compatibility fixtures for every supported
version. Collections must not probe arbitrary globals as a fallback.

## Internal Persistence Migrations

**Status:** collection-owned content migrations are implemented, but internal
MongoDB documents do not share one ordered schema-migration registry.

Add feature-owned, idempotent migrations with a durable applied-version ledger,
single-writer fencing, restart recovery and backup/restore tests before internal
schemas become long-lived production contracts.

## OIDC Activation Gate

**Status:** OIDC support is dormant in the current official local bootstrap.
Before enabling it in production, give discovery, token and JWKS requests the
same bounded networking posture as the Gateway: explicit allowlists, DNS/IP
policy, redirect policy, timeouts, response-size limits and rotation tests.

## High Availability

**Status:** the current deployment assumes one active CMS runtime and one active
official-repository writer. Leases protect implemented critical sections, but
the complete system has not been proven under multi-replica failover.

Treat horizontal replicas as unsupported until migration fencing, background
jobs, repository publication, cache invalidation and recovery have black-box
split-brain and ownership-loss tests.
