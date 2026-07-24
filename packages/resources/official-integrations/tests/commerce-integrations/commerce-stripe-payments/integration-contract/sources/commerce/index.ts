import { makeSourceUrn, type Source } from "@bernouy/cms-sources";
import { commerceCheckoutEndpoints } from "./checkout";
import { commerceBuyerLegalEndpoints } from "./legal";
import { commerceOperationsEndpoints } from "./operations/index";
import { commercePaymentEndpoints } from "./payment";
import { commerceSellerEndpoints } from "./seller";

export function commerceSource(): Source {
    return {
        urn: makeSourceUrn("commerce"),
        identityAuthority: "commerce",
        endpoints: [
            ...commerceCheckoutEndpoints(),
            ...commerceBuyerLegalEndpoints(),
            ...commercePaymentEndpoints(),
            ...commerceSellerEndpoints(),
            ...commerceOperationsEndpoints(),
        ],
    };
}
