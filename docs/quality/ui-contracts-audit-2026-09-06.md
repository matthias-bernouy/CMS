# UI contracts: initial reviewed audit

Reviewed on 2026-09-06 against application source revision `6acd7b525`. The new checker is described in [UI contracts](./ui-contracts.md). This task adds quality tooling and documentation; it does not modify application behavior or contact a running CMS.

## Machine results

The checked-in [JSON inventory](./ui-contracts-audit-2026-09-06.json) is the
complete static scan, including source evidence and recommendations.

| Scope / severity | Count |
|---|---:|
| Production files scanned | 3,533 |
| HTML / script files | 341 / 3,192 |
| Scripts reachable from configured browser entrypoints | 1,070 |
| ERROR: component-owned binding core | 3 |
| WARNING: imperative browser HTTP | 77 |
| INFO: document cores / infrastructure HTTP | 7 / 3 |
| Distinct files with ERROR or WARNING | 56 |

The source/form checks found no errors or warnings on this revision. This means
no defect matched the implemented static rules; it does not prove every form or
flow works. No application fixes are included in this audit.

The three errors are Dashboard navigation, Dashboard view, and runtime widget
mounting; the detailed ownership discussion below explains each one. The ten
informational findings are explicit document producers and the binding/editor
transaction transport boundaries, all still visible in the JSON inventory.

## Scope and interpretation

This inventory contains every direct `fetch(...)` call in Control browser components, Mossa TypeScript blocs, foundation visual components, and feature editor components at this revision: **78 application callsites across 54 files** (Control: **54 / 31**; Mossa: **18 / 17**; foundation visual components: **3 / 3**; feature editor: **3 / 3**). No direct calls were found in Control `src/core/editorSystemV2`. These callsites were reconciled one-for-one with the scanner findings; a callsite is not necessarily an unnecessary request. The two fetches implementing the shared binding transport (`source/fetcher.ts:31`, `submit/submitRequest.ts:17`) are infrastructure and excluded from these 78 application callsites. It excludes generated bundles, tests, server requests, SDK-internal requests and indirect dynamic script loads. No XMLHttpRequest/EventSource/WebSocket call was found in these searched scopes.

No entry in this audit grants a policy exemption. “Justified specialized mechanism” records a technically defensible transport boundary for explicit review. A callsite can serve many endpoints and callers. Categories below describe a recommended primary treatment, not blanket file exemptions. In particular, mixed helpers need operation-level reconciliation. A “binding gap” means an explicit adapter or API projection is needed to preserve behavior; it is not an approved permanent exception. “Needs more evidence” identifies a shared callsite whose different callers require separate treatment before a scanner exemption can be justified.

| Recommended treatment | Callsites |
|---|---:|
| migrate-to-binding | 58 |
| justified specialized mechanism | 7 |
| binding gap | 10 |
| needs more evidence | 3 |

## Existing binding capability evidence

- `packages/foundation/components/src/binding/source/fetcher.ts:26`: source requests expose loading/error/outcome state and cancellation; report queries and aborted searches are not intrinsically exceptional.
- `packages/foundation/components/src/binding/submit/formSerialization.ts:4`: supports GET/HEAD/POST/PUT/PATCH/DELETE, FormData and structured additional fields. File uploads are not a blanket capability gap.
- `packages/foundation/components/src/binding/submit/nestedFormData.ts:7`: arrays and nested field paths are supported; role grants can be serialized declaratively.
- `packages/foundation/components/src/binding/submit/submitRequest.ts:4`: submit results include success/status/body/message but read JSON/text. They do not expose a Blob body or arbitrary response headers. This substantiates the narrow binary-download and diagnostic-response cases.

## Callsite inventory

Paths below are repository-relative. Each row is one direct callsite. Shared reasons are intentionally repeated so scanner findings can be matched by exact location.

