import type { RepositoryOperationOutcome } from "./contracts";

export function failedOperation(error: unknown): Readonly<{
    outcome: Exclude<RepositoryOperationOutcome, "succeeded">;
    errorCode?: string;
}> {
    const status = recordNumber(error, "status");
    const code = recordString(error, "code");
    return {
        outcome: status !== undefined && status >= 400 && status < 500 ? "rejected" : "failed",
        ...(code ? { errorCode: code } : {}),
    };
}

function recordNumber(value: unknown, key: string): number | undefined {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === "number" ? candidate : undefined;
}

function recordString(value: unknown, key: string): string | undefined {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === "string" ? candidate : undefined;
}
