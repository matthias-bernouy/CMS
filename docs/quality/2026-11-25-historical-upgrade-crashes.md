# Historical binary upgrade and process crashes — 2026-11-25

This extends the [protected upgrade validation](2026-11-25-protected-upgrades-and-forms-migration.md)
with a real historical-to-current binary rollout and deliberate process deaths.
The historical source is commit `bde42cc0f20953190832f9b8258edf86c07154cd`,
which executes Forms 1.1.0. Source code is exported with `git archive`; no legacy
application code or persisted business documents are rewritten for the fixture.

## Journey

The [historical crash journey](../../packages/runtimes/ulvia-cli/tests/stack/maintenance/upgrade/journey.test.ts)
builds the historical and current CLI bundles with their respective stack
releases. It starts actual Provider, Edge, Mongo and proxy containers. The old
CLI initializes the installation, and the old browser/API creates 101 forms,
a publication and a submission. Its Event is settled before capturing the
business baseline. A retained file and runtime keys are also checked.

1. During actual conversion, the observer detects the first new-format document
   and locks Mongo writes with `fsync`. It asserts that both old and converted
   forms exist, then sends SIGKILL to the CLI process group and migration
   container. In the first recorded successful run, two forms were converted and
   99 remained old. Resuming the real CLI restores the cold checkpoint, exact
   historical images, old API responses, keys and file. An exact old submission
   retry returns the original receipt.
2. A fresh attempt completes conversion and starts the new Provider while paused.
   The fixture verifies its actual image version, paused readiness and business
   HTTP refusal. It disables that disposable container's restart policy and
   kills its process. Compose's actual startup failure drives automatic rollback;
   the historical binary/API and retained data are checked again.
3. A final attempt activates the new binary. After the real proxy starts, a test
   barrier holds the Docker client return before the CLI completes its activation
   journal. Through the new API, the fixture commits a new submission and file.
   SIGKILL terminates the CLI process group. Resume completes the exact target,
   retains those new writes and accepts an exact submission retry without a new
   receipt. The exported email settings are present and contain no answer payload.

All image metadata, container operations, persistence and HTTP responses come from
real Docker/services. The test-only Docker transport intercepts only acquisition
of locally built target tags and the cold-copy/proxy-return barriers. It does not fabricate
image inspections, Docker health, migration output or service responses. A second
return barrier holds the actual completed cold-copy command so the journey can
assert that Mongo, Provider and Edge are stopped while the public error Page and
its frozen stylesheet remain available. These
controls live entirely in test code; no production failure hook is added.

## Running and retained evidence

`bun run verify` builds the current candidate, prepares the historical images and
runs the gated journey automatically. To run it separately after the current
candidate image build:

```bash
bun run packages/runtimes/ulvia-cli/tests/stack/maintenance/upgrade/historical.ts
ULVIA_RUN_UPGRADE_CRASH_JOURNEY=1 bun test packages/runtimes/ulvia-cli/tests/stack/maintenance/upgrade/journey.test.ts
```

The fixture requires the pinned historical Git object, frozen Bun dependencies,
Linux `setsid`, Chromium and Docker with host access to its private bridge.
Historical image labels are checked against the pinned commit. Historical sources
are cached under `~/.codex/test-fixtures/ulvia-upgrades/` outside the test workspace,
so Bun's filename filters cannot accidentally run the historical test suite. The Git checkout
must retain that history; missing source evidence fails rather than substituting
a different release. No image or npm package is remotely published.

Private fixture directories under `artifacts/upgrade-crash-*` retain CLI logs,
rollback checkpoints and `partial-migration-proof.json`. Live disposable services
and data are removed at the end. These checkpoints include test credentials and
must be treated as private; they do not contain user installation data.

The first successful targeted run passed 200 assertions in about 182 seconds.
The extended maintenance-presentation run passed 250 assertions in about 194 seconds.
This is process-crash coverage on standalone Mongo, not a machine-power-loss or
storage-controller failure test. It covers this exact historical source and the
current candidate, not every historical distribution or Mongo major change.
