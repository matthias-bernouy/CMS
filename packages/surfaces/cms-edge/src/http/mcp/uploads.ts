import { accessCall, mcpActor, json, McpHttpError, type CmsMcpHost } from "./protocol";

export async function mcpUpload(request: Request, host: CmsMcpHost, uploadId: string) {
    if (request.method !== "PUT") {
        return new Response(null, { status: 405, headers: { Allow: "PUT" } });
    }
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(host.publicUrl).origin) {
        throw new McpHttpError("access_denied", 403);
    }
    const bearer = request.headers.get("authorization");
    if (!bearer?.startsWith("Bearer ")) {
        throw new McpHttpError("invalid_token", 401);
    }
    const principal = await accessCall(host, "resolve-mcp-connection", { token: bearer.slice(7) });
    const token = request.headers.get("upload-token");
    if (!token || token.length > 4096 || !/^[A-Za-z0-9_-]{1,128}$/u.test(uploadId)) {
        throw new McpHttpError("invalid_request", 400);
    }
    const lengthHeader = request.headers.get("content-length");
    const length = lengthHeader === null ? undefined : Number(lengthHeader);
    if (length !== undefined && (!Number.isSafeInteger(length) || length < 0)) {
        throw new McpHttpError("invalid_request", 400);
    }
    const body =
        request.body ??
        new ReadableStream<Uint8Array>({
            start(controller) {
                controller.close();
            },
        });
    const result = await host.invoker.invoke({
        siteId: "default",
        contractId: "ulvia.cms.files",
        capabilityId: "upload.write",
        actor: mcpActor(principal),
        input: { uploadId, uploadToken: token },
        binaryBody: { stream: body, ...(length === undefined ? {} : { contentLength: length }) },
    });
    if (result.kind === "declared-error") {
        return json({ error: result.errorCode }, result.status ?? 422);
    }
    if (result.kind !== "success") {
        throw new McpHttpError("upload_failed", 503);
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
