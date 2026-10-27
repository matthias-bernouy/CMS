/** A successful HTTP response is not enough to discard a producer batch. */
export function assertLogAcknowledgement(value: unknown, expected: number): void {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Observability batch was not fully acknowledged");
    }
    const result = value as Record<string, unknown>;
    if (
        result.accepted !== expected ||
        !Number.isSafeInteger(result.stored) ||
        !Number.isSafeInteger(result.duplicates) ||
        Number(result.stored) < 0 ||
        Number(result.duplicates) < 0 ||
        Number(result.stored) + Number(result.duplicates) !== expected
    ) {
        throw new TypeError("Observability batch was not fully acknowledged");
    }
}
