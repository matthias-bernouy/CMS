import { implementFeature } from "@bernouy/ulvia-sdk";
import { hostingFeature } from "@bernouy/hosting/feature";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";

export const hostingImplementation = implementFeature(hostingFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.hosting) {
            throw new TypeError("Hosting requires injected Control authority, instance and domain services");
        }
        return { hosting: dependencies.hosting };
    },
});
