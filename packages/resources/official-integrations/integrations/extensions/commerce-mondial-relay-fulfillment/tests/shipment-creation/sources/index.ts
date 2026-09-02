import { createFulfillmentSources } from "../../order-contexts/shared/sources";
import { creationCommerceEndpoints } from "./commerce";
import { creationDeliveryEndpoints } from "./delivery";

export async function shipmentCreationSources() {
    return await createFulfillmentSources(creationCommerceEndpoints(), creationDeliveryEndpoints());
}
