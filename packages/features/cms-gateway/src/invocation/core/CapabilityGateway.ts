import { delegationStream } from "./delegationStream";
import type { CapabilityDefinition, ContractRelease } from "@bernouy/cms-repository/contracts";
import { capabilityBindings } from "@bernouy/cms-repository/contracts/bindings";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { ProviderIdentityService } from "cms-gateway/identity/interfaces/ProviderIdentityService";
import type {
    GatewayActor,
    GatewayAccessProbe,
    GatewayInvocation,
    GatewayResult,
    GatewayRoute,
    GatewayRouteResolver,
    GatewayTransport,
} from "cms-gateway/invocation/interfaces/Invocation";
import { GatewayError, GatewayDispatchRejected } from "cms-gateway/invocation/core/GatewayError";
import { resolveRoute } from "cms-gateway/invocation/core/resolveRoute";
import { snapshotInvocation } from "cms-gateway/invocation/core/snapshotInvocation";
import { validateResponse } from "cms-gateway/invocation/core/validateResponse";
import type {
    GatewayCommandAuditEvent,
    GatewayCommandAuditStage,
    GatewayCommandAuditStore,
} from "cms-gateway/audit/interfaces/GatewayAudit";

import type { GatewayDelegationAuthority, DelegationTarget } from "cms-gateway/access/delegation/interfaces";

export interface CapabilityGatewayOptions {
    readonly delegations?: GatewayDelegationAuthority;
    readonly routes: GatewayRouteResolver;
    readonly transport: GatewayTransport;
    /** Required host grant check, including view restrictions and site membership. */
    readonly authorize: (
        actor: GatewayActor,
        capability: CapabilityDefinition,
        route: GatewayRoute,
    ) => Promise<boolean>;
    readonly identities?: ProviderIdentityService;
    /** Required for command capabilities. Commands fail closed before dispatch when audit is unavailable. */
    readonly commandAudit?: GatewayCommandAuditStore;
    readonly now?: () => string;
    readonly maxObservationAgeMs?: number;
    /**
     * The transport authorization boundary re-resolves and fences the exact
     * installation, release and capability immediately before dispatch.
     * Generic transports must leave this disabled.
     */
    readonly transportFencesRoute?: boolean;
}

type AuthorizedRoute = {
    route: GatewayRoute;
    instanceId: string;
    release: ContractRelease;
    capability: CapabilityDefinition;
};

export class CapabilityGateway implements GatewayAccessProbe {
    readonly #options: CapabilityGatewayOptions;

    constructor(options: CapabilityGatewayOptions) {
        this.#options = options;
    }

    /** Checks the current route and host grant without calling the provider. */
    async assertAuthorized(value: Omit<GatewayInvocation, "input">): Promise<void> {
        await this.#authorizedRoute(value);
    }

    async resolveContract(value: { siteId: string; contractId: string }) {
        const route = await this.#options.routes.resolve(value.siteId, value.contractId);
        if (!route) {
            throw new GatewayError("not_selected", "site has no selected release for this contract");
        }
        return route.requestedRelease.admission;
    }