| Location | Treatment | Request purpose | Specific rationale / next boundary |
|---|---|---|---|
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/account/onboarding/stripe-connect-onboarding/Bloc.ts:723` | justified specialized mechanism | Tokenize identity directly with Stripe account_tokens | Browser sends profile fields to Stripe using a publishable key and receives token; retain dedicated provider protocol. The separate CMS request helper is not covered by this reason. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/account/onboarding/stripe-connect-onboarding/Bloc.ts:773` | binding gap | Read onboarding state/config and submit token continuation | Ordinary reads should migrate; account/bank token creation precedes CMS continuation. Needs explicit provider-token-to-submit adapter retaining busy/error semantics, not a blanket Stripe exemption. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/account/orders/order/Bloc.ts:278` | migrate-to-binding | Load order and related resources; perform order action | Detail projection and ordinary mutation; combine related metadata server-side if needed. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/account/orders/purchases/Bloc.ts:251` | migrate-to-binding | Load current user purchases | Ordinary list, currently with custom pending-request cache and error wrapper. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/checkout/checkout/Bloc.ts:813` | binding gap | Load checkout data; update account, create order, set relay | Reads should migrate; ordered writes use newly created order IDs. Preserve sequencing through a server operation or explicit multi-step submit adapter, not blind independent forms. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/checkout/commerce-stripe-payment/Bloc.ts:623` | needs more evidence | CMS payment requirements/create/refresh wrapper | Mixed: legal requirements and create are ordinary data/actions, but refreshPaymentUntilSettled :532-557 performs deadline/backoff reconciliation after Stripe confirmation. A narrow payment coordinator is justified; do not allow all CMS calls merely because Stripe is present. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/checkout/service-withdrawal/Bloc.ts:196` | migrate-to-binding | Read orders and submit withdrawal request | Ordinary selection source and form. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/fulfillment/commerce-mondial-relay-sale-fulfillment/Bloc.ts:195` | migrate-to-binding | Read fulfillment and create shipment/request label/declare handoff | Existing helper reads JSON, not a binary label stream. Shipping terminology alone does not justify specialized transport. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/fulfillment/mondial-relay-picker/runtime/operations.ts:115` | migrate-to-binding | Search relay points and select one | Map integration/selection remains local; CMS search and selection result are ordinary source/form data. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/negotiation/commerce-negotiation-form/controller/Bloc.ts:251` | migrate-to-binding | Create negotiation proposal | Standard createMyProposal form mutation. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/negotiation/commerce-negotiation-list/controller/Bloc.ts:575` | migrate-to-binding | List proposals, withdraw or respond | myProposals list and withdrawMyProposal/respondToProposal actions; signals and local selection do not require private transport. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/offers/catalogue/commerce-offer-filter/schema/schema-loader.ts:9` | binding gap | Load category schema to generate filters | Transport is ordinary; schema-to-control compiler needs a source-result adapter and explicit missing-category behavior. Private promise cache is not independently justified. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/offers/catalogue/valuation/Bloc.ts:186` | migrate-to-binding | Search products for valuation | Ordinary query-driven list. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/offers/details/commerce-sale-detail/Bloc.ts:162` | migrate-to-binding | Read current user sale detail | Single mySale GET used for display. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/offers/pricing/commerce-offer-price-form/controller/Bloc.ts:668` | binding gap | Load offer/pricing/provider state and submit activation/price changes | Ordinary reads/actions should migrate; provider account-token continuation needs a documented adapter. Separate it from the external Stripe helper. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/offers/pricing/commerce-offer-price-form/stripe-account-token.ts:7` | justified specialized mechanism | Tokenize account profile directly with Stripe | Dedicated external provider protocol with publishable key; tokens return to application, profile tokenization remains browser-to-provider. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/offers/public/public-offer/controller/Bloc.ts:265` | migrate-to-binding | Read public offer and related information | Server projection plus source binding can supply page data. |
| `packages/resources/official-integrations/integrations/collections/mossa/blocs/domains/commerce/selling/sell/Bloc.ts:642` | binding gap | Register seller, create offer, upload images, submit version | publish :544-587 chains dependent IDs, per-image uploads and expectedVersion. Requires a documented workflow coordinator/server operation; migrate simple option/account reads separately. Multipart itself is supported. |
| `packages/surfaces/cms-control/src/components/admin/Actions/ProviderActions/ProviderActions.ts:101` | migrate-to-binding | Enable/disable or delete identity provider | PATCH/DELETE form actions; built-in provider rules and confirmation do not require custom networking. |
| `packages/surfaces/cms-control/src/components/admin/Actions/UserActions/UserActions.ts:61` | migrate-to-binding | User account actions | Ordinary action response, toast, redirect/reload; these are submit lifecycle concerns. |
| `packages/surfaces/cms-control/src/components/admin/Common/ConfirmForm/ConfirmForm.ts:64` | binding gap | Confirm deletion and retry on dependency conflict | A 409 response lists consumers and requires a second explicit force confirmation. Preserve this two-stage interaction through a binding confirmation adapter; blanket exemption would also cover simple deletes. |
| `packages/surfaces/cms-control/src/components/admin/Common/CredentialSelect/flows.ts:14` | migrate-to-binding | Read credential keys and create credential | Ordinary dependent select and create form; keep local dialog and emitted selection event. |
| `packages/surfaces/cms-control/src/components/admin/Common/CredentialSelect/flows.ts:27` | migrate-to-binding | Read credential keys and create credential | Ordinary dependent select and create form; keep local dialog and emitted selection event. |
| `packages/surfaces/cms-control/src/components/admin/Common/PageSettings/PageCopySource.ts:106` | migrate-to-binding | Search/select a page to copy | Query-driven source with cancellation; keep selection and validity behavior in the input controller. |
| `packages/surfaces/cms-control/src/components/admin/Common/PageSettings/pagePathAvailability.ts:33` | binding gap | Validate path uniqueness asynchronously | Needs an explicit source-to-field validity adapter preserving stale-request guards and current-path exclusion; do not turn each form validator into a separate network owner. |
| `packages/surfaces/cms-control/src/components/admin/Common/RoleSelect/RoleSelect.ts:58` | migrate-to-binding | Read available roles and assign one | Select source and ordinary JSON mutation. |
| `packages/surfaces/cms-control/src/components/admin/Common/RoleSelect/RoleSelect.ts:90` | migrate-to-binding | Read available roles and assign one | Select source and ordinary JSON mutation. |
| `packages/surfaces/cms-control/src/components/admin/Common/SystemSettings/store.ts:27` | migrate-to-binding | Cache global settings snapshot with revision retry | Duplicates shared source/cache lifecycle; consolidate data ownership or server projection. |
| `packages/surfaces/cms-control/src/components/admin/Common/Tokens/TokenCreate.ts:47` | migrate-to-binding | Create token and reveal one-time value | Submit result can display the value without private networking; preserve one-time display semantics. |
| `packages/surfaces/cms-control/src/components/admin/DashboardWorkspace/api.ts:13` | migrate-to-binding | Load dashboard session and scoped dashboard metadata | Session-driven UI metadata can use a binding source; authorization scope alone is not an exemption. |
| `packages/surfaces/cms-control/src/components/admin/Layout/Analytics/api.ts:144` | migrate-to-binding | Read analytics report with query and abort signal | Charts can consume binding data. Query cancellation is already a source capability; chart rendering does not justify fetch ownership. |
| `packages/surfaces/cms-control/src/components/admin/Layout/AnalyticsPrivacySettings/api.ts:55` | migrate-to-binding | Read privacy/compliance and save settings/snapshot | Plain settings forms and report reads; combine presentation data server-side where useful. |
| `packages/surfaces/cms-control/src/components/admin/Layout/EndpointPerformance/api.ts:77` | migrate-to-binding | Read endpoint performance report | Same query-driven report pattern; keep chart rendering local, source lifecycle declarative. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Auth/LoginMethods/LoginMethods.ts:22` | migrate-to-binding | Load login method links | Ordinary list render with returnTo URL composition and local-auth fallback. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/api.ts:119` | migrate-to-binding | Refresh dashboard definitions and load user picker | Plain metadata/option lists; main definition view already uses cms-source, so private refresh transport duplicates ownership. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/navigation/management.ts:5` | migrate-to-binding | Load installations to append management navigation | Navigation aggregation belongs in the server projection and a source scope. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/runtime/source.ts:11` | migrate-to-binding | Resolve generic detail/lookup source JSON | Dynamic endpoint metadata is already compiled into cms-source elsewhere in this runtime. Request dedupe/cancellation alone does not justify a second transport. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/runtime/source.ts:41` | migrate-to-binding | Submit runtime media FormData | Multipart forms are supported. Preserve widget callbacks through submit result events. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/runtime/source.ts:74` | needs more evidence | Shared JSON action and binary-download transport | JSON action branch should migrate; sendSourceDownload at :49 needs Blob plus Content-Disposition filename, absent from current binding result. Extract or narrowly allow binary operation rather than entire shared helper. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Functions/api.ts:27` | migrate-to-binding | Read function details and catalog | Ordinary editor metadata sources. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Functions/api.ts:37` | migrate-to-binding | Read function details and catalog | Ordinary editor metadata sources. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Functions/api.ts:45` | binding gap | Create function from authored definition object | Editor produces an arbitrary definition tree; needs a documented structured-draft-to-submit adapter. Serializer supports additional structured fields internally, so this is an interface gap, not proof fetch is necessary forever. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Functions/api.ts:67` | justified specialized mechanism | Execute a function in the diagnostic runner | Returns HTTP status, JSON/text body and content-type as inspected output even for non-2xx responses. Narrow diagnostic transport is reasonable; current submit result does not expose response headers. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Functions/api.ts:95` | migrate-to-binding | Resolve field options and seed fields from source endpoints | Callers are create/fields.ts:126 and :147, not a generic HTTP explorer. Dynamic options/seed reads are normal source data. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Integrations/api.ts:114` | migrate-to-binding | Read definitions/versions; import, rerun, upgrade | Typed JSON metadata and form actions. Resource selection and previews are local state, not a reason for an independent request/cache system. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Integrations/api.ts:122` | migrate-to-binding | Read definitions/versions; import, rerun, upgrade | Typed JSON metadata and form actions. Resource selection and previews are local state, not a reason for an independent request/cache system. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Integrations/management/api.ts:11` | migrate-to-binding | Read source settings/health and invoke management actions | Ordinary source metadata/actions, including Dashboard management callers; server authorization already owns management scope. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Triggers/api.ts:27` | migrate-to-binding | Read triggers/functions; enable or manually run trigger | Lists, option catalogs and ordinary actions; no special response protocol. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Triggers/api.ts:39` | migrate-to-binding | Read triggers/functions; enable or manually run trigger | Lists, option catalogs and ordinary actions; no special response protocol. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Triggers/api.ts:40` | migrate-to-binding | Read triggers/functions; enable or manually run trigger | Lists, option catalogs and ordinary actions; no special response protocol. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Triggers/api.ts:55` | binding gap | Create authored trigger definition | Same structured definition adapter requirement as function authoring; preserve typed definition values. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Triggers/api.ts:67` | migrate-to-binding | Read triggers/functions; enable or manually run trigger | Lists, option catalogs and ordinary actions; no special response protocol. |
| `packages/surfaces/cms-control/src/components/admin/Resources/Triggers/api.ts:79` | migrate-to-binding | Read triggers/functions; enable or manually run trigger | Lists, option catalogs and ordinary actions; no special response protocol. |
| `packages/surfaces/cms-control/src/components/admin/RoleEditor/RoleEditor.ts:44` | migrate-to-binding | Read role editor and save grants | Nested grants arrays are representable by supported form serialization. Checkbox collection is not a fundamental transport gap. |
| `packages/surfaces/cms-control/src/components/admin/RoleEditor/RoleEditor.ts:144` | migrate-to-binding | Read role editor and save grants | Nested grants arrays are representable by supported form serialization. Checkbox collection is not a fundamental transport gap. |
| `packages/surfaces/cms-control/src/components/admin/Secrets/actions.ts:16` | migrate-to-binding | Read, create, delete secrets | JSON list and form mutations. Secret sensitivity does not require a different browser HTTP lifecycle. |
| `packages/surfaces/cms-control/src/components/admin/Secrets/actions.ts:24` | migrate-to-binding | Read, create, delete secrets | JSON list and form mutations. Secret sensitivity does not require a different browser HTTP lifecycle. |
| `packages/surfaces/cms-control/src/components/admin/Secrets/actions.ts:38` | migrate-to-binding | Read, create, delete secrets | JSON list and form mutations. Secret sensitivity does not require a different browser HTTP lifecycle. |
| `packages/surfaces/cms-control/src/components/admin/Theme/editor/api.ts:5` | binding gap | Save complete theme settings graph | persistTheme validates reference cycles and submits an in-memory themes graph plus activeThemeId. Retain validation/controller and expose a structured draft adapter to binding; success-versus-refresh-failure messages are distinct. |
| `packages/surfaces/cms-control/src/components/editorSystemV2/catalog.ts:54` | justified specialized mechanism | Merge bloc lifecycle with dynamically registered editor catalogue | The catalogue is bootstrapped after editor-script registration and controls insertability. It configures the editor runtime rather than rendering a page list; narrow bootstrap allowance is defensible. |
| `packages/surfaces/cms-control/src/components/editorSystemV2/documentLoad.ts:10` | migrate-to-binding | Load editable page metadata | Ordinary GET. A source-result adapter can call shell.setPageConfig; redirect/auth behavior must remain. |
| `packages/surfaces/cms-control/src/components/editorSystemV2/documentMutations.ts:5` | justified specialized mechanism | Persist serialized editor document | Canvas document snapshots are editor transactions rather than native field submissions. Preserve the editor save acknowledgement/failure boundary; narrowly allow document transport, not every editor API. |
| `packages/surfaces/cms-control/src/components/editorSystemV2/shellSetup.ts:49` | justified specialized mechanism | Load source contracts and theme settings into editor shell | Bootstrap sets imperative editor catalog/data-source/theme-token interfaces and frame URL. A runtime boot adapter is justified; ordinary settings screens are separate. |
| `packages/surfaces/cms-control/src/components/editorSystemV2/siteBloc/siteBlocApi.ts:78` | needs more evidence | Shared composition load/catalogue/save/publish/archive client | Mixed wrapper: optimistic draft revisions and save/publish ordering belong to editor transactions; catalogue and archive reads/actions may migrate. Split or annotate individual operations before allowing the shared fetch. |
| `packages/surfaces/cms-control/src/components/media/GridMedia/api/read.ts:16` | migrate-to-binding | List and filter files | Ordinary folder query/list; project display fields server-side and use a source scope. |
| `packages/surfaces/cms-control/src/components/media/GridMedia/api/read.ts:66` | migrate-to-binding | Build ancestor breadcrumb | Sequential parent reads can become a breadcrumb API projection; ancestry is not a special browser transport. |
| `packages/surfaces/cms-control/src/components/media/GridMedia/api/write.ts:6` | migrate-to-binding | Rename, delete, create folder, move metadata | Standard JSON mutations; confirmations and selection remain local behavior. |
| `packages/surfaces/cms-control/src/components/media/GridMedia/api/write.ts:20` | migrate-to-binding | Rename, delete, create folder, move metadata | Standard JSON mutations; confirmations and selection remain local behavior. |
| `packages/surfaces/cms-control/src/components/media/GridMedia/api/write.ts:25` | migrate-to-binding | Rename, delete, create folder, move metadata | Standard JSON mutations; confirmations and selection remain local behavior. |
| `packages/surfaces/cms-control/src/components/media/GridMedia/api/write.ts:56` | migrate-to-binding | Upload files and replace file content | Binding supports multipart FormData. Preserve per-file progress and local object-URL previews in a small controller; do not exempt the whole media API. |
| `packages/surfaces/cms-control/src/components/media/GridMedia/api/write.ts:75` | migrate-to-binding | Upload files and replace file content | Binding supports multipart FormData. Preserve per-file progress and local object-URL previews in a small controller; do not exempt the whole media API. |
| `packages/surfaces/cms-control/src/components/media/GridMedia/api/write.ts:99` | migrate-to-binding | Rename, delete, create folder, move metadata | Standard JSON mutations; confirmations and selection remain local behavior. |

