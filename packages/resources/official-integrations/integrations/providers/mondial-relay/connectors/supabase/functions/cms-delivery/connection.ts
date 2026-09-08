type RecordValue = Record<string, unknown>;
type Handler = (request: Request) => Promise<Response>;

/** Adapt the public Connection endpoint to the integration-owned synchronous operation. */
export function connectionHandler(manage: Handler) {
    return async (request: Request): Promise<Response> => {
        if (request.method !== "GET" && request.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405 });
        }
        const input = request.method === "POST" ? ((await request.json()) as RecordValue) : {};
        const { _cms, ...values } = input;
        const context = record(_cms);
        if (request.method === "POST" && !context.installationId) {
            return Response.json({ error: "Integration context is required" }, { status: 422 });
        }
        return manage(
            new Request(request.url, {
                method: "POST",
                headers: request.headers,
                body: JSON.stringify({
                    ...context,
                    installationId: context.installationId ?? "mondial-relay",
                    operation:
                        request.method === "GET"
                            ? "read-connection"
                            : new URL(request.url).pathname.endsWith("/retry")
                              ? "retry-connection"
                              : "save-connection",
                    input: { ...values, expectedRevision: values.expectedRevision ?? null },
                }),
            }),
        );
    };
}
function record(value: unknown): RecordValue {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
}
