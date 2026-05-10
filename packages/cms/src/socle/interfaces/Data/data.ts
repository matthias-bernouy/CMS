/**
 * Data provider contracts.
 *
 * A data provider is a registered OpenAPI source the CMS knows how to
 * consume. Phase 2 stores the basic shape; later phases parse the spec,
 * apply rules, generate mocks and expose endpoints to consumer blocks.
 *
 * `id` is the user-chosen slug used as the binding key in blocks. It is
 * immutable — renaming would orphan every block that references it.
 */

import type { RulesConfig } from "@bernouy/cdn-buckets";

export type TDataHeader = { name: string; value: string };

/**
 * Admin-time auth, used **once** to fetch the OpenAPI doc at
 * `sourceUrl`. Stays simple (bearer / headers / none) because it never
 * touches the runtime path — the spec is fetched via `cms.secrets`
 * resolution and that flow is fine as-is.
 */
export type TDataAuth =
    | { type: 'none' }
    | { type: 'bearer'; token: string }
    | { type: 'headers'; headers: TDataHeader[] };

export type TDataProviderSource = 'url' | 'file' | 'paste' | 'official';

export type TDataProvider = {
    /** Slug — primary key + display label + binding key in blocs. Immutable. */
    id: string;
    source: TDataProviderSource;
    /** URL where the OpenAPI spec was fetched from. */
    sourceUrl: string;
    /** Base URL of the actual API endpoints. Auto-derived from the spec's
     *  `servers[0].url` (3.x) or `schemes`+`host`+`basePath` (2.0). Empty
     *  when the spec carries no server info — the admin must fill it
     *  manually before the provider is usable at runtime. */
    server: string;
    spec: string;
    /** Admin-time auth, used to fetch the OpenAPI document at `sourceUrl`. */
    specAuth: TDataAuth;
    /**
     * Declarative rules forwarded to the cdn-edge proxy. Same DSL as
     * `BucketProxy.rules` (`@bernouy/cdn-buckets`): defaults +
     * per-path `on_request` / `on_response` primitives. Validated at
     * write time by the `parseRulesConfig` + `validateRules` pair from
     * cdn-buckets. The publisher pushes this verbatim to cdn-buckets,
     * which wraps the matching `secrets` values via envelope crypto
     * before persistence. Default `{ paths: {} }` (catch-all forward
     * to upstream with no extra processing).
     */
    rules: RulesConfig;
    /**
     * envName → cleartext, supplying values for the `${env:NAME}`
     * interpolations referenced inside `rules`. Cleartext on the wire,
     * encrypted by cdn-buckets at rest. Every `${env:NAME}` in `rules`
     * MUST have a matching key here; the validate endpoint catches
     * mismatches before commit.
     */
    secrets: Record<string, string>;
    createdAt: Date;
    lastSyncAt: Date | null;
};

/**
 * Slim projection used by the admin Data table — never returns the raw
 * spec or auth secrets to the browser.
 *
 * `syncLabel` / `syncColor` are pre-computed for the admin tag rendering
 * so the template can stay free of conditional logic (cms-fetch templates
 * don't support if/else).
 */
export type TDataProviderListItem = {
    id: string;
    source: TDataProviderSource;
    /** Base URL of the API — empty when not derived from the spec yet. */
    server: string;
    endpointCount: number;
    lastSyncAt: string;
    syncLabel: string;
    syncColor: string;
};

/**
 * Slim per-bucket lists of resources whose content references a data
 * provider's `server` URL. Used by the delete-blocked flow so the
 * admin sees what would break before forcing the deletion.
 */
export type DataProviderConsumers = {
    pages:     { path: string; title: string }[];
    templates: { identifier: string; name: string }[];
    snippets:  { identifier: string; name: string }[];
};

/**
 * Editor-side mockup for a single (provider, method, path) operation.
 *
 * Used only at edit time: the editor's fetch proxy hits
 * `POST /api/data/mock` and the server returns the active mockup so the
 * preview renders without calling the real API.
 *
 * `path` is the OpenAPI-templated path (e.g. `/users/{id}`) — not a
 * concrete URL. The matcher resolves a concrete URL to its templated
 * counterpart before looking up the mockup.
 *
 * Composite key: `(providerId, method, path, name)`. Exactly one mockup
 * per `(providerId, method, path)` carries `active = true` at any time —
 * `setActiveMockup` enforces it.
 */
export type TDataMockup = {
    providerId: string;
    method:     string;  // upper-case HTTP verb ("GET", "POST", ...)
    path:       string;  // OpenAPI path template ("/users/{id}")
    name:       string;  // user-friendly label, unique per (providerId, method, path)
    status:     number;  // HTTP status code returned by this mockup (200, 401, ...)
    body:       string;  // raw JSON body, served verbatim with Content-Type: application/json
    active:     boolean;
    updatedAt:  Date;
};
