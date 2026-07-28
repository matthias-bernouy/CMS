import { readBoundedJsonObjectResponse } from "cms-cli/http/readBoundedJsonObjectResponse";
import type { RepositoryOperatorClientConfig, RepositoryOperatorResult } from "./contracts";
import { safeCode } from "./responses";

export type OperatorHttpSuccess = Readonly<{
    response: Response;
    body: Readonly<Record<string, unknown>>;
}>;

export type OperatorHttpResult = OperatorHttpSuccess | Extract<RepositoryOperatorResult, { outcome: "failed" }>;

export async function operatorHttpRequest(
    config: RepositoryOperatorClientConfig,
    url: string,
    init: RequestInit,
    deadline: number,
): Promise<OperatorHttpResult> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        return { outcome: "failed", reason: "timeout" };
    }
    const signal = AbortSignal.timeout(remaining);
    let response: Response;
    try {
        response = await (config.fetch ?? fetch)(url, {
            ...init,
            headers: { ...init.headers, authorization: `Bearer ${config.token}` },
            redirect: "error",
            signal,
        });
    } catch {
        return { outcome: "failed", reason: signal.aborted ? "timeout" : "transport" };
    }
    try {
        return { response, body: await readBoundedJsonObjectResponse(response, "management") };
    } catch {
        return invalidOperatorResponse(response.status);
    }
}

export function operatorUpstreamFailure(
    result: OperatorHttpSuccess,
): Extract<RepositoryOperatorResult, { outcome: "failed" }> {
    const retryAfterSeconds = retryAfter(result.response.headers.get("retry-after"));
    return {
        outcome: "failed",
        reason: "upstream",
        status: result.response.status,
        ...(safeCode(result.body.code) ? { code: safeCode(result.body.code) } : {}),
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    };
}

export function invalidOperatorResponse(status: number): Extract<RepositoryOperatorResult, { outcome: "failed" }> {
    return { outcome: "failed", reason: "invalid-response", status };
}

function retryAfter(value: string | null): number | undefined {
    if (!value || !/^[0-9]+$/u.test(value)) {
        return undefined;
    }
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds >= 1 && seconds <= 86_400 ? seconds : undefined;
}
