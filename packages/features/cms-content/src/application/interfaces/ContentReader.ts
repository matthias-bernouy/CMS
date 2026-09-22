import type { TPage } from "cms-content/pages/interfaces/pages";
import type { RenderingSettings } from "cms-content/settings/interfaces/settings";

export type RenderableBloc = {
    id: string;
    compositionHTML?: string;
    nativeElement?: string;
};

export type PublishedRouteResolution =
    | { kind: "current"; page: TPage; language: string }
    | { kind: "redirect"; path: string }
    | { kind: "gone"; language: string }
    | { kind: "updating" }
    | { kind: "unavailable" };

/**
 * Read-only view of the content aggregate — the subset public rendering
 * needs: no create/update/delete paths and no editorial page reads.
 *
 * Delivery normally addresses rendered pages by path. Stable page identifiers
 * remain available for read-only machine contracts that must survive a path
 * change, such as a published-page snapshot.
 *
 * An adapter that wraps the existing `CmsRepository` is the short-term way
 * to satisfy this contract; longer term, Delivery can bypass the admin DB
 * entirely and read from a projection (file export, S3 snapshot, etc.).
 */
export interface ContentReader {
    // PAGE
    getPublishedPage(path: string): Promise<TPage | null>;
    getPublishedPageById(id: string): Promise<TPage | null>;
    getPublishedPages(): Promise<TPage[]>;
    resolvePublishedRoute(path: string): Promise<PublishedRouteResolution | null>;

    // BLOC (view only — editor bundles live in the admin)
    getRenderableBlocs(): Promise<RenderableBloc[]>;
    getBlocViewJS(tag: string): Promise<string | null>;

    // SYSTEM (theme, favicon, host, language, system page refs)
    getRenderingSettings(): Promise<RenderingSettings>;
}
