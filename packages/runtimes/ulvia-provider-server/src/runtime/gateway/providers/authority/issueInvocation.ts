import { assertInvocationScope } from "./scope";
import type { ProviderInvocationIssue } from "@bernouy/cms-gateway/protocol";
import type { GatewayDelegationAuthority } from "@bernouy/cms-gateway/access/delegation";
import type { ProviderIdentityService } from "@bernouy/cms-gateway/identity";
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
    providers: Pick<ProviderAccess, "authorize" | "consumeBudget">,
    resolveSecret: (reference: string) => Promise<string | null | undefined>,
    delegations?: GatewayDelegationAuthority,
    identities?: ProviderIdentityService,
) {
    return async (input: ProviderInvocationIssue) => {
        assertInvocationScope(input);
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
            !input.delegatedTicket &&
            !(await providers.authorize(
                {
                    sourceInstallationId: input.sourceInstallationId,
                    sourceCredentialFingerprint: input.sourceCredentialFingerprint,
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
        let subjectId = input.subjectId;
        let rootRequestId: string | undefined;
        if (input.delegatedTicket) {
            if (!delegations || !identities) {
                throw Object.assign(new Error("Delegation unavailable"), { status: 403 });
            }
            const checked = await delegations.check(
                {
                    siteId,
                    ticket: input.delegatedTicket,
                    sourceInstallationId: input.sourceInstallationId!,
                    sourceCredentialFingerprint: input.sourceCredentialFingerprint!,
                    contractId: input.contractId,
                    capabilityId: input.capabilityId,
                },
                true,
                input.bodyBytes ?? 0,
            );
            if (!(await providers.consumeBudget(input.sourceInstallationId!, input.bodyBytes ?? 0))) {
                throw Object.assign(new Error("Delegated request exceeds Provider limits"), { status: 403 });
            }
            rootRequestId = checked.rootRequestId;
            subjectId =
                checked.actor.kind === "anonymous"
                    ? undefined
                    : await identities.getOrCreate(
                          { providerId: route.installation.installation.providerId },
                          checked.actor.subjectId,
                      );
            if (input.subjectId !== undefined && input.subjectId !== subjectId) {
                throw Object.assign(new Error("Delegated subject does not match Access state"), { status: 403 });
            }
        }
        const secret = await resolveSecret(route.installation.installation.providerTokenRef);
        if (!secret) {
            throw new Error("Provider invocation credential is unavailable");
        }
        if (!(await routes.isCurrent(route))) {
            throw Object.assign(new Error("Invocation authorization changed"), { code: "stale_route", status: 409 });
        }
        if (input.sourceInstallationId) {
            const target = {
                sourceInstallationId: input.sourceInstallationId,
                sourceCredentialFingerprint: input.sourceCredentialFingerprint!,
                targetInstallationId: input.installationId,
                contractId: input.contractId,
                capabilityId: input.capabilityId,
                version: input.contractVersion,
            };
            if (input.delegatedTicket) {
                await delegations!.check({
                    siteId,
                    ticket: input.delegatedTicket,
                    sourceInstallationId: target.sourceInstallationId,
                    sourceCredentialFingerprint: target.sourceCredentialFingerprint,
                    contractId: input.contractId,
                    capabilityId: input.capabilityId,
                });
            } else if (!(await providers.authorize(target))) {
                throw Object.assign(new Error("Provider credential or authority changed before dispatch"), {
                    status: 403,
                });
            }
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
                ...(subjectId ? { subjectId } : {}),
                ...(rootRequestId ? { rootRequestId } : {}),
                ...(input.delegation
                    ? { delegationTicket: input.delegation.ticket, delegationExpiresAt: input.delegation.expiresAt }
                    : {}),
                ...(input.systemServiceId ? { systemServiceId: input.systemServiceId } : {}),
                ...(input.sourceInstallationId ? { sourceInstallationId: input.sourceInstallationId } : {}),
                connectionId: input.installationId,
                issuedAt,
                expiresAt: issuedAt + 30,
            }),
        };
    };
}