    async invoke(value: GatewayInvocation): Promise<GatewayResult> {
        let invocation = snapshotInvocation(value);
        const started = Date.now();
        let delegated: DelegationTarget | undefined;
        let rootRequestId: string | undefined;
        if (invocation.delegationTicket) {
            if (invocation.actor.kind !== "provider" || !this.#options.delegations) {
                throw new GatewayError("not_authorized", "delegation authority is unavailable");
            }
            delegated = {
                siteId: invocation.siteId,
                ticket: invocation.delegationTicket,
                sourceInstallationId: invocation.actor.installationId,
                sourceCredentialFingerprint: invocation.actor.credentialFingerprint,
                contractId: invocation.contractId,
                capabilityId: invocation.capabilityId,
            };
            const checked = await this.#options.delegations.check(delegated);
            invocation = { ...invocation, actor: checked.actor };
            rootRequestId = checked.rootRequestId;
        }
        const { route, instanceId, release, capability } = await this.#authorizedRoute(invocation, false);
        assertActorCredentialTarget(invocation, capability);
        const input = snapshotInput(invocation.input, capability);
        const subjectId = await this.#providerSubjectId(invocation.actor, capability, route);
        if (!this.#options.transportFencesRoute && !(await this.#options.routes.isCurrent(route))) {
            throw new GatewayError("stale_route", "installation changed while resolving actor identity");
        }
        const requestId = crypto.randomUUID();
        const isCommand = capability.behavior.effect === "command";
        // Cached policy only avoids unnecessary control calls; issuance revalidates live authority.
        const delegationSource = route.manifest.admission.manifest.implementations.some(
            (implementation) =>
                implementation.contractId === route.selection.contractId &&
                implementation.version === route.selection.version &&
                implementation.digest === route.selection.digest &&
                implementation.delegation?.sources.some((source) => source === "*" || source === capability.id),
        );
        if (isCommand) {
            await this.#auditCommand(
                commandAuditEvent(invocation, route, requestId, this.#now(), "started"),
                requestId,
                false,
            );
        }
        let result: GatewayResult;
        let delegation: Awaited<ReturnType<GatewayDelegationAuthority["issue"]>> = null;
        let streamed = false;
        const closeDelegation = async () => {
            if (delegation) {
                try {
                    await this.#options.delegations!.close({
                        siteId: invocation.siteId,
                        ticket: delegation.ticket,
                        requestId,
                    });
                } catch {
                    /* Expiry remains the fallback if the authority becomes unavailable. */
                }
            }
        };
        try {
            if (delegated) {
                await this.#options.delegations!.check(
                    delegated,
                    !this.#options.transportFencesRoute,
                    invocation.binaryBody
                        ? (invocation.binaryBody.contentLength ?? 4 * 1024 * 1024 + 1)
                        : new TextEncoder().encode(JSON.stringify(input)).length,
                );
            } else if (
                this.#options.delegations &&
                delegationSource &&
                (invocation.actor.kind === "anonymous" ||
                    invocation.actor.kind === "user" ||
                    invocation.actor.kind === "administrator")
            ) {
                delegation = await this.#options.delegations.issue({
                    siteId: invocation.siteId,
                    requestId,
                    installationId: route.selection.installationId,
                    contractId: invocation.contractId,
                    version: release.version,
                    digest: route.selection.digest,
                    capabilityId: capability.id,
                    actor: invocation.actor,
                    deadline: started + 15_000,
                });
            }
            const response = await this.#options.transport.send({
                requestId,
                ...(delegation ? { delegation } : {}),
                ...(delegated
                    ? {
                          delegated: {
                              ticket: delegated.ticket,
                              sourceInstallationId: delegated.sourceInstallationId,
                              credentialFingerprint: delegated.sourceCredentialFingerprint,
                          },
                          sourceInstallationId: delegated.sourceInstallationId,
                          rootRequestId,
                      }
                    : {}),
                instanceId,
                installationId: route.installation.installation.id,
                endpoint: route.installation.installation.endpoint,
                providerTokenRef: route.installation.installation.providerTokenRef,
                release,
                capability,
                ...(invocation.bindingId ? { bindingId: invocation.bindingId } : {}),
                ...(invocation.bindingTransport ? { bindingTransport: invocation.bindingTransport } : {}),
                ...(invocation.metadataOnly ? { metadataOnly: true } : {}),
                input,
                ...(invocation.binaryBody ? { binaryBody: invocation.binaryBody } : {}),
                ...(subjectId ? { subjectId } : {}),
                ...(invocation.actor.kind === "system" ? { systemServiceId: invocation.actor.serviceId } : {}),
                ...(invocation.actor.kind === "provider"
                    ? {
                          sourceInstallationId: invocation.actor.installationId,
                          sourceCredentialFingerprint: invocation.actor.credentialFingerprint,
                      }
                    : {}),
                ...(invocation.idempotencyKey ? { idempotencyKey: invocation.idempotencyKey } : {}),
                ...(invocation.actorCredential ? { actorCredential: invocation.actorCredential } : {}),
            });
            if (!this.#options.transportFencesRoute && !(await this.#options.routes.isCurrent(route))) {
                throw new GatewayError("stale_route", "selection or installation changed during invocation");
            }
            result = validateResponse(capability, response, requestId);
            if (isCommand) {
                await this.#auditCommand(
                    commandAuditEvent(
                        invocation,
                        route,
                        requestId,
                        this.#now(),
                        result.kind === "declared-error" ? "declared-error" : "completed",
                        result.status,
                        result.kind === "declared-error" ? result.errorCode : undefined,
                    ),
                    requestId,
                    true,
                );
            }
            if (delegation && result.kind === "binary" && !invocation.metadataOnly) {
                result = { ...result, stream: delegationStream(result.stream, closeDelegation) };
                streamed = true;
            }
        } catch (error) {
            if (error instanceof GatewayDispatchRejected) {
                if (isCommand) {
                    await this.#auditCommand(
                        commandAuditEvent(
                            invocation,
                            route,
                            requestId,
                            this.#now(),
                            "rejected",
                            error.code === "rate_limited" ? 429 : 403,
                            error.code,
                        ),
                        requestId,
                        false,
                    );
                }
                throw error;
            }
            if (isCommand) {
                await this.#auditOutcomeUnknown(invocation, route, requestId);
                throw new GatewayError(
                    "outcome_unknown",
                    "provider command may have completed; reconcile using the request ID before retrying",
                    requestId,
                );
            }
            if (error instanceof GatewayError) {
                throw error;
            }
            throw new GatewayError("transport_failure", "provider transport failed");
        } finally {
            if (!streamed) {
                await closeDelegation();
            }
        }
        return result;
    }

    #now(): string {
        return (this.#options.now ?? (() => new Date().toISOString()))();
    }

    async #auditCommand(event: GatewayCommandAuditEvent, requestId: string, dispatched: boolean): Promise<void> {
        if (!this.#options.commandAudit) {
            throw new GatewayError(
                dispatched ? "outcome_unknown" : "transport_failure",
                dispatched
                    ? "provider command completed but its audit outcome could not be recorded"
                    : "provider command audit is unavailable; command was not dispatched",
                requestId,
            );
        }
        try {
            await this.#options.commandAudit.append(event);
        } catch {
            throw new GatewayError(
                dispatched ? "outcome_unknown" : "transport_failure",
                dispatched
                    ? "provider command completed but its audit outcome could not be recorded"
                    : "provider command audit is unavailable; command was not dispatched",
                requestId,
            );
        }
    }

    async #auditOutcomeUnknown(invocation: GatewayInvocation, route: GatewayRoute, requestId: string): Promise<void> {
        try {
            await this.#options.commandAudit?.append(
                commandAuditEvent(invocation, route, requestId, this.#now(), "outcome-unknown"),
            );
        } catch {
            // Preserve the original unknown outcome. Audit recovery can reconcile the durable start event by request ID.
        }
    }

    async #authorizedRoute(value: Omit<GatewayInvocation, "input">, verifyCurrent = true): Promise<AuthorizedRoute> {
        const route = await this.#options.routes.resolve(value.siteId, value.contractId);
        if (!route) {
            throw new GatewayError("not_selected", "site has no selected release for this contract");
        }
        const capabilityRelease = resolveRoute(
            route,
            value.siteId,
            value.contractId,
            (this.#options.now ?? (() => new Date().toISOString()))(),
            this.#options.maxObservationAgeMs ?? 60_000,
        );
        const instanceId = route.installation.observation?.report.instanceId;
        if (!instanceId) {
            throw new GatewayError("invalid_route", "provider observation has no invocation audience");
        }
        const capability = capabilityRelease.capabilities.find((item) => item.id === value.capabilityId);
        if (!capability) {
            throw new GatewayError("invalid_route", "selected release does not define this capability");
        }
        if (
            value.bindingId &&
            !capabilityBindings(capability).some(
                (binding) =>
                    binding.id === value.bindingId &&
                    (!value.bindingTransport || binding.transport === value.bindingTransport),
            )
        ) {
            throw new GatewayError("invalid_route", "selected release does not define this binding");
        }
        if (value.bindingTransport && !value.bindingId) {
            throw new GatewayError("invalid_route", "binding transport requires a binding ID");
        }
        checkBinaryBody(value.binaryBody, capability);
        if (value.metadataOnly && capability.output.type !== "binary") {
            throw new GatewayError("invalid_input", "metadata representation requires a binary output");
        }
        const keyed = capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed";
        if (keyed && !value.idempotencyKey) {
            throw new GatewayError("invalid_input", "keyed commands require an idempotency key");
        }
        if (!keyed && value.idempotencyKey) {
            throw new GatewayError("invalid_input", "idempotency keys are accepted only by keyed commands");
        }
        checkAccess(value.actor, capability);
        if (!(await this.#options.authorize(value.actor, capability, route))) {
            throw new GatewayError("not_authorized", "host grant denied this capability");
        }
        if (verifyCurrent && !(await this.#options.routes.isCurrent(route))) {
            throw new GatewayError("stale_route", "selection or installation changed during access check");
        }
        return { route, instanceId, release: capabilityRelease, capability };
    }

    async #providerSubjectId(
        actor: GatewayActor,
        capability: CapabilityDefinition,
        route: GatewayRoute,
    ): Promise<string | undefined> {
        if (
            (capability.access !== "authenticated" && capability.access !== "admin") ||
            (actor.kind !== "user" && actor.kind !== "administrator")
        ) {
            return undefined;
        }
        if (!this.#options.identities) {
            throw new GatewayError("not_authorized", "provider identity service is unavailable");
        }
        return this.#options.identities.getOrCreate(
            { providerId: route.installation.installation.providerId },
            actor.subjectId,
        );
    }
}

