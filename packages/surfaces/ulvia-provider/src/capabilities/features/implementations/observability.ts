import { implementFeature } from "@bernouy/ulvia-sdk";
import { observabilityFeature } from "@bernouy/cms-observability/feature";
import type { UlviaProviderFeatureServices } from "../../../ports/index";
export const observabilityImplementation = implementFeature(observabilityFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.observability) {
            throw new TypeError("Observability requires an injected observability service");
        }
        return { observability: dependencies.observability };
    },
});
