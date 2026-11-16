# Control hosting administration

`ulvia/cms.hosting` administers hosted CMS instances and their registered domains.
It grants no authority by installation alone: every operation requires a signed
user invocation from the Provider's persisted Control instance and a current
administrator grant in that instance. Ordinary site administrators, system
services, collection delegations and raw Edge control tokens are refused.

Use `instances.create` with a UUID `requestId`, a label, a public origin and the
initial administrator credentials. Exact retries retain one instance identity and
one primary domain reservation. Changed input with the same request is refused.
Passwords are staged in the existing encrypted bootstrap credential store;
results contain no Provider credentials or internal storage addresses. Treat only
`status: ready` as completed provisioning. Read `instances.get` to inspect state;
a failed attempt may be retried with its exact original input.

New instances contain system contracts and no collections or Pages. Configuration
uses native CMS setup and an explicit Repository and collection choice.

`instances.list` and `domains.list` require explicit nullable cursors and limits
from 1 to 50. Resume with `nextCursor`; null marks the final page.
`instances.disable` refuses the installation's Control instance.

Customer domains remain pending until `domains.verify` observes their exact TXT
proof. Verification and TLS readiness are separate states. Deployment-owned
suffixes may skip ownership proof; callers cannot declare a domain managed.
Hosting 1.1 also supports [verified DNS zones](zones.md), administered at runtime
with `zones.claim`, `zones.verify`, `zones.list` and `zones.disable`. A verified
zone grants automatic admission of its apex and descendants on this installation.
Domain changes require `expectedRevision`. Stale operations refuse without
changing state. The installation's initial Control domain cannot be disabled.

Every capability has an HTTP binding and an MCP tool binding. Select the admitted
contract and use the existing authenticated Gateway transport; no special console
collection is required. This contract contains no quotas, billing or Edge machine
credentials.
