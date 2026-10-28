import type { DelegationContext } from "cms-gateway/access/delegation/interfaces";
import type { GatewayActor, GatewayTransportRequest, GatewayTransportResponse } from "./Invocation";

/** A runtime combines preparation at its transport authority boundary and closes partial tickets on rejection.
 * The Gateway owns a returned delegation through response completion or cancellation.
 */
export type GatewayDispatch = (
    request: GatewayTransportRequest,
    context: {
        actor: GatewayActor;
        deadline: number;
    },
) => Promise<{ response: GatewayTransportResponse; delegation: DelegationContext | null }>;
