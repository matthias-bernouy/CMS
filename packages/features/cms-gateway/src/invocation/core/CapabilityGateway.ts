import type { CapabilityDefinition, ContractRelease } from "@bernouy/cms-repository/contracts";
import type { CompiledHttpBinding } from "@bernouy/cms-repository/contracts/bindings";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { ProviderIdentityService } from "cms-gateway/identity/interfaces/ProviderIdentityService";
import type {
    GatewayActor,
    GatewayAccessProbe,
    GatewayInvocation,
    GatewayOrigin,
    GatewayResult,
    GatewayRoute,
    GatewayRouteResolver,
    GatewayTransport,
} from "cms-gateway/invocation/interfaces/Invocation";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import { resolveRoute } from "cms-gateway/invocation/core/resolveRoute";
import { snapshotInvocation } from "cms-gateway/invocation/core/snapshotInvocation";
import { validateResponse } from "cms-gateway/invocation/core/validateResponse";
import { providerByteGeneration } from "cms-gateway/media/core/derivativeKey";
import type {
    GatewayCommandAuditEvent,
    GatewayCommandAuditStage,
    GatewayCommandAuditStore,
} from "cms-gateway/audit/interfaces/GatewayAudit";

export interface CapabilityGatewayOptions {
    readonly routes: GatewayRouteResolver;
    readonly transport: GatewayTransport;
    /** Required host grant check, including view restrictions and site membership. */
    readonly authorize: (
        actor: GatewayActor,
        capability: CapabilityDefinition,
        route: GatewayRoute,
        origin: GatewayOrigin,
    ) => Promise<boolean>;
    readonly identities?: ProviderIdentityService;
    /** Required for command capabilities. Commands fail closed before dispatch when audit is unavailable. */
    readonly commandAudit?: GatewayCommandAuditStore;
    readonly now?: () => string;
    readonly maxObservationAgeMs?: number;
}

type AuthorizedRoute = {
    route: GatewayRoute;
    release: ContractRelease;
    capability: CapabilityDefinition;
    binding: CompiledHttpBinding;
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

    async invoke(value: GatewayInvocation): Promise<GatewayResult> {
        const invocation = snapshotInvocation(value);
        const { route, release, capability, binding } = await this.#authorizedRoute(invocation);
        const input = snapshotInput(invocation.input, capability);
        const providerSubjectId = await this.#providerSubjectId(invocation.actor, capability, route);
        if (!(await this.#options.routes.isCurrent(route))) {
            throw new GatewayError("stale_route", "installation changed while resolving actor identity");
        }
        const requestId = crypto.randomUUID();
        const isCommand = capability.behavior.effect === "command";
        if (isCommand) {
            await this.#auditCommand(
                commandAuditEvent(invocation, route, requestId, this.#now(), "started"),
                requestId,
                false,
            );
        }
        let result: GatewayResult;
        try {
            const response = await this.#options.transport.send({
                requestId,
                siteId: invocation.siteId,
                installationId: route.installation.installation.id,
                endpoint: route.installation.installation.endpoint,
                providerTokenRef: route.installation.installation.providerTokenRef,
                release,
                capability,
                binding,
                input,
                invocationOrigin: invocation.origin,
                actorKind: invocation.actor.kind,
                ...(providerSubjectId ? { providerSubjectId } : {}),
                ...(invocation.idempotencyKey ? { idempotencyKey: invocation.idempotencyKey } : {}),
            });
            if (!(await this.#options.routes.isCurrent(route))) {
                throw new GatewayError("stale_route", "selection or installation changed during invocation");
            }
            result = validateResponse(capability, binding, response, requestId);
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
        } catch (error) {
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
        }
        const mediaId = capability.media ? input[capability.media.idInput] : undefined;
        if (result.kind !== "binary" || typeof mediaId !== "string") {
            return result;
        }
        return {
            ...result,
            media: {
                siteId: invocation.siteId,
                installationId: route.installation.installation.id,
                contractId: invocation.contractId,
                releaseDigest: route.selection.digest,
                capabilityId: invocation.capabilityId,
                fileId: mediaId,
                generation: await providerByteGeneration(result.bytes),
            },
        };
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

    async #authorizedRoute(value: Omit<GatewayInvocation, "input">): Promise<AuthorizedRoute> {
        const route = await this.#options.routes.resolve(value.siteId, value.contractId);
        if (!route) {
            throw new GatewayError("not_selected", "site has no selected release for this contract");
        }
        if (value.origin === "page" && !value.execution) {
            throw new GatewayError("not_authorized", "Page invocation requires an active execution plan");
        }
        if (
            value.execution &&
            (value.execution.version !== route.selection.version ||
                value.execution.digest !== route.selection.digest ||
                value.execution.installationId !== route.selection.installationId)
        ) {
            throw new GatewayError("stale_route", "Page execution plan no longer matches the selected provider route");
        }
        const release = resolveRoute(
            route,
            value.siteId,
            value.contractId,
            (this.#options.now ?? (() => new Date().toISOString()))(),
            this.#options.maxObservationAgeMs ?? 60_000,
        );
        const capability = release.capabilities.find((item) => item.id === value.capabilityId);
        const binding = route.release.admission.bindings.find(
            (item) => item.capabilityId === value.capabilityId,
        )?.binding;
        if (!capability || !binding) {
            throw new GatewayError("invalid_route", "selected release does not define this capability and binding");
        }
        if (binding.body?.kind === "binary") {
            throw new GatewayError("unsupported_behavior", "this capability needs a later execution profile");
        }
        const keyed = capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed";
        if (keyed && !value.idempotencyKey) {
            throw new GatewayError("invalid_input", "keyed commands require an idempotency key");
        }
        if (!keyed && value.idempotencyKey) {
            throw new GatewayError("invalid_input", "idempotency keys are accepted only by keyed commands");
        }
        checkAccess(value.actor, capability, value.origin);
        if (!(await this.#options.authorize(value.actor, capability, route, value.origin))) {
            throw new GatewayError("not_authorized", "host grant denied this capability");
        }
        if (!(await this.#options.routes.isCurrent(route))) {
            throw new GatewayError("stale_route", "selection or installation changed during access check");
        }
        return { route, release, capability, binding };
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

function checkAccess(actor: GatewayActor, capability: CapabilityDefinition, origin: GatewayOrigin): void {
    if (
        actor.kind === "provider" ||
        actor.kind === "system" ||
        origin === "provider" ||
        origin === "system" ||
        origin === "conformance"
    ) {
        throw new GatewayError(
            "unsupported_behavior",
            "provider and system actor grants need their dedicated entrypoints",
        );
    }
    if (
        (capability.access === "authenticated" && actor.kind === "anonymous") ||
        (capability.access === "admin" && actor.kind !== "administrator")
    ) {
        throw new GatewayError("not_authorized", "actor does not meet the capability access level");
    }
}

function snapshotInput(value: unknown, capability: CapabilityDefinition): Readonly<Record<string, unknown>> {
    try {
        validateSchemaValue(capability.input, value);
        return value as Readonly<Record<string, unknown>>;
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
        origin: invocation.origin,
        actorKind: invocation.actor.kind,
        ...(invocation.actor.kind === "user" || invocation.actor.kind === "administrator"
            ? { actorSubjectId: invocation.actor.subjectId }
            : {}),
        stage,
        ...(status === undefined ? {} : { status }),
        ...(errorCode === undefined ? {} : { errorCode }),
    });
}
