import { OAuthError, type McpAuthorization } from "@bernouy/cms-auth/oauth";
import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { UlviaProviderGateway } from "../../ports";
import { actorSubject, requiredGateway } from "./support";

export function registerMcpAccessCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    gateway: UlviaProviderGateway | undefined,
    authorization?: McpAuthorization,
) {
    const actions = [
        "deny-mcp-authorization",
        "register-mcp-client",
        "prepare-mcp-authorization",
        "authorize-mcp-connection",
        "exchange-mcp-token",
        "resolve-mcp-connection",
        "list-mcp-connections",
        "revoke-mcp-connection",
    ];
    for (const id of actions) {
        dispatcher.register("ulvia.cms.access", id, async (input, context) => {
            if (!authorization) {
                throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
            }
            const request = parseStrictJson(String(input.requestJson), 2 * 1024 * 1024, 16) as Record<string, unknown>;
            if (!request || typeof request !== "object" || Array.isArray(request)) {
                throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
            }
            try {
                let result: unknown;
                switch (id) {
                    case "deny-mcp-authorization":
                        result = await authorization.deny(String(request.requestId));
                        break;
                    case "register-mcp-client":
                        result = await authorization.register(request);
                        break;
                    case "prepare-mcp-authorization":
                        result = await authorization.prepare(request);
                        break;
                    case "exchange-mcp-token":
                        result = await authorization.exchange(request);
                        break;
                    case "resolve-mcp-connection":
                        result = await authorization.resolve(String(request.token));
                        break;
                    case "authorize-mcp-connection":
                        result = await authorization.authorize(
                            String(request.requestId),
                            await actorSubject(requiredGateway(gateway), context),
                        );
                        break;
                    case "list-mcp-connections":
                        result = await authorization.list(
                            await actorSubject(requiredGateway(gateway), context),
                            request,
                        );
                        break;
                    case "revoke-mcp-connection":
                        result = await authorization.revoke(
                            String(request.id),
                            await actorSubject(requiredGateway(gateway), context),
                        );
                        break;
                }
                return { resultJson: JSON.stringify(result) };
            } catch (error) {
                if (error instanceof OAuthError) {
                    return { resultJson: JSON.stringify({ error: error.code, status: error.status }) };
                }
                throw error;
            }
        });
    }
}
