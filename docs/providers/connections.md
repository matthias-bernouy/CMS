# Connecting Providers from the CMS

An installation belongs to one CMS instance and pins one approved manifest,
remote account and endpoint. The manifest's `implementations[].requires` is the
outbound capability allowlist. Contract requirements must be covered by the
manifest. Optional requests can be absent from the site selection; when selected,
their version and capability still have to match. Page and Bloc requirements do
not elevate a user or a Provider.

## Installation

1. Publish the contract releases and Provider manifest to a configured Repository.
2. Open `/admin/providers/connect`, import the exact manifest from the catalogue,
   enter the Provider endpoint and its dedicated account connection credential.
3. Review the verified account, exact manifest digest, served contracts and
   requested outbound capabilities, then approve.
4. The CMS stores the upstream credential in its encrypted installation secret
   namespace. It probes the report again and rejects changed account/instance
   identity. The encrypted administrator-bound preview expires after five minutes
   and survives a Provider process restart.
5. The CMS generates a separate random return credential and sends it through
   `ulvia.provider.connections@1.0.0 / connections.configure`. The receiving
   Provider stores it with the CMS origin and opaque connection ID in an encrypted,
   account-bound store. It must validate the signed connection ID before writing.
   Configuration carries a monotonically increasing generation. Storage uses
   atomic compare-and-set so late retries cannot restore a retired key.
6. Choose the contracts served by this installation using the existing Provider
   selection workflow. Approval and return pairing do not switch site selections.

The account connection credential is used as the shared invocation signing secret;
it must be distinct from an operator or user token. It authenticates report reads
and signed capability calls. The official runtime accepts its instance control
token separately; possession of a report credential does not grant control access.

`/admin/providers/access?ulvia-official-provider-access-id=<installation-id>` shows
read-only requirements and pairing state. It allows return-key rotation and a
reviewed reconnection with a replacement upstream credential. Disable or revoke an
unselected installation through the Provider manager; selected contracts must be
rerouted first. Revocation is terminal. A revoked installation cannot be restored
by replaying its approval ticket.

Pairing uses a durable operation intent and completion receipt. Retry an interrupted
operation to resume it. The candidate return credential is accepted for up to five minutes during the
handoff, bound to the exact approved installation fingerprint. This prevents a
receiver using its new key before local acknowledgement from losing a log batch.
The active reference changes only after remote acknowledgement. Configuration
changes or disablement invalidate pending authority; switching the reference
retires the old key immediately. Current references reject retired credentials immediately; already
issued invocation tokens are bounded to 30 seconds. A concurrent configuration
change returns a revision conflict rather than restoring earlier authority.

## Provider SDK

A receiving runtime can register the return channel with:

```ts
import { ProviderConnections } from "@bernouy/cms-gateway/provider/node";
import { registerProviderConnectionCapabilities } from "@bernouy/ulvia-provider/sdk/node";

const connections = new ProviderConnections(accountEncryptedCompareAndSetStore);
registerProviderConnectionCapabilities(dispatcher, connections);
```

Implement and report `ulvia.provider.connections@1.0.0` with its exact digest in
the manifest. Use the verified `context.connectionId` in business handlers to
select the return connection. Never accept a CMS URL, source installation ID or
credential from ordinary business input:

```ts
const client = connections.client(context.connectionId);
const result = await client.invoke(emailerRelease, "emailer.send", input, {
    idempotencyKey: stableBusinessOperationKey,
});
```

The contract release supplies input/output schemas and explicit HTTP bindings.
Keyed commands require an idempotency key. The Node client reloads the stored
credential for each invocation, so a long-lived client sees rotations. Requests
use `/.cms/call/{contractId}{binding.path}` on that CMS; the selected destination
can be any compatible Provider. Redirects are forbidden. Private-network targets
require the runtime's explicit network-policy opt-in.

The CMS resolves the return token to one active installation without trusting
caller-supplied identity headers. It checks approved requirements, compatible
selected version, destination readiness and instance-wide restrictions, then
issues a short-lived signed call containing source provenance. User and system
identities cannot be combined with Provider identity. Internal `gateway.*`
capabilities additionally require the Kernel control connection; declaring one in
a Provider manifest does not permit minting user invocations or forging audit events.

Selected destination observations are refreshed on demand after 30 seconds. Probes
are coalesced per installation, use its encrypted upstream credential, revalidate
against the approved manifest and back off for five seconds on failure. A probe
cannot overwrite a concurrent configuration change or approve a new identity.

Current limits are 120 calls / 8 MiB of request bodies per minute per source and
1,000 calls / 16 MiB of request bodies per minute per instance. Quotas are shared across workers in Mongo. Unknown-size
streaming request bodies fail closed; a bounded content length is required.
Quota refusals use HTTP 429 and are retryable. Authentication and authorization
refusals use 401/403 and are permanent for the current credential.

## Logs from another Provider

Declare `ulvia.cms.observability / logs.append` in an implementation's `requires`.
The Producer need not implement the Observability contract itself. Inject an
admitted Observability release and a connection client into:

```ts
import { createConnectedProviderLogger } from "@bernouy/ulvia-provider/sdk/node";

const diagnostics = createConnectedProviderLogger({
    client: connections.client(context.connectionId),
    contract: observabilityRelease,
    service: "my-provider",
    fallback: localDiagnosticSink,
});
diagnostics.logger.info("invoice.created", { invoiceId });
```

The collector starts a one-second delivery timer. The runtime owns its lifecycle;
call `collector.close()` at shutdown. Keep one collector per account/CMS connection,
not one per business request. The CMS supplies the instance and derives the
stored service as `provider:<source-installation-id>`. A Producer cannot choose
another instance or emitter, query logs, or perform unrelated calls merely by
having permission to append.

Stored IDs are namespaced by authenticated emitter; `sourceEntryId` preserves the
producer UUID. Retried batches deduplicate without colliding with another
Provider's UUIDs. The bounded collector retries temporary failures, reports
permanent refusals locally, suppresses transport self-collection and never blocks
business operations. Its queue is in memory; a process crash or overflow can
lose unacknowledged records. See [Observability](../architecture/observability.md).

Automatic observation renewal has one owner per instance: the Gateway route resolver.
Official Provider warm-up and capability calls share its in-flight probe for each
installation. Advisory warm-up also coalesces route reads; live calls always
re-read authority. Observations younger than 30 seconds are reused; failed probes back
off for five seconds. A renewal never changes installation approval or selection.
