import { signProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import { scope } from "../fixture";

export const TOKEN = "test-only-smtp-provider-token-" + "x".repeat(40);
export const message = { toEmail: "member@example.test", subject: "Welcome", text: "Hello" };

/** Tests derive transport details from the generated contract, like a Gateway client. */
export function smtpRequests(origin: string, contracts: readonly ResolvedContract[]) {
    const routes = compileProviderRoutes(contracts);
    return (
        input: unknown = message,
        options: {
            key?: string | null;
            claims?: Partial<ProviderInvocationClaims>;
            authenticated?: boolean;
        } = {},
    ) => {
        const claims: ProviderInvocationClaims = {
            version: 1,
            requestId: crypto.randomUUID(),
            instanceId: scope.instanceId,
            contractId: contracts[0]!.release.contractId,
            contractVersion: contracts[0]!.release.version,
            capabilityId: "emailer.send",
            actorKind: "administrator",
            subjectId: "admin-a",
            issuedAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor(Date.now() / 1000) + 30,
            ...options.claims,
        };
        const route = routes.find(
            (route) =>
                route.contractId === claims.contractId &&
                route.contractVersion === claims.contractVersion &&
                route.capability.id === claims.capabilityId,
        )!;
        const binding = route.capability.binding;
        return new Request(`${origin}${binding.path}`, {
            method: binding.method,
            headers: {
                "content-type": "application/json",
                "x-ulvia-request-id": claims.requestId,
                ...(route.capability.behavior.effect === "command" &&
                route.capability.behavior.idempotency === "keyed" &&
                options.key !== null
                    ? { "idempotency-key": options.key ?? "send-1" }
                    : {}),
                ...(options.authenticated === false
                    ? {}
                    : { authorization: `Bearer ${signProviderInvocationToken(TOKEN, claims)}` }),
            },
            ...(binding.input?.body ? { body: JSON.stringify(input) } : {}),
        });
    };
}
