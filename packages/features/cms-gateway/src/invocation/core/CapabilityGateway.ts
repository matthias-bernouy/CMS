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
            });
            if (!(await this.#options.routes.isCurrent(route))) {
                throw new GatewayError("stale_route", "selection or installation changed during invocation");
            }
            result = validateResponse(capability, binding, response, requestId);
        } catch (error) {
            if (capability.behavior.effect === "command") {
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

    async #authorizedRoute(value: Omit<GatewayInvocation, "input">): Promise<AuthorizedRoute> {
        const route = await this.#options.routes.resolve(value.siteId, value.contractId);
        if (!route) {
            throw new GatewayError("not_selected", "site has no selected release for this contract");
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
        if (
            capability.behavior.execution !== "sync" ||
            (capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed") ||
            binding.body?.kind === "binary"
        ) {
            throw new GatewayError("unsupported_behavior", "this capability needs a later execution profile");
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
