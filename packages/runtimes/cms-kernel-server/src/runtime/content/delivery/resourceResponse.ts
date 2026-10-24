import type { GatewayInvoker } from "@bernouy/cms-gateway";

export function binaryResponse(
    result: Extract<Awaited<ReturnType<GatewayInvoker["invoke"]>>, { kind: "binary" }>,
    head: boolean,
): Response {
    return new Response(head ? null : result.stream, {
        status: result.status,
        headers: {
            ...result.responseHeaders,
            "content-type": result.contentType,
            ...(result.contentLength === undefined ? {} : { "content-length": String(result.contentLength) }),
        },
    });
}
