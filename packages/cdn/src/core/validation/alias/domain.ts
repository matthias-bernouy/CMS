// One DNS label: 1–63 chars, alnum + dashes, must start and end with alnum.
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Caller is expected to lowercase before calling. Asserting on uppercase rejects
// silent-mismatch bugs (e.g. an alias stored as "Example.com" wouldn't match
// the lowercased Host header at request time).
export function assertValidAliasDomain(value: unknown): asserts value is string {
    if (typeof value !== "string") {
        throw new TypeError("Alias domain must be a string.");
    }
    if (value.length === 0 || value.length > 253) {
        throw new Error(`Alias domain length out of range (${value.length}). Must be 1–253 chars.`);
    }
    const labels = value.split(".");
    if (labels.length < 2) {
        throw new Error("Alias domain must contain at least two labels (e.g. \"example.com\").");
    }
    for (const label of labels) {
        if (!LABEL.test(label)) {
            throw new Error(`Invalid label in alias domain: ${JSON.stringify(label)}.`);
        }
    }
}
