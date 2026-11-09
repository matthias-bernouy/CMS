import { implementFeature } from "@bernouy/ulvia-sdk";
import { authoringFeature } from "@bernouy/repository/features/authoring";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";
export const authoringImplementation = implementFeature(authoringFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.authoring) {
            throw new TypeError("Authoring requires an injected authoring service");
        }
        return {
            authoring: dependencies.authoring,
            authoringOperations: dependencies.authoringOperations,
            authoringAuthority: dependencies.authoringAuthority,
        };
    },
});
