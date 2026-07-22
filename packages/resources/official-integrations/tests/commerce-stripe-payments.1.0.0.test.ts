import { describe, test } from "bun:test";
import { runIntegrationContract } from "./commerce-stripe-payments/integration-contract/scenario";

describe("commerce-stripe-payments 1.0.0", () => {
    test("imports and creates a payment from trusted order data with the canonical CMS seller identity", async () => {
        await runIntegrationContract();
    });
});
