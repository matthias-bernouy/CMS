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
    /** Primary public path. Kept for existing consumers and older records. */
    path: string;
    /** Local path per site language; non-default public paths add the language prefix. */
    paths?: Record<string, string>;
    content: string;
    title: string;
    description: string;
    /** Optional SEO copy by language; absent fields inherit the page title and description. */
    seo?: Record<string, { title?: string; description?: string }>;
    visible: boolean;
    tags: string[];
    /** Absent means that indexing has not been configured yet. */
    indexing?: PageIndexingConfiguration;
};

export type PageRoute = {
    path: string;
    state: "current" | "redirect" | "gone";
    /** The page currently serving this path or receiving its redirect. */
    pageId: string;
    /** Original owner, retained when deletion redirects this route to another page. */
    ownerPageId?: string;
    language: string;
};

/**
 * Reference to a specific page by its primary key. `null` means "not set".
 */
export type TPageRef = { path: string; id?: string } | null;
