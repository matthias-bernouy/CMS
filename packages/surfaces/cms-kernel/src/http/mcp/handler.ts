import { mcpUpload } from "./uploads";
import { CapabilityMcpBinding, createCapabilityMcpHttpHandler } from "@bernouy/cms-gateway/mcp";
import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import type { McpInvocationContext } from "@bernouy/cms-gateway/mcp";
import { authorizationPage, connectionsPage } from "./pages";
import { accessCall, boundedText, form, json, McpHttpError, type CmsMcpHost } from "./protocol";
import { createAuthoringResources } from "./resources";

export function createCmsMcpHandler(
    host: CmsMcpHost & {
        readonly contracts: (context: McpInvocationContext) => Promise<readonly AdmittedContractRelease[]>;
    },
) {
    const origin = new URL(host.publicUrl).origin;
    const resource = `${origin}/.cms/mcp`;
    const resourceMetadata = `${origin}/.well-known/oauth-protected-resource`;
    const binding = new CapabilityMcpBinding({
        invoker: host.invoker,
        contracts: host.contracts,
        onMutationSuccess: host.onMutationSuccess,
    });
    const mcp = createCapabilityMcpHttpHandler({
        binding,
        allowedOrigins: [origin],
        serverInfo: { name: "ulvia-cms", version: "1.0.0" },
        resources: createAuthoringResources(host),
        resolveContext: async (request) => {
            const bearer = request.headers.get("authorization");
            if (!bearer?.startsWith("Bearer ")) {
                throw new McpHttpError("invalid_token", 401);
            }
            const principal = await accessCall(host, "resolve-mcp-connection", { token: bearer.slice(7) });
            return { siteId: "default", actor: { kind: "administrator", subjectId: principal.subjectId } };
        },
    });
    return async (request: Request): Promise<Response | null> => {
        const path = new URL(request.url).pathname;
        try {
            if (
                ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/.cms/mcp"].includes(
                    path,
                ) &&
                request.method === "GET"
            ) {
                return json({
                    resource,
                    authorization_servers: [origin],
                    scopes_supported: ["cms:full"],
                    bearer_methods_supported: ["header"],
                });
            }
            if (path === "/.well-known/oauth-authorization-server" && request.method === "GET") {
                return json({
                    issuer: origin,
                    authorization_endpoint: `${origin}/.cms/oauth/authorize`,
                    token_endpoint: `${origin}/.cms/oauth/token`,
                    registration_endpoint: `${origin}/.cms/oauth/register`,
                    scopes_supported: ["cms:full"],
                    response_types_supported: ["code"],
                    grant_types_supported: ["authorization_code", "refresh_token"],
                    code_challenge_methods_supported: ["S256"],
                    token_endpoint_auth_methods_supported: ["none"],
                });
            }
            if (path === "/.cms/oauth/authorize") {
                return await authorizationPage(request, host);
            }
            if (path === "/.cms/connections") {
                return await connectionsPage(request, host);
            }
            if (path === "/.cms/oauth/register" && request.method === "POST") {
                if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
                    throw new McpHttpError("invalid_request", 415);
                }
                const input = JSON.parse(await boundedText(request, 16_384));
                return json(await accessCall(host, "register-mcp-client", input), 201);
            }
            if (path === "/.cms/oauth/token" && request.method === "POST") {
                return json(await accessCall(host, "exchange-mcp-token", Object.fromEntries(await form(request))));
            }
            const upload = /^\/\.cms\/mcp\/uploads\/([A-Za-z0-9_-]+)$/u.exec(path);
            if (upload) {
                return await mcpUpload(request, host, upload[1]!);
            }
            if (path === "/.cms/mcp") {
                // Validate before the transport catches JSON-RPC errors so OAuth failures remain HTTP 401.
                const bearer = request.headers.get("authorization");
                if (!bearer?.startsWith("Bearer ")) {
                    throw new McpHttpError("invalid_token", 401);
                }
                await accessCall(host, "resolve-mcp-connection", { token: bearer.slice(7) });
                return await mcp(request);
            }
            return null;
        } catch (error) {
            const status = error instanceof McpHttpError ? error.status : 400;
            const response = json({ error: error instanceof McpHttpError ? error.code : "invalid_request" }, status);
            if (status === 401) {
                response.headers.set("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadata}"`);
            }
            return response;
        }
    };
}
