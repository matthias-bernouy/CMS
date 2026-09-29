import type { CapabilityDefinition } from "@bernouy/cms-repository/contracts";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { ProviderIdentityService } from "../identity/ProviderIdentityService";
import type {
    GatewayActor,
    GatewayInvocation,
    GatewayOrigin,
    GatewayResult,
    GatewayRoute,
    GatewayRouteResolver,
    GatewayTransport,
} from "../interfaces/Invocation";
import { GatewayError } from "./GatewayError";
import { resolveRoute } from "./resolveRoute";
import { snapshotInvocation } from "./snapshotInvocation";
import { validateResponse } from "./validateResponse";

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
    readonly now?: () => string;
    readonly maxObservationAgeMs?: number;
}

export class CapabilityGateway {
    readonly #options: CapabilityGatewayOptions;

    constructor(options: CapabilityGatewayOptions) {
        this.#options = options;
    }

    async invoke(value: GatewayInvocation): Promise<GatewayResult> {
        const invocation = snapshotInvocation(value);
        const route = await this.#options.routes.resolve(invocation.siteId, invocation.contractId);
        if (!route) {
            throw new GatewayError("not_selected", "site has no selected release for this contract");
        }
        const release = resolveRoute(
            route,
            invocation.siteId,
            invocation.contractId,
            (this.#options.now ?? (() => new Date().toISOString()))(),
            this.#options.maxObservationAgeMs ?? 60_000,
        );
        const capability = release.capabilities.find((item) => item.id === invocation.capabilityId);
        const binding = route.release.admission.bindings.find(
            (item) => item.capabilityId === invocation.capabilityId,
        )?.binding;
        if (!capability || !binding) {
            throw new GatewayError("invalid_route", "selected release does not define this capability and binding");
        }
        if (
            capability.behavior.effect !== "query" ||
            capability.behavior.execution !== "sync" ||
            binding.body?.kind === "binary"
        ) {
            throw new GatewayError("unsupported_behavior", "this capability needs a later execution profile");
        }
        checkAccess(invocation.actor, capability, invocation.origin);
        if (!(await this.#options.authorize(invocation.actor, capability, route, invocation.origin))) {
            throw new GatewayError("not_authorized", "host grant denied this capability");
        }
        const input = snapshotInput(invocation.input, capability);
        if (!(await this.#options.routes.isCurrent(route))) {
            throw new GatewayError("stale_route", "selection or installation changed before invocation");
        }
        const providerSubjectId = await this.#providerSubjectId(invocation.actor, capability, route);
        if (!(await this.#options.routes.isCurrent(route))) {
            throw new GatewayError("stale_route", "installation changed while resolving actor identity");
        }
        const requestId = crypto.randomUUID();
        let response;
        try {
            response = await this.#options.transport.send({
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
            });
        } catch (error) {
            if (error instanceof GatewayError) {
                throw error;
            }
            throw new GatewayError("transport_failure", "provider transport failed");
        }
        if (!(await this.#options.routes.isCurrent(route))) {
            throw new GatewayError("stale_route", "selection or installation changed during invocation");
        }
        return validateResponse(capability, binding, response, requestId);
    }

    async #providerSubjectId(
        actor: GatewayActor,
        capability: CapabilityDefinition,
        route: GatewayRoute,
    ): Promise<string | undefined> {
        if (capability.access !== "authenticated" || (actor.kind !== "user" && actor.kind !== "administrator")) {
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
