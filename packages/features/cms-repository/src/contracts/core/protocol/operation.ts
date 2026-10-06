export interface CapabilityOperationHandle {
    readonly operationId: string;
}

/** Protocol-wide 202 response. A capability's output schema describes the terminal result. */
export function parseCapabilityOperationHandle(value: unknown): CapabilityOperationHandle {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Invalid capability operation handle");
    }
    const record = value as Record<string, unknown>;
    if (
        Object.keys(record).length !== 1 ||
        typeof record.operationId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(record.operationId)
    ) {
        throw new TypeError("Invalid capability operation handle");
    }
    return Object.freeze({ operationId: record.operationId });
}
