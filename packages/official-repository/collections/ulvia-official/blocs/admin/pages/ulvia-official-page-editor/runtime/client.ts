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
    update: { route: "mutation", method: "POST" },
} as const satisfies Readonly<
    Record<PageEditorCapability, { route: "mutation" | "query"; method: "GET" | "POST" | "QUERY" }>
>;

export async function callCapability<T>(capabilityId: PageEditorCapability, input: unknown): Promise<T> {
    const { method, route } = REQUEST_BY_CAPABILITY[capabilityId];
    const response = await fetch(`/.cms/${route}/ulvia.cms.content/pages.${encodeURIComponent(capabilityId)}`, {
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
        const error =
            record.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : record;
        const output =
            error.output && typeof error.output === "object" ? (error.output as Record<string, unknown>) : record;
        const details = diagnosticMessages(output.diagnostics);
        throw new CapabilityError(
            [
                typeof output.message === "string"
                    ? output.message
                    : typeof record.error === "string"
                      ? record.error
                      : `Request failed (${response.status})`,
                ...details,
            ].join("\n"),
            typeof error.code === "string" ? error.code : "REQUEST_FAILED",
        );
    }
    return body as T;
}

export function diagnosticMessages(value: unknown): string[] {
    return Array.isArray(value)
        ? value
              .slice(0, 16)
              .flatMap((item) =>
                  item && typeof item === "object" && typeof item.message === "string"
                      ? [item.message.slice(0, 2048)]
                      : [],
              )
        : [];
}
