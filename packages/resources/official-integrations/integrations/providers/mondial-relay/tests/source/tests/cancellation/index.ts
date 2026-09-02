import { registerCancellationRequestTests } from "./requests.ts";
import { registerCancellationReconciliationTests } from "./reconciliation.ts";

export function registerCancellationTests(): void {
    registerCancellationRequestTests();
    registerCancellationReconciliationTests();
}
