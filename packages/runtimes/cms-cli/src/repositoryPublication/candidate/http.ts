import type { ManagementCandidateResult, RepositoryManagementCandidateClientConfig } from "./contracts";
import { readBoundedJsonObjectResponse } from "cms-cli/http/readBoundedJsonObjectResponse";

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
        return { response, body: await readBoundedJsonObjectResponse(response, "management") };
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
