import { implementFeature } from "@bernouy/ulvia-sdk";
import { repositoryFeature } from "@bernouy/repository/features/repository";
import type { UlviaProviderFeatureServices } from "../../../../ports/index";

export const repositoryImplementation = implementFeature(repositoryFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        const { repository, resolveRepositoryAccount } = dependencies;
        if (!repository || !resolveRepositoryAccount) {
            throw new TypeError("Repository requires injected domain services and an authenticated account resolver");
        }
        return { repository, resolveRepositoryAccount };
    },
});
