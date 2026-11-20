# Visual capture implementation evidence — 2026-11-19

Worktree `/home/matthias/Documents/Company/Softwares/CmsCore-visual-captures`, branch `codex/visual-captures`, starting
commit `a44061028582bba577348ac6748784d2cc87e8c4`. This records code and local
evidence, not a production deployment or compatibility with the user's Claude.

## Implemented scope

Content `1.3.0` adds `pages.capture`, `examples.capture`, `captures.image`;
Authoring `1.3.0` adds `capture-prepared-example`. Pages include authorized private
drafts and viewport/full-page/element framing. Examples identify exact installed
releases or owned preparations and explicit pinned dependencies.

Foundation provides bounded capture ports, ephemeral artifacts, Linux isolated
Playwright execution and private Unix transport. `ulvia capture-worker` runs as an
independent native process; it never opens CMS state or saved PAT configuration.
The Provider injects a Unix client. The CLI preview uses the same capture engine.
The compiled CLI ships its worker bundle, service template and runtime guide.
DOM inspection and persistent browser sessions remain deferred.

The first Docker-nested worker approach was superseded. All Provider image,
seccomp and shared integration-cluster policy changes from that experiment were
removed. The native listener is not a container and exposes no TCP port. A Docker
Provider needs only a read-only socket-directory mount and supplementary group.
See the [historical review](2026-11-19-capture-sandbox-proposal.md).

## Access, limits and caller impact

Administrator authority is required. Image ownership combines instance, site,
Provider, subject and Provider connection. Each read checks the current invocation;
images are not published URLs. Tests cover foreign subjects/connections/instances,
stale revisions, preparation ownership and integrity, missing resources, TTL,
entry-count and aggregate-byte eviction. Refusals leave business state unchanged.
Administrative access is enforced at the capability boundary. Ordinary signed
queries carry a subject without the resource-only `actorKind` claim; capture
ownership accepts that current protocol shape and still refuses a missing subject
or an explicitly non-administrator actor. The actual OAuth Docker journey exposed
this mismatch in the initial owner check; a focused regression covers its fix.

Two preparation/capture pipelines may run per Provider and two jobs per native
worker, with immediate excess-work refusal. Each browser has a 20-second limit;
Unix request deadlines are 23 seconds server-side and 25 seconds client-side.
Input is at most 2048 files / 64 MiB decoded / 96 MiB wire; output is at most
4 MiB / 12M pixels / 6 MiB wire. Cancellation and shutdown release capacity.
The artifact cache retains at most 16 entries / 32 MiB for five minutes, copies
bytes and stores no failed render or authorization decision.

The shipped systemd template adds cgroup limits of two CPUs, 1536 MiB, 512 tasks
and 1024 descriptors for listener plus descendants. These are deployment settings,
not measured hard RSS evidence for raw foreground CLI execution. Production
account creation, browser/OS dependencies and unit activation remain explicit
operator setup; tests do not modify the host's accounts or service manager.
The service preserves its socket-directory inode across restarts so the Docker
read-only mount remains valid. A kernel-backed empty SQLite lease prevents duplicate
listeners, survives PID reuse and is released by SIGKILL. Recovery removes only an
owned disconnected socket; tests preserve active listeners and ordinary files.

A Page capture adds two Page reads and two combined rendering-revision reads
around ordinary renderer/resource preparation, then one native-worker request
and one isolated browser job. Each combined revision reads system, site Bloc and
collection revisions. Resource preparation resolves at most one approved local
resource per discovered URL within the file/byte bounds. External origins never
become server fetches; Files resources use anonymous authority.

An installed example loads only its selected dependency graph, at most 32
collections / 64 MiB assets, with two installation revision reads. The focused
no-dependency test observes one installed-release read and two revision reads.
Resource bundling preserves its input HTML, inline scripts and CSS exactly.
The worker uses the original Page origin while fulfilling permitted resources
from explicit bytes; no live origin request is made. URL-relative entries and
decoded file keys preserve Unicode Page paths. CLI preview starts one isolated
browser per frame. No reusable render cache or publication/installation side
effect is introduced.

## Verification

Starting static check: 10 passed, 0 failed. Native transport tests pass for exact
bytes, permissions, malformed jobs, attempted executable-path injection, blocked
browser origins, byte limits, busy refusal, cancellation and shutdown. A native
CLI process starts without creating CMS state, renders a PNG and cleans up its
socket. The signed Provider/MCP-only journey passes through the Unix transport:
choose an example, create a private draft, detect mobile overflow, read images,
correct the source and capture its new revision at two viewports.

The compiled CLI preview emits both PNGs with production dependencies. Real
Chromium tests cover viewport, full page, unique element including below-fold
geometry, blocked network and cancellation/recovery. An executable OS-boundary
probe cannot access a host-only file, environment variable or loopback listener.
Configuration tests validate the optional connection, refuse invalid settings,
apply only the read-only socket mount and preserve frozen startup behavior.

Final `bun run verify` ran in the permanent worktree with Bun 1.4.4:

- Static checks: **10 passed, 0 failed**, no blocking directory fanout.
- Unit suite: **4201 passed, 78 skipped, 1 failed** across 4280 tests / 1118 files.
- Real browser capture suite: **9 passed**, including original-origin/Unicode
  rendering, native process, compiled CLI and the MCP-only correction journey.
- Content/MongoDB integration: **15 passed**.
- Static performance plan: **229 executors / 1774 scenarios**, no missing
  definitions or budgets; retained compatibility check passed.
- Edge/Docker journey: **1 passed**. The real Provider uses a native CLI worker
  over the read-only socket mount; OAuth MCP creates a private draft, captures
  mobile/desktop, receives native PNG content, checks hashes/dimensions and
  refuses foreign-instance image access. Provider restart and two Edges pass.
- Fresh TLS and TLS restart: **1 passed each**.
- The rebuilt CLI archive includes its worker, service template and guide. Its
  actual native command independently produced a 320 × 180 PNG and exited cleanly.

The command exits nonzero solely for `the real pinned transport delivers the
entire DELETE JSON body without instrumentation` in
`tests/performance/harness/transport/payload.test.ts`. That same failure was
reconfirmed on the untouched original checkout with the same Bun version.
The task does not change that transport path. The main checkout remains clean.

The temporary checkout was lost during an app restart. Its source edits were
recovered from this chat's tool history, then all checks above were rerun. The
permanent worktree is outside temporary/build-output directories. Recovery logs
and a complete changed-source archive are retained in the original checkout's
`artifacts/capture-recovery/` directory.

Existing large integration files remain cohesive: the MCP binding's dispatch
flow, installation parser and Provider composition keep their current owners;
new worker protocol, lifecycle, lease and runtime helpers are separate modules.

Static performance plans cover all new capabilities and bindings. No measured
campaign was run. Native worker CPU/RSS is outside Provider Docker counters;
a capture campaign must connect a native worker and collect its host resource
evidence before claiming complete performance acceptance.

## Remaining operator/client checks

The user's Claude client has not been exercised. Native MCP image-content tests
prove that PNG pixels are delivered, not that every client forwards them to its
selected model. Follow the client test in the
[runtime guide](../development/visual-captures.md#verification-and-client-evidence).
Collection demonstrations do not imply arbitrary site personalization or live
authenticated API execution. Upload's separate HTTP PUT remains outside this work.
