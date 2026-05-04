export function assertValidUploadSize(value: unknown): asserts value is number {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        throw new TypeError("Size must be a positive integer (bytes).");
    }
}
