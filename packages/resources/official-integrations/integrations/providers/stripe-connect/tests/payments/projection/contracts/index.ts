import { describe } from "bun:test";
import type { CreatePaymentProjectionHarness } from "../harness";
import { registerProjectionQuarantineContract } from "./quarantine.contract";
import { registerSuccessfulProjectionContracts } from "./successful.contracts";

export function registerPaymentProjectionContracts(createHarness: CreatePaymentProjectionHarness): void {
    describe("stripe-connect payment provider projection contracts", () => {
        registerSuccessfulProjectionContracts(createHarness);
        registerProjectionQuarantineContract(createHarness);
    });
}
