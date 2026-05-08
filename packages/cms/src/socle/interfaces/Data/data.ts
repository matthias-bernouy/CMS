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
    id: string;
    name: string;
    source: TDataProviderSource;
    sourceUrl: string;
    spec: string;
    auth: TDataAuth;
    createdAt: Date;
    lastSyncAt: Date | null;
};

/**
 * Slim projection used by the admin Data table — never returns the raw
 * spec or auth secrets to the browser.
 */
export type TDataProviderListItem = {
    id: string;
    name: string;
    source: TDataProviderSource;
    endpointCount: number;
    lastSyncAt: string;
};
