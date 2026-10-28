import type { DeliveryActor } from "cms-content/pages/delivery/interfaces";
import type ContentDeliveryHost from "cms-content/pages/delivery/interfaces";

const deliveryActors = new WeakMap<ContentDeliveryHost, WeakMap<Request, Promise<DeliveryActor>>>();

export async function resolveRequestActor(delivery: ContentDeliveryHost, request: Request): Promise<DeliveryActor> {
    let requestActors = deliveryActors.get(delivery);
    if (!requestActors) {
        requestActors = new WeakMap();
        deliveryActors.set(delivery, requestActors);
    }
    const current = requestActors.get(request);
    if (current) {
        return current;
    }
    const pending = delivery.resolveActor(request).catch((error) => {
        if (requestActors.get(request) === pending) {
            requestActors.delete(request);
        }
        throw error;
    });
    requestActors.set(request, pending);
    return pending;
}
