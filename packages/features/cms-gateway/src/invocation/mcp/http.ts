import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { readGatewayHttpInput } from "cms-gateway/invocation/http/readHttpInput";
import { CapabilityMcpBinding, McpProtocolError } from "./CapabilityMcpBinding";
import type { McpInvocationContext } from "./interfaces";

export const MCP_PROTOCOL_VERSION = "2025-11-25";

export function createCapabilityMcpHttpHandler(options: {
    binding: CapabilityMcpBinding;
    resources?: {
        list(context: McpInvocationContext): Promise<unknown>;
        read(uri: string, context: McpInvocationContext): Promise<unknown>;
    };
    resolveContext(request: Request): Promise<McpInvocationContext>;
    allowedOrigins: readonly string[];
    serverInfo: { name: string; version: string };
}) {
    return async (request: Request): Promise<Response> => {
        const origin = request.headers.get("origin");
        if (origin !== null && !options.allowedOrigins.includes(origin)) {
            return new Response(null, { status: 403 });
        }
        if (request.method !== "POST") {
            return new Response(null, { status: 405, headers: { Allow: "POST" } });
        }
        if (
            !request.headers.get("accept")?.includes("application/json") ||
            !request.headers.get("accept")?.includes("text/event-stream")
        ) {
            return new Response(null, { status: 406 });
        }
        if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
            return new Response(null, { status: 415 });
        }
        let id: string | number | null = null;
        try {
            let message: Record<string, unknown>;
            try {
                message = (await readGatewayHttpInput(request)) as Record<string, unknown>;
            } catch {
                return failure(null, -32700, "Invalid or oversized JSON-RPC message", 400);
            }
            if (
                !message ||
                typeof message !== "object" ||
                Array.isArray(message) ||
                message.jsonrpc !== "2.0" ||
                typeof message.method !== "string"
            ) {
                throw new McpProtocolError(-32600, "Invalid JSON-RPC request");
            }
            if (
                typeof message.id === "string" ||
                (typeof message.id === "number" && Number.isSafeInteger(message.id))
            ) {
                id = message.id;
            } else if (message.id !== undefined) {
                throw new McpProtocolError(-32600, "Invalid JSON-RPC request ID");
            }
            const version = request.headers.get("mcp-protocol-version");
            if (!version && message.method !== "initialize") {
                return failure(id, -32600, "MCP protocol version header is required", 400);
            }
            if (version && version !== MCP_PROTOCOL_VERSION) {
                return failure(id, -32600, "Unsupported MCP protocol version", 400);
            }
            const context = await options.resolveContext(request);
            if (message.id === undefined) {
                if (message.method !== "notifications/initialized" && message.method !== "notifications/cancelled") {
                    throw new McpProtocolError(-32600, "Unsupported notification");
                }
                return new Response(null, { status: 202 });
            }
            const params =
                message.params === undefined
                    ? {}
                    : (parseStrictJson(JSON.stringify(message.params), 8 * 1024 * 1024, 64) as Record<string, unknown>);
            if (!params || typeof params !== "object" || Array.isArray(params)) {
                throw new McpProtocolError(-32602, "Invalid JSON-RPC parameters");
            }
            let result: unknown;
            switch (message.method) {
                case "initialize":
                    result = {
                        protocolVersion: MCP_PROTOCOL_VERSION,
                        capabilities: { tools: {}, ...(options.resources ? { resources: {} } : {}) },
                        serverInfo: options.serverInfo,
                    };
                    break;
                case "ping":
                    result = {};
                    break;
                case "resources/list":
                    if (!options.resources) {
                        throw new McpProtocolError(-32601, "Method not found");
                    }
                    result = await options.resources.list(context);
                    break;
                case "resources/read":
                    if (!options.resources || typeof params.uri !== "string") {
                        throw new McpProtocolError(-32602, "Invalid resource URI");
                    }
                    result = await options.resources.read(params.uri, context);
                    break;
                case "tools/list":
                    if (params.cursor !== undefined && typeof params.cursor !== "string") {
                        throw new McpProtocolError(-32602, "Invalid cursor");
                    }
                    result = await options.binding.list(context, params.cursor as string | undefined);
                    break;
                case "tools/call":
                    if (typeof params.name !== "string") {
                        throw new McpProtocolError(-32602, "Missing tool name");
                    }
                    result = await options.binding.call(params.name, params.arguments ?? {}, context);
                    break;
                default:
                    throw new McpProtocolError(-32601, "Method not found");
            }
            return Response.json({ jsonrpc: "2.0", id, result }, { headers: { "Cache-Control": "no-store" } });
        } catch (error) {
            return error instanceof McpProtocolError
                ? failure(id, error.code, error.message)
                : failure(id, -32603, "Capability transport failed");
        }
    };
}

function failure(id: string | number | null, code: number, message: string, status = 200): Response {
    return Response.json(
        { jsonrpc: "2.0", id, error: { code, message } },
        { status, headers: { "Cache-Control": "no-store" } },
    );
}
