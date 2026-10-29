import { GatewayAuthorityReads, prepareGatewayDispatch, type GatewayRouteResolver } from "@bernouy/cms-gateway";
import type { ProviderDispatchPreparation, ProviderInvocationIssue } from "@bernouy/cms-gateway/protocol";
import type { ProviderIdentityService } from "@bernouy/cms-gateway/identity";
import type { DelegationAuthority, PreparedDelegation, DelegationActor } from "@bernouy/cms-gateway/access/delegation";
import { assertPreparationScope } from "./preparationScope";

export function createDispatchPreparer(options: {
    siteId: string;
    captureAuthority?(installationIds: readonly string[]): Promise<GatewayAuthorityReads>;
    routes: GatewayRouteResolver;
    identities: ProviderIdentityService;
    inspectActor?(actor: { kind: "user" | "administrator"; subjectId: string }): Promise<DelegationActor | null>;
    delegations: Pick<DelegationAuthority, "prepare"> & Partial<Pick<DelegationAuthority, "close">>;
    issue(
        input: ProviderInvocationIssue,
        reads: GatewayAuthorityReads,
        root?: PreparedDelegation,
    ): Promise<{
        token: string;
        instanceId: string;
        delegation?: { ticket: string; expiresAt: number };
    }>;
}) {
    return async (value: ProviderDispatchPreparation) => {
        let input = structuredClone(value);
        if (input.closedDelegations?.length) {
            if (input.closedDelegations.length > 64 || !options.delegations.close) {
                throw Object.assign(new Error("Invalid root closure batch"), { status: 403 });
            }
            await Promise.all(
                input.closedDelegations.map((context) =>
                    options.delegations.close!({ ...context, siteId: options.siteId }),
                ),
            );
        }
        const actorToInspect = input.actor;
        if (
            (actorToInspect.kind === "user" || actorToInspect.kind === "administrator") &&
            actorToInspect.authorizationRevision === undefined
        ) {
            const inspected = await options.inspectActor?.(actorToInspect);
            if (
                !inspected ||
                inspected.kind === "anonymous" ||
                inspected.kind !== actorToInspect.kind ||
                inspected.subjectId !== actorToInspect.subjectId
            ) {
                throw Object.assign(new Error("Dispatch actor could not be verified"), { status: 403 });
            }
            input = { ...input, actor: inspected };
        }
        assertPreparationScope(input);
        const invocation = input.invocation;
        const reads = options.captureAuthority
            ? await options.captureAuthority([
                  invocation.installationId,
                  ...(invocation.sourceInstallationId ? [invocation.sourceInstallationId] : []),
              ])
            : new GatewayAuthorityReads(options.siteId);
        const route = await options.routes.resolve(options.siteId, invocation.contractId, reads);
        const release = route?.requestedRelease.admission.release;
        const capability = release?.capabilities.find(({ id }) => id === invocation.capabilityId);
        if (
            !route ||
            !capability ||
            route.selection.installationId !== invocation.installationId ||
            release?.version !== invocation.contractVersion
        ) {
            throw Object.assign(new Error("Dispatch route changed"), { status: 409 });
        }
        const actor = input.actor;
        const needsIdentity =
            (actor.kind === "user" || actor.kind === "administrator") &&
            (capability.access !== "public" || (capability.output.type === "binary" && capability.output.resource));
        const source = route.manifest.admission.manifest.implementations.find(
            (item) =>
                item.contractId === route.selection.contractId &&
                item.version === route.selection.version &&
                item.digest === route.selection.digest,
        );
        const mayDelegate =
            !invocation.delegatedTicket && source?.delegation?.sources.some((id) => id === "*" || id === capability.id);
        const prepared = await prepareGatewayDispatch(
            () =>
                needsIdentity && (actor.kind === "user" || actor.kind === "administrator")
                    ? options.identities.getOrCreate(
                          { providerId: route.installation.installation.providerId },
                          actor.subjectId,
                      )
                    : Promise.resolve(undefined),
            () =>
                mayDelegate && (actor.kind === "anonymous" || actor.kind === "user" || actor.kind === "administrator")
                    ? options.delegations.prepare(
                          {
                              siteId: options.siteId,
                              requestId: invocation.requestId,
                              installationId: invocation.installationId,
                              contractId: invocation.contractId,
                              version: invocation.contractVersion,
                              digest: route.selection.digest,
                              capabilityId: invocation.capabilityId,
                              actor,
                              deadline: input.deadline,
                          },
                          reads,
                      )
                    : Promise.resolve(null),
            (pending) => pending.cancel(),
        );
        try {
            if (input.expectedSubjectId !== undefined && input.expectedSubjectId !== prepared.subjectId) {
                throw Object.assign(new Error("Provider identity changed during preparation"), { status: 403 });
            }
            const issued = await options.issue(
                {
                    ...invocation,
                    ...(prepared.subjectId ? { subjectId: prepared.subjectId } : {}),
                    ...(capability.output.type === "binary" &&
                    capability.output.resource &&
                    (actor.kind === "anonymous" || actor.kind === "user" || actor.kind === "administrator")
                        ? { actorKind: actor.kind }
                        : {}),
                },
                reads,
                prepared.delegation ?? undefined,
            );
            return { ...issued, delegation: issued.delegation ?? null };
        } catch (error) {
            if (prepared.delegation) {
                await prepared.delegation.cancel().catch(() => undefined);
            }
            throw error;
        }
    };
}
