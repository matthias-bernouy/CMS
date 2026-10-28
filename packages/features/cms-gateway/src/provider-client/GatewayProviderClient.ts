import { currentTraceContext } from "@bernouy/logging/tracing";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import { HttpGatewayTransport } from "cms-gateway/invocation/http/transport/HttpGatewayTransport";
import { NodeGatewayHttpNetwork } from "cms-gateway/invocation/node-http/NodeGatewayHttpNetwork";
import { validDelegationTicket } from "cms-gateway/access/delegation/wire";
import type { ProviderInvocationOptions } from "./interfaces";

import { gatewayFailure } from "./gatewayFailure";
import { ProviderClientError } from "./interfaces";

/** One authenticated CMS connection. Never share it between unrelated tenants. */
export class GatewayProviderClient {
    private readonly transport;
    private readonly origin;
    constructor(options: { cmsUrl: string; token: string; allowPrivateAddresses?: boolean }) {
        const url = new URL(options.cmsUrl);
        if (
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            url.pathname !== "/" ||
            !/^[\x21-\x7e]{32,4096}$/u.test(options.token)
        ) {
            throw new TypeError("Invalid CMS connection");
        }
        this.origin = url.origin;
        const network = new NodeGatewayHttpNetwork({
            authorize: async (request) => ({
                token: options.token,
                providerAuthority: request.delegated ? "delegated" : "provider",
                ...(request.delegated ? { delegationTicket: request.delegated.ticket } : {}),
            }),
            allowPrivateAddresses: options.allowPrivateAddresses,
        });
        this.transport = new HttpGatewayTransport({
            network: {
                exchange: async (request) => {
                    const response = await network.exchange({
                        ...request,
                        origin: this.origin,
                        pathAndQuery: `/.cms/call/${encodeURIComponent(request.authentication.kind === "capability" ? request.authentication.contractId : "")}${request.pathAndQuery}`,
                    });
                    if ([401, 403, 429].includes(response.status)) {
                        await response.body?.cancel();
                        throw new ProviderClientError(
                            response.status === 429 ? "RATE_LIMITED" : "FORBIDDEN",
                            response.status === 429,
                            response.status,
                        );
                    }
                    const failure = await gatewayFailure(response, request.signal);
                    if (failure) {
                        await response.body?.cancel();
                        throw failure;
                    }
                    return response;
                },
            },
        });
    }
    async invoke(release: ContractRelease, capabilityId: string, input: unknown, options: ProviderInvocationOptions) {
        if (!options || (options.authority !== "provider" && options.authority !== "delegated")) {
            throw new TypeError("Provider invocations require an explicit authority");
        }
        if (
            options.authority === "delegated" &&
            (!options.delegation ||
                !validDelegationTicket(options.delegation.ticket) ||
                !Number.isSafeInteger(options.delegation.expiresAt) ||
                options.delegation.expiresAt <= Date.now())
        ) {
            throw new TypeError("Delegation context is missing or expired");
        }
        const capability = release.capabilities.find((item) => item.id === capabilityId);
        if (!capability) {
            throw new TypeError("Capability does not belong to the supplied contract");
        }
        if (
            capability.behavior.effect === "command" &&
            capability.behavior.idempotency === "keyed" &&
            !options.idempotencyKey
        ) {
            throw new TypeError("Keyed Provider commands require an idempotency key");
        }
        const response = await this.transport.send({
            ...(currentTraceContext() ? { trace: currentTraceContext() } : {}),
            ...(options.binaryBody ? { binaryBody: options.binaryBody } : {}),
            ...(options.bindingId ? { bindingId: options.bindingId } : {}),
            ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
            ...(options.authority === "delegated"
                ? {
                      delegated: {
                          ticket: options.delegation.ticket,
                          sourceInstallationId: "connection",
                          credentialFingerprint: "connection",
                      },
                  }
                : {}),
            requestId: crypto.randomUUID(),
            instanceId: "cms",
            installationId: "connection",
            endpoint: this.origin,
            providerTokenRef: "connection",
            release,
            capability,
            input: input as Readonly<Record<string, unknown>>,
        });
        if (response.errorCode) {
            throw new ProviderClientError(
                response.errorCode,
                capability.errors.find((error) => error.code === response.errorCode)?.retryable ?? false,
                response.status,
            );
        }
        return response;
    }
}
