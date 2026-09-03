export function encodeIdentifier(value: string): string {
    if (!value || value.length > 256 || value === "." || value === "..") {
        throw new Error("Upgrade fixture resource identifier is invalid");
    }
    return encodeURIComponent(value);
}

export function boundedObjectPath(path: string): string {
    if (!path || path.length > 1_024 || path.startsWith("/") || path.endsWith("/")) {
        throw new Error("Upgrade fixture Storage object path is invalid");
    }
    return path.split("/").map(encodeIdentifier).join("/");
}

export function requestBody(bytes: Uint8Array): ArrayBuffer {
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return body;
}
