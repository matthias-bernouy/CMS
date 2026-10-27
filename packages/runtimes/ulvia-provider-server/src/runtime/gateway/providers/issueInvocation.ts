import { getProviderInstallationReadiness } from "@bernouy/cms-repository/providers/installations";
import { capabilityGranted, type ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import { signProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { ProviderAccess } from "@bernouy/cms-gateway/access/providers";

/** Fresh route, readiness and manifest authority fence immediately before signing. */
export function createInvocationIssuer(
    siteId: string,
    routes: GatewayRouteResolver,
    selections: Pick<ContractSelectionStore, "get">,
    providers: Pick<ProviderAccess, "authorize">,
    resolveSecret: (reference: string) => Promise<string | null | undefined>,
) {
    return async (input: {
        requestId: string;
        installationId: string;
        contractId: string;
        contractVersion: string;
        capabilityId: string;
        subjectId?: string;
        systemServiceId?: string;
        sourceInstallationId?: string;
        bodyBytes?: number;
    }) => {
        if (
            input.sourceInstallationId !== undefined &&
            (input.systemServiceId !== undefined || input.subjectId !== undefined)
        ) {
            throw new TypeError("Provider identity cannot impersonate a user or system service");
        }
        if (
            input.systemServiceId !== undefined &&
            (input.systemServiceId !== "cms-kernel" ||
                input.contractId !== "ulvia.cms.observability" ||
                input.capabilityId !== "logs.append" ||
                input.subjectId !== undefined)
        ) {
            throw Object.assign(new Error("System invocation is not authorized"), { code: "forbidden", status: 403 });
        }
        const route = await routes.resolve(siteId, input.contractId);
        const release = route?.requestedRelease.admission.release;
        const instanceId = route?.installation.observation?.report.instanceId;
        if (
            !route ||
            route.installation.installation.id !== input.installationId ||
            release?.version !== input.contractVersion ||
            !release.capabilities.some(({ id }) => id === input.capabilityId) ||
            !instanceId
        ) {
            throw Object.assign(new Error("Gateway invocation route is unavailable"), { code: "route_not_found" });
        }
        const readiness = getProviderInstallationReadiness(route.installation, new Date().toISOString(), 300_000);
        if (
            readiness.status !== "observed" ||
            !readiness.readyImplementations.some(
                (item) =>
                    item.contractId === route.selection.contractId &&
                    item.version === route.selection.version &&
                    item.digest === route.selection.digest,
            )
        ) {
            throw Object.assign(new Error("Selected Provider is not ready"), { code: "route_not_found", status: 404 });
        }
        const current = await selections.get(siteId);
        if (!current || !capabilityGranted(current.grants, route.selection.contractId, input.capabilityId)) {
            throw Object.assign(new Error("Capability is not granted for this site"), {
                code: "forbidden",
                status: 403,
            });
        }
        if (
            input.sourceInstallationId &&
            !(await providers.authorize(
                {
                    sourceInstallationId: input.sourceInstallationId,
                    targetInstallationId: input.installationId,
                    contractId: input.contractId,
                    capabilityId: input.capabilityId,
                    version: input.contractVersion,
                },
                true,
                input.bodyBytes ?? 0,
            ))
        ) {
            throw Object.assign(new Error("Provider capability is not authorized"), { code: "forbidden", status: 403 });
        }
        const secret = await resolveSecret(route.installation.installation.providerTokenRef);
        if (!secret) {
            throw new Error("Provider invocation credential is unavailable");
        }
        if (!(await routes.isCurrent(route))) {
            throw Object.assign(new Error("Invocation authorization changed"), { code: "stale_route", status: 409 });
        }
        const issuedAt = Math.floor(Date.now() / 1_000);
        return {
            instanceId,
            token: signProviderInvocationToken(secret, {
                version: 1,
                requestId: input.requestId,
                instanceId,
                contractId: input.contractId,
                contractVersion: input.contractVersion,
                capabilityId: input.capabilityId,
                ...(input.subjectId ? { subjectId: input.subjectId } : {}),
                ...(input.systemServiceId ? { systemServiceId: input.systemServiceId } : {}),
                ...(input.sourceInstallationId ? { sourceInstallationId: input.sourceInstallationId } : {}),
                connectionId: input.installationId,
                issuedAt,
                expiresAt: issuedAt + 30,
            }),
        };
    };
}
