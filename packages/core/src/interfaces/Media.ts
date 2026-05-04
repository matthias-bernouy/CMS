// ─────────────────────────────────────────────────────────────
// File & item types
// ─────────────────────────────────────────────────────────────

export const FILE_TYPES = [
    "image", "video", "audio", "pdf", "document", "text", "archive", "other",
] as const;
export type FileType = typeof FILE_TYPES[number];

export type MediaItemType = FileType | "folder";

// ─────────────────────────────────────────────────────────────
// Item metadata (discriminated union on `type`)
// ─────────────────────────────────────────────────────────────

/** Fields shared by every media item, folders and files alike. */
type BaseItemMetadata = {
    id: string;
    name: string;
    parentFolderID: string | null; // null = root
    createdAt: Date;
    updatedAt: Date;
};

export type FolderMetadata = BaseItemMetadata & {
    type: "folder";
    /**
     * Number of direct children. `undefined` (not `0`) when the provider
     * didn't compute it — callers MUST NOT treat absence as "empty".
     */
    itemCount?: number;
};

/** Fields shared by every file (image or otherwise). */
type BaseFileMetadata = BaseItemMetadata & {
    size: number;        // bytes
    mimeType: string;    // "image/jpeg", "application/pdf", etc.
    absoluteURL: string; // direct-access URL; signing is the provider's concern
};

export type ImageFileMetadata = BaseFileMetadata & {
    type: "image";
    imageInfo: {
        width: number;
        height: number;
    };
};

export type GenericFileMetadata = BaseFileMetadata & {
    type: Exclude<FileType, "image">;
};

export type FileMetadata = ImageFileMetadata | GenericFileMetadata;

export type MediaItem = FolderMetadata | FileMetadata;

// ─────────────────────────────────────────────────────────────
// Error & response wrapper (discriminated union)
// ─────────────────────────────────────────────────────────────

export type MediaErrorCode =
    | "not_found"
    | "unauthorized"
    | "forbidden"
    | "conflict"                // name already in use in the destination folder
    | "folder_not_empty"        // non-recursive delete on a non-empty folder
    | "destination_not_found"   // target parentFolderID does not exist
    | "invalid_name"            // empty, forbidden chars, "..", …
    | "validation_error"        // malformed input (e.g. move into own descendant)
    | "unsupported_mime_type"   // blocked by `limits.acceptedMimeTypes`
    | "file_too_large"
    | "quota_exceeded"
    | "rate_limited"
    | "storage_unavailable"     // upstream provider down / network error
    | "unsupported_operation"   // this provider does not support this call/option
    | "unknown";

export type MediaError = {
    code: MediaErrorCode;
    message: string;
    /** Optional native/provider error attached for logging. Never trust its shape. */
    cause?: unknown;
};

export type MediaResponse<Data> =
    | { ok: true;  data: Data }
    | { ok: false; error: MediaError };

// ─────────────────────────────────────────────────────────────
// Listing / pagination
// ─────────────────────────────────────────────────────────────

export type MediaPagination = {
    page: number;   // 1-based
    limit: number;
};

export type MediaGetItemsOptions = {
    /** Defaults to root. */
    folderID?: string;
    /** Type filter. Mixes folder and file types. */
    accept?: MediaItemType[];
    pagination?: MediaPagination;
    sortBy?: "name" | "createdAt" | "updatedAt" | "size";
    sortOrder?: "asc" | "desc";
    /** Case-insensitive substring match on `name`. Providers that can't
     *  search MAY return `unsupported_operation`. */
    search?: string;
    /** If true, descends into subfolders. Default: false. */
    recursive?: boolean;
};

export type MediaItemsPage = {
    items: MediaItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
};

// ─────────────────────────────────────────────────────────────
// Upload input (portable browser ↔ Node)
// ─────────────────────────────────────────────────────────────

/**
 * Raw payload for an upload. `Blob` works in browsers and modern Node (18+);
 * `Uint8Array` for buffered server-side data; `ReadableStream` for streaming.
 * Implementations MUST accept all three.
 */
export type UploadData = Blob | Uint8Array | ReadableStream<Uint8Array>;

export type MediaUploadFileOptions = {
    data: UploadData;
    /** File name stored in the CMS. Required because `Uint8Array` / `ReadableStream`
     *  carry no intrinsic name. */
    name: string;
    /** Override sniffed content-type. Required when `data` is not a `Blob`. */
    mimeType?: string;
    /** Size hint in bytes. Required when `data` is a `ReadableStream` without
     *  a known length, to allow `file_too_large` validation up-front. */
    size?: number;
    /** Defaults to root. */
    folderID?: string;
    /** If false (default), a name clash returns `conflict`. If true, the
     *  existing file is replaced (same id is NOT guaranteed — check the return). */
    overwrite?: boolean;
    signal?: AbortSignal;
    onProgress?: (progress: { loaded: number; total?: number }) => void;
};

// ─────────────────────────────────────────────────────────────
// Other mutations
// ─────────────────────────────────────────────────────────────

export type MediaCreateFolderOptions = {
    name: string;
    /** Defaults to root. */
    parentFolderID?: string;
};

/**
 * Rename and/or move an item. Passing both `name` and `parentFolderID`
 * performs both atomically from the caller's point of view.
 *
 * Error cases:
 * - `not_found`            — `id` does not exist.
 * - `destination_not_found` — `parentFolderID` does not exist.
 * - `conflict`              — `name` already in use in the destination folder.
 * - `invalid_name`          — `name` fails validation.
 * - `validation_error`      — moving a folder into its own descendant.
 */
export type MediaUpdateItemOptions = {
    id: string;
    name?: string;
    parentFolderID?: string;
};

