/** Thrown when a file/folder write breaks a files-domain rule. Carries
 *  `.status` so any HTTP surface maps it to a 400. */
export class FileValidationError extends Error {
    status = 400;
    constructor(field: string, message: string) {
        super(`Invalid ${field}: ${message}`);
        this.name = "FileValidationError";
    }
}

/** Maximum size of a single uploaded/replaced file. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

/** Size rule, owned by the files feature. Throws `FileValidationError`. */
export function validateUploadSize(size: number): void {
    if (size > MAX_UPLOAD_BYTES) {
        throw new FileValidationError("file", `exceeds the ${MAX_UPLOAD_BYTES}-byte limit`);
    }
}

/** Item (folder/file) name rule: required, trimmed, single path segment.
 *  Returns the normalized name. Enforced at the seam by
 *  `ValidatingCmsFilesMetadata`. */
export function validateItemName(name: unknown): string {
    if (typeof name !== "string" || !name.trim()) {
        throw new FileValidationError("name", "required");
    }
    const trimmed = name.trim();
    if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("\0")) {
        throw new FileValidationError("name", "must be a single path segment");
    }
    if (trimmed === "." || trimmed === ".." || trimmed.includes("..")) {
        throw new FileValidationError("name", "must not contain traversal markers");
    }
    return trimmed;
}