## Foundation visual components: three additional migration candidates

| Location | Treatment | Request purpose | Specific rationale / next boundary |
|---|---|---|---|
| `packages/foundation/components/src/ui/Form/Inputs/TokenInput/remoteOptions.ts:57` | migrate-to-binding | Read remote token options and merge with local options | TokenInput connects/reloads this helper at `TokenInput.ts:59,74`, then merges options at `:141`. Supply options declaratively; the local normalization/deduplication function can remain. Load counters and stale-result checks do not justify separate HTTP ownership. |
| `packages/foundation/components/src/ui/Form/Selection/TagSuggest/domain/api.ts:14` | migrate-to-binding | Read tag suggestions for a resource | An ordinary option list, with a hard-coded fallback `../api/tags` at `:9`. That CMS endpoint default also conflicts with the foundation package's generic responsibility; the containing CMS view should own the source URL and pass options. |
| `packages/foundation/components/src/ui/DataDisplay/Dataviz/dataviz.ts:10` | migrate-to-binding | Read JSON statistics/chart data | Called by `Stat/Stat.ts:26`, `BarList/BarList.ts:23`, `LineChart/LineChart.ts:23`. Query forwarding and null-on-error duplicate binding lifecycle. Keep chart rendering as visual component behavior, bind its input data. |

