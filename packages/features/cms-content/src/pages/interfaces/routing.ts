import type { PageSurface } from "@bernouy/cms-repository/collections";

export type PageReference =
    | { readonly kind: "site"; readonly pageId: string }
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
    register(input: SurfacePageRouteRegistration): Promise<SurfacePageRoute>;
    get(page: PageReference): Promise<SurfacePageRoute | null>;
    resolve(surface: PageSurface, path: string): Promise<SurfacePageRoute | null>;
    updateDefault(page: PageReference, defaultPath: string, expectedRevision: number): Promise<SurfacePageRoute>;
    setOverride(page: PageReference, overridePath: string | null, expectedRevision: number): Promise<SurfacePageRoute>;
    remove(page: PageReference, expectedRevision: number): Promise<void>;
}

export interface ResolvedPageLink {
    readonly href: string;
    readonly surface: PageSurface | "external";
}
