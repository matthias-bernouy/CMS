/**
 * Wire envelope for the super-admin API (frontier D). Same shape as
 * `MediaResponse` from the public Media contract — kept distinct so the error
 * code domain is admin-specific (no leaking of media-only codes like
 * `unsupported_mime_type` into bucket / alias / credential operations).
 */
export type AdminResponse<Data> =
    | { ok: true;  data: Data }
    | { ok: false; error: AdminError };

export type AdminError = {
    code: AdminErrorCode;
    message: string;
};

export type AdminErrorCode =
    | "not_found"
    | "unauthorized"
    | "forbidden"
    | "conflict"
    | "validation_error"
    | "unknown";
