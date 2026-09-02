import { registerRelayPointReadTests } from "./relay-points.ts";
import { registerShipmentCreationReadTests } from "./creation.ts";
import { registerShipmentDetailReadTests } from "./detail.ts";

export function registerShipmentReadTests(): void {
    registerRelayPointReadTests();
    registerShipmentCreationReadTests();
    registerShipmentDetailReadTests();
}
