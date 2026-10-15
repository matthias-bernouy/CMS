export type SitePageReference = { readonly kind: "site"; readonly pageId: string };

export type PageReference =
    | SitePageReference
    | {
          readonly kind: "contribution";
          readonly sourceId: string;
          readonly contributionId: string;
          readonly pageId: string;
      };

export type PageLinkTarget =
    | { readonly kind: "page"; readonly page: PageReference }
    | { readonly kind: "url"; readonly url: string };

export interface RegisteredPageRoute {
    readonly page: PageReference;
    readonly defaultPath: string;
    readonly overridePath?: string;
    readonly path: string;
    readonly revision: number;
}

export interface PageRouteRegistration {
    readonly page: PageReference;
    readonly defaultPath: string;
}

export interface PageRouteRegistry {
    register(siteId: string, input: PageRouteRegistration): Promise<RegisteredPageRoute>;
    list(siteId: string): Promise<readonly RegisteredPageRoute[]>;
    get(siteId: string, page: PageReference): Promise<RegisteredPageRoute | null>;
    resolve(siteId: string, path: string): Promise<RegisteredPageRoute | null>;
    resolveDefault(siteId: string, defaultPath: string): Promise<RegisteredPageRoute | null>;
    updateDefault(
        siteId: string,
        page: PageReference,
        defaultPath: string,
        expectedRevision: number,
    ): Promise<RegisteredPageRoute>;
    setOverride(
        siteId: string,
        page: PageReference,
        overridePath: string | null,
        expectedRevision: number,
    ): Promise<RegisteredPageRoute>;
    remove(siteId: string, page: PageReference, expectedRevision: number): Promise<void>;
}

export interface PageRouteReader {
    get(page: PageReference): Promise<RegisteredPageRoute | null>;
    resolvePath(path: string): Promise<RegisteredPageRoute | null>;
}

export interface ResolvedPageLink {
    readonly href: string;
    readonly external: boolean;
}
