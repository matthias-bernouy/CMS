import { registerDeliveryEndpoints } from "cms-delivery/registerDeliveryEndpoints";
import type { DeliveryCmsConfig } from "cms-delivery/interfaces/DeliveryCmsConfig";
import { DeliveryCmsContext } from "cms-delivery/runtime/DeliveryCmsContext";

export type { DeliveryCmsConfig } from "cms-delivery/interfaces/DeliveryCmsConfig";

/**
 * Public rendering surface. It exposes pages and Delivery-owned assets under
 * the supplied runner's base path; all mutations remain in the Control surface.
 */
export default class DeliveryCms extends DeliveryCmsContext {
    constructor(config: DeliveryCmsConfig) {
        super(config);
        registerDeliveryEndpoints(this);
    }
}
