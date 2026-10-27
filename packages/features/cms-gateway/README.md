# @bernouy/cms-gateway

The gateway resolves a site's exact contract selection and approved provider
installation before invoking a capability. It checks the selected release,
manifest claim, current installation state, runtime observation, actor access,
effective host grant, input/output schemas and compiled HTTP binding.

All public capability traffic uses the binding-derived route:

```text
/.cms/call/{contractId}{binding.path}
```

The same admitted binding builds the provider request. A parent contract call
uses that exact parent release on the wire; the concrete selected specialization
remains the authority for installation readiness and site grants. HTTP hosts
supply a required `resolveContract`; there is no separate host-defined route resolver. JSON and binary bodies
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
before the request and derives a short-lived signed grant for the observed
provider instance, exact contract release and capability. Provider-to-provider calls require an enabled installation, an
exact dependency in the approved source manifest, the instance-wide selection
restrictions, and bounded call/byte budgets. No separate editable source grant list exists. The
selection graph rejects cycles and dependency paths containing more than eight
contracts before activation. CMS site and user-role metadata stay inside the gateway. Signed machine calls
include opaque source and destination connection identifiers so a receiving
Provider can choose the correct account-bound return connection.

The gateway has no file, image, video, MIME, namespace, visibility, signature,
variant or image-processing model. Those concepts belong to providers such as
`@bernouy/cms-files`.

Successful responses may carry a separately authenticated semantic effect only
when the selected contract declares it. The current closed effect vocabulary
contains `session`; Gateway validates it and returns it to Kernel as metadata
instead of forwarding Provider `Set-Cookie` headers.

`./analysis` statically verifies Page requirements and derives Page access from
the selected capabilities. Live browser authorization depends only on the
capability's declared access and a trusted actor; Pages, referrers and execution
pins are not authorities. `./access` exposes optional durable grant adapters,
`./identity` owns provider-wide user aliases. `./http` and
`./http/node` expose the generic binding transport and hardened network adapter.

Synchronous commands are durably audited. A failure after dispatch produces
`outcome_unknown` with the request ID so callers can reconcile before retrying.
Sensitive capability fields are not included in command audit events.


`./provider` exposes adapter-light machine client interfaces and errors.
`./provider/node` exposes `GatewayProviderClient` and `ProviderConnections`.
The Node client uses the canonical CMS binding route, validates the selected
contract output and never forwards a user credential. Receiving runtimes inject
an encrypted account-bound connection store. See [Provider connections](../../../docs/providers/connections.md).
