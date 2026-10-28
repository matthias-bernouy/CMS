import { preparedEdgeDispatch } from "./preparedDispatch";
import { isPublicContentAsset } from "../publicContentAssets";
import { gatewayObservability } from "@bernouy/cms-gateway/observability/node";
import { NOOP_LOGGER, type Logger } from "@bernouy/logging";
import type { McpInvocationContext } from "@bernouy/cms-gateway/mcp";
import { CapabilityGateway, GatewayDispatchRejected, type GatewayActor } from "@bernouy/cms-gateway";

import { HttpGatewayTransport, invocationAuthority, type GatewayHttpExchange } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { actorCredentialFromRequest } from "@bernouy/cms-gateway/protocol";
import { edgeSystemMayInvoke } from "./edgeSystemAccess";
import type { ControlProviderClient } from "./ControlProviderClient";
import {
    ControlGatewayAuditStore,
    ControlGatewayRouteResolver,
    ControlProviderIdentityService,
} from "./RemoteGatewayServices";

export function createEdgeGateway(control: ControlProviderClient, logger: Logger = NOOP_LOGGER) {
    const routes = new ControlGatewayRouteResolver(control);
    const logicalRoutes = new ControlGatewayRouteResolver(control, Date.now, 0);
    const gateway = new CapabilityGateway({
        ...gatewayObservability(logger),
        routes,
        delegations: control.delegations,
        identities: new ControlProviderIdentityService(control),
        commandAudit: new ControlGatewayAuditStore(control),
        // The control Provider resolves the live route again before issuing
        // every short-lived invocation token. That broker is the dispatch
        // fence; the cached route is only a transport plan.
        transportFencesRoute: true,
        ...(control.supportsPreparation ? { dispatch: preparedEdgeDispatch(control, routes) } : {}),
        authorize: async (actor, capability, route) =>
            actor.kind === "provider"
                ? control.authorizeProvider({
                      sourceInstallationId: actor.installationId,
                      sourceCredentialFingerprint: actor.credentialFingerprint,
                      targetInstallationId: route.installation.installation.id,
                      contractId: route.requestedRelease.admission.release.contractId,
                      capabilityId: capability.id,
                      version: route.requestedRelease.admission.release.version,
                  })
                : edgeSystemMayInvoke(actor, route.requestedRelease.admission.release.contractId, capability.id),
        transport: new HttpGatewayTransport({
            network: new NodeGatewayHttpNetwork({
                allowPrivateAddresses: true,
                authorize: async (request) => ({ token: await brokerAuthorization(control, routes, request) }),
            }),
        }),
    });
    const resolveContract = async (contractId: string) => {
        // Capability access is an authorization input, not a transport plan:
        // always resolve it from current control state.
        const route = await logicalRoutes.resolve("default", contractId);
        return route
            ? {
                  version: route.requestedRelease.admission.release.version,
                  capabilities: route.requestedRelease.admission.release.capabilities.map((capability) => ({
                      id: capability.id,
                      access: capability.access,
                      effect: capability.behavior.effect,
                      ...(capability.behavior.effect === "command"
                          ? { idempotency: capability.behavior.idempotency }
                          : {}),
                      outputType: capability.output.type,
                  })),
              }
            : null;
    };
    const resolveCapability = async (contractId: string, capabilityId: string) => {
        const contract = await resolveContract(contractId);
        const capability = contract?.capabilities.find((item) => item.id === capabilityId);
        return capability && contract
            ? {
                  access: capability.access,
                  effect: capability.effect,
                  ...(capability.effect === "command" ? { idempotency: capability.idempotency } : {}),
                  outputType: capability.outputType,
                  version: contract.version,
              }
            : null;
    };
    return {
        contracts: async (context: McpInvocationContext) => {
            const result = await gateway.invoke({
                ...context,
                contractId: "ulvia.cms.installations",
                capabilityId: "list-provider-installations",
                input: {},
            });
            if (result.kind !== "success") {
                throw new Error("Selected contract catalogue is unavailable");
            }
            const selections = (result.output as { selections: { contractId: string }[] }).selections;
            const ids = [...new Set(selections.map(({ contractId }) => contractId))];
            const contracts = new Map<string, Awaited<ReturnType<typeof gateway.resolveContract>>>();
            while (ids.length) {
                if (contracts.size >= 256) {
                    throw new Error("Selected contract catalogue is too large");
                }
                const contractId = ids.shift()!;
                if (contracts.has(contractId)) {
                    continue;
                }
                const contract = await gateway.resolveContract({ siteId: context.siteId, contractId });
                contracts.set(contractId, contract);
                if (contract.release.extends) {
                    ids.push(contract.release.extends.contractId);
                }
            }
            return [...contracts.values()];
        },
        invoker: gateway,
        authenticateProvider: (token: string) => control.authenticateProvider(token),
        resolveCapability,
        resolveActor: (request: Request) => resolveActor(gateway, request),
    };
}

async function brokerAuthorization(
    control: ControlProviderClient,
    routes: ControlGatewayRouteResolver,
    request: GatewayHttpExchange,
): Promise<string> {
    if (request.authentication.kind !== "capability" || !request.installationId) {
        throw new TypeError("Provider invocation authorization requires an exact installation and capability");
    }
    let issued;
    try {
        issued = await control.issueGatewayInvocation(invocationAuthority(request));
    } catch (error) {
        routes.invalidate("default", request.authentication.contractId);
        const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
        if (status === 403 || status === 429) {
            throw new GatewayDispatchRejected(status === 429 ? "rate_limited" : "not_authorized");
        }
        throw error;
    }
    if (issued.instanceId !== request.authentication.instanceId) {
        throw new TypeError("Installations Provider issued a token for a different Provider audience");
    }
    return issued.token;
}

async function resolveActor(gateway: CapabilityGateway, request: Request): Promise<GatewayActor> {
    if (isPublicContentAsset(request)) {
        return { kind: "anonymous" };
    }
    const actorCredential = actorCredentialFromRequest(request);
    if (!actorCredential) {
        return { kind: "anonymous" };
    }
    const result = await gateway.invoke({
        siteId: "default",
        contractId: "ulvia.cms.access",
        capabilityId: "resolve-actor",
        input: {},
        actor: { kind: "anonymous" },
        ...(actorCredential ? { actorCredential } : {}),
    });
    if (result.kind !== "success") {
        throw new TypeError("Access Provider did not resolve the request actor");
    }
    return parseActor(result.output);
}

function parseActor(value: unknown): GatewayActor {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Access actor response is invalid");
    }
    const actor = value as Record<string, unknown>;
    if (actor.state === "anonymous" && Object.keys(actor).length === 1) {
        return { kind: "anonymous" };
    }
    if (
        actor.state !== "authenticated" ||
        typeof actor.subjectId !== "string" ||
        typeof actor.administrator !== "boolean" ||
        !Number.isSafeInteger(actor.authorizationRevision)
    ) {
        throw new TypeError("Access actor response is invalid");
    }
    return {
        kind: actor.administrator ? "administrator" : "user",
        subjectId: actor.subjectId,
        authorizationRevision: Number(actor.authorizationRevision),
    };
}
