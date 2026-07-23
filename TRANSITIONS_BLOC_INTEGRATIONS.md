# Integration Bloc Data Transition

Status: proposed technical direction. This document describes a migration; it does not authorize changing published integration versions in place.

## Executive Decision

Official integration blocs should stop implementing their own transport to `/.cms/sources`, but they should not all become purely declarative.

Use three explicit paths:

```text
Simple read or form
    -> cms-source binding
    -> CmsCore source proxy

Workflow requiring response data in JavaScript
    -> shared requestCmsSource client
    -> CmsCore source proxy

Browser-only provider operation
    -> provider SDK or explicitly approved provider request
```

The recommended target is therefore hybrid:

- `cms-source` owns ordinary reads, lists, loading/error/empty presentation, and simple form submissions.
- A shared CMS source browser client owns imperative CMS calls required by workflows.
- Bloc code owns domain presentation, state machines, sequencing, polling, and provider SDK integration.
- Direct provider calls are exceptional, documented, and never confused with CmsCore source calls.

The architectural rule should be: **no hand-written `fetch` to the CmsCore source proxy from an official bloc**.

## Current State

There are 34 official blocs:

| Category | Count | Notes |
| --- | ---: | --- |
| No remote access | 20 | Seventeen Basic Blocs plus three presentation-only integration blocs |
| Existing `cms-source` binding | 4 | Basic Form, Commerce Offer List, Commerce Account Offers, User Account Form |
| Imperative browser transport | 10 | Listed below |

The ten imperative blocs contain 13 literal `fetch` calls across 11 files:

- Eleven calls use `/.cms/sources/...` and therefore already pass through the CmsCore source proxy.
- Two calls target Stripe V2 account tokenization directly from the browser.
- No bloc directly contacts Supabase REST, Storage, or Functions.

Their local `request`, `requestJson`, and `requestSource` wrappers account for roughly 261 lines. Removing those wrappers will improve consistency, but it will not make the largest blocs small by itself: most of their remaining code is rendering, validation, provider integration, and workflow state.

The server-side security boundary is already present. The proxy resolves and authorizes endpoints in [`handleSourceRequest.ts`](packages/features/cms-sources/src/http/handleSourceRequest.ts). The duplicated responsibility is browser transport and UI orchestration, not backend endpoint execution.

Existing binding-based blocs provide useful precedents:

- Commerce Offer List and Commerce Account Offers set a reactive `cms-source` URL and let the template render the response.
- User Account Form uses bindings for reads, JSON submissions, and file upload while retaining a small JavaScript controller to sequence avatar upload and profile save.
- Basic Form deliberately contains no custom network logic.

## Goals

- Remove duplicated CMS URL construction, credentials, JSON parsing, abort handling, and error normalization.
- Use the binding runtime where it reduces code and makes data behavior editable and observable.
- Preserve public bloc attributes, events, slots, form behavior, and rendered semantics.
- Keep the source proxy as the only browser entry point for CmsCore-managed endpoints.
- Preserve direct-to-provider tokenization when it prevents sensitive payment data from passing through CmsCore.
- Support incremental, versioned rollout instead of a repository-wide flag day.
- Add enough tests that transport refactors cannot silently change workflows.

## Non-goals

- Turning the binding runtime into a general workflow engine.
- Expressing Stripe.js, provider SDK callbacks, polling, redirects, or multi-step transactions in HTML attributes.
- Banning `fetch` from Supabase Edge Functions or provider connectors.
- Replacing domain-specific rendering with increasingly complex interpolation expressions.
- Mutating a published integration version merely to avoid creating an upgrade path.

## Approaches Considered

### A. Keep Per-bloc Fetch Implementations

Positive aspects:

- No migration or compatibility cost.
- Each bloc can implement any workflow without runtime limitations.
- Shadow DOM blocs remain fully isolated.

Negative aspects:

- URL, credentials, JSON handling, errors, and cancellation continue to drift.
- Fixes must be repeated across unrelated integrations.
- Source behavior is harder to inspect in the editor and harder to test consistently.
- New blocs are likely to copy the existing wrappers.

