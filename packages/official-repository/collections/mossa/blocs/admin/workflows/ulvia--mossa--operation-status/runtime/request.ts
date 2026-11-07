export type Operation = {
    operationId: string;
    status: "queued" | "running" | "succeeded" | "failed";
    updatedAt: string;
    errorCode?: string;
    errorOutput?: { message: string };
    result?: { status: "prepared" | "applying" | "completed" | "cancelled"; upgradeId: string };
};

export class OperationReadFailure extends Error {
    constructor(
        readonly retryable: boolean,
        readonly retryAfterMs = 0,
    ) {
        super("Operation unavailable");
    }
}

export async function readOperation(operationId: string, signal: AbortSignal): Promise<Operation> {
    let response: Response;
    try {
        response = await fetch("/.cms/query/ulvia/cms.installations/get-operation", {
            method: "QUERY",
            credentials: "same-origin",
            redirect: "error",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ operationId }),
            signal,
        });
    } catch {
        throw new OperationReadFailure(true);
    }
    if (!response.ok || !response.body) {
        const header = response.headers.get("Retry-After") ?? "";
        const delay = /^\d+$/u.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
        await response.body?.cancel().catch(() => undefined);
        throw new OperationReadFailure(
            [408, 429, 500, 502, 503, 504].includes(response.status),
            Number.isFinite(delay) && delay > 0 ? delay : 0,
        );
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            length += value.byteLength;
            if (length > 32_768) {
                await reader.cancel();
                throw new Error("Operation response exceeds limit");
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        throw new Error("Invalid operation response");
    }
    const envelope = decoded as { error?: { code?: unknown; retryable?: unknown } };
    if (envelope.error?.code === "CORE_UNAVAILABLE" && envelope.error.retryable === true) {
        throw new OperationReadFailure(true);
    }
    const value = decoded as Operation;
    if (
        value.operationId !== operationId ||
        !["queued", "running", "succeeded", "failed"].includes(value.status) ||
        typeof value.updatedAt !== "string" ||
        !Number.isFinite(Date.parse(value.updatedAt)) ||
        (value.result &&
            (!["prepared", "applying", "completed", "cancelled"].includes(value.result.status) ||
                typeof value.result.upgradeId !== "string" ||
                value.result.upgradeId.length > 256))
    ) {
        throw new Error("Invalid operation response");
    }
    return value;
}
