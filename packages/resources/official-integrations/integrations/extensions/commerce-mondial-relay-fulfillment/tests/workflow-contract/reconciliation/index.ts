import { registerProjectionBatchTests } from "./batch";
import { registerReconciliationForwardingTests } from "./forwarding";
import { registerPendingProjectionTests } from "./pending";
import { registerPoisonProjectionTests } from "./poison";

export function registerReconciliationTests(): void {
    registerReconciliationForwardingTests();
    registerPendingProjectionTests();
    registerProjectionBatchTests();
    registerPoisonProjectionTests();
}