Verdict: acceptable only as a temporary baseline.

### B. Introduce Only a Shared Imperative CMS Source Client

Positive aspects:

- Lowest-risk way to eliminate the duplicated transport.
- Works inside both Light DOM and Shadow DOM.
- Preserves existing rendering and event contracts.
- Fits Stripe and multi-source workflows without expanding the binding language.

Negative aspects:

- Loading, error, empty, and rendering state remain implemented by every bloc.
- Data dependencies remain less visible to the editor and page preflight.
- Simple blocs retain more JavaScript than necessary.

Estimated cost: 5-10 person-days including characterization tests and compiler integration.

Verdict: valuable foundation, but incomplete as the final architecture.

### C. Convert Every Bloc to Pure Declarative Binding

Positive aspects:

- Maximum consistency for ordinary reads and forms.
- Less bloc-owned network state when the workflow maps naturally to the binding model.
- Static bindings can be inspected and configured by editor tooling.

Negative aspects:

- The current binding does not expose automatic GET payloads to JavaScript.
- Sibling sources share status but not response data.
- Nested request bodies and cross-source transformations are limited.
- Polling, retry/backoff, provider SDKs, custom provider headers, and response chaining are not supported.
- Seven of the ten affected blocs currently render in Shadow DOM, which the outer binding discovery does not traverse.
- The binding would gradually become an opaque workflow language that is harder to debug than TypeScript.

Estimated cost: 45-70+ person-days, with continuing runtime complexity afterward.

Verdict: rejected as a global objective.

### D. Hybrid Binding and Shared Client

Positive aspects:

- Uses declarative behavior for the cases it models well.
- Keeps complex sequencing explicit and testable in TypeScript.
- Removes all hand-written CMS transport without banning legitimate provider calls.
- Can be adopted bloc by bloc.
- Follows the existing User Account Form precedent.

Negative aspects:

- Maintainers must understand both the binding and the imperative client.
- A decision rule is required to avoid arbitrary implementation choices.
- Some blocs will still own significant state and presentation code.
- Versioning and persisted page content still require an upgrade strategy.

Estimated cost: 25-40 person-days for the core migration, or approximately five to eight weeks for one developer.

Verdict: recommended.

### E. Add Selective Composite Server Endpoints

This is a supporting technique rather than a repository-wide replacement strategy.

Positive aspects:

- Keeps transactional sequencing, idempotency, secrets, and authorization on the server.
- Can replace several dependent browser reads with one coherent read model.
- Simplifies a bloc when the combined operation is genuinely a domain capability.

Negative aspects:

- Can create UI-shaped endpoints and couple source contracts to one bloc.
- Adds backend contracts, implementation, authorization, versioning, and tests.
- Becomes wasteful when introduced only to bypass a presentation limitation in the binding.

Verdict: consider for Commerce Negotiation and transactional workflows only when the operation has independent domain meaning.

## Binding Capabilities and Gaps

The current runtime already provides automatic GET, request cancellation, loading/error/empty/loaded states, reactive URL parameters, repeats, conditions, form submission, JSON, multipart, success/failure events for submissions, and event-driven reloads. See [`Source.ts`](packages/foundation/components/src/binding/source/Source.ts) and [`submission.ts`](packages/foundation/components/src/binding/source/submission.ts).

The following gaps matter to this migration:

1. Automatic GET data is rendered but is not exposed through a stable lifecycle API for bloc JavaScript.
2. `$sources` exposes sibling source statuses, not their payloads.
3. `cms-source-body` supports query parameter, page state, and raw scalar fields, but not general nested object construction.
4. Delivery has no general money/date presentation filter set for these domain blocs.
5. There is no polling, retry policy, dependent-request graph, or provider SDK hook.
6. Binding discovery uses Light DOM traversal and does not cross Shadow DOM roots.
7. The bloc compiler shim advertises `auto` and `submit`, while the wider binding contract also supports `change`; this divergence should be fixed before relying on that trigger.
8. Document-global publish/reload events can collide when several instances use the same event name unless instance scoping is designed explicitly.
9. Rich HTML interpolation and provider-supplied values require an explicit XSS review; transport consolidation must not broaden `innerHTML` usage.

