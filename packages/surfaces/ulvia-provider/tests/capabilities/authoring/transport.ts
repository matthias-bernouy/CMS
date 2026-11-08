import { localizeFailureResponse } from "../../../src/dispatch/errors/response";
import { createProviderHandler, compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerOfficialFeatures, loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import type { AuthoringService } from "@bernouy/cms-repository/features/authoring";
import { authoringServices } from "./services";
const providerId = "ulvia/primary-provider";
const token = "authoring-test-provider-token-" + "x".repeat(40);
export async function authoringTransport(service: Partial<AuthoringService> = {}) {
    const ports = authoringServices(service);
    const build = await loadOfficialFeatures();
    const releases = build.implementations.filter(({ contractId }) => contractId === "ulvia/cms.authoring");
    const contracts = build.implementedContracts.filter(({ release }) => release.contractId === "ulvia/cms.authoring");
    const routes = compileProviderRoutes(contracts);
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(dispatcher, ports, releases, {
        providerId,
        scope: { siteId: "default", instanceId: "instance-a" },
    });
    const handle = createProviderHandler({
        contracts,
        dispatcher,
        authenticate: async (request) => {
            try {
                const claims = verifyProviderInvocationToken(
                    (request.headers.get("authorization") ?? "").slice(7),
                    token,
                );
                return claims.instanceId === "instance-a" ? { claims, providerId, siteId: "default" } : null;
            } catch {
                return null;
            }
        },
        authorize: async (claims) => {
            const access = contracts[0]!.capabilities.find(({ definition }) => definition.id === claims.capabilityId)!
                .definition.access;
            return (
                access === "public" ||
                (access === "authenticated" ? Boolean(claims.subjectId) : claims.actorKind === "administrator")
            );
        },
    });
    const call = async (
        id: string,
        input: Record<string, unknown>,
        options: {
            claims?: Partial<ProviderInvocationClaims>;
            authenticated?: boolean;
            headers?: HeadersInit;
            signal?: AbortSignal;
        } = {},
    ) => {
        const binding = routes.find(({ capability }) => capability.id === id)!.capability.binding;
        const url = new URL(
            binding.path.replace(/\{([^}]+)\}/gu, (_match, key: string) => encodeURIComponent(String(input[key]))),
            "https://provider.test",
        );
        for (const [name, key] of Object.entries(binding.input?.query ?? {})) {
            if (input[key] !== undefined) {
                url.searchParams.set(name, String(input[key]));
            }
        }
        const claims: ProviderInvocationClaims = {
            version: 1,
            requestId: crypto.randomUUID(),
            instanceId: "instance-a",
            contractId: "ulvia/cms.authoring",
            contractVersion: "1.0.0",
            capabilityId: id,
            actorKind: "administrator",
            subjectId: "admin",
            issuedAt: Math.floor(Date.now() / 1000),
            expiresAt: Math.floor(Date.now() / 1000) + 30,
            ...options.claims,
        };
        const { actorKind, subjectId: requestedSubject, ...rest } = claims;
        const subjectId = actorKind === "anonymous" ? undefined : requestedSubject;
        const signedClaims = { ...rest, ...(actorKind ? { actorKind } : {}), ...(subjectId ? { subjectId } : {}) };
        const headers = new Headers(options.headers);
        headers.set("content-type", "application/json");
        headers.set("x-ulvia-request-id", claims.requestId);
        if (options.authenticated !== false) {
            headers.set("authorization", `Bearer ${signProviderInvocationToken(token, signedClaims)}`);
        }
        const request = new Request(url, {
            method: binding.method,
            headers,
            signal: options.signal,
            ...(binding.input?.body ? { body: JSON.stringify(input) } : {}),
        });
        return (await localizeFailureResponse(await handle(request), request, signedClaims, routes))!;
    };
    return { ports, call };
}
