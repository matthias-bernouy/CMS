export const DEFAULT_TRIGGER_BODY_LIMIT_BYTES = 256 * 1024;

export async function readJsonBodyUnderLimit(
    message: Request | Response,
    maxBytes = DEFAULT_TRIGGER_BODY_LIMIT_BYTES,
): Promise<unknown | undefined> {
    if (!isJson(message.headers)) {
        return undefined;
    }
    let bytes: ArrayBuffer;
    try {
        bytes = await message.arrayBuffer();
    } catch {
        return undefined;
    }
    if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
        return undefined;
    }
    try {
        return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
        return undefined;
    }
}

function isJson(headers: Headers): boolean {
    const contentType = headers.get("content-type")?.toLowerCase() ?? "";
    return contentType.includes("application/json") || contentType.includes("+json");
}