These gaps should be addressed only when a real migrated bloc needs them. They are not a reason to create a general workflow engine up front.

## Target Technical Boundaries

### Declarative Binding

Use binding when all of the following are true:

- The operation is a normal GET or form submission through the CmsCore source proxy.
- Rendering can be expressed with repeats, conditions, interpolation, and simple presentation helpers.
- No provider SDK needs the raw response.
- No dependent multi-source workflow is required.
- The binding can exist in Light DOM and participate in editor preview behavior.

### Shared CMS Source Browser Client

Extend the existing, currently type-oriented [`@bernouy/cms-sources/browser`](packages/features/cms-sources/src/exports/browser.ts) public subpath with a small browser API, provisionally `requestCmsSource`. It should accept a source ID and endpoint rather than an arbitrary external URL and should provide:

- safe source URL construction and encoding;
- standard methods and query parameters;
- JSON and FormData bodies, empty responses, and an explicit response kind when binary data is genuinely required;
- `credentials: "include"`;
- `AbortSignal` support;
- latest-request-wins protection when used by reactive widgets;
- normalized success, HTTP failure, invalid response, network failure, and abort outcomes;
- optional response validation without importing server adapters;
- no automatic retry for mutations;
- focused browser tests.

The generic binding package must not depend on the feature-layer `cms-sources` package. If the binding and CMS client share a transport primitive, that primitive must remain foundation-level. Otherwise, a small intentional duplication between the generic binding transport and the CMS-specific wrapper is preferable to reversing the workspace dependency direction.

The bloc compiler must either bundle this small client or expose it as a stable external runtime API. Externalization reduces repeated bundle bytes but introduces a host/runtime compatibility contract; bundling is simpler but embeds one client copy in every affected bloc. This decision must be made before migration begins.

### Provider Boundary

Stripe.js and Stripe V2 account tokenization remain imperative. They require provider-specific APIs, publishable credentials, headers, and SDK state. They must not be routed through a generic CMS source binding merely to satisfy a no-`fetch` metric.

Every direct provider exception should identify:

- the provider and endpoint family;
- why the browser must call it directly;
- which credential class is used;
- why sensitive data should not pass through CmsCore;
- the tests protecting that boundary.

Provider code must continue to obey CSP, forbidden-header policy, publishable-versus-secret credential boundaries, and response projection rules. A generic client must never make secret provider credentials available to a bloc.

### Shadow DOM

Do not mount an independent binding core inside each Shadow DOM as the default solution. Editor forced states and binding-disable behavior do not reliably cross that boundary, and nested runtimes complicate lifecycle ownership.

Use this policy:

- Convert simple, content-oriented blocs to Light DOM `Composition` when doing so improves editable structure.
- Keep stateful widgets and provider SDK containers in Shadow DOM and use the shared client.
- Consider a general Shadow DOM bridge only after at least two concrete migrations demonstrate the same requirement.

## Bloc-by-bloc Direction

Standalone estimates overlap because the client, tests, and runtime improvements are shared.

| Bloc | Current behavior | Recommended target | Complexity |
| --- | --- | --- | ---: |
| `newsletter-subscription` | One subscription POST | Binding form; preserve the existing saved event | Low, 1-2 days |
| `commerce-account-sales` | Paginated/filterable sales GET | Binding read plus presentation controller | Medium, 2-4 days |
| `commerce-sale-detail` | Sale GET and reload after fulfillment event | Binding read plus derived presentation and reload glue | Medium, 3-6 days |
| `commerce-negotiation-list` | List GET and accept/reject/withdraw actions | Binding list/forms plus small action controller | Medium, 3-5 days |
| `commerce-negotiation-form` | Parallel policy/proposal reads and creation POST | Hybrid; consider a composite read endpoint | High, 5-8 days |
| `commerce-mondial-relay-sale-fulfillment` | Read plus three mutations, label opening, custom event | Hybrid binding/client with explicit event glue | High, 4-7 days |
| `mondial-relay-picker` | Search, restore, save, form-associated selection | Shared client; keep selection state in JavaScript | High, 4-7 days |
| `commerce-offer-price-form` | Sequential CMS calls, profile update, system functions, Stripe tokenization | Shared client; bind only isolated presentation if useful | Very high; partial migration only |
| `commerce-stripe-payment` | Config/create, Stripe Elements, confirmation, redirects, polling | Shared client for CMS calls; keep workflow imperative | Very high; partial migration only |
| `stripe-connect-onboarding` | Status/profile/config reads, tokenization, submit, wallet state | Shared client for CMS calls; keep workflow imperative | Very high; partial migration only |

