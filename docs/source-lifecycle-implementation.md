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

## Implementation

| Workstream | Scope |
| --- | --- |
| Lifecycle core | Manifest contracts, management APIs, health, scoped secrets |
| Integration settings | Provider settings, reconciliation, official resources |
| Source interface | Sources/Blocks catalogues, field pickers, Health interface |
| Integration and validation | Consent/Commerce, local migration, release reset, end-to-end tests |

Each workstream used an isolated Git worktree. Changes were reviewed and assembled
in `codex/source-lifecycle-20260906`. The [management guide](integrations/management.md)
documents the manifest, settings revision protocol, scoped credentials, published
page resolution, and Health report/observation boundary.

Source settings save and apply without redeployment. Stripe's integration-owned
Edge Function reconciles webhooks and preserves provisioning receipts across
retries. Consent owns buyer policies and immutable acceptance evidence; Commerce
records verified order/payment links before requesting payment. Signup uses its
built-in context. Collection availability changes affect insertion choices while
existing published blocks remain renderable.

## Starting evidence

- Base commit: `2eb443712`.
- Main workspace has an unrelated untracked `AUDIT.md`, left untouched.
- Initial `bun run check:all`: six checks pass; typechecking cannot resolve the
  unbuilt `@bernouy/components` output in the fresh worktree.
- Initial report: `/tmp/cmscore-lifecycle-baseline.log`.
- After frozen dependencies and the required workspace build, the comparable
  baseline passed all seven checks.
- CourtSide recovery snapshot exists at
  `.ulvia/migration-20260906/backups-final-20260906T013616Z/`.

## Local data migration

All fourteen official packages were built, verified, admitted to a fresh local
repository, and actually deployed as `1.0.0`. Previously admitted coordinates were
archived rather than overwritten. Configuration and provider simulations were
selected through the authenticated local management APIs. The one-time local
release-baseline adaptation retained the original installation metadata archive;
normal product upgrade and package-immutability guards remain enforced.

The pre-journey database comparison covered 127 tables: 117 retained identical
row digests. The ten changed tables were inspected at row/column level. Changes
were limited to the documented policy migration, settings revisions, timestamps,
and derived capability/payment projections. No existing business row was deleted.
Catalog products, categories, brands, offers, orders, payments, immutable legal
versions, and previous acceptances retained their original values.

The original signup and seller policy revisions were preserved. The buyer policy
was added to Consent, and the obsolete Commerce setting disappeared from its API.
All 24 pre-existing offers were preserved. The 13 active approved offers were
already unavailable before migration; the public production home page showed the
same empty-offers state during read-only comparison.

Backups, migration journals, row hashes, and browser evidence remain under the
local site's private `.ulvia/source-lifecycle-20260906/` directory. They are not
repository artifacts. Production received no mutation or deployment.

During the migration, `CMS_SCHEDULED_TRIGGERS_ENABLED=false` prevented scheduled
execution, including manual scheduler runs, without deleting trigger definitions.
The original enabled states were restored afterwards; live carrier polling was
already disabled and remains disabled in this simulated demo.

## Validation

- CmsCore `bun run check:all`: seven checks pass, matching the built baseline.
  The focused Core/Control/CLI regression run passed 774 tests and 2,263 assertions;
  five explicitly opt-in database/system cases were skipped in that invocation.
- Official packages passed release verification and admission. The final Commerce
  package passed 643 tests and a fresh Supabase/CMS sandbox. Separate database
  exercises checked fresh installation, migration on preserved data, and replay.
- CourtSide `bun run check`: style, typechecking, and all six structure tests pass.
- The final binding regression run passed 236 tests and 601 assertions. Browser
  fixtures verified page pickers/tabs, Source navigation, and actual horizontal
  scrolling to the final table column at mobile widths in separate processes.
- The final live administration run passed all 36 checks with no JavaScript
  errors, unexpected requests, or Health observation failures. It covered the
  source/extension and collection catalogues, secret/page pickers, settings Save
  with immediate application, stale-revision rejection, collection Save feedback,
  all fourteen Health screens, and desktop/mobile layouts. The original selection
  of 71 available Mossa resources was restored and verified through UI/API/rendering.
- All 33 public routes passed at 1440px and 390px: 66 screenshots and 206 assertions,
  including missing components, failed images, browser errors, and page overflow.
- Signup, confirmation email, login return navigation, profile/avatar changes,
  notifications, newsletter/contact forms, and password reset passed at both widths.
  New-seller profile and required-terms gating also passed before tokenization.
- The final complete journey run passed all five tests and 365 assertions after
  the binding fix. Direct and negotiated sales both completed listing, payment,
  label creation/download, seller handoff, buyer tracking, and a withdrawal request
  with downloadable receipt. Access controls on the shipping label were checked.
  Checkout assertions verify the accepted document version and its Consent receipt
  identity, buyer, order, checkout group, and payment attempt.
- A final read-only SQL audit retained all 110 historical evidence rows across
  seven tables. Both new orders had valid buyer-checkout evidence and exactly one
  successful payment attempt, with no missing links or new legacy evidence writes.
  Consent receipts were committed before the provider payment rows were created.
  Commerce links have no insertion timestamp; their insertion-before-payment
  ordering is additionally covered by the pipeline code and regression tests.

Repository-shape review found no directory-fanout errors. Several files now cross
the size-review threshold: the Integration contracts and Health schemas remain
atomic declarations, while the validators, management/migration orchestration,
and dashboard navigation retain cohesive responsibilities. They were kept together
instead of split solely to reduce line counts; these warnings remain visible in
the final check report.

The demo uses explicit local Stripe and Mondial Relay simulators and local mail
delivery. These results do not validate real charges, remote carrier operations,
or production webhook delivery. Health reports this boundary honestly: the
Mondial Relay credential probe is unavailable, and integrations without a custom
Health function report an unsupported observation rather than invented success.

Changes are integrated into the local CmsCore and CourtSide `master` branches.
The unrelated untracked `AUDIT.md` is unchanged. The demo retains its original
`.ulvia` data directory; the normal startup command uses the durable sibling
CmsCore checkout. Private backups and evidence are retained, and the disposable
database used for the historical comparison has been removed.
