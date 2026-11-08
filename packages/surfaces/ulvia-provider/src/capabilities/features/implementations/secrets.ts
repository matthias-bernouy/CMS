import { implementFeature } from "@bernouy/ulvia-sdk";
import { secretsFeature } from "@bernouy/secrets/feature";
import type { UlviaProviderFeatureServices } from "../../../ports/index";

export const secretsImplementation = implementFeature(secretsFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.secrets) {
            throw new TypeError("Secrets requires an injected secrets service");
        }
        return { secrets: dependencies.secrets };
    },
});
