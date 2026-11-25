# System upgrade maintenance Pages — 2026-11-25

## Implemented path

The protected CLI upgrade now captures each ready site's public error Page before
stopping its source release. It reuses Content's maintenance freezer rather than
adding another HTML/CSS sanitization implementation. A read-only target-image
worker reads the published `serverError` / `notFound` references and fetches their
HTML through the still-running source binary with anonymous requests. It never
hydrates the target's tenant runtime over historical Forms data. No contract or
public capture endpoint is added.

The private `<checkpoint>.presentation/` companion is outside Mongo and the
installation root. It contains frozen Pages/resources, domain routing metadata,
Caddy configuration and copied certificate/key pairs. The separate frontend uses
the applied release's exact Caddy pin, a read-only mount/root and an independent
restart policy. It is deliberately outside the Compose containers removed by
cold restore. No Provider, Edge, Mongo or live certificate storage is required to
serve its public responses. After backend readiness, the CLI hands public ports
back to the normal proxy. A failed pre-opening rollout restores the old binary
and data while preserving static presentation. Opening resumes preserve new writes.

## Safety and work bounds

- Capture uses published, visible Pages and the source release's ordinary
  anonymous authorization. Redirects are not followed. Signed resource URLs,
  private/draft Pages, unavailable dependencies and oversized content fall back
  to another public candidate or generic HTML.
- Existing limits remain 64 resources, 1 MiB per resource and 4 MiB per site, with
  a 15-second capture signal. Preparation bounds 1024 ready sites, 4096 active
  domains and 256 MiB of frozen content. Domain inventory uses batches of 50;
  only one site is captured at a time. No stateful CMS request is introduced on
  the maintenance request path: each response needs zero CMS/database calls.
- Manifests reject duplicate/cross-site hosts, unknown TLS names, unsafe header
  bytes and noncanonical domains. Canonical international domain names remain
  supported. Only exact listed resources can be served; arbitrary snapshot paths
  never become a public filesystem root.
- HTTPS-ready domains require a currently valid matching certificate/key pair.
  Copies are private (0700 directories, 0600 files), bounded and read-only to
  Caddy. ACME account credentials are not copied. Missing/mismatched evidence
  refuses before live services stop. Certificates are not renewed during downtime.
- HTML returns 503, no-store, noindex and Retry-After. Resources return 200 with
  their declared visual type. Non-GET/HEAD requests receive generic 503 JSON.
  CSP prevents script execution, form submission and framing, including direct
  navigation to a frozen SVG resource. Unknown HTTP hosts receive generic HTML.

## Evidence

The targeted historical journey passed 250 assertions in about 194 seconds;
the actual Caddy HTTP/HTTPS test passed 32 assertions, including Range and
conditional requests. The four presentation
tests, including production frontend restart and foreign-snapshot refusal, passed
50 assertions. The static check passed
all ten gates. Logs are retained in this worktree's private
`artifacts/maintenance-*.log` files.

The complete `bun run verify` finished with exit code 0. Its general test stage
passed 4693 tests (162 gated tests skipped there); dedicated stages then passed
browser capture, real Mongo, the 250-assertion historical crash journey, Access
(381 assertions), Forms (167 assertions), native Edge/backup/upgrade/restart
(2471 assertions), and fresh/restarted ACME TLS (18/19 assertions). The dedicated
four-test presentation run also passed after the certificate fixture extraction.
`bun run check` passed all ten gates on the final code. No remote publication or
installation against user data was performed. Relevant tests are:

- Content `rendering/maintenance/capture.test.ts`: source HTML/resource capture,
  disabled forms/scripts, anonymous redirects, hidden sites, signed resources,
  oversized streaming cancellation and aborted preparation.
- CLI `maintenance/presentation/model.test.ts` and `certificates.test.ts`:
  international hosts, tenant collisions, header injection, certificate ownership,
  missing domains, symlink refusal and private key file modes.
- CLI `maintenance/presentation/frontend.native.test.ts`: actual pinned Caddy,
  two sites and an alias, isolated resources, GET/HEAD/POST, real HTTPS with trust
  validation, correct content types and no CMS services running.
- The [historical crash journey](2026-11-25-historical-upgrade-crashes.md) holds
  the real cold-copy return, verifies that business containers are stopped while
  the historical error Page and frozen stylesheet remain available, then checks
  presentation during partial migration/CLI death and paused Provider failure.
- Native Edge smoke observes the actual installed Smoke Page composition as the
  site's error Page throughout a protected same-image upgrade.

The Docker protocol fixture remains one cohesive file (217 lines); its size
warning is retained after review rather than splitting a copied executable into
relative imports that would break its isolated invocation.

## Limits

The ordinary proxy's admin API is disabled. Entry/exit therefore require a brief
listener handoff; this does not guarantee zero lost TCP connections or completion
of asset requests already in flight across that handoff. A system snapshot is one
public representation per site, shared by paths and languages. External visual
URLs remain external; scripts and dynamic queries do not execute. An HTTPS name
without a previously valid certificate cannot gain working TLS from maintenance.

The private companion is not a database rollback receipt. It stays alongside its
checkpoint for recovery and must be protected/retained as sensitive backup data;
there is no automatic pruning. Standalone backups without a companion retain
their prior stop/start behavior. Process-crash tests do not establish physical
power-loss or storage-controller durability.