## Migration Plan

### Phase 0: Characterize Existing Contracts

- Record every public attribute, source ID default, source prefix, event name, event detail, slot, and form-associated behavior.
- Add behavioral tests for loading, failures, retries/reloads, submissions, and disconnect/abort behavior.
- Cover Stripe polling and redirect branches with deterministic fakes.
- Add a scoped quality diagnostic for raw `fetch` calls to `/.cms/sources` inside integration bloc browser sources. Do not scan Edge Functions and connectors.
- Begin as a warning if needed; make it blocking once the shared client exists.

### Phase 1: Establish the Shared Client

- Define the browser API and normalized error model.
- Implement URL construction, JSON/FormData serialization, credentials, and abort behavior.
- Decide bundling versus compiler externalization.
- Add unit tests and one integration test through the Delivery source proxy.
- Document provider-call exceptions separately from CMS calls.

### Phase 2: Run Two Pilots

- Migrate `newsletter-subscription` to validate a simple submission and legacy event compatibility.
- Migrate `commerce-account-sales` to validate GET rendering, pagination, formatting, and the Light DOM decision.
- Test both in Delivery and the editor frame, including forced loading/error/empty states.
- Review the result before adding binding features.
- Keep a deliberate exit point: if Shadow DOM conversion or editor behavior is disproportionately expensive, retain the shared-client architecture for that class of bloc.

Expected pilot cost: 5-10 person-days including shared groundwork.

### Phase 3: Migrate Ordinary Reads and Actions

- Migrate `commerce-sale-detail` after deciding how its presentation and fulfillment reload event are divided.
- Migrate the declarative portions of `commerce-negotiation-list`.
- Preserve existing custom events even when binding publish events are also used.
- Prefer small presentation helpers over adding domain rules to the generic binding runtime.

### Phase 4: Migrate Hybrid Workflows

- Evaluate a composite read endpoint for `commerce-negotiation-form`; otherwise use the shared client for the joined read model.
- Use binding for suitable forms in fulfillment, but keep label navigation and business events explicit.
- Keep Mondial Relay Picker form association and selection state imperative.
- Add a GET lifecycle/data API only if these migrations prove it is safer than the client approach.

### Phase 5: Normalize Complex Stripe Workflows

- Replace local CMS request wrappers in Offer Price, Stripe Payment, and Stripe Connect Onboarding with the shared client.
- Keep Stripe.js, direct tokenization, confirmation, wallet state, redirects, and polling explicit.
- Do not expand the binding merely to reduce the TypeScript line count of these workflows.

### Phase 6: Editor and Preflight Integration

- Replace raw source ID/endpoint text settings with the existing endpoint picker where the endpoint is user-selectable.
- Keep fixed internal system-function dependencies non-editable.
- Decide how blocs declare source dependencies that are created inside their runtime templates.
- Extend page preflight to consume declared bloc dependencies if static HTML scanning cannot see them.
- Ensure authenticated source denial behaves consistently before and after hydration.

### Phase 7: Versioned Rollout

- Treat published `1.0.0` resource directories as immutable.
- Create new integration versions for the seven affected integrations when required.
- Update catalog stable/latest pointers intentionally.
- Test clean installation and rerun/upgrade from the previous version.
- Preserve old bloc attributes and events or provide an explicit migration.
- Account for persisted page children: changing a bloc's default Light DOM content does not automatically rewrite existing page instances.
- Retain the previous version's artifacts long enough to support rollback and verify how identical custom-element tags behave across installed versions.
- Roll out simple integrations before payment and fulfillment integrations.

