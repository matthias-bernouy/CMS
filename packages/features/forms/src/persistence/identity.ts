/** Stable JSON identity for already validated, closed DTOs; no coercion or dynamic payload schema. */
function canonicalize(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalize).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
        return `{${Object.entries(value)
            .filter(([, entry]) => entry !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
            .join(",")}}`;
    }
    const text = JSON.stringify(value);
    if (text === undefined) {
        throw new TypeError("Invalid identity value");
    }
    return text;
}

export async function fingerprint(value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(canonicalize(value));
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) =>
        byte.toString(16).padStart(2, "0"),
    ).join("");
}
