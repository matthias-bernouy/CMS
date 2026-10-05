# Features audit handoff

Date: 2026-10-01. Branch at audit time: `codex/refonte-sources`.

## Request and status

The requested review covers every package under `packages/features/`, looking for inconsistent structure or concepts, dead code, and duplication. It is an audit only: no implementation or cleanup was authorized as part of this review.

Eight feature packages were inventoried and reviewed. The `cms-repository` review was completed after the initial handoff. No source code was modified by the review; this document records the findings and action plan.

There is no production deployment or production data to preserve. Historical implementation compatibility can be removed rather than maintained through parallel representations. This does **not** eliminate release versioning or upgrade validation: those are current product features, not compatibility with a retired implementation.

| Package | Review status | Main result |
| --- | --- | --- |
| `cms-auth` | Completed | Token lifecycle, provider identity rules, and dormant OIDC flow need attention. |
| `cms-collection-build` | Renamed after audit | Collection build isolation still needs hardening; the editor artifact channel was removed. |
| `cms-content` | Completed | Public export boundary is too broad; a few adapters and validators appear unused. |
| `cms-dashboards` | Removed after audit | The disposable Dashboard aggregate, assignments, collection resource, routes and UI were deleted before the Control Page rebuild. |
| `cms-editor-system-v2` | Removed after audit | The retired editor package and its Control shell were deleted before the planned rewrite. |
| `cms-gateway` | Completed | Media is coupled to generic invocation by an implicit `fileId` convention; HTTP handling is duplicated. |
| `ulvia-official-provider` | Relocated after audit | The official provider is now a direct product package with explicit media identity and a declared server entrypoint. |
| `cms-repository` | Completed | Collection admission and installation disagree; upgrade checks miss text override validity; HTTP source clients duplicate policy. |

## Highest-priority verified findings

