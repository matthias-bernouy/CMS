import type { ProviderCommandStart } from "cms-gateway/protocol/ProviderDispatchPreparation";
import type { GatewayRoute } from "cms-gateway/invocation/interfaces/Invocation";
import type { DelegationContext } from "cms-gateway/access/delegation/interfaces";
import type {
    GatewayActor,
    GatewayTransportRequest,
    GatewayTransportResponse,
} from "cms-gateway/invocation/interfaces/Invocation";

/** A runtime combines preparation at its transport authority boundary and closes partial tickets on rejection.
 * The Gateway owns a returned delegation through response completion or cancellation.
 */
export type GatewayDispatch = (
    request: GatewayTransportRequest,
    context: {
        /** Host-owned initial route, never serialized or treated as fresh authorization. */
        route?: GatewayRoute;
        commandStart?: ProviderCommandStart;
        actor: GatewayActor;
        deadline: number;
    },
) => Promise<{ response: GatewayTransportResponse; delegation: DelegationContext | null }>;
