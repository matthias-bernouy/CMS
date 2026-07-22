import { registerRecoveryAuthorizationTests } from "./authorization";
import { registerShipmentCancellationOperationTests } from "./cancellation";
import { registerDeliveryHealthTests } from "./health";
import { registerUnknownShipmentRecoveryTests } from "./recovery";
import { registerShipmentCreationOperationTests } from "./shipment-creation";

export function registerOperationTests(): void {
    registerShipmentCreationOperationTests();
    registerShipmentCancellationOperationTests();
    registerDeliveryHealthTests();
    registerUnknownShipmentRecoveryTests();
    registerRecoveryAuthorizationTests();
}
