import type { ContentTextSource } from "cms-content/pages/core/rendering/contentTexts";
import type { TBloc } from "cms-content/blocs/interfaces/blocs";
import type { TPage } from "cms-content/pages/interfaces/pages";
import type { PageReference } from "cms-content/pages/interfaces/routing";
import type { RenderingSettings } from "cms-content/settings/interfaces/settings";

export type RenderableBloc = {
    id: string;
    compositionHTML?: string;
    templateHTML?: string;
    uses?: readonly string[];
    root: TBloc["root"];
    content?: TBloc["content"];
};

export type PageCapabilityRequirement = {
    readonly contractId: string;
    readonly capabilityId: string;
    readonly versionRange: string;
};

export type RenderablePageSource =
    | {
          readonly kind: "site";
          readonly pageId: string;
          readonly revision: number;
      }
    | {
          readonly kind: "contribution";
          readonly sourceId: string;
          readonly contributionId: string;
          readonly version: string;
          readonly digest: string;
          readonly pageId: string;
          readonly generation: number;
          readonly defaultPath: string;
      };

export type RenderablePage = {
    readonly reference: PageReference;
    readonly page: TPage;
    readonly language?: string;
    readonly source: RenderablePageSource;
    readonly requirements: readonly PageCapabilityRequirement[];
};

export type RenderableRouteResolution =
    | { kind: "current"; page: RenderablePage; language: string }
    | Exclude<PublishedRouteResolution, { kind: "current" }>;

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
 * The Kernel normally addresses rendered Pages by path. Stable Page identifiers
 * remain available for read-only machine contracts that must survive a path
 * change, such as a published-page snapshot.
 *
 * An adapter that wraps the existing `CmsRepository` is the short-term way
 * to satisfy this contract; longer term, the Kernel can bypass the authoring DB
 * entirely and read from a projection (file export, S3 snapshot, etc.).
 */
export interface ContentReader {
    getContentTexts?(): Promise<ContentTextSource[]>;
    getContentRevision?(): Promise<number | string>;
    getRenderablePage(path: string): Promise<RenderablePage | null>;
    getRenderablePages(): Promise<RenderablePage[]>;
    resolvePageReference(reference: PageReference): Promise<string | null>;
    resolvePagePaths(paths: readonly string[]): Promise<Readonly<Record<string, string>>>;
    resolveRenderableRoute(path: string): Promise<RenderableRouteResolution | null>;
    // PAGE
    getPublishedPage(path: string): Promise<TPage | null>;
    getPublishedPageById(id: string): Promise<TPage | null>;
    getPublishedPages(): Promise<TPage[]>;
    resolvePublishedRoute(path: string): Promise<PublishedRouteResolution | null>;

    // BLOC (rendering artifacts only)
    getRenderableBlocs(): Promise<RenderableBloc[]>;
    getBlocViewJS(tag: string): Promise<string | null>;

    // SYSTEM (theme, favicon, host, language, system page refs)
    getRenderingSettings(): Promise<RenderingSettings>;
}
