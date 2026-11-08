import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { defineCapability, resourceBindings } from "./policy";
import { initializationApplyErrors } from "resources/application/schemas/common";
import { initializationApplySchema, initializationStatusSchema } from "resources/application/schemas/status";
import {
    authorizeResourceInitialization,
    resourceAdministrator,
    resourceInitialization,
    resourceExecutionGuard,
} from "resources/application/core/authority";
import { resourceStatus } from "resources/application/core/status";
export const initializationApply = defineCapability({
    id: "initialization.apply",
    access: "admin",
    description: "Apply or resume the exact reviewed resource copy after explicit browser-authority acknowledgement.",
    behavior: { effect: "command", execution: "operation", idempotency: "keyed", sensitive: true },
    input: initializationApplySchema,
    output: initializationStatusSchema,
    errors: initializationApplyErrors,
    bindings: resourceBindings("apply"),
    docs: ["initialization.md"],
    authorize: authorizeResourceInitialization,
    execute: async ({ services, context, input }) => {
        const actorId = await resourceAdministrator(services, context);
        const state = await resourceInitialization(services, context).apply(
            actorId,
            parseStrictJson(input.reviewJson, 1048576, 64),
            input.browserRiskAcknowledgement,
            resourceExecutionGuard(context),
        );
        return resourceStatus(state, false, { operationId: "", operationStatus: "none", errorMessage: "" });
    },
});
