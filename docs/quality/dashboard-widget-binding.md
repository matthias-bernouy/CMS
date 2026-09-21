# Dashboard binding architecture and verification

Dashboard definitions are composed into the page's light DOM. The document
binding core owns source reads, conditions, interpolation and repeats. Components
may provide visual shells with shadow-DOM styles or light-DOM behavior without
global styles. They must not introduce a second response-to-DOM renderer.

See [data bindings](../blocs/data-bindings.md) and
[UI contracts](./ui-contracts.md).

## Ownership

- `@bernouy/cms-dashboards` defines and validates declarative widgets and forms.
- Control's `runtime/mounting` and widget composition functions derive structure
  from definitions, using fragments in
  `packages/surfaces/cms-control/src/static/admin/_content/sources/_runtime/`.
- Widget `configure()` receives definitions. Source responses stay in binding
  state; `setSourceContext` projects display values and local drafts into scope.
- Visual controls expose slots and ordinary form values. They do not receive
  whole resources encoded in `data-config-json` or `data-source-json` attributes.
- Main and aside share one form. Operation, media-upload and related-detail
  forms have separate ownership; native forms must never be nested.

Nested repeats use the inherited item context, including child arrays.
Composition does not require `cms-use`, a template-reference API or keyed
reconciliation. Ordinary values use interpolation, such as `value="{{ item.name }}"`,
and existing boolean bindings. There is no `cms-bind-value`, `getFormValue()` or
`setBindingValue()` component protocol.

Read sources retain their content while refreshing. Controllers still own
navigation, selection, drafts and mutation completion. The presence of a
controller is not itself a second rendering engine.

## Specialized transports

`runtime/actions/forms/ActionForms` (implemented in `index.ts`) composes a
short-lived hidden form for multipart uploads. The page binding still owns the
request lifecycle and result events.

Binary downloads retain a narrow fetch path because they need Blob content and
response headers. Removing these calls requires preserving their actual
behavior, not suppressing a quality warning or inventing a hidden payload.

The `/admin/sources/example` sandbox is still routed and imports the shared
widget compositions. It is an active example, not an orphaned component.

## Checks

Run `bun run check:all` before and after changes, plus `bun run build` when the
browser bundle changes. `bun run check:ui-contracts` checks core ownership,
markup and suspicious programmatic networking. It does not prove that a helper
is used: its browser discovery deliberately treats component files as entry
candidates. Reference and import analysis are separate cleanup checks.

For a binding or form change, exercise the real bundle with Playwright:

1. Load a detail and verify initial error, empty and retry states.
2. Edit text, boolean, numeric and structured controls; assert exact submitted
   values, identity/revision fields, and the absence of nested forms.
3. Delay or reject Save. Preserve the draft and block duplicate submission.
4. After success, verify the shared GET, updated revisions and normalized values.
   A failed GET retries only the read, never the successful mutation.
5. Retain element handles and measure focus, selection, scroll and geometry
   around normal refreshes. Creation-to-edition navigation is a separate case
   and currently remounts the detail.
6. Exercise related-resource panels, cancel/reopen, independent operations,
   validation in both columns/tabs, and staged media abandonment.
7. Capture desktop and mobile states. Inspect actual section/control bounds as
   well as document width: ancestor clipping can hide overflow from the latter.

Relevant browser suites live under Control's
`tests/browser/dashboards/detail-binding/` and
`tests/browser/dashboards/workspace/`. Source ownership and formatting tests use
actual detail/table mounting rather than wrappers no longer used in production.

Use disposable records for real local writes and clean only those records.
Provider operations requiring credentials can use mocks, but report that limit.
Separate grouped-run timeouts from passing isolated reruns; screenshots alone
are not evidence of timing stability or complete functional coverage.

### Browser command

After `bun run build`, run `bun run test:browser:dashboards` for all Control
dashboard browser tests. Optional paths are relative to Control's `tests/browser`:

```sh
bun run test:browser:dashboards dashboards/detail-binding/actions/forms dashboards/table-binding
```

The command runs each test file once in a fresh Bun process, in sorted order,
retaining its own Playwright browser lifecycle. Any assertion failure, nonzero exit
or 90-second process timeout fails the command. An unmatched filter also fails.
There are no automatic retries or skipped failures. Direct grouped `bun test`
invocations have reproduced Chromium reload/shutdown timeouts even when the same
files pass separately; the underlying grouped-run cause remains unresolved.
