const MAX_RESPONSE_BYTES = 1_048_576;

type RepositoryResponseKind = "maintenance" | "management";

export async function readBoundedJsonObjectResponse(
    response: Response,
    kind: RepositoryResponseKind,
): Promise<Readonly<Record<string, unknown>>> {
    const description = `Repository ${kind} response`;
    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (!contentType || (!contentType.startsWith("application/json;") && contentType !== "application/json")) {
        await response.body?.cancel();
        throw new Error(`${description} must use application/json`);
    }
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
        await response.body?.cancel();
        throw new Error(`${description} exceeds its byte limit`);
    }
    if (!response.body) {
        throw new Error(`${description} body is missing`);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new Error(`${description} exceeds its byte limit`);
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${description} must be a JSON object`);
    }
    return value as Readonly<Record<string, unknown>>;
}
