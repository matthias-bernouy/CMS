import { registerShipmentAuthorizationTests } from "./authorization";
import { registerShipmentCreationTests } from "./creation";
import { registerShipmentProjectionTests } from "./projections";

export function registerShipmentTests(): void {
    registerShipmentProjectionTests();
    registerShipmentCreationTests();
    registerShipmentAuthorizationTests();
}