## Feature editor: three reconciled scanner findings

| Location | Treatment | Request purpose | Specific rationale / next boundary |
|---|---|---|---|
| `packages/features/cms-editor-system-v2/src/components/Controls/Pickers/FilesCenter/filesCenterDomain.ts:50` | migrate-to-binding | List files in the current folder for a picker | `FilesCenter.ts:85` loads items with parentId, accept, sortBy and limit; this is an ordinary options/list source. Keep selection, breadcrumb and MIME filtering local if needed, but let the owning document source supply the list. A picker is not an autonomous document and does not justify a private binding core either. |
| `packages/features/cms-editor-system-v2/src/components/Controls/Pickers/PageLink/Internals/PageLinkController.ts:88` | migrate-to-binding | Load page link options, optionally published only | `connectedCallback` at `:14` invokes loadPages, which fills the local list and summary. The published-only query and loaded guard are ordinary source concerns. Preserve link selection and local filtering while moving request ownership to the document binding source. |
| `packages/features/cms-editor-system-v2/src/components/Layout/Shell/Domain/Mutations/media.ts:71` | justified specialized mechanism | Read selected SVG source and import sanitized nodes into the authored iframe document | This branch is reached only for an accepted SVG after CMS-file URL validation (`:61`) and MIME validation. It reads text and passes it to `Content/inlineSvg.ts:54`, which parses XML, sanitizes the SVG tree, removes unsupported nodes and imports into the frame document. Callers in `Content/mediaContentMutations.ts:29,53,83,114` use the produced elements for document insert/replace operations. This is an asset-to-document authoring transformation, not a list/data render or form submission. A narrow import transport is technically defensible; do not use it to exempt the FilesCenter or PageLink listing requests. No scanner exception is granted by this audit. |

