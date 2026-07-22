import { test } from "bun:test";
import type { StripeConnectHarness } from "../../../runtime/harness";
import { createProviderBoundaryPayment } from "./creation";
import { verifyProviderDetailBoundary } from "./detail";
import { verifyProviderListBoundary } from "./list";

export function registerProviderBoundarySourceScenario(createHarness: () => Promise<StripeConnectHarness>): void {
    test("keeps payment creation and admin payment reads on their provider boundaries", async () => {
        const { harness, created, transferGroup } = await createProviderBoundaryPayment(createHarness);
        await verifyProviderListBoundary(harness, created, transferGroup);
        await verifyProviderDetailBoundary(harness, created, transferGroup);
    });
}
