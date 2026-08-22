export type SourceFieldPath = string;

export const SOURCE_INDEXING_VARIABLE_TYPES = ["text", "url", "image", "date", "number"] as const;
export type SourceIndexingVariableType = (typeof SOURCE_INDEXING_VARIABLE_TYPES)[number];

export const MAX_SOURCE_INDEXING_PAGE_SIZE = 1_000;

export type SourceIndexingOffsetPagination = {
    type: "offset";
    limitParam: string;
    offsetParam: string;
    /** Limit requested on every discovery call. */
    pageSize: number;
    /** Optional dotted path to the total number of discoverable entities. */
    totalPath?: SourceFieldPath;
};

export type SourceIndexingCursorPagination = {
    type: "cursor";
    cursorParam: string;
    /** Dotted response path to the cursor for the next discovery call. */
    nextCursorPath: SourceFieldPath;
    /** Optional bounded page size; both fields are declared together. */
    limitParam?: string;
    pageSize?: number;
};

export type SourceIndexingPagination = SourceIndexingOffsetPagination | SourceIndexingCursorPagination;

export type SourceIndexingVariable = {
    /** Dotted path relative to the resolved entity response. */
    path: SourceFieldPath;
    type: SourceIndexingVariableType;
};

export type SourceIndexingIdentity = {
    /** Stable name exposed to page bindings, for example `slug` or `id`. */
    key: string;
    /** Request parameter accepted by the resolution endpoint. */
    inputParam: string;
    /** Dotted path to the canonical identity in the resolved response. */
    outputPath: SourceFieldPath;
};

export type SourceIndexingEntity = {
    /** Stable capability id selected by a page configuration. */
    id: string;
    resolve: {
        endpointUrn: string;
        identity: SourceIndexingIdentity;
    };
    discover: {
        endpointUrn: string;
        /** Dotted path to the indexable entity array in a discovery response. */
        itemsPath: SourceFieldPath;
        /** Dotted path relative to each discovered item. */
        identityPath: SourceFieldPath;
        pagination?: SourceIndexingPagination;
        /** Dotted path relative to each discovered item. */
        lastModifiedPath?: SourceFieldPath;
    };
    /** Named values available to SEO templates and future structured-data mappings. */
    variables: Record<string, SourceIndexingVariable>;
    /** Suggestions copied into a page configuration; a page remains free to override them. */
    defaults?: {
        titleTemplate?: string;
        descriptionTemplate?: string;
    };
};

export type SourceIndexing = {
    /** Capabilities offered by the source. A page must still opt into and bind one entity. */
    entities: SourceIndexingEntity[];
};
