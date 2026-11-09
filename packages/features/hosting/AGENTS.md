# @bernouy/hosting

Hosting owns installation authority and admitted domain routing. It does not
select adapters, read environment, start listeners or render CMS content.

`./instances` owns the instance lifecycle, exact system plans, provisioning and
renewable transition leases. Surfaces expose these services; runtimes compose
their registries, credentials and execution targets. Preserve recovery and pin
checks when extending provisioning for Control.

Instance Repository configuration is mandatory persisted state. Validate its
closed shape, canonical HTTP(S) origin and configured boolean before use. Creation
supplies initial settings explicitly; reads and updates never repair missing or
malformed settings by substituting the official Repository.

Instance records require immutable creation provenance: an internal operator
entry point or the original Control administrator actor. Bind it into creation
fingerprints. Reauthorize Control provenance before journaling, recovery, each
business step, readiness and completed replay. A missing field is invalid state,
never an operator default. Revocation must not mark an instance ready or change
its business status; transition refusal may still be journaled. Read staged
administrator credentials only for the administrator step.

- Control authority comes from the persisted installation and a fresh administrator
  check in that exact CMS instance. Names, domains and caller input grant nothing.
- Domain claims are exclusive and revision checked. Failed ownership verification
  must not mutate the claim. Recheck authority after external verification.
- Only deployment-owned code may register a managed domain without a DNS proof.
  That method is not a tenant capability. Customer domains need an exact proof.
- Routing only returns active domains. Context identity includes both domain and
  target instance revisions; the Provider must fence current authority at use.
- Persist mandatory fields without defaults or historical repair. Initializing an
  installation cannot replace its origin or bind it to another Control instance.
- Lists are cursor based and bounded; the serving path never scans domain lists.
- Optional persistence adapters use explicit exports and are runtime imports.
- No collections or Pages are created by this package.

`./feature` owns `ulvia/cms.hosting` and its eight HTTP/MCP capabilities. The
surface projects structural services from the single official SDK inventory.
Creation uses natural persisted idempotence, not SDK receipts containing initial
administrator passwords. Domain reservations fence both hostname and creation
request before provisioning can write an instance.

Control bootstrap persists reserved/provisioning/ready phases. Only a ready
installation grants hosting authority. Reopening ready state validates its
instance, credentials and domain without recreating missing records. Runtime
freshness evidence must precede initial reservation. Never expose deployment-only
bootstrap, managed-domain registration or TLS completion as tenant capabilities.

`./routing` owns the host-level `ulvia/provider.routing` SDK definition, its
structural DTOs and short-lived Edge control lease authority. It is excluded
from ordinary and Control CMS plans. Only a signed `cms-edge` machine in the
fixed hosting scope may resolve a route. The lease contains no persistent tenant
credential; verify its signature before any lookup, then fence current hostname,
assignment, revisions, origins and expiry. Keep it within the existing 512-byte
control-credential bound even at maximum DNS/revision lengths.
The routing result carries an opaque resource revision from an injected read
port. It is cache metadata, excluded from authority/context identity and the
signed lease. Read it only when issuing a route; lease verification still checks
current domain/instance authority without opening content persistence.

`./tls` owns the public read-only `ulvia/provider.tls` permission capability and
bounded background certificate reconciliation. Permission requires a verified
HTTPS claim, a ready instance and current deployment DNS configuration; recheck
both persisted revisions after DNS. It grants no CMS actor or control lease.
Reconciliation uses hostname seek pages of 50 and four workers, checks every
configured TLS entrypoint and fences status writes with the captured revision.
Stable readiness must not keep changing domain revisions. Stop must prevent
new scans and drain current probes. Only this deployment-owned worker may call
`recordTls`; the public permission capability cannot mutate domain state.

`./caddy` is the pure optional Caddy configuration adapter. It has static shared
Edge destinations and the admitted permission URL, no per-site container list,
Docker socket or operator credential. Persist certificate storage and coordinate
it across entrypoints. Preserve the incoming Host including its port; HTTP
redirects use the configured public HTTPS port.

An operator may request a separate private HTTP listener in the Caddy adapter.
It uses the same shared upstreams and Host preservation without public HTTPS
redirects. The runtime must keep its port unpublished; it grants no CMS authority
and still reaches the Edge's fresh domain resolution and normal contract bindings.