1. **Bloc source imports can escape the temporary build directory.** `buildCollectionBloc` passes its entrypoint to `Bun.build` without constraining resolved imports. A [`test.failing`](packages/features/cms-collection-build/tests/buildCollectionBloc.test.ts) demonstrates an absolute import outside the uploaded bundle. See [`buildCollectionBloc.ts`](packages/features/cms-collection-build/src/core/buildCollectionBloc.ts). This matters if untrusted Bloc source is compiled on the server.
2. **Resolved after audit: the compiled Bloc editor channel was removed.** Collection settings and placement now live in declarative collection JSON; collection builds produce only the browser runtime artifact.
3. **Resolved after audit: provider media identity is explicit and consistent.** Contracts opt into media URLs through `media.idInput: "fileId"`; Gateway no longer infers media intent from arbitrary binary inputs, and the official media contract and handler use `fileId`.
4. **Email verification and password reset consume their token before the durable credential change.** A transient failure in `markEmailVerified` or `setPassword` makes the token unusable for retry. This is already documented locally and captured by failing recovery tests. See [`flows.ts`](packages/features/cms-auth/src/application/core/public-flows/flows.ts#L65) and [`publicAuthFailure.test.ts`](packages/features/cms-auth/tests/application/public-flows/publicAuthFailure.test.ts#L13).
5. **Resolved after audit: collection bundles are supported end to end.** CLI authoring, immutable local storage, bounded HTTP transport, CMS admission, Mongo storage and installed Bloc thumbnails now carry verified assets. Collection requirements are admitted against the contract catalogue and reported separately as ready, missing or degraded against the site's selected provider grants.
6. **Resolved after audit: collection upgrades revalidate mutable site state.** Saved text overrides are parsed against the candidate release before the digest changes, and existing Bloc setting declarations cannot silently change during an upgrade.

## Structural and conceptual findings

### `cms-auth`

- `ConsoleEmailer` logs the full email body, which contains verification or reset URLs and tokens. It is exported but has no known workspace runtime consumer. Its behavior conflicts with the package rule against logging these tokens. [`ConsoleEmailer.ts`](packages/features/cms-auth/src/email/default-implementation/ConsoleEmailer.ts#L8)
- `IdentityProviderPatch` can change `kind`, while builtin protection uses the current `kind` to identify the special local provider. Direct management API callers can therefore alter the invariant. The current Control handler does not send `kind`. [`IdentityProvider.ts`](packages/features/cms-auth/src/providers/interfaces/IdentityProvider.ts#L46), [`identityProviderRules.ts`](packages/features/cms-auth/src/application/core/account-lifecycle/identityProviderRules.ts#L10)
- OIDC implementation and routes exist, but the current server runtime composes only local authentication. Treat OIDC as implemented code without a mounted production flow. [`OidcAuthentication.ts`](packages/features/cms-auth/src/application/core/authentication/OidcAuthentication.ts#L32), [`mountSurfaces.ts`](packages/runtimes/cms-server/src/runtime/mountSurfaces.ts#L84)
- SMTP and auth email configuration types are repeated between `cms-auth` and `cms-content`. They are structurally connected only in the runtime. [`ConfiguredEmailer.ts`](packages/features/cms-auth/src/email/default-implementation/ConfiguredEmailer.ts#L7), [`settings.ts`](packages/features/cms-content/src/settings/interfaces/settings.ts#L88)

### `cms-collection-build`

- Resolved after audit: `buildCollectionBloc` now validates `blocId` at its public boundary before creating a temporary path. [`buildCollectionBloc.ts`](packages/features/cms-collection-build/src/core/buildCollectionBloc.ts)
- Package instructions prohibit authored `customElements.define()`, while validation and tests still allow the historical self-registering form. The policy and implementation need one explicit answer. [`AGENTS.md`](packages/features/cms-collection-build/AGENTS.md), [`validateBloc.ts`](packages/features/cms-collection-build/src/core/validateBloc.ts)
- Resolved after audit: the duplicated editor binding metadata disappeared with the compiled editor artifact; browser bindings now come from the public `@bernouy/cms-content/bindings` contract.
- Resolved after audit: the repository-wide `.env` test now documents its actual `cms-collection-build` location. [`env-secret-committed.test.ts`](packages/features/cms-collection-build/tests/server/security/env-secret-committed.test.ts)

### `cms-content`

- The root export repeats `ContentReader`, rendering helpers, and the published snapshot HTTP handler already available through `./rendering`. Control imports some of these from the root. This weakens the documented authoring/rendering split. [`index.ts`](packages/features/cms-content/src/exports/index.ts#L53), [`rendering.ts`](packages/features/cms-content/src/exports/rendering.ts#L3)
- Resolved after audit: generic memory, local-filesystem and S3 blob contracts/adapters now live in `@bernouy/blob-store`; `cms-content` retains only CMS metadata and lifecycle responsibilities. The server composes `LocalFsBlobStore` directly. [`blob-store`](packages/foundation/blob-store/package.json), [`authorFiles.ts`](packages/runtimes/cms-server/src/runtime/stores/authorFiles.ts#L1)
- `validateCategory` and `isValidCategoryFolder` have no known workspace caller. The latter reaches the public API through a wildcard export. [`fields.ts`](packages/features/cms-content/src/application/core/validation/fields.ts#L38), [`predicates.ts`](packages/features/cms-content/src/application/core/validation/predicates.ts#L54)

### Removed `cms-dashboards`

- The audit found a disposable aggregate mixing navigation, layout placement,
  collection activation, member assignments and View grants. With no production
  compatibility requirement, the package, persistence adapters, collection
  resource, routes, UI and tests were removed rather than strengthened.
- Collection Views remain transitional inputs. Future navigation and shells are
  ordinary Blocs inside surface-specific Pages; access policy will be added only
  for a concrete use case.

### `cms-editor-system-v2`

- Resolved after the audit by deleting the package and its Control-owned shell, routes, frames, picker APIs and tests. Stable content persistence and `cms-content` authoring contracts remain available for the replacement editor.

### `cms-gateway`

- Resolved after audit: generic binary invocation produces provider media identity only for a capability with an admitted media declaration.
- `SelectedGatewayCatalogue.list()` skips unavailable/not-ready installations, but a single stale or invalid selected route can abort the entire list. Whether the catalogue is meant to be atomic is not documented clearly. [`SelectedGatewayCatalogue.ts`](packages/features/cms-gateway/src/invocation/core/SelectedGatewayCatalogue.ts#L43)
- Three HTTP handlers duplicate identifier parsing and `GatewayError` status mapping. `unsupported_behavior` maps to 501 in call/file handlers but to the default 503 in the image handler. [`handleHttpCall.ts`](packages/features/cms-gateway/src/invocation/http/handleHttpCall.ts#L95), [`handleImageGet.ts`](packages/features/cms-gateway/src/media/http/handleImageGet.ts#L83)
- The browser media runtime still prioritizes old `data-source-width`/`data-source-height` over current `data-cms-*` attributes. Workspace sources no longer produce the old names. Identity aliases also retain old numeric Source IDs, which may still protect persisted records. [`providerMediaImages.ts`](packages/features/cms-gateway/src/media/browser/providerMediaImages.ts#L23), [`ProviderIdentityAliases.ts`](packages/features/cms-gateway/src/identity/core/ProviderIdentityAliases.ts#L37)
- Several public helpers and `./identity/request-scope` have no known production consumer outside the package. This is only a workspace usage observation; external consumers are unknown. [`package.json`](packages/features/cms-gateway/package.json#L15)

### `ulvia-official-provider`

- Resolved after audit: the handler receives the exact catalogue, forms and media releases claimed by its manifest, requires every served capability at startup and validates JSON/binary outputs against them.
- Resolved after audit: the public handler rejects blank credentials before serving requests.
- The bounded body reader duplicates a pattern used in Gateway and Repository. [`handler.ts`](packages/official-provider/src/http/handler.ts#L98)
- Resolved after relocation: provider tests consume the declared root and `./local-fs` exports instead of its source tree. [`handler.test.ts`](packages/official-provider/tests/handler.test.ts#L7)

### `cms-repository`

- Resolved after audit: collection publication, HTTP transport, import and installation share one bundle contract carrying the release and exact asset bytes; contract catalogues are available during requirement admission.
- Resolved after audit: upgrades revalidate saved text overrides and preserve the existing Bloc settings contract.
- Resolved after audit: the collection Dashboard resource and its parsing, limits, catalogue summaries and compatibility branches were deleted.
- At audit time, `HttpCollectionRepository` and `HttpProviderRepository` duplicated base-URL policy, fetch timeout/redirect handling and bounded stream reads. Their transport has since moved to [`repository-http/`](packages/features/cms-repository/src/repository-http/getBytes.ts); catalogue parsing remains domain-specific in [`collections/sources/parseCatalogue.ts`](packages/features/cms-repository/src/collections/sources/parseCatalogue.ts) and [`providers/sources/parseCatalogue.ts`](packages/features/cms-repository/src/providers/sources/parseCatalogue.ts). The separate identifier and SemVer regexes are still looser than the contract/manifest parsers: a catalogue entry can be displayed then fail admission. [`identifiers.ts`](packages/features/cms-repository/src/contracts/core/parsing/identifiers.ts#L4)
- Conformance suite parsing/admission is a substantial implemented domain (17 source files in `contracts/core/conformance/`) with no caller in the current surfaces or runtimes. The runtime explicitly says live conformance is not implemented. This is unmounted future work, not proof of dead code. Keep or remove it based on product scope, not on a blind unused-symbol pass. [`index.ts`](packages/features/cms-repository/src/exports/contracts/index.ts#L38), [`ProviderConnectionWorkflow.ts`](packages/runtimes/cms-server/src/runtime/gateway/ProviderConnectionWorkflow.ts#L229)
- The package's internal boundaries are comparatively strong: type-only root export, dedicated domain subpaths, architecture tests, immutable artifact admission and revisioned stores. No blocking source-directory fanout was found. The focused repository suite passed: **570 tests, 0 failures across 95 files**.

## What appears sound

Package dependencies generally follow the repository's layer direction. Mongo, filesystem, SMTP, Sharp, and Node HTTP adapters are mostly kept behind dedicated subpaths. The reviewed packages have no blocking directory fanout finding. Several risks already have focused tests, including expected-failure tests that document unresolved behavior. The `cms-gateway` review reported passing architecture checks and 97 package tests; the official provider review reported its single test passing. The repository suite was run again for this review: 570 passing tests. These results should be rerun before implementation work.

## Action plan

1. **Completed: make the collection release scope coherent.** V1 now carries assets and capability requirements through publication, transport, import, installation and upgrade. Persisted text overrides are revalidated.
2. **Make authored Bloc compilation safe and deterministic.** Constrain the resolved import graph to the supplied bundle and remove the historical self-registration form rather than preserving two registration contracts. Public Bloc ID validation and the obsolete editor artifact have already been resolved.
3. **Completed: normalize the provider media contract.** `fileId` and explicit media capability declarations are canonical across contracts, Gateway and the official provider.
4. **Completed: remove the Dashboard model.** Its package, persistence, collection resource, routes, assignments and Control UI are gone. Do not recreate it during the Page rebuild.
5. **Fix auth state transitions.** Make verification/reset token consumption retry-safe and bind the built-in provider invariant to a stable identity. Remove token-bearing console output. Decide whether OIDC is in the current product; either compose and test it or remove its incomplete public flow for now.
6. **Build the new editor on canonical contracts.** Reuse `cms-content` binding types and URL helpers; inject page/file access; represent tree actions as a discriminated union. Avoid carrying over mechanical CSS fragments or direct Control route constants.
7. **Tighten package surfaces.** Share only genuinely common HTTP read/validation primitives, reduce duplicate root exports, remove unused exports and old aliases. With no production deployment, remove historical compatibility branches directly. Keep SemVer and release upgrade checks that support current versioned artifacts.

### Completed first step: collection release path

The chosen V1 scope includes immutable JSON plus separately transported assets and provider-neutral capability requirements. CLI authoring calculates asset metadata, the local repository persists and serves immutable bytes, the HTTP client applies per-asset bounds, CMS admission verifies hashes and contract witnesses, and Mongo stores assets outside the release document. Installed Bloc thumbnails read those verified bytes. Provider readiness remains a separate site concern and is reported as ready, missing or degraded from exact selected contract grants.

Upgrade checks now reject changed settings contracts and invalid saved text overrides before changing the installed digest. Focused tests cover CLI publication, repository HTTP, CMS storage, asset projection, requirement admission, provider readiness and incompatible upgrades.

## Progress after the audit

The follow-up `cms-repository` structure cleanup aligned collection installation adapter folders, extracted the shared repository HTTP transport, separated catalogue parsing and refreshed the package documentation. Later implementation completed the collection release lifecycle described above.

The follow-up editor cleanup removed `@bernouy/cms-editor-system-v2`, the V2 page/composition editor integration from Control and the compiled Bloc editor artifact. Admin page settings, composition CRUD, generic Bloc previews and content persistence remain. Bloc settings and placement are declarative collection JSON, and build ownership now lives in `@bernouy/cms-collection-build`.

Provider follow-up added explicit media declarations, exact-release startup validation for the official provider, administrator enable/disable/revoke actions, credential cleanup on revocation, and collection requirement readiness derived from selected provider grants. Live conformance execution remains intentionally unimplemented rather than being inferred from provider self-reporting.

Dashboard follow-up ultimately removed the package, Mongo and memory storage,
collection format, activation/assignment routes, static pages and Control UI.
The generic gateway execution-plan primitives remain for the future Control Page flow.
