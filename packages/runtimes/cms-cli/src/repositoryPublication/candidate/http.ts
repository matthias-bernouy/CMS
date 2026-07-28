import type { ManagementCandidateResult, RepositoryManagementCandidateClientConfig } from "./contracts";
import { readBoundedJsonObjectResponse } from "cms-cli/http/readBoundedJsonObjectResponse";

const MAX_REQUEST_TIMEOUT_MS = 60_000;

export type CandidateHttpResponse = Readonly<{
    response: Response;
    body: Readonly<Record<string, unknown>>;
}>;

type CandidateHttpResult = CandidateHttpResponse | Extract<ManagementCandidateResult, { outcome: "failed" }>;

export async function candidateHttpRequest(
    config: RepositoryManagementCandidateClientConfig,
    url: string,
    init: RequestInit,
    remainingMs: number,
): Promise<CandidateHttpResult> {
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

export async function retryRateLimitedCandidateRequest(
    config: RepositoryManagementCandidateClientConfig,
    deadline: number,
    now: () => number,
    request: (remainingMs: number) => Promise<CandidateHttpResult>,
): Promise<CandidateHttpResult> {
    const wait = config.wait ?? ((milliseconds: number) => Bun.sleep(milliseconds));
    while (remaining(deadline, now) > 0) {
        const result = await request(remaining(deadline, now));
        if ("outcome" in result || result.response.status !== 429) {
            return result;
        }
        const { retryAfterSeconds } = retryAfter(result.response.headers.get("retry-after"));
        if (!retryAfterSeconds) {
            return result;
        }
        const delayMs = retryAfterSeconds * 1_000;
        if (delayMs >= remaining(deadline, now)) {
            return { outcome: "failed", reason: "timeout" };
        }
        await wait(delayMs);
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

function remaining(deadline: number, now: () => number): number {
    return Math.max(0, deadline - now());
}
