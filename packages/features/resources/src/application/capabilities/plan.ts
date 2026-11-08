import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { defineCapability, resourceBindings } from "./policy";
import { initializationErrors } from "resources/application/schemas/common";
import { initializationPlanSchema, initializationReviewSchema } from "resources/application/schemas/status";
import { resourceInitialization, resourceAdministrator } from "resources/application/core/authority";
export const initializationPlan = defineCapability({
    id: "initialization.plan",
    access: "admin",
    description: "Review an empty start or the locally configured base resource ZIP without live writes.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: initializationPlanSchema,
    output: initializationReviewSchema,
    errors: initializationErrors,
    bindings: resourceBindings("plan"),
    docs: ["initialization.md"],
    execute: async ({ services, context, input }) => {
        const actorId = await resourceAdministrator(services, context);
        const review = await resourceInitialization(services, context).plan(
            actorId,
            input.choice,
            input.locale,
            context.signal,
        );
        return { planDigest: review.digest, reviewJson: canonicalizeIJson(review) };
    },
});
