import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import {
    ACTOR_CREDENTIAL_HEADER,
    SESSION_EFFECT_HEADER,
    decodeSessionEffect,
    encodeActorCredential,
} from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { AccessServices } from "@bernouy/cms-auth/feature";
import { NOOP_LOGGER } from "@bernouy/logging";
import { DefaultProviderCapabilityDispatcher, ProviderCapabilityResponse } from "@bernouy/ulvia-provider";
import type { ProviderCapabilityInvocationContext } from "@bernouy/ulvia-provider";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { createProviderContractRelay } from "../../../../src/transport/relay";
const providerId = "ulvia/primary-provider";
export async function accessTransport(services: AccessServices) {
    const build = await loadOfficialFeatures();
    const contract = build.implementedContracts.find(({ release }) => release.contractId === "ulvia/cms.access")!;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(
        dispatcher,
        services,
        build.implementations.filter(({ contractId }) => contractId === contract.release.contractId),
        {
            providerId,
            scope: { siteId: "default", instanceId: "instance-a" },
        },
    );
    const routes = compileProviderRoutes([contract]);
    const relay = createProviderContractRelay(routes, dispatcher, { siteId: "default", providerId }, NOOP_LOGGER);
    const call = async (
        id: string,
        input: Record<string, unknown>,
        context: Partial<ProviderCapabilityInvocationContext> = {},
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
            requestId: context.requestId ?? crypto.randomUUID(),
            instanceId: context.invocation?.instanceId ?? "instance-a",
            contractId: contract.release.contractId,
            contractVersion: contract.release.version,
            capabilityId: id,
            issuedAt: 0,
            expiresAt: 9999999999,
            ...(context.subjectId ? { subjectId: context.subjectId } : {}),
            ...(context.systemServiceId ? { systemServiceId: context.systemServiceId } : {}),
            ...(context.sourceInstallationId ? { sourceInstallationId: context.sourceInstallationId } : {}),
        };
        const headers = new Headers({ "content-type": "application/json", "x-ulvia-request-id": claims.requestId });
        if (context.actorCredential) {
            headers.set(ACTOR_CREDENTIAL_HEADER, encodeActorCredential(context.actorCredential));
        }
        // Submit the full body: the real admitted binding owns which properties are exposed.
        return (await relay(
            new Request(url, {
                method: binding.method,
                headers,
                ...(binding.input?.body ? { body: JSON.stringify(input) } : {}),
            }),
            claims,
        ))!;
    };
    const invoke = async (
        contractId: string,
        id: string,
        input: Record<string, unknown>,
        context?: Partial<ProviderCapabilityInvocationContext>,
    ) => {
        if (contractId !== contract.release.contractId) {
            throw new Error("Unexpected test contract");
        }
        const response = await call(id, input, context);
        const result = await response.json();
        if (!response.ok) {
            throw Object.assign(new Error(result.error.code), { ...result.error, status: response.status });
        }
        const effect = decodeSessionEffect(response.headers.get(SESSION_EFFECT_HEADER));
        return effect ? new ProviderCapabilityResponse(result, effect) : result;
    };
    return { call, invoke, contract, dispatcher };
}
