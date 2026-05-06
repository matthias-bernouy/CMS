// Name of a file or folder. The storage layer is flat (id-based filenames on
// disk), so slashes are forbidden purely as a UX safeguard against paths that
// look like nested structure but aren't.
export function assertValidItemName(value: unknown): asserts value is string {
    if (typeof value !== "string") {
        throw new TypeError("Name must be a string.");
    }
    if (value.length === 0) {
        throw new Error("Name cannot be empty.");
    }
    if (value.length > 255) {
        throw new Error(`Name too long (${value.length}). Max 255.`);
    }
    if (value === "." || value === "..") {
        throw new Error(`${JSON.stringify(value)} is a reserved name.`);
    }
    if (/[/\\\x00-\x1F\x7F]/.test(value)) {
        throw new Error("Name contains forbidden characters (slash, backslash, control chars).");
    }
    if (value !== value.trim()) {
        throw new Error("Name cannot have leading or trailing whitespace.");
    }
}
