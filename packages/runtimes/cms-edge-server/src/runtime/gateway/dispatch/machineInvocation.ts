import { isTraceContext } from "@bernouy/logging";
import { CapabilityGateway, GatewayError } from "@bernouy/cms-gateway";
import type { CapabilityGatewayOptions, GatewayInvocation, GatewayTransport } from "@bernouy/cms-gateway";
import type { GatewayHttpExchange } from "@bernouy/cms-gateway/http";
import { providerCredentialFingerprint, providerInstallationFingerprint } from "@bernouy/cms-gateway/access/providers";
import type { ControlProviderClient } from "../ControlProviderClient";
import type { ControlGatewayRouteResolver } from "../RemoteGatewayServices";

type TransportFactory = (authorize: (request: GatewayHttpExchange) => Promise<{ token: string }>) => GatewayTransport;

/** A broker proof belongs to one invocation, exact destination and verified source. */
export function machineInvocation(
    control: ControlProviderClient,
    routes: ControlGatewayRouteResolver,
    options: CapabilityGatewayOptions,
    transport: TransportFactory,
) {
    return async (credential: string, value: GatewayInvocation) => {
        if (value.delegationTicket || value.siteId !== "default") {
            throw new GatewayError("not_authorized", "Machine preparation requires the local instance");
        }
        const route = await routes.resolve(value.siteId, value.contractId);
        const release = route?.requestedRelease.admission.release;
        const capability = release?.capabilities.find((item) => item.id === value.capabilityId);
        if (!route || !release || !capability) {
            throw new GatewayError("not_selected", "Machine target is unavailable");
        }
        const requestId = crypto.randomUUID();
        const parent = isTraceContext(value.trace) ? value.trace : options.tracing?.current();
        const trace = {
            traceId: parent?.traceId ?? requestId,
            spanId: requestId,
            ...(parent ? { parentSpanId: parent.spanId } : {}),
        };
        const issued = await control
            .prepareProviderDispatch({
                token: credential,
                deadline: Date.now() + 15_000,
                invocation: {
                    requestId,
                    installationId: route.selection.installationId,
                    contractId: value.contractId,
                    contractVersion: release.version,
                    capabilityId: value.capabilityId,
                    bodyBytes: value.binaryBody
                        ? (value.binaryBody.contentLength ?? 64 * 1024 * 1024 + 1)
                        : new TextEncoder().encode(JSON.stringify(value.input)).byteLength,
                    trace,
                },
            })
            .catch((error: unknown) => {
                const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
                throw new GatewayError(
                    status === 401 || status === 403
                        ? "not_authorized"
                        : status === 429
                          ? "rate_limited"
                          : "transport_failure",
                    "Machine authority preparation failed",
                );
            });
        if (issued.instanceId !== route.installation.observation?.report.instanceId || issued.delegation !== null) {
            throw new GatewayError("invalid_provider_response", "Machine preparation changed its audience");
        }
        const actor = {
            kind: "provider" as const,
            installationId: issued.sourceInstallationId,
            credentialFingerprint: providerCredentialFingerprint(credential),
        };
        let sent = false;
        const gateway = new CapabilityGateway({
            ...options,
            requestId: () => requestId,
            authorize: async (candidate, requested, current) =>
                candidate.kind === "provider" &&
                candidate.installationId === actor.installationId &&
                candidate.credentialFingerprint === actor.credentialFingerprint &&
                requested.id === capability.id &&
                current.selection.installationId === route.selection.installationId &&
                current.selection.digest === route.selection.digest &&
                providerInstallationFingerprint(current.installation) ===
                    providerInstallationFingerprint(route.installation) &&
                current.installation.installation.endpoint === route.installation.installation.endpoint &&
                current.manifest.admission.digest === route.manifest.admission.digest &&
                current.requestedRelease.admission.digest === route.requestedRelease.admission.digest,
            dispatch: async (request) => {
                if (sent) {
                    throw new GatewayError("not_authorized", "Machine preparation was already dispatched");
                }
                sent = true;
                const pinned = transport(async (exchange) => {
                    if (
                        exchange.requestId !== requestId ||
                        exchange.authentication.kind !== "capability" ||
                        exchange.authentication.instanceId !== issued.instanceId ||
                        exchange.authentication.contractId !== value.contractId ||
                        exchange.authentication.contractVersion !== release.version ||
                        exchange.authentication.capabilityId !== value.capabilityId
                    ) {
                        throw new GatewayError("not_authorized", "Machine preparation does not match dispatch");
                    }
                    return { token: issued.token };
                });
                return { response: await pinned.send(request), delegation: null };
            },
        });
        return gateway.invoke({ ...value, actor });
    };
}
