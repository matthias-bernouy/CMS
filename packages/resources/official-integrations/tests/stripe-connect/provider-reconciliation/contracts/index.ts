import { describe } from "bun:test";
import type { CreateProviderReconciliationHarness } from "../harness";
import { registerTerminalPageContract } from "./terminal-page.contract";
import { registerTerminalReplayContracts } from "./terminal-replay.contracts";

export function registerProviderReconciliationContracts(createHarness: CreateProviderReconciliationHarness): void {
    describe("stripe-connect provider reconciliation response contracts", () => {
        registerTerminalPageContract(createHarness);
        registerTerminalReplayContracts(createHarness);
    });
}
