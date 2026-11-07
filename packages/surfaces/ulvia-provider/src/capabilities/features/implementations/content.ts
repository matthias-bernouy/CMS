import { implementFeature } from "@bernouy/ulvia-sdk";
import { contentFeature } from "@bernouy/cms-content/feature";
import type { UlviaProviderFeatureServices } from "../../../ports/index";
export const contentImplementation = implementFeature(contentFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        const { repo, contributions, publicDelivery, contentQuery } = dependencies;
        if (!repo || !contributions || !publicDelivery) {
            throw new TypeError("Content requires repository, contribution and public delivery services");
        }
        return { repo, contributions, publicDelivery, contentQuery };
    },
    requires: [
        {
            "contractId": "ulvia/cms.installations",
            "capabilityId": "capabilities.describe",
            "versionRange": "^1.0.0",
            "optional": false,
        },
    ],
    delegation: {
        "sources": ["delivery.resolve-resource"],
        "allow": [{ "contractId": "*", "capabilityId": "*", "effect": "query", "sensitive": false }],
    },
});