export type MediaDeleteItemOptions = {
    id: string;
    /** If the item is a non-empty folder, `recursive: true` deletes the whole
     *  subtree; otherwise the call returns `folder_not_empty`. Ignored for files. */
    recursive?: boolean;
};

// ─────────────────────────────────────────────────────────────
// Image formatting (provider-agnostic URL derivation)
// ─────────────────────────────────────────────────────────────

export const IMAGE_FORMATS = ["jpeg", "png", "webp", "avif"] as const;
export type ImageFormat = typeof IMAGE_FORMATS[number];

/** CSS-like semantics. `cover` crops to fill, `contain` letterboxes, `fill`
 *  stretches without preserving aspect ratio. */
export type ImageFit = "cover" | "contain" | "fill";

export type MediaFormatImageOptions = {
    /**
     * Absolute URL of the source image, typically `FileMetadata.absoluteURL`.
     * Using a URL (rather than an id) keeps this method stateless: the
     * implementation never has to resolve an id to a storage location, so
     * relocations on the Provider side (node moves, CDN swaps, …) propagate
     * naturally through the next `getItem`. Behavior on URLs that were not
     * produced by this implementation is provider-defined.
     */
    url: string;
    width?: number;
    height?: number;
    fit?: ImageFit;
    format?: ImageFormat;
    /** 1–100. */
    quality?: number;
};

// ─────────────────────────────────────────────────────────────
// Contracts
// ─────────────────────────────────────────────────────────────

/**
 * Render-only subset of the media contract: enough to derive image URLs
 * without any storage access. Useful for components that only display
 * images (front-end rendering, SSR, emails, edge workers, build-time
 * static output, Storybook mocks, …) so they don't depend on the full
 * CRUD surface nor require credentials.
 *
 * Portability contract — implementations of this interface MUST be
 * **browser-deployable**:
 * - No Node-only APIs (`fs`, `path`, `crypto` Node-bindings, `Buffer`, …).
 * - Only Web-standard globals (`URL`, `fetch`, `Blob`, `ReadableStream`, …).
 * - No side effects at module load (pure imports, no filesystem/network).
 * - `formatImageUrl` itself MUST be synchronous and side-effect-free (no
 *   network, no storage) — it's a pure URL rewrite.
 */
export interface MediaUrlBuilder {

    /**
     * Image pipeline capabilities. `ladderWidths` and `ladderFormats` are
     * advertised so the caller can build its own responsive `srcset` by
     * iterating and calling `formatImageUrl` — no dedicated method.
     */
    readonly imageConfig: {
        maxWidth: number;
        maxHeight: number;
        ladderWidths: number[];
        ladderFormats: ImageFormat[];
        defaultQuality: number;
    };

    /**
     * Pure, synchronous URL derivation for a stored image. Takes the image's
     * current `absoluteURL` and rewrites it (transform query params, CDN host
     * swap, signing, …). MUST NOT hit the network.
     */
    formatImageUrl(opts: MediaFormatImageOptions): URL;
}

/**
 * Storage-agnostic media contract consumed by the CMS. Implementations wrap
 * a concrete backend (S3, Cloudinary, local filesystem, …) and keep the
 * transport details (signed URLs, direct-to-storage uploads, CDN rewrites)
 * internal to `uploadFile` and `formatImageUrl`.
 *
 * Portability contract — implementations of this interface MUST be
 * **browser-deployable** AND **self-contained** so that the class can be
 * serialized with `constructor.toString()` and rehydrated on the client
 * (e.g. `window._cms.Media`) without pulling anything else along:
 *
 * - NO external function reference — every helper the class relies on
 *   MUST be declared as a (private) method on the class itself. No
 *   module-level `function helper()` called from methods.
 * - NO external import at runtime — `import type { … }` is fine (erased
 *   at compile time); `import { … }` of runtime values is forbidden.
 * - NO non-browser-compatible dependency: only Web-standard globals
 *   (`fetch`, `URL`, `URLSearchParams`, `Blob`, `FormData`, `Request`,
 *   `Response`, `ReadableStream`, `AbortSignal`, `crypto`, `globalThis`, …)
 *   and built-ins (`JSON`, `Array`, `Map`, `Promise`, …).
 * - NO Node-only API (`fs`, `path`, `Buffer`, Node `crypto` bindings, …).
 * - NO side effects at module load.
 * - Any server-side concerns (master credentials, token minting, storage
 *   SDKs, filesystem access) MUST live **outside** the implementation of
 *   this interface — typically in a separate server companion that the
 *   client talks to over HTTP. The `Media` object itself is a pure consumer,
 *   safe to serialize, ship to the browser, and rehydrate as-is.
 */
export interface Media extends MediaUrlBuilder {

    /**
     * Upload limits enforced by the implementation.
     * `acceptedMimeTypes` MAY contain wildcard prefixes like `"image/*"`;
     * `"*"` means "any MIME".
     */
    readonly limits: {
        maxFileSize: number; // bytes
        acceptedMimeTypes: string[] | "*";
    };

    // Read
    getItems(opts?: MediaGetItemsOptions): Promise<MediaResponse<MediaItemsPage>>;
    getItem(id: string): Promise<MediaResponse<MediaItem>>;

    // Write
    uploadFile(opts: MediaUploadFileOptions): Promise<MediaResponse<FileMetadata>>;
    createFolder(opts: MediaCreateFolderOptions): Promise<MediaResponse<FolderMetadata>>;
    updateItem(opts: MediaUpdateItemOptions): Promise<MediaResponse<MediaItem>>;
    deleteItem(opts: MediaDeleteItemOptions): Promise<MediaResponse<{ id: string }>>;
}