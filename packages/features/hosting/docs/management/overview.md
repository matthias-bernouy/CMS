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

## Elect the primary public domain

Read `instances.get` and `domains.list`. Choose a domain of that exact instance
whose `state` is `active` and whose TLS is `ready` (or `not-required` for admitted
local HTTP). Call `instances.set-primary-domain` with `instanceId`, `hostname`,
`expectedInstanceRevision` and `expectedDomainRevision`. The result returns the
effective `origin`, the instance `revision` and the current domain revision.
The domain is already claimed and verified; this operation does not perform DNS
admission, obtain a certificate or create another instance.

The elected origin becomes the Page, authentication-link, file-URL and MCP
origin. Other active domains redirect public Pages and OAuth/MCP discovery to
it, preserving paths and query strings. Existing admitted contract URLs remain
usable on active aliases to preserve Provider callbacks and origin-bound
Repository credentials; they retain ordinary Gateway authorization. This does
not authorize unknown domains or move credentials to another origin.

The primary domain cannot be disabled: elect another first. A domain still used
as the instance's callback or configured Repository origin also refuses disable;
changing the public primary does not migrate those independent identities. Control's original
bootstrap domain remains protected even when another domain is primary.
Browser sessions are host-bound; reconnect on the new domain when required.
No Page, account, file, Provider credential or Repository identity is recreated.

Re-electing the current primary is harmless after current authorization checks.
An interrupted election retains a domain reservation. Retry its exact input to
fence the previous writer and recover; after a conflict read both revisions
again. A target domain reserved by an unfinished election refuses disable and
TLS mutations until the election is recovered. Never guess newer revisions.

Every capability has an HTTP binding and an MCP tool binding. Select the admitted
contract and use the existing authenticated Gateway transport; no special console
collection is required. This contract contains no quotas, billing or Edge machine
credentials.
