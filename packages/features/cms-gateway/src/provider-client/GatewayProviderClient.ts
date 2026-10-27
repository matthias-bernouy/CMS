import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import { HttpGatewayTransport } from "cms-gateway/invocation/http/transport/HttpGatewayTransport";
import { NodeGatewayHttpNetwork } from "cms-gateway/invocation/node-http/NodeGatewayHttpNetwork";
import type { GatewayTransportRequest } from "cms-gateway/invocation/interfaces/Invocation";

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
            authorize: async () => options.token,
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
    async invoke(
        release: ContractRelease,
        capabilityId: string,
        input: unknown,
        options: Pick<GatewayTransportRequest, "idempotencyKey" | "binaryBody" | "bindingId"> = {},
    ) {
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
            ...options,
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
