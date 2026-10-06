export class CapabilityError extends Error {
    constructor(
        message: string,
        readonly code: string,
        readonly status: number,
    ) {
        super(message);
    }
}

export async function callCapability<T>(
    contractId: string,
    capabilityId: string,
    input: unknown,
    idempotencyKey?: string,
    signal?: AbortSignal,
): Promise<T> {
    const headers = new Headers({ Accept: "application/json", "Content-Type": "application/json" });
    if (idempotencyKey) {
        headers.set("Idempotency-Key", idempotencyKey);
    }
    const response = await fetch(`/.cms/call/${encodeURIComponent(contractId)}/${encodeURIComponent(capabilityId)}`, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
        signal,
    });
    const body = await response
        .json()
        .catch(() => ({ error: response.statusText || `Request failed (${response.status})` }));
    if (!response.ok) {
        const record = isRecord(body) ? body : {};
        throw new CapabilityError(
            typeof record.message === "string"
                ? record.message
                : typeof record.error === "string"
                  ? record.error
                  : `Request failed (${response.status})`,
            typeof record.code === "string" ? record.code : "REQUEST_FAILED",
            response.status,
        );
    }
    return body as T;
}

export async function waitForOperation(operationId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 240; attempt += 1) {
        signal?.throwIfAborted();
        const operation = await callCapability<Operation>(
            "ulvia.cms.operations",
            "get",
            { operationId },
            undefined,
            signal,
        );
        if (operation.status === "failed") {
            throw new CapabilityError("The operation failed.", operation.errorCode ?? "OPERATION_FAILED", 409);
        }
        if (operation.status === "succeeded") {
            return operation.resultJson ? (JSON.parse(operation.resultJson) as Record<string, unknown>) : {};
        }
        await delay(500, signal);
    }
    throw new CapabilityError("The operation is still running. Check Activity for its status.", "TIMEOUT", 408);
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const finish = (): void => {
            signal?.removeEventListener("abort", abort);
            resolve();
        };
        const abort = (): void => {
            clearTimeout(timeout);
            reject(signal?.reason);
        };
        const timeout = setTimeout(finish, milliseconds);
        signal?.addEventListener("abort", abort, { once: true });
    });
}

type Operation = { status: "queued" | "running" | "succeeded" | "failed"; errorCode?: string; resultJson?: string };
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object");
