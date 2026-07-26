import type { ManagementCandidateResult, RepositoryManagementCandidateClientConfig } from "./contracts";

const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_REQUEST_TIMEOUT_MS = 60_000;

export type CandidateHttpResponse = Readonly<{
    response: Response;
    body: Readonly<Record<string, unknown>>;
}>;

export async function candidateHttpRequest(
    config: RepositoryManagementCandidateClientConfig,
    url: string,
    init: RequestInit,
    remainingMs: number,
): Promise<CandidateHttpResponse | Extract<ManagementCandidateResult, { outcome: "failed" }>> {
    const timeoutMs = Math.max(1, Math.min(MAX_REQUEST_TIMEOUT_MS, remainingMs));
    const signal = AbortSignal.timeout(timeoutMs);
    let response: Response;
    try {
        response = await (config.fetch ?? fetch)(url, { ...init, redirect: "error", signal });
    } catch {
        return { outcome: "failed", reason: signal.aborted ? "timeout" : "transport" };
    }
    try {
        return { response, body: await readBoundedJsonObject(response) };
    } catch {
        return { outcome: "failed", reason: "invalid-response", status: response.status };
    }
}

export function retryAfter(value: string | null): Readonly<{ retryAfterSeconds?: number }> {
    if (value === null || !/^[0-9]+$/u.test(value)) {
        return {};
    }
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 86_400 ? { retryAfterSeconds: seconds } : {};
}

async function readBoundedJsonObject(response: Response): Promise<Readonly<Record<string, unknown>>> {
    const contentType = response.headers.get("content-type")?.toLowerCase();
    if (!contentType || (!contentType.startsWith("application/json;") && contentType !== "application/json")) {
        await response.body?.cancel();
        throw new Error("Repository management response must use application/json");
    }
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
        await response.body?.cancel();
        throw new Error("Repository management response exceeds its byte limit");
    }
    if (!response.body) {
        throw new Error("Repository management response body is missing");
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
            throw new Error("Repository management response exceeds its byte limit");
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Repository management response must be a JSON object");
    }
    return parsed as Readonly<Record<string, unknown>>;
}
