# Visual capture runtime

Content `1.3.0` exposes `pages.capture`, `examples.capture`, `captures.image`;
Authoring `1.3.0` exposes `capture-prepared-example`. Installed contract selection
and exact runtime support still apply. Building source does not upgrade or deploy
existing sites. DOM inspection and persistent browser sessions remain deferred.

## Native worker architecture

The Provider sends explicit document/resource bytes to a native Playwright worker
through a filesystem-protected Unix socket. The worker runs independently under a
dedicated unprivileged account. No TCP listener, CMS persistence adapter, session
secret, operator token, Repository PAT or Provider environment is supplied.
Documents can contain private Page data and scoped resource URLs; the worker is a
trusted processor of those bytes. Its Unix group must contain only trusted callers.

The worker launches a disposable Chromium job using Linux Bubblewrap, which clears
its environment and isolates its filesystem, PID and network namespaces. The
browser receives only read-only engine/runtime dependencies, browser binaries and
fonts, private temporary storage and the explicit document map. It cannot read the
listener's socket, home or arbitrary host files. Browser requests are fulfilled
from the explicit document map under the Page's original origin (or
`capture.invalid` for collection examples); other resources and live APIs are
blocked and diagnosed. HTML, inline scripts and CSS are not rewritten to replace
site URLs, so visible addresses and `location.origin` remain faithful to the Page.
No container is required for the worker. A Docker Provider remains supported by
mounting the socket directory read-only. Its original seccomp, AppArmor,
`cap_drop: ALL` and `no-new-privileges` policies remain unchanged.

Content owns private Page selection and rendering; Repository owns collection
examples, verified dependencies and private preparations. Foundation's
`@bernouy/browser-capture` has no CMS identities or resource fetcher. The Provider
injects `@bernouy/browser-capture/unix/client`; the native CLI command injects
`@bernouy/browser-capture/playwright`. The MCP adapter delivers bounded PNG bytes
as native image content. Other binary results retain resource publication.

## Install and run

Linux with unprivileged namespaces, Bun, Bubblewrap at `/usr/bin/bwrap`, the pinned
Playwright Chromium build and its OS libraries are required on the worker host.
For the Debian image family, install Bubblewrap and the libraries listed by
Playwright's Chromium dependency checker using the host's ordinary package tools.
Do not change host namespace/security policy implicitly. Startup renders a tiny
readiness document before binding the socket; missing prerequisites fail closed.

Install Bun and the co-versioned Ulvia CLI in a system-readable location. Create a
non-login `ulvia-capture` account and private group through the host's account
management. This is operator setup: neither `ulvia apply` nor the worker creates
users, edits system services or installs host OS packages.

Use `/var/lib/ulvia-capture` as that account's private home and install its browser:

```bash
sudo -u ulvia-capture env HOME=/var/lib/ulvia-capture /usr/local/bin/ulvia capture-worker --install-browser
```

The packaged `dist/capture-worker/ulvia-capture.service` is a systemd template.
Review its executable paths, copy it to the host's unit directory, then enable it.
It runs with `User=ulvia-capture`, `Group=ulvia-capture`, a private state directory,
`/run/ulvia-capture` with mode `0770`, socket mode `0660`, no-new-privileges,
private temporary storage, two CPUs, 1536 MiB memory, 512 tasks and 1024 file
descriptors. The cgroup includes the listener and its browser descendants.
Those hard resource limits apply to this service template; the raw command alone
does not impose the same cgroup budget.

For a manual foreground run as that account, provision a private socket directory
owned by its shared group, then run:

```bash
ulvia capture-worker --socket /run/ulvia-capture/worker.sock
```

`--browser-path <absolute-path>` selects an explicitly installed Chromium binary.
The command never initializes CMS data directories, reads saved PATs or acquires
the installation mutation lock. SIGTERM/SIGINT cancel jobs, close the listener and
remove its socket. Startup never unlinks an active worker.
The systemd runtime directory is preserved across service stops and restarts,
keeping the directory inode mounted by a Docker Provider. An exclusive empty
SQLite transaction serializes listeners; the kernel releases it after SIGKILL.
Startup recovers only an owned socket that explicitly refuses a connection,
without replacing an active listener or a regular file. Keep the `.lock` inode.

