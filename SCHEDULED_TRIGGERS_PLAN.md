# Scheduled Triggers Plan

Status: implemented.

## Goal

Move integration-specific worker schedules out of `cms-server` and `cms-cli`.
Integrations declare recurring work as trigger artifacts, while the generic CMS
runtime discovers, claims, executes, displays, and disables those triggers.

## Current State

- Trigger artifacts already belong to integrations, survive their lifecycle,
  preserve `enabled` and `lastRun` on rerun, and appear in the Triggers admin.
- Triggers currently support only endpoint request and response events.
- Production and development runtimes duplicate a hard-coded list of eight
  scheduled Commerce functions.
- Commerce notification dispatch is another hard-coded runtime worker. It is
  executable code rather than a declarative CMS function because it needs the
  CMS user repository and dynamic integration lookup.

## Contract

Extend `TriggerEvent` with a schedule variant:

```json
{
  "type": "trigger",
  "trigger": {
    "id": "commerce-stripe.reconcile-protected-payments",
    "label": "Reconcile protected payments",
    "event": {
      "kind": "schedule",
      "intervalMs": 15000,
      "initialDelayMs": 5000,
      "timeoutMs": 120000
    },
    "function": {
      "id": "reconcileProtectedPaymentSystems",
      "body": {
        "runKey": "$schedule.runKey",
        "limit": 5
      }
    }
  }
}
```

A scheduled trigger declares exactly one target:

- `function`: an installed system `POST` CMS function;
- `task`: a server-side task handler registered by a feature, such as
  `cms.notifications.dispatch`.

Resource packages may reference task IDs but cannot provide executable runtime
code. Unknown tasks fail visibly. Arbitrary URLs and module names are forbidden.

Inputs may use `$schedule.runId`, `$schedule.runKey`,
`$schedule.scheduledAt`, and `$trigger.id`. The run key remains stable for one
claimed occurrence.

The MVP supports fixed intervals only. It does not introduce cron expressions or
time zones. Intervals are bounded from 5 seconds to 24 hours.

## Runtime Semantics

The trigger repository owns schedule state and distributed claims. A due trigger
is claimed with a lease. Completion or failure records the result and schedules
the next interval; a crash leaves an expired lease that another runtime can
reclaim.

- Mongo claims are atomic, so only one CMS replica executes an occurrence.
- In-memory claims provide equivalent development behavior, and execution
  timeout remains shorter than the claim lease.
- Missed intervals do not create a catch-up storm. One occurrence runs after
  recovery, followed by the normal fixed delay.
- Disabling a trigger prevents new claims. It does not interrupt an in-flight
  provider operation.
- Re-enabling schedules the next run after `initialDelayMs`.
- Rerunning an integration preserves the administrator's enabled choice.
- Removing an integration removes its managed scheduled triggers.
- Functions still need idempotent provider operations because a crash after an
  external side effect is inherently ambiguous.

The runtime polls only for due scheduled triggers. It no longer knows Commerce,
Stripe, Mondial Relay, Emailer, function IDs, intervals, or batch sizes.

The scheduler is a required runtime service:

- production, `p9r dev`, and `p9r preview` start it by default;
- failure to initialize the trigger repository or scheduler fails startup
  instead of silently serving with background processing disabled;
- trigger-level `enabled` is the normal operational control;
- local development accepts an explicit `--no-workers` maintenance escape
  hatch, while the existing `--workers` flag remains temporarily compatible
  and becomes unnecessary.

## Visibility And Control

Extend the Triggers admin list for scheduled records:

- integration owner, target, interval, and enabled state;
- runtime state and next run;
- last start, duration, status, and bounded error;
- a guarded `Run now` action.

`Run now` uses the same distributed claim and refuses concurrent execution.
Disabling a critical financial trigger requires confirmation. Full run history
is not part of the MVP; the latest run is enough to operate the scheduler.

