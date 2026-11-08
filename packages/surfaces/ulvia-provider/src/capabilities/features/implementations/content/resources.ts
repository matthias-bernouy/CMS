import { implementFeature } from "@bernouy/ulvia-sdk";
import { resourcesFeature } from "@bernouy/resources/feature";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";

export const resourcesImplementation = implementFeature(resourcesFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.resources) {
            throw new TypeError("Resources requires injected initialization, administrator and operation services");
        }
        return { resources: dependencies.resources };
    },
});
