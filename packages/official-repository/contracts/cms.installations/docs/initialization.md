# Site Initialization

Initialization is optional and independent of a collection's ordinary installation or upgrade.
New core instance profiles explicitly create a pending initialization record. Existing instances
without that record report `unavailable`; reads never infer state from an empty Page list.

The public `initialization.entry` query exposes only a pending flag. Every other initialization
capability requires an administrator. The system HTML assistant uses the same Gateway capabilities
as API and MCP clients; it owns no authentication session or persistence of its own.

Use `initialization.list` to browse recipes. Discovery reads metadata for at most four latest
stable collections per page. A cursor is bound to the current catalogue; restart discovery after
a revision conflict. No browser code executes while browsing or reviewing a recipe.

Call `initialization.plan` with an exact root reference, or `root: null` for an empty start.
The review pins the instance, administrator, execution policy, current state, collection bytes,
browser-code risks and proposed ordinary Pages. Missing selected capabilities, conflicting routes,
unavailable resources or invalid example documents refuse before durable business changes.
The implementation verifies complete bounded bundles and simulates the ordinary Content writes
using disposable adapters. It never creates providers, changes selections or expands execution grants.

After reviewing `reviewJson`, explicitly approve its `planDigest` with `initialization.apply`.
This keyed asynchronous command returns an operation ID; poll `initialization.status`. The exact digest approves the entire reviewed collection graph, including
its declared browser-code risks. A changed actor, instance, recipe or state requires a new review.

An interrupted application retains a durable site maintenance fence. Retry the same reviewed
command to resume using already verified local artifacts, even if the Repository is unavailable.
Only the original administrator can resume that review. Ordinary mutations remain blocked until
completion; a removed or unexpectedly modified unfinished Page refuses instead of being overwritten.
Completed initialization is idempotent and never reapplies edited Pages. Deleting all Pages later
does not reset the initialization record. There is no implicit rollback or destructive reinitialization.