## Connect Ulvia

For a native Provider, set the optional runtime configuration:

```bash
ULVIA_CAPTURE_SOCKET=/run/ulvia-capture/worker.sock
```

Its account needs access to the private shared group. For the CLI-managed Docker
Provider, use the numeric GID of `ulvia-capture` on the host:

```bash
ulvia configure --capture-socket-directory /run/ulvia-capture --capture-group <gid>
ulvia apply
```

The saved optional connection adds that supplementary group to the Provider and
mounts only the socket directory at `/run/ulvia-capture`, read-only, without
creating a missing host path. The Edge and browser receive no such mount.
The directory must exist, be real, exclude other users and match the configured
GID. The socket filename is `worker.sock`. Native worker lifecycle belongs to its
host service; CLI apply/start/stop continue to manage the Docker stack only.

`configure` records desired state, `apply` activates it, and `start` retains the
exact applied snapshot. Disable with `ulvia configure --capture-socket-directory
disabled`, followed by `ulvia apply`. An absent/unreachable connection yields
`CORE_UNAVAILABLE`; it never launches Chromium inside the Provider as a fallback.

## Bounds and evidence

Two jobs may execute per worker, with immediate refusal rather than a waiting
queue. Each browser job has a 20-second limit; complete socket requests have a
23-second worker deadline and a 25-second client deadline. Direct administrator
requests for the three capture-generation capabilities have a 30-second Edge
first-byte budget. Other requests retain their existing deadlines. Limits are 2048 files /
64 MiB decoded input, 96 MiB wire requests, 4 MiB / 12M pixels PNG output and 6 MiB
wire responses. Cancellation, oversized input/output and failures release capacity.

The Provider's in-memory image store retains at most 16 entries / 32 MiB for five
minutes. Opaque IDs are bound to instance, site, Provider, subject and Provider
connection identity. There is no public artifact URL, reusable render cache or
authorization cache. Capture metadata records source revision/digests, viewport,
locale, theme, browser version and diagnostics. Page capture leaves drafts private.

Local public/signed Files URLs are resolved under anonymous authority before the
job. External origins and authenticated live APIs are not fetched. Collection
captures use their demonstration context; full site personalization is not implied.
Inspect missing-resource diagnostics before treating a capture as visual evidence.

Native worker CPU/RSS belongs to its host service, separately from Provider Docker
metrics. Static performance plans are not measurements of that cost. A capture
performance campaign needs the native worker connection and its own host resource
evidence; no measured campaign is claimed by the implementation tests.

## Verification and client evidence

The packaged CLI resolves its read-only dependency mount from the installed
Playwright module rather than assuming package-local `node_modules`. The npm
regression installs a packed CLI with both hoisted and nested dependencies and
checks identical desktop/mobile PNGs. No workspace dependency symlink is supplied.

Tests cover Unix permissions, input refusal, concurrent capacity, cancellation,
shutdown, actual native-process startup, isolated Chromium and a complete MCP-only
journey through signed Provider HTTP calls. Tests on the implementing workstation
use its test account; they do not install or activate a system account/service.

A transport test establishes that native MCP image content contains PNG pixels,
not that a particular client forwards those pixels to its chosen model. In each
actual target client, call a capture tool and then `captures.image`; ask the model
to describe a random visual detail absent from tool text and source available to
that model. Record client/model/date and answer. The user's Claude client has not
been tested here. Upload's separate HTTP PUT remains outside this work.

The shared-stack browser acceptance test supports `ULVIA_EDGE_SMOKE_PORT_BASE`
(default `15100`, valid range `1024`–`65532`). It uses that port for the proxy,
base + 2 for the test Registry ingress and base + 3 for the Provider. Choose an
unused base when another local installation already owns the default ports:

```bash
ULVIA_EDGE_SMOKE_PORT_BASE=17100 bun run verify
```

This setting belongs only to test isolation; it does not change deployment defaults.
