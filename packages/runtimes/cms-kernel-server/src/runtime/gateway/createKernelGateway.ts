import { CapabilityGateway, type GatewayActor } from "@bernouy/cms-gateway";
import { PageCapabilityAnalyzer } from "@bernouy/cms-gateway/analysis";
import { HttpGatewayTransport, type GatewayHttpExchange } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { actorCredentialFromRequest } from "@bernouy/cms-gateway/protocol";
import type { ControlProviderClient } from "./ControlProviderClient";
import {
    ControlGatewayAuditStore,
    ControlGatewayRouteResolver,
    ControlProviderIdentityService,
} from "./RemoteGatewayServices";

export function createKernelGateway(control: ControlProviderClient) {
    const routes = new ControlGatewayRouteResolver(control);
    const gateway = new CapabilityGateway({
        routes,
        identities: new ControlProviderIdentityService(control),
        commandAudit: new ControlGatewayAuditStore(control),
        authorize: async () => true,
        transport: new HttpGatewayTransport({
            network: new NodeGatewayHttpNetwork({
                allowPrivateAddresses: true,
                authorize: (request) => brokerAuthorization(control, request),
            }),
        }),
    });
    const resolveCapability = async (contractId: string, capabilityId: string) => {
        const route = await routes.resolve("default", contractId);
        const capability = route?.release.admission.release.capabilities.find((item) => item.id === capabilityId);
        return capability
            ? {
                  access: capability.access,
                  version: route!.release.admission.release.version,
                  effect: capability.behavior.effect,
                  outputType: capability.output.type,
              }
            : null;
    };
    return {
        invoker: gateway,
        resolveCapability,
        pageCapabilities: new PageCapabilityAnalyzer({ resolveCapability }),
        resolveActor: (request: Request) => resolveActor(gateway, request),
    };
}

async function brokerAuthorization(control: ControlProviderClient, request: GatewayHttpExchange): Promise<string> {
    if (request.authentication.kind !== "capability" || !request.installationId) {
        throw new TypeError("Provider invocation authorization requires an exact installation and capability");
    }
    const issued = await control.issueGatewayInvocation({
        requestId: request.requestId,
        installationId: request.installationId,
        contractId: request.authentication.contractId,
        contractVersion: request.authentication.contractVersion,
        capabilityId: request.authentication.capabilityId,
        ...(request.authentication.subjectId ? { subjectId: request.authentication.subjectId } : {}),
    });
    if (issued.instanceId !== request.authentication.instanceId) {
        throw new TypeError("Installations Provider issued a token for a different Provider audience");
    }
    return issued.token;
}

async function resolveActor(gateway: CapabilityGateway, request: Request): Promise<GatewayActor> {
    const actorCredential = actorCredentialFromRequest(request);
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
    return { kind: actor.administrator ? "administrator" : "user", subjectId: actor.subjectId };
}
