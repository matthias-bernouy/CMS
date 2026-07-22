import { describe } from "bun:test";
import { registerInstallationTests } from "./commerce-mondial-relay-fulfillment/workflow-contract/installation";
import { registerOperationTests } from "./commerce-mondial-relay-fulfillment/workflow-contract/operations";
import { registerReconciliationTests } from "./commerce-mondial-relay-fulfillment/workflow-contract/reconciliation";
import { registerClaimReturnTests } from "./commerce-mondial-relay-fulfillment/workflow-contract/returns";
import { registerShipmentTests } from "./commerce-mondial-relay-fulfillment/workflow-contract/shipments";

describe("commerce-mondial-relay-fulfillment 1.0.0", () => {
    registerInstallationTests();
    registerShipmentTests();
    registerOperationTests();
    registerReconciliationTests();
    registerClaimReturnTests();
});
