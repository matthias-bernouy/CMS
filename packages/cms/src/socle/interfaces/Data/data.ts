/**
 * Data provider contracts.
 *
 * A data provider is a registered OpenAPI source the CMS knows how to
 * consume. Phase 2 stores the basic shape; later phases parse the spec,
 * apply auth, generate mocks and expose endpoints to consumer blocks.
 *
 * `id` is the user-chosen slug used as the binding key in blocks. It is
 * immutable — renaming would orphan every block that references it.
 */

export type TDataHeader = { name: string; value: string };

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
    auth: TDataAuth;
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
 * Slim per-bucket lists of resources that reference a data provider via
 * the `cms:schema:<id>:...` URN. Used by the delete-blocked flow so the
 * admin sees what would break before forcing the deletion.
 */
export type DataProviderConsumers = {
    pages:     { path: string; title: string }[];
    templates: { identifier: string; name: string }[];
    snippets:  { identifier: string; name: string }[];
};
