import { GatewayAuthorityReads } from "@bernouy/cms-gateway";
import { assertInvocationScope } from "./scope";
import type { ProviderInvocationIssue } from "@bernouy/cms-gateway/protocol";
import type {
    DelegationDispatchAuthority,
    DelegationAuthorization,
    PreparedDelegation,
    DelegationActor,
    DelegationContext,
} from "@bernouy/cms-gateway/access/delegation";
import type { ProviderIdentityService } from "@bernouy/cms-gateway/identity";
import { getProviderInstallationReadiness } from "@bernouy/cms-repository/providers/installations";
import { capabilityGranted, type ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import { signProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { GatewayRoute, GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { ProviderAccess } from "@bernouy/cms-gateway/access/providers";

/** Fresh route, readiness and manifest authority fence immediately before signing. */
export function createInvocationIssuer(
    siteId: string,
    routes: GatewayRouteResolver,
    selections: Pick<ContractSelectionStore, "get">,
    providers: Pick<ProviderAccess, "authorize" | "consumeBudget">,
    resolveSecret: (reference: string) => Promise<string | null | undefined>,
    delegations?: DelegationDispatchAuthority,
    identities?: ProviderIdentityService,
    inspectActor?: (subjectId: string) => Promise<"user" | "administrator" | null>,
    authority?: {
        capture(installationIds: readonly string[]): Promise<GatewayAuthorityReads>;
        check(route: GatewayRoute, capabilityId: string): Promise<{ current: boolean; granted: boolean }>;
    },
) {
    return async (input: ProviderInvocationIssue, reads?: GatewayAuthorityReads, root?: PreparedDelegation) => {
        assertInvocationScope(input);
        reads ??= authority
            ? await authority.capture([
                  input.installationId,
                  ...(input.sourceInstallationId ? [input.sourceInstallationId] : []),
              ])
            : new GatewayAuthorityReads(siteId);
        const route = await routes.resolve(siteId, input.contractId, reads);
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
        const current = await reads.selection(selections, siteId);
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
                reads,
            ))
        ) {
            throw Object.assign(new Error("Provider capability is not authorized"), { code: "forbidden", status: 403 });
        }
        let delegatedAuthorization: DelegationAuthorization | undefined;
        let subjectId = input.subjectId;
        let rootRequestId: string | undefined;
        if (input.delegatedTicket) {
            if (!delegations || !identities) {
                throw Object.assign(new Error("Delegation unavailable"), { status: 403 });
            }
            const checked = await delegations.authorize(
                {
                    siteId,
                    ticket: input.delegatedTicket,
                    sourceInstallationId: input.sourceInstallationId!,
                    sourceCredentialFingerprint: input.sourceCredentialFingerprint!,
                    contractId: input.contractId,
                    capabilityId: input.capabilityId,
                },
                input.bodyBytes ?? 0,
            );
            if (!(await providers.consumeBudget(input.sourceInstallationId!, input.bodyBytes ?? 0))) {
                throw Object.assign(new Error("Delegated request exceeds Provider limits"), { status: 403 });
            }
            delegatedAuthorization = checked;
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
        const capability = release.capabilities.find(({ id }) => id === input.capabilityId)!;
        let actorKind: "anonymous" | "user" | "administrator" | undefined;
        let resourceSubject: string | null | undefined;
        if (capability.output.type === "binary" && capability.output.resource) {
            if (input.systemServiceId || (input.sourceInstallationId && !input.delegatedTicket)) {
                throw Object.assign(new Error("Resource delivery requires an end-user actor"), { status: 403 });
            }
            if (subjectId) {
                const cmsSubject = await identities?.resolve(
                    { providerId: route.installation.installation.providerId },
                    subjectId,
                );
                resourceSubject = cmsSubject;
                if (!cmsSubject) {
                    throw Object.assign(new Error("Resource actor is unavailable"), { status: 403 });
                }
            } else {
                actorKind = "anonymous";
            }
            if (!resourceSubject && input.actorKind !== actorKind) {
                throw Object.assign(new Error("Resource actor changed before dispatch"), { status: 403 });
            }
        } else if (input.actorKind) {
            throw Object.assign(new Error("Actor context requires a resource output"), { status: 403 });
        }
        const secret = await resolveSecret(route.installation.installation.providerTokenRef);
        if (!secret) {
            throw new Error("Provider invocation credential is unavailable");
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
                await delegatedAuthorization!.assertCurrent();
            } else if (!(await providers.authorize(target))) {
                throw Object.assign(new Error("Provider credential or authority changed before dispatch"), {
                    status: 403,
                });
            }
        }
        const sign = (rootContext?: DelegationContext, actor?: DelegationActor) => {
            if (actor && capability.output.type === "binary" && capability.output.resource) {
                const sameSubject = actor.kind === "anonymous" ? !subjectId : actor.subjectId === resourceSubject;
                if (!sameSubject || actor.kind !== input.actorKind) {
                    throw Object.assign(new Error("Resource actor does not match the prepared delegation"), {
                        status: 403,
                    });
                }
                actorKind = actor.kind;
            }
            const issuedAt = Math.floor(Date.now() / 1_000);
            const delegation = rootContext ?? input.delegation;
            return {
                instanceId,
                ...(rootContext ? { delegation: rootContext } : {}),
                token: signProviderInvocationToken(secret, {
                    version: 1,
                    ...(input.trace ? { trace: input.trace } : {}),
                    requestId: input.requestId,
                    instanceId,
                    contractId: input.contractId,
                    contractVersion: input.contractVersion,
                    capabilityId: input.capabilityId,
                    ...(subjectId ? { subjectId } : {}),
                    ...(actorKind ? { actorKind } : {}),
                    ...(rootRequestId ? { rootRequestId } : {}),
                    ...(delegation
                        ? { delegationTicket: delegation.ticket, delegationExpiresAt: delegation.expiresAt }
                        : {}),
                    ...(input.systemServiceId ? { systemServiceId: input.systemServiceId } : {}),
                    ...(input.sourceInstallationId ? { sourceInstallationId: input.sourceInstallationId } : {}),
                    connectionId: input.installationId,
                    issuedAt,
                    expiresAt: issuedAt + 30,
                }),
            };
        };
        const finish = async () => {
            if (resourceSubject) {
                actorKind = (await inspectActor?.(resourceSubject)) ?? undefined;
                if (!actorKind || input.actorKind !== actorKind) {
                    throw Object.assign(new Error("Resource actor changed at dispatch fence"), { status: 403 });
                }
            }
            const final = authority ? await authority.check(route, input.capabilityId) : undefined;
            const dispatchSelection = final ? null : await selections.get(siteId);
            const granted = final
                ? final.granted
                : Boolean(
                      dispatchSelection &&
                          capabilityGranted(dispatchSelection.grants, route.selection.contractId, input.capabilityId),
                  );
            if (!granted) {
                throw Object.assign(new Error("Capability grant changed before dispatch"), { status: 403 });
            }
            if (!(final ? final.current : await routes.isCurrent(route))) {
                throw Object.assign(new Error("Invocation authorization changed"), {
                    code: "stale_route",
                    status: 409,
                });
            }
            return sign();
        };

        return root
            ? root.finalize(
                  {
                      siteId,
                      requestId: input.requestId,
                      installationId: input.installationId,
                      contractId: input.contractId,
                      version: input.contractVersion,
                      digest: route.selection.digest,
                      capabilityId: input.capabilityId,
                  },
                  async (context, actor) => sign(context, actor),
                  route,
              )
            : finish();
    };
}
