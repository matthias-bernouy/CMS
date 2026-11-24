# Forms 2.0 and optional Workflow notifications — 2026-11-24

## Scope and result

Implemented and functionally verified in the persistent task worktree
`/home/matthias/.codex/worktrees/forms-events-only/CmsCore`, based on
`bde42cc0f20953190832f9b8258edf86c07154cd` from local `v1.0.23`.
The user explicitly approved removing Forms email delivery, the optional official
Workflow, SDK authoring, and the Forms 2.0 breaking change without a 1.x executor.

Forms 2.0 removes notification configuration, rendered mail, recipient delivery
intents, notification outcomes/retries and its Emailer requirement. The submission
Event worker now also owns bounded payload expiry, including when no publication
port is supplied. Event lease/attempt growth is reserved in submission BSON bounds.
Historical Forms 1.x admissions remain archived, outside executable support.
The official Provider manifest advances to 1.13.0.

`@bernouy/ulvia-workflows` owns the unchanged shared declarative language/parser,
graph validation, errors and manifest fingerprinting previously owned by the
feature. SDK `defineWorkflow` snapshots immutable I-JSON; build `compileWorkflow`
admits it through the same validator as the feature engine. Platform imports no
feature runtime. Contract requirement witnesses and instance publication remain
separate checks.

`@bernouy/official-workflows` provides `ulvia/form-submission-email@1.0.0` in the
CLI local catalogue and generated image bootstrap. It is not automatically
installed or activated, nor seeded into a tenant Registry or pushed remotely.
The administrator configures one form, recipient and exact Email Template
publication. The Workflow renders submission metadata, then invokes Emailer;
answer mappings require an explicit custom variant. The text representation is
sent. The existing administration collection remains responsible for its UI.

## Verification

Frozen installation and the initial `bun run check` passed before changes.
Final `bun run verify` exited 0:

| Stage | Result |
| --- | --- |
| Static checks | 10 passed |
| Ordinary suite | 4,640 passed, 143 explicit skips, zero failures |
| Collection browser | 4 passed |
| Capture / CLI browser | 11 passed |
| Content recovery / observability / templates | 18 passed |
| Enabled Forms / Events / Workflow Mongo suites | 29 passed |
| Native Forms / Workflow / SMTP browser journey | Passed, 203 assertions |
| Shared hosting, restart, two Edges | Passed, 216 assertions |
| TLS fresh / restart | Both passed, 18 / 19 assertions |

Enabled stages are separate evidence, not additional unique-test counts.
The ordinary skipped tests are not counted as executed successes.
The targeted regression group passed 22 tests / 540 assertions, with nine Mongo
skips subsequently covered by enabled verification. Four authoring/admission
checks passed with 18 assertions; bootstrap/catalogue checks passed separately.

Relevant evidence:

- `packages/features/forms/tests/mongo.test.ts`: storage without Emailer,
  immutable publications, conflicting replay, invalid-input refusals, foreign
  instance isolation, deletion and background expiry with replay protection.
- `packages/features/forms/tests/events/initiator.mongo.test.ts`: original proof
  retained across accepted replay and reopened persistence.
- `packages/platform/sdk/tests/workflows/authoring.test.ts` and public SDK typing:
  immutable snapshots, shared fingerprints, invalid graphs and malformed data.
- `packages/platform/workflow-language/tests/admission.test.ts`: altered bytes,
  digest substitution, duplicate keys and foreign publisher refusals.
- `packages/features/workflow-library/tests/catalogue.test.ts`: closed instance
  configuration, declared requirements and absence of automatic answer copying.
- CLI bootstrap/release/push tests: admitted local catalogue, one Workflow artifact,
  exact current Forms digest, no Emailer producer requirement, ordinary transfer
  through a loopback test Repository and idempotent Provider publication.
- `tests/integration/instance/forms/journey.test.ts`: eleven browser field kinds,
  template publication and active official Workflow, stable submission replay,
  Provider restart, two intended emails, no old built-in notification, another
  form excluded by the filter, private/cross-instance refusals and initiator scope.

Formatting and whitespace checks passed. The SDK compiler directory's eighth
entry is a reviewed advisory; the dedicated Workflow compiler keeps a clear
responsibility. No directory fanout error remains. Existing cohesive large Mongo
and browser-journey files decreased in size.

## Cost and boundaries

At the Forms service boundary, publication's optional Emailer availability callback
changes from one call to zero. Submission constructs zero rendered emails or
recipient intents. A composed retention/Event tick uses one bounded due-list scan
instead of separate Event and notification scans. The optional notification
Workflow makes two downstream capability calls: `templates.render`, `emailer.send`.
These are code-path counts, not measured latency or database-operation claims.
Summary lists retain the same projected `limit + 1` query and cursor checks.

Forms 1.x state is not migrated. Every announced exact Provider implementation is
checked during recovery, even if unselected; an instance advertising Forms 1.x can
therefore refuse the new image. No migration tooling is supplied here. Existing
instances need separately reviewed migration or fresh state; replacing an image
alone does not perform either. No existing instance or local laboratory was reset.
In-progress Event publication or downstream effects may finish after local answer
deletion. Workflow uncertainty/reconciliation semantics remain in force; this does
not guarantee exactly-once arbitrary external delivery.

The existing measured-performance issues were not repaired or remeasured. Static
performance plans were updated and passed within verification. No throughput or
latency success is claimed. Additional domain Events remain proposals only.

Persistent logs use
`/home/matthias/.codex/logs/CmsCore-forms-workflow-2026-11-24-*.log`.
