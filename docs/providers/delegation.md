# Provider authority and bounded delegation

Contracts describe the operation, including its access level and mandatory
`behavior.sensitive` boolean. They reject capability `requires`. Provider
manifests declare global `requires` and per-implementation `requires`; only exact
implementations selected for that installation contribute implementation rights.
Global requirements are evaluated once per participating installation in the
selection graph. They do not create artificial contract dependency cycles.

## Static delegation policy

An implementation can opt into delegation:

```json
{
    "contractId": "example.content",
    "version": "1.0.0",
    "digest": "sha256:...",
    "requires": [],
    "delegation": {
        "sources": ["render"],
        "allow": [
            {
                "contractId": "*",
                "capabilityId": "*",
                "effect": "query",
                "sensitive": false
            }
        ]
    }
}
```

Sources are exact capability IDs or the single wildcard `"*"`, including
inherited capabilities. Target contract/capability selectors accept exact IDs or
`"*"`; partial globs are rejected. Effect is `query`, `command` or `"*"`.
An omitted sensitivity selector matches either classification; explicit `false`
or `true` matches only that value. Queries can delegate queries only, even with
an unrestricted selector. Commands can delegate either effect when allowed.
There are no `kind` or `batch` selectors. Unknown target contracts are allowed
in the policy and do not become installation dependencies.

Connection review exposes policies and their concrete matches against current
site selections. A changed selection or authorization inventory invalidates the
connection approval. Contract upgrade plans expose exact machine and delegated
grants plus newly matched delegated pairs. Their digest covers exact source and
target pins, approved manifest digests, access, effect and sensitivity. Capabilities
are retained once in a compact table; grants reference their table positions. Added
grants are compared by exact pins, independently of table positions. HTTP review
labels are presentation data, not persisted authority. Applying
a stale plan fails. Each expansion is bounded to 1,024 pairs; narrow excessively
broad policies rather than silently truncating the reviewed inventory.

## Invocation flow

1. The Gateway resolves a live selected route and authorizes the original actor.
2. The control authority may issue a random opaque ticket for an implementation
   with a matching source policy. It retains only a hash, the root request,
   exact source pin, installation/credential fingerprints, site selection
   fingerprint and the verified actor with its authorization revision. The selection
   fingerprint covers mutable selection identity and grants, not the expanded review inventory.
3. The source Provider receives the ticket in signed invocation metadata as
   `context.delegation`. No browser session, user bearer or global subject is
   forwarded to that Provider for delegation.
4. The source sends the ticket to the CMS using its own return credential.
   The CMS binds the source to the credential actually presented, rechecks the
   ticket, source/target selections and status, site denials, actor revision,
   reviewed concrete grant, source policy and quotas.
5. The broker performs one full dispatch authorization and consumes the ticket
   budget once. Its local proof rechecks mutable credentials, actor revision,
   selections, routes and ticket lifetime immediately before signing, without
   resolving the immutable catalogue again. Transport failures remain infrastructure failures; they are not presented as
   permission refusals.
6. Access owns live user membership and authorization inspection through
   `ulvia.cms.access / inspect-actor`, restricted to signed `cms-gateway` system
   authority. Anonymous tickets retain anonymous/public access only.
7. The broker signs the target invocation with its Provider-scoped user alias
   and source/root provenance. The target receives no reusable delegation ticket.
8. The Gateway closes the root ticket when the source invocation ends, including
   failures. For binary responses, completion, cancellation or a stream error
   closes the ticket; receiving headers alone does not. Metadata-only responses
   close immediately. Expiry remains the fallback if closing becomes unavailable.

A ticket lasts at most 30 seconds and never beyond the root deadline; the current
Gateway root deadline is 15 seconds. It permits one downstream hop, up to 32
child calls and 4 MiB of request bodies. Mongo atomically enforces these limits
and caps active tickets at 256 per instance. TTL is cleanup; every read/consume
checks expiry itself. Credential rotation, configuration changes, disabled
installations, selection/grant changes and actor revision changes invalidate
existing tickets. An already dispatched operation cannot be recalled.

The return credential, opaque delegation ticket and signed target invocation
are distinct credentials with distinct purposes. Control-only issue/check/close
capabilities have no MCP binding and reject ordinary Provider/user authority.

## Explicit SDK authority

```ts
await client.invoke(emailerRelease, "emailer.send", input, {
    authority: "provider",
    idempotencyKey: stableOperationKey,
});

await client.invoke(catalogueRelease, "products.get", input, {
    authority: "delegated",
    delegation: context.delegation,
});
```

Missing authority or an invalid/expired delegation context is rejected. Delegated
rejection never falls back to machine authority. The SDK marks return calls with
`x-ulvia-provider-authority`; a rejected Provider credential is refused before
user authentication, so it is never forwarded to Access as a user bearer. Use machine authority for logs;
`logs.append` rejects delegated user calls. Runtime connection pairing and
`gateway.*` control operations also retain their dedicated authority checks.

Requirements grant installation-wide machine authority. They cannot isolate
modules sharing one Provider process or prevent that process from using its
other approved machine rights. Query declarations are contractual behavior,
not a proof that an implementation has no side effects. This phase supplies
communication and delegation infrastructure; it does not relocate SSR or add
`delivery.resolve-path`.
