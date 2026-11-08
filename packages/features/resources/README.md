# @bernouy/resources

Validates one-time resource ZIPs containing `resources.json` and declared `assets/`
files. The format contains ordinary compiled Content Blocs, theme settings, static
text catalogues, Page seeds and asset metadata. It has no installed release identity,
version, dependency graph, update or uninstall lifecycle.

`writeResourceArchive` creates a deterministic ZIP and verifies it before returning.
`readResourceArchive` requires the SHA-256 of the exact expected archive and verifies
paths, counts, bytes, CRC32, strict JSON, Content artifacts and each asset's hash/media
signature. Both APIs perform no Content writes and execute no browser artifact.

Archive verification is not authorization to import. The host must separately review
browser authority, validate the complete candidate against current selected execution,
authorize the actor and scope, and own durable fenced application and crash recovery.
No runtime import or setup endpoint is mounted by this package yet.

`./storage` exposes ordinary resource asset/text services and the Content text read
adapter. `./memory` and `./mongo` expose explicitly composed metadata adapters; hosts
supply their Blob store and instance/site scope. Asset bytes are immutable and exact
retries refuse inconsistent metadata or missing stored data. Text defaults and site
overrides use verified content revisions and atomic compare-and-replace writes.

Default text sources are bounded to 256 KiB, each stored source plus overrides to
512 KiB, and snapshots to 32 namespaces. Mongo snapshots query at most 33 records
to detect an exceeded namespace budget; batched asset lookups load only requested
metadata. These stores do not mount an import endpoint or provide import authority.

`./initialization` provides a one-time initialization service. `plan` produces
actor/site/instance-bound evidence for an empty site or the host's local base ZIP.
It checks the selected execution, hashes the candidate's normalized Page content
and merged theme, and reports browser authority for explicit acknowledgement.
Plans perform no live writes. `apply` reauthorizes before intent lookup and replay,
rechecks the review, and copies ordinary entities under the host's maintenance
fence. Exact retries recognize uncertain commits; missing completed entities and
changed Page roles refuse rather than repair data. Completed replay needs no ZIP.

The host must inject durable intents, worker lease/signal, private bounded ZIP
retention, verification and disposable preview ports. Memory adapters are explicit
preview/test composition only. The Mongo initialization adapter uses a mandatory
scope-bound protocol record and compare-and-swap checkpoints, provisioned explicitly
rather than inferred from an empty site. No runtime, HTTP/MCP or native setup flow
is wired to this new service yet; legacy setup remains until that transition lands.

`./feature` defines the generated `ulvia/cms.resources` API. It offers explicit
empty/base initialization, a scoped public pending flag, administrator-only review
and progress, and a durable apply capability with browser-risk acknowledgement.
The Provider inventory and native setup integration are separate composition work;
this definition alone does not mount or select the contract.
