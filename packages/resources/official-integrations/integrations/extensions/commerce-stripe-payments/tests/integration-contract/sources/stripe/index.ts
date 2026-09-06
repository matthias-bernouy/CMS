import { makeEndpointUrn, makeSourceUrn, type Source } from "@bernouy/cms-sources";
import { stripeAccountEndpoints } from "./accounts";
import { stripePaymentEndpoints } from "./payments/index";
import { stripeReconciliationEndpoints } from "./reconciliation";
import { stripeSettlementEndpoints } from "./settlement";

export function stripeSource(): Source {
    return {
        urn: makeSourceUrn("stripe-connect"),
        identityAuthority: "stripe-connect",
        endpoints: [
            {
                urn: makeEndpointUrn("stripe-connect", "getProviderConfiguration"),
                method: "GET",
                targetUrl: "https://stripe.test/configuration",
                output: [
                    {
                        status: "200",
                        body: { type: "object", properties: { sellerPayoutSchedule: { type: "string" } } },
                    },
                ],
            },
            ...stripeAccountEndpoints(),
            ...stripePaymentEndpoints(),
            ...stripeReconciliationEndpoints(),
            ...stripeSettlementEndpoints(),
        ],
    };
}