function assertActorCredentialTarget(invocation: GatewayInvocation, capability: CapabilityDefinition): void {
    if (!invocation.actorCredential) {
        return;
    }
    if (
        invocation.contractId !== "ulvia.cms.access" ||
        invocation.capabilityId !== "resolve-actor" ||
        capability.access !== "public" ||
        capability.behavior.effect !== "query"
    ) {
        throw new GatewayError("invalid_input", "actor credentials are restricted to the Access actor resolver");
    }
}

function checkAccess(actor: GatewayActor, capability: CapabilityDefinition): void {
    if (actor.kind === "provider" || actor.kind === "system") {
        return;
    }
    if (
        (capability.access === "authenticated" && actor.kind === "anonymous") ||
        (capability.access === "admin" && actor.kind !== "administrator")
    ) {
        throw new GatewayError("not_authorized", "actor does not meet the capability access level");
    }
}

function checkBinaryBody(body: GatewayInvocation["binaryBody"], capability: CapabilityDefinition): void {
    const binary = Object.entries(capability.input.properties).find(([, schema]) => schema.type === "binary");
    if (!binary) {
        if (body) {
            throw new GatewayError("invalid_input", "capability does not accept binary input");
        }
        return;
    }
    if (!body && capability.input.required.includes(binary[0])) {
        throw new GatewayError("invalid_input", "capability requires binary input");
    }
    if (
        body &&
        body.contentLength !== undefined &&
        binary[1].type === "binary" &&
        body.contentLength > binary[1].maxBytes
    ) {
        throw new GatewayError("invalid_input", "binary input exceeds the capability limit");
    }
}

