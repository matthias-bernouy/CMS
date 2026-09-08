type RecordValue = Record<string, unknown>;
type Handler = (request: Request) => Promise<Response>;

/** The integration owns persistence, provider reconciliation and acknowledgement. */
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
        const continuation = record(context.continuation);
        const phase =
            request.method === "GET"
                ? "read"
                : (continuation.phase ?? (new URL(request.url).pathname.endsWith("/retry") ? "apply" : "save"));
        const operations: Record<string, string> = {
            read: "read-settings",
            save: "save-settings",
            apply: "apply-settings",
            confirm: "confirm-apply",
        };
        const operation = operations[String(phase)];
        if (!operation) {
            return Response.json({ error: "Invalid connection continuation" }, { status: 400 });
        }
        const response = await manage(
            new Request(request.url, {
                method: "POST",
                headers: request.headers,
                body: JSON.stringify({
                    ...context,
                    installationId: context.installationId ?? "stripe-connect",
                    operation,
                    input:
                        phase === "save"
                            ? { ...values, expectedRevision: values.expectedRevision ?? null }
                            : {
                                  savedRevision: continuation.revision ?? values.expectedRevision,
                                  expectedRevision: continuation.revision ?? values.expectedRevision,
                              },
                }),
            }),
        );
        if (!response.ok) {
            return response;
        }
        const result = (await response.json()) as RecordValue;
        if (phase === "save") {
            return Response.json({
                ...result,
                _cms: { rememberSecrets: true, continue: { phase: "apply", revision: result.savedRevision } },
            });
        }
        if (phase === "apply") {
            const { generatedSecrets, ...data } = result;
            return Response.json({
                ...data,
                _cms: {
                    syncRuntime: true,
                    ...(generatedSecrets ? { generatedSecrets } : {}),
                    continue: { phase: "confirm", revision: result.savedRevision },
                },
            });
        }
        return Response.json(result);
    };
}
function record(value: unknown): RecordValue {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : {};
}
