# @bernouy/cms-gateway

The gateway resolves a site's exact contract selection and approved provider
installation before invoking a capability. It checks the selected release,
manifest claim, current installation state, runtime observation, actor access,
effective host grant, input/output schemas and compiled HTTP binding.

All public capability traffic uses the binding-derived route:

```text
/.cms/call/{contractId}{binding.path}
```

The same admitted binding builds the provider request. JSON and binary bodies
are transported without domain-specific interpretation. Binary responses are
streamed with backpressure, cancellation, transfer limits, first-byte and
inactivity timeouts. Safe provider headers include content type and length,
disposition, ETag, cache policy, range metadata and last-modified. The public
response always adds `X-Content-Type-Options: nosniff`.

A binary `GET` binding automatically accepts `HEAD`. `Range` and `If-Range`
are forwarded, and `206`/`416` range metadata is validated before projection.
The provider owns resource and cache semantics.

Provider credentials remain opaque. `CapabilityGateway` passes only a secret
reference to the server-side network adapter, which resolves it immediately
before the request. Provider-origin calls require an enabled installation, an
exact declared dependency and a separate effective capability grant. The
selection graph rejects cycles and dependency paths containing more than eight
contracts before activation. Live calls carry the verified source installation
identity and a request ID; they do not maintain a second dynamic call graph.

The gateway has no file, image, video, MIME, namespace, visibility, signature,
variant or image-processing model. Those concepts belong to providers such as
`@bernouy/cms-files`.

`./execution` owns immutable collection Page plans and grants. `./identity`
owns provider-wide user aliases. `./conformance` runs admitted suites against
injected disposable provider environments. `./http` and `./http/node` expose
the generic binding transport and hardened network adapter.

Synchronous commands are durably audited. A failure after dispatch produces
`outcome_unknown` with the request ID so callers can reconcile before retrying.
Sensitive capability fields are not included in command audit events.
