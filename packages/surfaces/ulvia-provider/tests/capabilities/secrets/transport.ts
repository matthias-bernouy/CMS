import { createProviderHandler, compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import type { SecretsService } from "@bernouy/cms-secrets";

export const scope = { siteId: "site-a", instanceId: "instance-a" };
const providerId = "ulvia/primary-provider";
const token = "test-only-secrets-provider-token-" + "x".repeat(40);
export interface RequestOptions {
    readonly authenticated?: boolean;
    readonly key?: string | null;
    readonly claims?: Partial<ProviderInvocationClaims>;
    readonly language?: string;
}

export async function secretsTransport(secrets: SecretsService) {
    const build = await loadOfficialFeatures();
    const contracts = build.implementedContracts.filter(({ release }) => release.contractId === "ulvia/cms.secrets");
    const releases = build.implementations.filter(({ contractId }) => contractId === "ulvia/cms.secrets");
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(dispatcher, { secrets }, releases, {
        providerId,
        scope,
        executeKeyed: async (_invocation, execute) => execute(),
    });
    const routes = compileProviderRoutes(contracts);
    const fetchHandler = createProviderHandler({
        contracts,
        dispatcher,
        authenticate: async (request) => {
            const authorization = request.headers.get("authorization");
            if (!authorization?.startsWith("Bearer ")) {
                return null;
            }
            try {
                const claims = verifyProviderInvocationToken(authorization.slice(7), token);
                return claims.instanceId === scope.instanceId ? { claims, providerId, siteId: scope.siteId } : null;
            } catch {
                return null;
            }
        },
        authorize: async (claims) => claims.actorKind === "administrator",
    });
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: fetchHandler });
    const request = (capabilityId: string, input: Record<string, unknown>, options: RequestOptions = {}) => {
        const route = routes.find(({ capability }) => capability.id === capabilityId)!;
        const binding = route.capability.binding;
        const claims: ProviderInvocationClaims = {
            version: 1,
            requestId: crypto.randomUUID(),
            instanceId: scope.instanceId,
            contractId: route.contractId,
            contractVersion: route.contractVersion,
            capabilityId,
            actorKind: "administrator",
            subjectId: "admin-a",
            issuedAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor(Date.now() / 1000) + 30,
            ...options.claims,
        };
        const url = new URL(
            binding.path.replace(/\{([^}]+)\}/gu, (_match, key: string) => encodeURIComponent(String(input[key]))),
            server.url,
        );
        for (const [name, key] of Object.entries(binding.input?.query ?? {})) {
            if (input[key] !== undefined) {
                url.searchParams.set(name, String(input[key]));
            }
        }
        const mapping = binding.input?.body;
        if (mapping && mapping !== true && !("properties" in mapping)) {
            throw new TypeError("The Secrets test client requires a JSON binding");
        }
        const body =
            mapping === true
                ? input
                : mapping
                  ? Object.fromEntries(
                        mapping.properties.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]),
                    )
                  : undefined;
        return new Request(url, {
            method: binding.method,
            headers: {
                ...(route.capability.behavior.effect === "command" &&
                route.capability.behavior.idempotency === "keyed" &&
                options.key !== null
                    ? { "idempotency-key": options.key ?? crypto.randomUUID() }
                    : {}),
                "x-ulvia-request-id": claims.requestId,
                "content-type": "application/json",
                "accept-language": options.language ?? "en",
                ...(options.authenticated === false
                    ? {}
                    : { authorization: `Bearer ${signProviderInvocationToken(token, claims)}` }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
    };
    return {
        dispatcher,
        request,
        call: (id: string, input: Record<string, unknown>, options?: RequestOptions) =>
            fetch(request(id, input, options)),
        close: () => server.stop(true),
    };
}
