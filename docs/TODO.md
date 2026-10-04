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
