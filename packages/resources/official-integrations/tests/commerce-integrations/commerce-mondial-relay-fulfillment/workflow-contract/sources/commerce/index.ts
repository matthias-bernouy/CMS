import { commerceAuthorizationEndpoints } from "./authorization";
import { commerceClaimEndpoints } from "./claims";
import { commerceContextEndpoints } from "./contexts";
import { commerceHealthRecoveryEndpoints } from "./health-recovery";
import { commerceShipmentCancellationEndpoints } from "./shipment-cancellation";
import { commerceShipmentCreationEndpoints } from "./shipment-creation";

export const commerceEndpoints = [
    ...commerceContextEndpoints,
    ...commerceAuthorizationEndpoints,
    ...commerceShipmentCreationEndpoints,
    ...commerceShipmentCancellationEndpoints,
    ...commerceHealthRecoveryEndpoints,
    ...commerceClaimEndpoints,
];
