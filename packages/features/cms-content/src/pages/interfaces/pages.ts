export type PageIndexingConfiguration = {
    /** Whether search engines may index this page or its discovered entity URLs. */
    enabled: boolean;
    /** CMS-owned projection of selected gateway capabilities for this dynamic page. */
    entity?: {
        contractId: string;
        label: string;
        /** Public page query parameter bound to the entity identity. */
        pageQueryParam: string;
        resolve: {
            capabilityId: string;
            inputParam: string;
            identityPath: string;
        };
        discover?: {
            capabilityId: string;
            itemsPath: string;
            identityPath: string;
            lastModifiedPath?: string;
            pagination?:
                | { type: "offset"; limitParam: string; offsetParam: string; pageSize: number; totalPath?: string }
                | {
                      type: "cursor";
                      cursorParam: string;
                      nextCursorPath: string;
                      limitParam?: string;
                      pageSize?: number;
                  };
        };
        variables: Record<string, { path: string; type: "text" | "url" | "image" | "date" | "number" }>;
    };
};

export type TPage = {
    id: string;
    /** Primary public path used by delivery and route lookups. */
    path: string;
    /** Local path per site language. Absent until the site has a default language. */
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
    ownerPageId: string;
    language: string;
};

/**
 * Reference to a specific page by its primary key. `null` means "not set".
 */
export type TPageRef = { path: string; id?: string } | null;
