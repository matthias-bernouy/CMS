import { createProvider } from "@bernouy/ulvia-sdk/provider";
import type { ProviderRuntimeOptions } from "@bernouy/ulvia-sdk/provider";
import type { CompiledProvider } from "@bernouy/ulvia-sdk";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";

/** Unit-only authentication port: the network journey separately verifies signed tokens. */
export function unitProvider<Dependencies>(
    build: CompiledProvider<Dependencies>,
    dependencies: Dependencies,
    options: Partial<ProviderRuntimeOptions> = {},
) {
    const requests = new WeakMap<Request, ProviderInvocationClaims>();
    const provider = createProvider(build, dependencies, {
        scope: { siteId: "site-test", instanceId: "instance:test" },
        authenticate: async (request) => {
            const claims = requests.get(request);
            return claims ? { claims, siteId: "site-test", providerId: build.manifest.manifest.providerId } : null;
        },
        authorize: async () => true,
        ...options,
    });
    return {
        provider,
        call: (contractId: string, capabilityId: string, path: string, init: RequestInit = {}, version = "1.0.0") => {
            const claims: ProviderInvocationClaims = {
                version: 1,
                requestId: crypto.randomUUID(),
                instanceId: "instance:test",
                contractId,
                contractVersion: version,
                capabilityId,
                issuedAt: 1,
                expiresAt: 2,
            };
            const request = new Request(`http://127.0.0.1:5103${path}`, {
                ...init,
                headers: {
                    ...Object.fromEntries(new Headers(init.headers)),
                    "x-ulvia-request-id": claims.requestId,
                },
            });
            requests.set(request, claims);
            return provider.fetch(request);
        },
    };
}