## Dashboard composition: current technical design versus approved target policy

**CMS ownership policy:** only the application shell or an autonomous document owns a binding core. Under this policy, Dashboard navigation/view private cores and their hidden JSON bridges are **errors to refactor**, even though the existing runtime supports them. They are not runtime bugs, and technical compatibility is not final policy compliance. The runtime widget mount is an **exemption candidate requiring an explicit ownership decision**, with no silent allowlist.

The current engine deliberately treats nested cores as independent owners: `packages/foundation/components/src/binding/core/attrs.ts:27` documents that boundary, `binding/runtime/discovery.ts` implements boundary-aware discovery, and the current foundation `AGENTS.md` says nested cores are isolated. This explains why the present Shadow DOM implementation works; it does not supersede the new user policy. Case-by-case evidence:

1. **Definition view:** `packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/view/template.html:2` owns the view's source scope. `view/controller/DashboardViewController.ts:11` starts its bound source and at `:21` sets `/api/dashboards as dashboards`. Example/external modes skip this source. The controller observes the JSON handoff and compiles server-supplied widget definitions; it does not perform the list HTTP request itself. Nevertheless, this is a private component data scope, not an autonomous document: **target-policy ERROR**. Refactor source ownership to the document shell and replace the hidden JSON/MutationObserver bridge with declarative composition or an explicitly supported data handoff.
2. **Navigation:** `packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/navigation/nav.html:1` activates binding in a separate component's markup and feeds the official `w13c-lateral-menu`. Independent Shadow DOM ownership explains its current technical role, but navigation is not a document: **target-policy ERROR**. The document shell should own the source and navigation composition. The additional imperative management-installation read at `navigation/management.ts:5` remains a migration candidate; a currently functioning core does not excuse this second data lifecycle.
3. **Runtime widget mount:** `packages/surfaces/cms-control/src/components/admin/Resources/Dashboards/runtime/mounting/mount.ts:16` creates a binding core around widgets compiled from runtime Dashboard definitions, then replaces the current mount at `:21`. The source schema is known only at runtime, making this a compiler/activation boundary with a stronger technical case than the hidden JSON bridge. However, it still creates a core inside the application: **exemption candidate pending an explicit ownership decision**. Decide whether the mount is truly an autonomous document, or compile into the owning shell core. Do not silently exempt its file. `mountSource.ts:19` resolves source metadata and suppresses requests when required parameters are missing; `mountSource.ts:37` generates `cms-source`, loading/error states and source reload behavior. `mountSource.ts:60` creates row templates using `cms-repeat`. Detail/navigation/relation mounts reuse this pattern.

