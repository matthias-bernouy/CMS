import { makeSourceUrn, type Source } from "@bernouy/cms-sources";
import { stripeAccountEndpoints } from "./accounts";
import { stripePaymentEndpoints } from "./payments/index";
import { stripeReconciliationEndpoints } from "./reconciliation";
import { stripeSettlementEndpoints } from "./settlement";

export function stripeSource(): Source {
    return {
        urn: makeSourceUrn("stripe-connect"),
        identityAuthority: "stripe-connect",
        endpoints: [
            ...stripeAccountEndpoints(),
            ...stripePaymentEndpoints(),
            ...stripeReconciliationEndpoints(),
            ...stripeSettlementEndpoints(),
        ],
    };
}
