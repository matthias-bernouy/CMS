/** Stable identity of an ordinary site-owned Page. */
export type PageReference = { readonly kind: "site"; readonly pageId: string };
export type SitePageReference = PageReference;
export type PageLinkTarget =
    | { readonly kind: "page"; readonly page: PageReference }
    | { readonly kind: "url"; readonly url: string };
export interface PageRouteReader {
    get(page: PageReference): Promise<{ readonly path: string } | null>;
    resolvePath(path: string): Promise<{ readonly path: string } | null>;
}
export interface ResolvedPageLink {
    readonly href: string;
    readonly external: boolean;
}