When local development explicitly uses `--no-workers`, triggers remain enabled
in storage and the UI reports that this runtime paused its scheduler. It must
not pretend that each integration trigger was disabled.

## Integration Migration

| Integration | Scheduled target | Interval | Batch |
| --- | --- | ---: | ---: |
| Commerce Stripe Payments | `reconcileProtectedPaymentSystems` | 15 s | 5 |
| Commerce Stripe Payments | `processDueOrderDeadlines` | 60 s | 5 |
| Commerce Stripe Payments | `dispatchPendingPaymentCancellations` | 60 s | 5 |
| Commerce Stripe Payments | `dispatchPendingProtectedRefunds` | 60 s | 5 |
| Commerce Stripe Payments | `dispatchDueProtectedSettlements` | 60 s | 5 |
| Commerce Mondial Relay Fulfillment | `reconcileMondialRelayShipmentOperations` | 60 s | 5 |
| Commerce Mondial Relay Fulfillment | `reconcileMondialRelayFulfillments` | 5 min | 8 |
| Commerce Mondial Relay Fulfillment | `publishMondialRelayDeliveryHealth` | 60 s | 24 |
| Commerce | `cms.notifications.dispatch` task | 30 s | 10 |

Commerce template provisioning is not scheduled work. It moves to installation
or rerun through the public Commerce and Emailer contracts, so disabling the
notification trigger does not make templates disappear from administration.

## Implementation Phases

1. Extend `cms-triggers` types, parsing, validation, schedule references, and
   backward-compatible endpoint trigger behavior.
2. Add atomic schedule state and claim/complete/fail operations to the in-memory
   and Mongo trigger repositories.
3. Add the generic scheduled-trigger runner with function and registered-task
   executors, bounded timeouts, stable run keys, and graceful shutdown.
4. Extend integration parsing so schedule trigger artifacts install, rerun,
   preserve toggles, and clean up like endpoint triggers.
5. Extend the Triggers API and admin UI with schedule rendering, runtime state,
   `Run now`, confirmation, and last-run details.
6. Register `cms.notifications.dispatch` from `cms-notifications` and declare
   its schedule in Commerce.
7. Add schedule trigger artifacts beside the existing Stripe and Mondial Relay
   system function artifacts.
8. Replace both runtime job arrays with the generic trigger scheduler while
   enabling it by default in production, development, and preview. Add the
   explicit local `--no-workers` maintenance flag.
9. Provision Commerce email templates during installation/rerun and keep the
   worker-side install call only as recovery.
10. Update architecture and integration documentation.

## Validation

- Existing endpoint-trigger tests remain unchanged and pass.
- Parser tests accept schedules and reject invalid intervals, sync/block modes,
  conditions with request references, multiple targets, and unknown shapes.
- Repository tests cover atomic multi-runner claims, lease expiry, toggle
  behavior, rerun preservation, interval changes, and deletion.
- Runner tests cover success, failure, timeout, missing functions/tasks,
  `Run now`, no overlap, shutdown, and deterministic run keys.
- Integration tests prove every previously hard-coded job is installed by its
  owning integration with the same interval and batch size.
- Runtime tests prove production and development contain no integration-specific
  function or task IDs, start scheduling by default, fail closed on scheduler
  initialization errors, and honor the explicit local maintenance flag.
- Admin tests cover scheduled rows, next/last run state, disabling, confirmation,
  and scheduler-unavailable display.

## Rollout

The runtime contains no fallback job arrays. Deployments must publish the
scheduled-trigger infrastructure, rerun the owning integrations to install
their trigger artifacts, verify all nine records, and then restart runtimes
with the generic scheduler enabled. This ordering avoids both a worker gap and
duplicate execution.

## Non-Goals

- Supabase Cron or provider-owned scheduling;
- arbitrary executable code supplied by resource packages;
- cron expressions, calendars, or time-zone scheduling in the MVP;
- retrying provider business operations outside their existing durable queues;
- an unbounded trigger-run log.
