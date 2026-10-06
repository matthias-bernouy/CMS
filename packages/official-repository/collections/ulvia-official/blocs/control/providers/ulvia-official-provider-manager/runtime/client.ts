export class CapabilityError extends Error {
    constructor(
        message: string,
        readonly code: string,
    ) {
        super(message);
    }
}

export async function callCapability<T>(capabilityId: string, input: unknown, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`/.cms/call/ulvia.cms.providers/${encodeURIComponent(capabilityId)}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal,
    });
    const body = await response.json().catch(() => ({ error: `Request failed (${response.status})` }));
    if (!response.ok) {
        const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        throw new CapabilityError(
            typeof record.message === "string"
                ? record.message
                : typeof record.error === "string"
                  ? record.error
                  : `Request failed (${response.status})`,
            typeof record.code === "string" ? record.code : "REQUEST_FAILED",
        );
    }
    return body as T;
}