Keep the narrow source lifetimes: missing selection must not trigger an invalid endpoint; creating a new item must not fetch a nonexistent resource; targeted detail refresh must not reload every dashboard. `runtime/mounting/detail.ts` handles new-resource and saved-result reuse, and per-detail reload events. A static rule should report all three current core locations under the target policy. Record the compiler/mount rationale separately for review; do not automatically allow it or arbitrary renderers that create cores.

## Recommended reconciliation and order

1. Match scanner JSON to exact location and endpoint callers. Keep totals for raw findings separate from accepted violations, provisional gaps and narrowly justified mechanisms.
2. Begin with ordinary admin metadata/forms, Dashboard duplicate reads, Mossa lists/details/proposals and shipping JSON actions. These have clear source/submit equivalents.
3. Define structured draft, async field validity and dependent workflow adapters before migrating authoring, checkout and seller publishing. Preserve revision and sequencing contracts. Do not label these “complex” and leave them unexamined.
4. Split mixed transport helpers before granting exceptions: Dashboard JSON versus binary; composition simple reads versus document transactions; payment metadata versus reconciliation. Allowing the helper file would silently excuse unrelated cases.
5. Keep Stripe account-token requests, editor transaction/bootstrap interfaces and diagnostic response transport narrowly documented. Stripe SDK script loading and confirmation are additional specialized mechanisms but are not included in the 78 application direct-fetch count.

