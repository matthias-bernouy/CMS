import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { OAuthError } from "auth/oauth/core/primitives";
import type { AccessServices } from "auth/application/interfaces/AccessServices";
import type { AccessContext } from "auth/application/interfaces/AccessContext";
import { AccessError } from "auth/application/core/access/errors";
import { actorSubject } from "auth/application/core/access/authority";
type Action = "deny" | "register" | "prepare" | "exchange" | "resolve" | "authorize" | "list" | "revoke";
/** OAuth rejections retain their protocol result document inside the admitted envelope. */
export async function executeMcp(
    action: Action,
    requestJson: string,
    services: AccessServices,
    context: AccessContext,
) {
    const request = parseStrictJson(requestJson, 2 * 1024 * 1024, 16) as Record<string, unknown>;
    if (!request || typeof request !== "object" || Array.isArray(request)) {
        throw new AccessError("INVALID_INPUT");
    }
    try {
        let result: unknown;
        switch (action) {
            case "deny":
                result = await services.mcpAuthorization.deny(String(request.requestId));
                break;
            case "register":
                result = await services.mcpAuthorization.register(request);
                break;
            case "prepare":
                result = await services.mcpAuthorization.prepare(request);
                break;
            case "exchange":
                result = await services.mcpAuthorization.exchange(request);
                break;
            case "resolve": {
                const resolved = services.mcpAuthorization.resolveWithAuthority
                    ? await services.mcpAuthorization.resolveWithAuthority(String(request.token))
                    : {
                          principal: await services.mcpAuthorization.resolve(String(request.token)),
                          authority: undefined,
                      };
                let authorizationRevision = resolved.authority?.revision;
                if (authorizationRevision === undefined) {
                    const administrator = await services.governance.administrators.get(resolved.principal.subjectId);
                    if (!administrator.enabled) {
                        throw new OAuthError("access_denied", 403);
                    }
                    authorizationRevision = administrator.revision;
                }
                result = { ...resolved.principal, authorizationRevision };
                break;
            }
            case "authorize":
                result = await services.mcpAuthorization.authorize(
                    String(request.requestId),
                    await actorSubject(services.governance, context),
                );
                break;
            case "list":
                result = await services.mcpAuthorization.list(
                    await actorSubject(services.governance, context),
                    request,
                );
                break;
            case "revoke":
                result = await services.mcpAuthorization.revoke(
                    String(request.id),
                    await actorSubject(services.governance, context),
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
}
