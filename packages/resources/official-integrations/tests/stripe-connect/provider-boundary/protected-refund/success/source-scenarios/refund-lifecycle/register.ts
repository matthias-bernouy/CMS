import type { CreateProtectedRefundSourceHarness } from "../harness";
import { registerNonterminalRefundScenario } from "./nonterminal.contracts";
import { registerPartialRefundReleaseScenario } from "./partial-release.contracts";
import { registerPendingRefundScenario } from "./pending.contracts";

export function registerRefundLifecycleSourceScenarios(createHarness: CreateProtectedRefundSourceHarness): void {
    registerPartialRefundReleaseScenario(createHarness);
    registerPendingRefundScenario(createHarness);
    registerNonterminalRefundScenario(createHarness);
}
