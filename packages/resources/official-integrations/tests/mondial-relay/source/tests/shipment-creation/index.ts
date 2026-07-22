import { registerAddressSnapshotTests } from "./address-snapshots.ts";
import { registerProviderBoundaryTests } from "./provider-boundaries.ts";
import { registerShipmentReplayTests } from "./replays.ts";

export function registerShipmentCreationTests(): void {
    registerAddressSnapshotTests();
    registerProviderBoundaryTests();
    registerShipmentReplayTests();
}
