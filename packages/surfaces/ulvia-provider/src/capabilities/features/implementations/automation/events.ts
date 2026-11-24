import { implementFeature } from "@bernouy/ulvia-sdk";
import { eventsFeature } from "@bernouy/cms-events/feature";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";
export const eventsImplementation = implementFeature(eventsFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.eventServices) {
            throw new TypeError("Events requires injected services");
        }
        return dependencies.eventServices;
    },
});
