import { createFulfillmentSources } from "../../shared/sources";
import { sellerCommerceEndpoints } from "./commerce";
import { sellerDeliveryEndpoints } from "./delivery";

export async function sellerContextSources() {
    return await createFulfillmentSources(sellerCommerceEndpoints(), sellerDeliveryEndpoints());
}
