import type { TPage } from "cms-content/interfaces/pages";
import type { TSystem } from "cms-content/interfaces/settings";

/**
 * Read-only view of the content aggregate — the subset public rendering
 * needs: no create/update/delete paths, no editor bundles, no templates.
 * `CmsRepository` extends it, so any repository satisfies a reader.
 *
 * Unlike the admin side, Delivery addresses pages by path only: identifier
 * variants are an authoring concern and don't exist in the public URL space.
 *
 * An adapter that wraps the existing `CmsRepository` is the short-term way
 * to satisfy this contract; longer term, Delivery can bypass the admin DB
 * entirely and read from a projection (file export, S3 snapshot, etc.).
 */
export interface ContentReader {

    // PAGE
    getPage(path: string): Promise<TPage | null>;
    getAllPages(): Promise<TPage[]>;
    getPublishedPage(path: string): Promise<TPage | null>;
    getPublishedPages(): Promise<TPage[]>;

    // BLOC (view only — editor bundles live in the admin)
    getBlocsList(): Promise<{ id: string; name: string; group: string; description: string }[]>;
    getBlocViewJS(tag: string): Promise<string | null>;

    // SYSTEM (theme, favicon, host, language, system page refs)
    getSystem(): Promise<TSystem>;

}
