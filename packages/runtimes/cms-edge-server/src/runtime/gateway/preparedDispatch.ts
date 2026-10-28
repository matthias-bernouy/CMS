import { GatewayDispatchRejected, type GatewayDispatch } from "@bernouy/cms-gateway";
import { HttpGatewayTransport, invocationAuthority } from "@bernouy/cms-gateway/http";
import { NodeGatewayHttpNetwork } from "@bernouy/cms-gateway/http/node";
import type { DelegationContext } from "@bernouy/cms-gateway/access/delegation";
import type { ControlProviderClient } from "./ControlProviderClient";
import type { ControlGatewayRouteResolver } from "./RemoteGatewayServices";

/** Preparation is one control capability; the business request still uses pinned HTTP. */
export function preparedEdgeDispatch(
    control: ControlProviderClient,
    routes: ControlGatewayRouteResolver,
): GatewayDispatch {
    return async (request, context) => {
        let delegation: DelegationContext | null = null;
        const close = async () => {
            if (delegation) {
                await control.delegations
                    .close({ siteId: "default", ticket: delegation.ticket, requestId: request.requestId })
                    .catch(() => undefined);
            }
        };
        const transport = new HttpGatewayTransport({
            network: new NodeGatewayHttpNetwork({
                allowPrivateAddresses: true,
                authorize: async (exchange) => {
                    const {
                        subjectId,
                        actorKind: _actorKind,
                        delegation: _delegation,
                        ...invocation
                    } = invocationAuthority(exchange);
                    try {
                        const issued = await control.prepareGatewayDispatch({
                            invocation,
                            ...context,
                            ...(subjectId ? { expectedSubjectId: subjectId } : {}),
                        });
                        delegation = issued.delegation;
                        if (
                            exchange.authentication.kind !== "capability" ||
                            issued.instanceId !== exchange.authentication.instanceId
                        ) {
                            throw new TypeError("Prepared dispatch has a different Provider audience");
                        }
                        return { token: issued.token };
                    } catch (error) {
                        routes.invalidate("default", invocation.contractId);
                        const status =
                            error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
                        if (status === 403 || status === 429) {
                            throw new GatewayDispatchRejected(status === 429 ? "rate_limited" : "not_authorized");
                        }
                        throw error;
                    }
                },
            }),
        });
        try {
            const response = await transport.send(request);
            return { response, delegation };
        } catch (error) {
            await close();
            throw error;
        }
    };
}
