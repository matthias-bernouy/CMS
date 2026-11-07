import { defineCapability } from "cms-content/application/capabilities/define";
import {
    deliveryResolveResourceInputSchema,
    deliveryResolveResourceOutputSchema,
} from "cms-content/application/schemas/delivery";
import { deliveryResolveResourceErrors as errors } from "cms-content/application/schemas/errors";
import { resourceResponse } from "@bernouy/ulvia-sdk";
import { resolveDelivery, deliveryCacheTags } from "cms-content/application/core/capabilities/delivery";
export const deliveryResolveResource = defineCapability({
    id: "delivery.resolve-resource",
    description:
        "Resolve a bounded public path as a streamed HTTP resource. Representation headers are carried through the common request context, outside business input.",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/delivery/resolve-resource",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/octet-stream"],
                errorStatuses: { INVALID_INPUT: 422, FORBIDDEN: 403, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: deliveryResolveResourceInputSchema,
    output: deliveryResolveResourceOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        const response = await resolveDelivery(input, context, services);
        return resourceResponse(response, {
            vary: ["accept", "accept-language"],
            cacheTags: deliveryCacheTags(response),
        });
    },
});
