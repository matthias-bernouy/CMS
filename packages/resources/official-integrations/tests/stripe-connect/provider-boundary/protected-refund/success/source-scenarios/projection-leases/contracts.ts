import { test } from "bun:test";
import type { CreateProtectedRefundSourceHarness } from "../harness";
import { verifyProjectionLeaseRecovery } from "./leasing";
import { verifyPoisonProjectionRecovery } from "./poison";

export function registerProjectionLeaseScenario(createHarness: CreateProtectedRefundSourceHarness): void {
    test("leases every provider projection durably without starvation or poison blocking", async () => {
        const { harness, paymentId } = await verifyProjectionLeaseRecovery(createHarness);
        await verifyPoisonProjectionRecovery(harness, paymentId);
    });
}
