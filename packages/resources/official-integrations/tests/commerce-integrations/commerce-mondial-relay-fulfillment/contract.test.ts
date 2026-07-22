import { describe } from "bun:test";
import { registerInstallationTests } from "./workflow-contract/installation";
import { registerOperationTests } from "./workflow-contract/operations";
import { registerReconciliationTests } from "./workflow-contract/reconciliation";
import { registerClaimReturnTests } from "./workflow-contract/returns";
import { registerShipmentTests } from "./workflow-contract/shipments";

describe("commerce-mondial-relay-fulfillment 1.0.0", () => {
    registerInstallationTests();
    registerShipmentTests();
    registerOperationTests();
    registerReconciliationTests();
    registerClaimReturnTests();
});
