import { implementFeature } from "@bernouy/ulvia-sdk";
import { providerConnectionsFeature } from "../provider/connections/feature";
import type { UlviaProviderFeatureServices } from "../../../ports/index";

export const providerConnectionsImplementation = implementFeature(providerConnectionsFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.providerConnections) {
            throw new TypeError("Provider connections require an injected return-channel service");
        }
        return { providerConnections: dependencies.providerConnections };
    },
});
