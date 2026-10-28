import type { GatewayActor } from "@bernouy/cms-gateway";
import type EdgeCms from "cms-edge/EdgeCms";

const edgeActors = new WeakMap<EdgeCms, WeakMap<Request, Promise<GatewayActor>>>();

export async function resolveRequestActor(edge: EdgeCms, request: Request): Promise<GatewayActor> {
    let requestActors = edgeActors.get(edge);
    if (!requestActors) {
        requestActors = new WeakMap();
        edgeActors.set(edge, requestActors);
    }
    const current = requestActors.get(request);
    if (current) {
        return current;
    }
    const pending = edge.resolveActor(request).catch((error) => {
        if (requestActors.get(request) === pending) {
            requestActors.delete(request);
        }
        throw error;
    });
    requestActors.set(request, pending);
    return pending;
}
