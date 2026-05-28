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

export function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Returns the URL to render for a `MediaItem`. The signature still accepts
 * `width` / `height` so existing call sites stay unchanged, but admin no
 * longer derives variant URLs — the CDN interface doesn't expose
 * `formatImageUrl` (it's a pure object store, not an image-resize service).
 * Folders carry no URL, so the empty-string fallback survives.
 */
export function variantUrl(item: MediaItem, _width?: number, _height?: number): string {
    return item.absoluteURL ?? "";
}
