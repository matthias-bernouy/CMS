import { withFileVersion } from "@bernouy/cms-files/urls";

export type MediaItem = {
    id: string;
    type: "folder" | "image" | "other";
    label: string;
    /**
     * Ready-to-use URL served by the active CDN provider. Populated from
     * socle's `FileMetadata.absoluteURL`. Folders carry no URL. The admin UI
     * renders this as-is; CDN doesn't expose a URL builder so no variants
     * are derived on the admin side.
     */
    absoluteURL?: string;
    /** sha256 of the bytes — the cache-bust token for the DISPLAY url only (see
     *  `variantUrl`). Kept off `absoluteURL` so the copied / picked-into-content
     *  value stays the clean `/by-id/<id>` (the renderer injects the live `?v`). */
    contentHash?: string;
    mimetype?: string;
    size?: number;
    width?: number;
    height?: number;
    alt?: string;
};

export type BreadcrumbEntry = {
    id: string;
    label: string;
};

export function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * The URL to DISPLAY a `MediaItem` in the admin (grid thumbnail, detail
 * preview). It is `absoluteURL` plus a `?v=<contentHash>` cache-bust so a
 * replaced file (same id, new bytes) repaints instead of showing the immutable
 * cached image. The token is added HERE only — `absoluteURL` itself stays the
 * clean `/by-id/<id>` for copy-URL and for what gets stored when picked.
 *
 * `width`/`height` are still accepted (call sites unchanged) but ignored: admin
 * derives no resize variants — the seam for Milestone B's variant URLs.
 */
export function variantUrl(item: MediaItem, _width?: number, _height?: number): string {
    const url = item.absoluteURL ?? "";
    if (!url || !item.contentHash) return url;
    return withFileVersion(url, item.contentHash);
}