## Testing and Quality Gates

A migrated bloc is not complete until it has:

- transport unit tests covering JSON, empty/204, invalid JSON, non-2xx, server messages, network failure, abort, query encoding, JSON/FormData, and concurrent stale responses;
- component tests for loading, empty, error, loaded, submit, and reload behavior;
- tests with multiple instances to detect global event collisions and double submissions;
- editor tests proving that previews do not perform unintended live mutations;
- Delivery tests for authenticated and forbidden source access;
- focused tests for CSP-sensitive provider loading, payment idempotency, and polling timeouts;
- compatibility tests for existing attributes and custom events;
- no raw CmsCore source-proxy `fetch` outside an approved temporary allowlist;
- `bun run check:all`, relevant package tests, typecheck, and build results recorded;
- a clean integration install and, when applicable, rerun/upgrade test.

The static diagnostic must distinguish three cases:

- CmsCore proxy call from a bloc: blocking after the client is available.
- Direct provider browser call: allowed only with a documented exception.
- Connector or Edge Function call: outside this rule.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Shadow-to-Light DOM changes styling or selectors | Pilot one simple Shadow DOM bloc and add rendered DOM/style regression tests |
| Binding events differ from legacy bloc events | Keep an explicit compatibility adapter until consumers migrate |
| A declarative rewrite hides complex control flow | Move the workflow back to the shared client instead of extending expressions |
| Runtime-generated bindings bypass page preflight | Add static bloc source dependency metadata or preflight artifact inspection |
| Client and binding error semantics diverge | Share a foundation transport outcome where practical and contract-test both paths |
| Externalized client breaks old integration bundles | Version the public runtime API and keep a compatibility surface |
| New default templates do not update existing pages | Provide an explicit content migration or preserve compatible internal markup |
| Provider exceptions become a general escape hatch | Require narrow endpoint/provider justification and targeted tests |
| Refactoring payment flows creates financial regressions | Change transport separately from workflow logic and retain state-machine tests |
| A repeated mutation is retried or double-submitted | Never retry mutations implicitly; preserve idempotency keys and lock submit state |
| Several bloc instances react to one global event | Scope event names or payloads and test multiple instances on one page |
| Provider data reaches an unsafe HTML sink | Keep escaping by default and review every intentional rich-HTML path |

## Cost Scenarios

| Scope | Estimate | Outcome |
| --- | ---: | --- |
| Shared client and characterization only | 5-10 person-days | Removes duplicated CMS transport with minimal UI change |
| Recommended hybrid core migration | 25-40 person-days | Declarative simple blocs, shared client for complex workflows |
| Hybrid plus full editor/preflight/versioned rollout hardening | 30-48 person-days | Operationally complete migration for published integrations |
| Literal pure-binding rewrite | 45-70+ person-days | Larger binding runtime and poor fit for provider workflows |

If the current `1.0.0` resources have never been released or installed outside development, the lower estimates apply and approximately three to six days of release migration work may disappear.

## Completion Criteria

The transition is complete when:

- no official bloc hand-writes transport to `/.cms/sources`;
- simple reads and forms use binding unless a documented constraint prevents it;
- complex blocs use one supported CMS source browser client;
- direct provider calls are explicitly reviewed and allowlisted;
- public bloc behavior remains compatible or has a versioned migration;
- editor preview, Delivery authorization, and page preflight behavior are understood and tested;
- published integration versions remain immutable;
- installation, rerun, and upgrade tests pass for every affected integration.

## Decisions Required Before Implementation

1. Is `@bernouy/cms-sources/browser` the stable public home of `requestCmsSource`?
2. Should the bloc compiler bundle that client or map it to a versioned host runtime API?
3. Which current `1.0.0` integrations are already considered published and immutable?
4. Should runtime-generated bloc source dependencies become explicit artifact metadata for preflight?
5. Which simple Shadow DOM blocs may become Light DOM compositions without breaking styling contracts?

Recommended answers are: use the browser subpath, prefer a stable external for remote integrations after a bundled pilot, never mutate released versions, add declared source dependencies, and decide Shadow versus Light DOM per bloc rather than globally.
