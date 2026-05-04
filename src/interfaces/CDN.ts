// ─────────────────────────────────────────────────────────────
// File & item types
// ─────────────────────────────────────────────────────────────

export const FILE_TYPES = [
    "image", "video", "audio", "pdf", "document", "text", "archive", "other",
] as const;
export type FileType = typeof FILE_TYPES[number];

export type CDNItemType = FileType | "folder";

// ─────────────────────────────────────────────────────────────
// Item metadata (discriminated union on `type`)
// ─────────────────────────────────────────────────────────────

/** Fields shared by every CDN item, folders and files alike. */
type BaseItemMetadata = {
    id: string;
    name: string;
    parentFolderID: string | null; // null = bucket root
    createdAt: Date;
    updatedAt: Date;
};

export type FolderMetadata = BaseItemMetadata & {
    type: "folder";
    /** Number of direct children. `undefined` (not `0`) when the provider
     *  didn't compute it — callers MUST NOT treat absence as "empty". */
    itemCount?: number;
};

/** Fields shared by every file. */
type BaseFileMetadata = BaseItemMetadata & {
    size: number;        // bytes
    mimeType: string;    // "image/jpeg", "application/pdf", etc.
    absoluteURL: string; // direct-access URL; signing is the provider's concern
    /**
     * Optional URL-safe slug served by the CDN at `/<publicPath>` instead of
     * the id-based default. Stable across uploads (the file's `id` doesn't
     * change when the slug is renamed) and unique within the bucket. Unset
     * means the file is reachable only via its id-based URL.
     */
    publicPath?: string;
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

export type CDNItem = FolderMetadata | FileMetadata;

// ─────────────────────────────────────────────────────────────
// Bucket configuration (this CDN's own bucket)
// ─────────────────────────────────────────────────────────────

export type BucketLimits = {
    maxFileSize: number; // bytes
    /** List of MIME patterns (`"image/*"`, `"application/pdf"`, …) or `"*"` for any. */
    acceptedMimeTypes: string[] | "*";
};

export type BucketQuotas = {
    maxTotalSize: number; // bytes
    maxFileCount: number;
};

// ─────────────────────────────────────────────────────────────
// Error & response wrapper (discriminated union)
// ─────────────────────────────────────────────────────────────

export type CDNErrorCode =
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

export type CDNError = {
    code: CDNErrorCode;
    message: string;
    /** Optional native/provider error attached for logging. Never trust its shape. */
    cause?: unknown;
};

export type CDNResponse<Data> =
    | { ok: true;  data: Data }
    | { ok: false; error: CDNError };

// ─────────────────────────────────────────────────────────────
// Listing / pagination
// ─────────────────────────────────────────────────────────────

export type CDNPagination = {
    page: number;   // 1-based
    limit: number;
};

export type CDNGetItemsOptions = {
    /** Defaults to bucket root. */
    folderID?: string;
    /** Type filter. Mixes folder and file types. */
    accept?: CDNItemType[];
    pagination?: CDNPagination;
    sortBy?: "name" | "createdAt" | "updatedAt" | "size";
    sortOrder?: "asc" | "desc";
    /** Case-insensitive substring match on `name`. Providers that can't
     *  search MAY return `unsupported_operation`. */
    search?: string;
    /** If true, descends into subfolders. Default: false. */
    recursive?: boolean;
};

export type CDNItemsPage = {
    items: CDNItem[];
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

export type CDNUploadFileOptions = {
    data: UploadData;
    /** File name stored on the CDN. Required because `Uint8Array` / `ReadableStream`
     *  carry no intrinsic name. */
    name: string;
    /** Override sniffed content-type. Required when `data` is not a `Blob`. */
    mimeType?: string;
    /** Size hint in bytes. Required when `data` is a `ReadableStream` without
     *  a known length, to allow `file_too_large` validation up-front. */
    size?: number;
    /** Defaults to bucket root. */
    folderID?: string;
    /** Optional URL-safe slug to serve the file at `/<publicPath>` (e.g.
     *  `"blog/post.html"`). Unique within the bucket. */
    publicPath?: string;
    /** If false (default), a name clash returns `conflict`. If true, the
     *  existing file is replaced (same id is NOT guaranteed — check the return). */
    overwrite?: boolean;
    signal?: AbortSignal;
    onProgress?: (progress: { loaded: number; total?: number }) => void;
};

// ─────────────────────────────────────────────────────────────
// Other mutations
// ─────────────────────────────────────────────────────────────

export type CDNCreateFolderOptions = {
    name: string;
    /** Defaults to bucket root. */
    parentFolderID?: string;
};

/**
 * Rename and/or move an item. Passing both `name` and `parentFolderID`
 * performs both atomically from the caller's point of view.
 *
 * Error cases:
 * - `not_found`             — `id` does not exist.
 * - `destination_not_found` — `parentFolderID` does not exist.
 * - `conflict`              — `name` already in use in the destination folder.
 * - `invalid_name`          — `name` fails validation.
 * - `validation_error`      — moving a folder into its own descendant.
 */
export type CDNUpdateItemOptions = {
    id: string;
    name?: string;
    parentFolderID?: string;
    /** Files only: change the public URL slug. Pass `null` to clear it
     *  (the file falls back to its id-based URL). */
    publicPath?: string | null;
};

export type CDNDeleteItemOptions = {
    id: string;
    /** If the item is a non-empty folder, `recursive: true` deletes the whole
     *  subtree; otherwise the call returns `folder_not_empty`. Ignored for files. */
    recursive?: boolean;
};

// ─────────────────────────────────────────────────────────────
// Contract
// ─────────────────────────────────────────────────────────────

/**
 * Single-bucket CDN contract consumed by the CMS. One `CDN` instance == one
 * bucket; multi-bucket fan-out (admin / provisioning) lives in a separate
 * Provider contract that is intentionally NOT defined here.
 *
 * Per-bucket configuration (`limits`, `quotas`, `cacheControl`) is exposed
 * read-only so that callers can validate uploads up-front and render
 * usage hints without round-tripping the server.
 *
 * Pre-signed / direct-to-storage upload URLs, token brokers, signing keys
 * and any other transport-side concern are deliberately out of scope:
 * implementations are free to handle them internally inside `uploadFile`,
 * or to expose extras on their concrete class outside this interface.
 *
 * Portability contract — implementations of this interface MUST be
 * **browser-deployable** AND **self-contained** so that the class can be
 * serialized with `constructor.toString()` and rehydrated on the client
 * (e.g. `window._cms.CDN`) without pulling anything else along:
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
 *   client talks to over HTTP. The `CDN` object itself is a pure consumer,
 *   safe to serialize, ship to the browser, and rehydrate as-is.
 */
export interface CDN {

    readonly limits: BucketLimits;
    readonly quotas: BucketQuotas;
    /** Raw `Cache-Control` value the CDN serves with public files of this bucket. */
    readonly cacheControl: string;

    // Read
    getItems(opts?: CDNGetItemsOptions): Promise<CDNResponse<CDNItemsPage>>;
    getItem(id: string): Promise<CDNResponse<CDNItem>>;

    // Write
    uploadFile(opts: CDNUploadFileOptions): Promise<CDNResponse<FileMetadata>>;
    createFolder(opts: CDNCreateFolderOptions): Promise<CDNResponse<FolderMetadata>>;
    updateItem(opts: CDNUpdateItemOptions): Promise<CDNResponse<CDNItem>>;
    deleteItem(opts: CDNDeleteItemOptions): Promise<CDNResponse<{ id: string }>>;
}
