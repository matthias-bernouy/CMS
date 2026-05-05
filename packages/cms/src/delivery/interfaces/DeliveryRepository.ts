import type { TPage, TSnippet, TSystem } from "src/socle/interfaces/models";

/**
 * Read-only data contract consumed by the Delivery layer. Mirrors the subset
 * of `CmsRepository` that public rendering needs — no create/update/delete
 * paths, no editor bundles, no templates.
 *
 * Unlike the admin side, Delivery addresses pages by path only: identifier
 * variants are an authoring concern and don't exist in the public URL space.
 *
 * An adapter that wraps the existing `CmsRepository` is the short-term way
 * to satisfy this contract; longer term, Delivery can bypass the admin DB
 * entirely and read from a projection (file export, S3 snapshot, etc.).
 */
export interface DeliveryRepository {

    // PAGE
    getPage(path: string): Promise<TPage | null>;
    getAllPages(): Promise<TPage[]>;

    // BLOC (view only — editor bundles live in the admin)
    getBlocsList(): Promise<{ id: string; name: string; group: string; description: string }[]>;
    getBlocViewJS(tag: string): Promise<string | null>;

    // SYSTEM (theme, favicon, host, language, notFound, serverError)
    getSystem(): Promise<TSystem>;

    // SNIPPET (for expandSnippets during render)
    getSnippetByIdentifier(identifier: string): Promise<TSnippet | null>;

}
