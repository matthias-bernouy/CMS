import { implementFeature } from "@bernouy/ulvia-sdk";
import { workflowsFeature } from "@bernouy/workflows/feature";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";
export const workflowsImplementation = implementFeature(workflowsFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.workflowServices) {
            throw new TypeError("Workflows requires injected services");
        }
        return dependencies.workflowServices;
    },
    requires: [
        ...[
            "sources.resolve",
            "sources.get",
            "sources.list",
            "subscriptions.create",
            "subscriptions.get",
            "subscriptions.list",
            "subscriptions.update",
            "subscriptions.delete",
        ].map((capabilityId) => ({
            contractId: "ulvia/cms.events",
            capabilityId,
            versionRange: "^1.0.0",
            optional: false,
        })),
    ],
});
