import { deliveryCreationEndpoints } from "./creation";
import { deliveryHealthRecoveryEndpoints } from "./health-recovery";
import { deliveryQuoteEndpoints } from "./quotes";
import { deliveryReconciliationEndpoints } from "./reconciliation";
import { deliveryShipmentEndpoints } from "./shipments";
import { deliveryTrackingEndpoints } from "./tracking";

export const deliveryEndpoints = [
    ...deliveryQuoteEndpoints,
    ...deliveryCreationEndpoints,
    ...deliveryShipmentEndpoints,
    ...deliveryTrackingEndpoints,
    ...deliveryReconciliationEndpoints,
    ...deliveryHealthRecoveryEndpoints,
];