function snapshotInput(value: unknown, capability: CapabilityDefinition): Readonly<Record<string, unknown>> {
    try {
        const input = value as Readonly<Record<string, unknown>>;
        const binaryProperties = Object.entries(capability.input.properties)
            .filter(([, schema]) => schema.type === "binary")
            .map(([name]) => name);
        if (binaryProperties.length === 0) {
            validateSchemaValue(capability.input, value);
            return input;
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError("input must be an object");
        }
        const required = capability.input.required.filter((name) => !binaryProperties.includes(name));
        const properties = Object.fromEntries(
            Object.entries(capability.input.properties).filter(([name]) => !binaryProperties.includes(name)),
        );
        validateSchemaValue({ ...capability.input, properties, required }, value);
        return input;
    } catch {
        throw new GatewayError("invalid_input", "input violates the selected capability schema");
    }
}

function commandAuditEvent(
    invocation: GatewayInvocation,
    route: GatewayRoute,
    requestId: string,
    occurredAt: string,
    stage: GatewayCommandAuditStage,
    status?: number,
    errorCode?: string,
): GatewayCommandAuditEvent {
    return Object.freeze({
        id: crypto.randomUUID(),
        requestId,
        occurredAt,
        siteId: invocation.siteId,
        installationId: route.installation.installation.id,
        contractId: invocation.contractId,
        capabilityId: invocation.capabilityId,
        actorKind: invocation.actor.kind,
        ...(invocation.actor.kind === "user" || invocation.actor.kind === "administrator"
            ? { actorSubjectId: invocation.actor.subjectId }
            : {}),
        stage,
        ...(status === undefined ? {} : { status }),
        ...(errorCode === undefined ? {} : { errorCode }),
    });
}
