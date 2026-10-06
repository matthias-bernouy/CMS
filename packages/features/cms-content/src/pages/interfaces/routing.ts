import type { PageSurface } from "@bernouy/cms-repository/collections";

export type SitePageReference = { readonly kind: "site"; readonly pageId: string };

export type PageReference =
    | SitePageReference
    | {
          readonly kind: "collection";
          readonly publisherId: string;
          readonly collectionId: string;
          readonly pageId: string;
      };

export type PageLinkTarget =
    | { readonly kind: "page"; readonly page: PageReference }
    | { readonly kind: "url"; readonly url: string };

export interface SurfacePageRoute {
    readonly page: PageReference;
    readonly surface: PageSurface;
    readonly defaultPath: string;
    readonly overridePath?: string;
    readonly path: string;
    readonly revision: number;
}

export interface SurfacePageRouteRegistration {
    readonly page: PageReference;
    readonly surface: PageSurface;
    readonly defaultPath: string;
}

export interface SurfacePageRouteRegistry {
    register(siteId: string, input: SurfacePageRouteRegistration): Promise<SurfacePageRoute>;
    list(siteId: string): Promise<readonly SurfacePageRoute[]>;
    get(siteId: string, page: PageReference): Promise<SurfacePageRoute | null>;
    resolve(siteId: string, surface: PageSurface, path: string): Promise<SurfacePageRoute | null>;
    updateDefault(
        siteId: string,
        page: PageReference,
        defaultPath: string,
        expectedRevision: number,
    ): Promise<SurfacePageRoute>;
    setOverride(
        siteId: string,
        page: PageReference,
        overridePath: string | null,
        expectedRevision: number,
    ): Promise<SurfacePageRoute>;
    remove(siteId: string, page: PageReference, expectedRevision: number): Promise<void>;
}

export interface PageRouteReader {
    get(page: PageReference): Promise<SurfacePageRoute | null>;
}

export interface ResolvedPageLink {
    readonly href: string;
    readonly surface: PageSurface | "external";
}
