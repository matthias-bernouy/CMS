import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import { EDGE_ROUTING_SERVICE, ROUTING_INSTANCE_ID } from "@bernouy/hosting/routing";
import { nativeRequest } from "../transport/provider";
import { observe } from "./observe";
import { ClientFailure } from "./failure";
import type { ClientCall } from "./types";

type Identity = Readonly<{ secret: string }> &
    (Readonly<{ kind: "account"; instanceId: string; connectionId: string }> | Readonly<{ kind: "routing" }>);

/** Use production SDK signing and actual fixture credentials; never accept arbitrary system identity headers. */
export async function observeSignedProvider(call: ClientCall, identity: Identity) {
    const routing = identity.kind === "routing";
    if (
        routing
            ? call.target.release.contractId !== "ulvia/provider.routing" ||
              call.target.definition.id !== "domains.resolve"
            : call.target.release.contractId !== "ulvia/provider.connections" ||
              call.target.definition.id !== "connections.configure"
    ) {
        throw new ClientFailure("signed-fixture-target-mismatch");
    }
    const request = nativeRequest(call.origin, call.target, call.binding, call.input, {});
    if (!["POST", "QUERY"].includes(String(request.init.method)) || typeof request.init.body !== "string") {
        throw new ClientFailure("signed-fixture-binding-mismatch");
    }
    const network = new NodeGatewayHttpNetwork({
        resolveToken: async () => identity.secret,
        allowPrivateAddresses: true,
    });
    return observe(
        call,
        request.traceId,
        request.requestBytes,
        (signal) =>
            network.exchange({
                origin: call.origin,
                pathAndQuery: request.url.pathname + request.url.search,
                method: String(request.init.method),
                headers: { "content-type": "application/json" },
                body: String(request.init.body),
                requestId: request.traceId,
                ...(identity.kind === "account" ? { installationId: identity.connectionId } : {}),
                providerTokenRef: "owned-performance-credential",
                authentication: {
                    kind: "capability",
                    instanceId: identity.kind === "account" ? identity.instanceId : ROUTING_INSTANCE_ID,
                    contractId: call.target.release.contractId,
                    contractVersion: call.target.release.version,
                    capabilityId: call.target.definition.id,
                    ...(routing ? { systemServiceId: EDGE_ROUTING_SERVICE } : {}),
                },
                signal,
            }),
        (bytes, response) => {
            if (!request.compiled.response.successStatuses.includes(response.status)) {
                throw new ClientFailure("signed-fixture-undeclared-success");
            }
            return JSON.parse(new TextDecoder().decode(bytes));
        },
    );
}
