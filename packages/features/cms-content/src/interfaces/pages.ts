export type PageIndexingConfiguration = {
    /** Whether search engines may index this page or its discovered entity URLs. */
    enabled: boolean;
    /** Optional dynamic entity exposed by the page. Endpoint details remain owned by the source. */
    entity?: {
        sourceUrn: string;
        entityId: string;
        /** Public page query parameter bound to the entity identity. */
        pageQueryParam: string;
    };
};

export type TPage = {
    id: string;
    /** path is unique */
    path: string;
    content: string;
    title: string;
    description: string;
    visible: boolean;
    tags: string[];
    /** Absent means that indexing has not been configured yet. */
    indexing?: PageIndexingConfiguration;
};

/**
 * Reference to a specific page by its primary key. `null` means "not set".
 */
export type TPageRef = { path: string } | null;
