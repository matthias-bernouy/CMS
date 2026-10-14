export type FetchOutcome =
    | { readonly kind: "success"; readonly data: unknown; readonly status?: number; readonly requestId?: string }
    | {
          readonly kind: "error";
          readonly code: string;
          readonly output?: unknown;
          readonly retryable: boolean;
          readonly status: number;
          readonly requestId?: string;
      }
    | {
          readonly kind: "failure";
          readonly code: string;
          readonly retryable: boolean;
          readonly status?: number;
          readonly requestId?: string;
      }
    | { readonly kind: "aborted" };

export async function runFetch(url: string, signal: AbortSignal, init: RequestInit = {}): Promise<FetchOutcome> {
    let response: Response;
    try {
        const headers = new Headers(init.headers);
        if (!headers.has("Accept")) {
            headers.set("Accept", "application/json");
        }
        response = await fetch(url, { ...init, headers, signal });
    } catch (error) {
        return isAbort(error) ? { kind: "aborted" } : { kind: "failure", code: "network_error", retryable: true };
    }

    const requestId = response.headers?.get("x-ulvia-request-id") ?? undefined;
    let body: string;
    try {
        body = await response.text();
    } catch (error) {
        return isAbort(error) ? { kind: "aborted" } : failure("network_error", true, response.status, requestId);
    }

    if (!response.ok) {
        return decodeFailureResponse(body, response.status, requestId);
    }
    if (body.trim() === "") {
        return success(null, response.status, requestId);
    }
    try {
        return success(JSON.parse(body), response.status, requestId);
    } catch {
        return failure("invalid_response", false, response.status, requestId);
    }
}

function decodeFailureResponse(body: string, status: number, requestId?: string): FetchOutcome {
    let value: unknown;
    try {
        value = JSON.parse(body);
    } catch {
        return failure("invalid_response", false, status, requestId);
    }
    if (!isRecord(value)) {
        return failure("invalid_response", false, status, requestId);
    }
    const declared = isRecord(value.error) ? value.error : null;
    if (declared && typeof declared.code === "string" && typeof declared.retryable === "boolean") {
        return {
            kind: "error",
            code: declared.code,
            retryable: declared.retryable,
            status,
            ...(Object.hasOwn(declared, "output") ? { output: declared.output } : {}),
            ...(requestId ? { requestId } : {}),
        };
    }
    const technical = isRecord(value.failure) ? value.failure : null;
    if (technical && typeof technical.code === "string" && typeof technical.retryable === "boolean") {
        return failure(technical.code, technical.retryable, status, requestId);
    }
    return failure("invalid_response", false, status, requestId);
}

function success(data: unknown, status: number, requestId?: string): FetchOutcome {
    return { kind: "success", data, status, ...(requestId ? { requestId } : {}) };
}

function failure(code: string, retryable: boolean, status?: number, requestId?: string): FetchOutcome {
    return {
        kind: "failure",
        code,
        retryable,
        ...(status === undefined ? {} : { status }),
        ...(requestId ? { requestId } : {}),
    };
}

function isAbort(error: unknown): boolean {
    return (error as { name?: string } | null)?.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