Callsite review used source code and callers, without requests to a live CMS or provider. The manual classifications do not automatically create policy exemptions.

## Exact scanner reconciliation

The scanner reports **80 HTTP callsites in 56 files**. Every one of the
**78 application callsites in 54 files** has an exact `file:line` row above.
The remaining two locations implement the binding transport itself:
`packages/foundation/components/src/binding/source/fetcher.ts:31` and
`packages/foundation/components/src/binding/submit/submitRequest.ts:17`.
There are no unmatched, extra, or duplicate callsites in this reconciliation.

The HTTP results are **77 WARNING / 3 INFO**. `documentLoad.ts:10` is an ordinary
metadata GET and remains WARNING. `documentMutations.ts:5` is the documented
editor transaction boundary and is INFO, alongside the two binding transports.
Therefore the manual 78-call classification totals 58 migration candidates,
10 binding gaps, seven specialized mechanisms and three mixed helpers. Of the
seven specialized mechanisms, one is already an explicit INFO boundary and six
remain warnings requiring a narrow policy decision.

## Separate in-progress Blocs worktree

The same scripts also read the uncommitted Blocs worktree based on `4c7dad309`
at `/tmp/cmscore-blocs-workspace-20260906`, without modifying it. Its totals are
**3,546 files, 4 ERROR, 77 WARNING, 11 INFO**. The differences are exactly:

- `packages/surfaces/cms-control/src/components/admin/Resources/Blocs/view/library.html:1`:
  one additional **ERROR**. This component fragment creates a private core inside
  the existing admin document. Move the binding markup into the document's
  static light DOM; there is no document-boundary justification for this core.
- `packages/surfaces/cms-control/src/core/content/bloc/preview/document.ts:44`:
  one additional **INFO**. This creates a complete sandboxed preview document
  with its own HTML shell and disabled binding. It is an explicit document
  owner, so its core is justified.

The `__BASE_PATH__` / `__COLLECTION__` assembly markers in that unfinished
worktree are outside these first automated rules. The presence of the private
core is detected independently. This supplemental scan does not validate the
worktree's build or runtime and is excluded from the main revision's counts.

## Tooling validation

The initial comparable baseline passed all seven existing `check:all` checks
after a normal build generated component declarations. The final run passes
those same seven checks and fails only the added UI contract check on the three
reported Dashboard owners. All 45 focused quality/CI tests pass (168 assertions).
Formatting, workspace/tooling typechecks, and `git diff --check` pass.

Repository shape reports three new informational eight-entry directories:
`quality/ui-contracts`, `markup`, and `network`. These preserve distinct parser,
policy, discovery, reporting, and test responsibilities; no directory error or
handwritten TypeScript file above 180 lines was introduced.
