import type { Source } from "@bernouy/cms-sources";
import { stripePaymentControlEndpoints } from "./controls";
import { stripePaymentLifecycleEndpoints } from "./lifecycle";

export function stripePaymentEndpoints(): Source["endpoints"] {
    return [...stripePaymentLifecycleEndpoints(), ...stripePaymentControlEndpoints()];
}
