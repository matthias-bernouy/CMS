import { implementFeature } from "@bernouy/ulvia-sdk";
import { routingFeature } from "@bernouy/hosting/routing";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";

export const routingImplementation = implementFeature(routingFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.routing) {
            throw new TypeError("Routing requires an injected host routing authority");
        }
        return { routing: dependencies.routing };
    },
});
