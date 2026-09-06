# Source lifecycle implementation

This work replaces installation questionnaires with integration-owned runtime
settings. It is local development work; the CourtSide production environment is
outside its scope.

## Accepted boundaries

- Sources owns the source and extension catalogue. Blocks owns collections and
  block availability. The separate Integrations navigation and Reconfigure action
  disappear.
- Integrations own configuration validation, application, provider reconciliation,
  and operational diagnostics. Core owns deployment, permissions, scoped secret
  access, generic invocation, and presentation.
- Settings reuse dashboard fields, including secret and published page pickers.
  Installations and updates must not overwrite saved runtime settings.
- A versioned Health report is independent of deployment and observation state.
  Checking health never performs configuration or repair.
- Consent owns document policies, immutable versions, and evidence. Commerce
  retains verified links between consent evidence and payment operations.
- Authored integration releases restart at 1.0.0. Existing business data and
  evidence history must be preserved during local adaptation.
- Interpolation expansion and full multilingual support are deferred.

## Work allocation

| Workstream | Scope |
| --- | --- |
| Lifecycle core | Manifest contracts, management APIs, health, scoped secrets |
| Integration settings | Provider settings, reconciliation, official resources |
| Source interface | Sources/Blocks catalogues, field pickers, Health interface |
| Integration and validation | Consent/Commerce, local migration, release reset, end-to-end tests |

Each workstream uses an isolated Git worktree. Changes are reviewed and assembled
in `codex/source-lifecycle-20260906` before updating the shared local workspace.

## Starting evidence

- Base commit: `2eb443712`.
- Main workspace has an unrelated untracked `AUDIT.md`, left untouched.
- Initial `bun run check:all`: six checks pass; typechecking cannot resolve the
  unbuilt `@bernouy/components` output in the fresh worktree.
- Initial report: `/tmp/cmscore-lifecycle-baseline.log`.
- CourtSide recovery snapshot exists at
  `.ulvia/migration-20260906/backups-final-20260906T013616Z/`.

## Completion criteria

Fresh installation without business credentials, subsequent settings edits,
failed application and recovery, retained settings during updates, honest health
freshness, extension discovery, collection visibility, signup consent, and buyer
payment consent must be exercised. The local CourtSide data counts and public
journeys must be checked after adaptation. Provider simulations and actual remote
provider checks must be distinguished in the final report.
