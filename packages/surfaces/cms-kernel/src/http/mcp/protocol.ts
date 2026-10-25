import type { CapabilityMcpOptions } from "@bernouy/cms-gateway/mcp";
import type { GatewayActor, GatewayInvoker } from "@bernouy/cms-gateway";

export interface CmsMcpHost {
    readonly publicUrl: string;
    readonly invoker: GatewayInvoker;
    readonly onMutationSuccess?: CapabilityMcpOptions["onMutationSuccess"];
    readonly resolveActor: (request: Request) => Promise<GatewayActor>;
}

export async function accessCall(
    host: CmsMcpHost,
    capabilityId: string,
    input: unknown,
    actor: GatewayActor = { kind: "anonymous" },
) {
    const result = await host.invoker.invoke({
        siteId: "default",
        contractId: "ulvia.cms.access",
        capabilityId,
        input: { requestJson: JSON.stringify(input) },
        actor,
    });
    if (
        result.kind !== "success" ||
        !result.output ||
        typeof result.output !== "object" ||
        !("resultJson" in result.output)
    ) {
        throw new McpHttpError("access_service_unavailable", 503);
    }
    const value = JSON.parse(String(result.output.resultJson));
    if (value?.error) {
        throw new McpHttpError(String(value.error), Number(value.status) || 400);
    }
    return value;
}

export class McpHttpError extends Error {
    constructor(
        readonly code: string,
        readonly status: number,
    ) {
        super(code);
    }
}

export function json(value: unknown, status = 200): Response {
    return Response.json(value, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
}

export async function form(request: Request, maximum = 16_384) {
    if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") {
        throw new McpHttpError("invalid_request", 415);
    }
    return new URLSearchParams(await boundedText(request, maximum));
}

export async function boundedText(request: Request, maximum: number) {
    if (!request.body) {
        throw new McpHttpError("invalid_request", 400);
    }
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            size += part.value.byteLength;
            if (size > maximum) {
                await reader.cancel();
                throw new McpHttpError("invalid_request", 413);
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

function cookie(request: Request, name: string): string | undefined {
    const matches = (request.headers.get("cookie") ?? "")
        .split(";")
        .map((value) => value.trim())
        .filter((value) => value.startsWith(`${name}=`));
    return matches.length === 1 ? matches[0]!.slice(name.length + 1) : undefined;
}

export function checkBrowserPost(request: Request, publicUrl: string, csrf: string | null, cookieName: string) {
    if (request.headers.get("origin") !== new URL(publicUrl).origin || !csrf || csrf !== cookie(request, cookieName)) {
        throw new McpHttpError("access_denied", 403);
    }
}
