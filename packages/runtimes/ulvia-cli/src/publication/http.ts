import type { PublicationClientConfig, PublicationResult } from "./contracts";

const MAX_RESPONSE_BYTES = 1_048_576;
const MAX_REQUEST_TIMEOUT_MS = 60_000;

export type PublicationHttpResponse = Readonly<{
    response: Response;
    body: Readonly<Record<string, unknown>>;
}>;

type PublicationHttpResult = PublicationHttpResponse | Extract<PublicationResult, { outcome: "failed" }>;

export async function publicationHttpRequest(
    config: PublicationClientConfig,
    url: string,
    init: RequestInit,
    remainingMs: number,
): Promise<PublicationHttpResult> {
    const signal = AbortSignal.timeout(Math.max(1, Math.min(MAX_REQUEST_TIMEOUT_MS, remainingMs)));
    let response: Response;
    try {
        response = await (config.fetch ?? fetch)(url, { ...init, redirect: "error", signal });
    } catch {
        return { outcome: "failed", reason: signal.aborted ? "timeout" : "transport" };
    }
    try {
        return { response, body: await readJsonObject(response) };
    } catch {
        return { outcome: "failed", reason: "invalid-response", status: response.status };
    }
}

export async function retryRateLimitedRequest(
    config: PublicationClientConfig,
    deadline: number,
    now: () => number,
    request: (remainingMs: number) => Promise<PublicationHttpResult>,
): Promise<PublicationHttpResult> {
    const wait = config.wait ?? ((milliseconds: number) => Bun.sleep(milliseconds));
    while (remaining(deadline, now) > 0) {
        const result = await request(remaining(deadline, now));
        if ("outcome" in result || result.response.status !== 429) {
            return result;
        }
        const { retryAfterSeconds } = retryAfter(result.response.headers.get("retry-after"));
        if (!retryAfterSeconds || retryAfterSeconds * 1_000 >= remaining(deadline, now)) {
            return retryAfterSeconds ? { outcome: "failed", reason: "timeout" } : result;
        }
        await wait(retryAfterSeconds * 1_000);
    }
    return { outcome: "failed", reason: "timeout" };
}

export function retryAfter(value: string | null): Readonly<{ retryAfterSeconds?: number }> {
    if (value === null || !/^[0-9]+$/u.test(value)) {
        return {};
    }
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 86_400 ? { retryAfterSeconds: seconds } : {};
}

async function readJsonObject(response: Response): Promise<Readonly<Record<string, unknown>>> {
    const contentType = response.headers.get("content-type")?.toLowerCase();
    const declared = response.headers.get("content-length");
    if (!contentType || (!contentType.startsWith("application/json;") && contentType !== "application/json")) {
        await response.body?.cancel();
        throw new Error("Repository management response must use application/json");
    }
    if (declared !== null && (!/^[0-9]+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
        await response.body?.cancel();
        throw new Error("Repository management response exceeds its byte limit");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
        throw new Error("Repository management response exceeds its byte limit");
    }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Repository management response must be a JSON object");
    }
    return value as Readonly<Record<string, unknown>>;
}

function remaining(deadline: number, now: () => number): number {
    return Math.max(0, deadline - now());
}
