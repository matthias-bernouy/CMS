export class CapabilityError extends Error {
    constructor(
        message: string,
        readonly code: string,
    ) {
        super(message);
    }
}

type PageEditorCapability = "editor-catalogue" | "get" | "update";

const REQUEST_BY_CAPABILITY = {
    "editor-catalogue": { route: "query", method: "GET" },
    get: { route: "query", method: "QUERY" },
    update: { route: "call", method: "POST" },
} as const satisfies Readonly<
    Record<PageEditorCapability, { route: "call" | "query"; method: "GET" | "POST" | "QUERY" }>
>;

export async function callCapability<T>(capabilityId: PageEditorCapability, input: unknown): Promise<T> {
    const { method, route } = REQUEST_BY_CAPABILITY[capabilityId];
    const response = await fetch(`/.cms/${route}/ulvia.cms.pages/${encodeURIComponent(capabilityId)}`, {
        method,
        headers: {
            Accept: "application/json",
            ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
        },
        ...(method === "GET" ? {} : { body: JSON.stringify(input) }),
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
