import { implementFeature } from "@bernouy/ulvia-sdk";
import { filesFeature } from "@bernouy/cms-files/feature";
import type { UlviaProviderFeatureServices } from "../../../ports/index";

export const filesImplementation = implementFeature(filesFeature, {
    services: (dependencies: UlviaProviderFeatureServices) => {
        if (!dependencies.files || !dependencies.workspace) {
            throw new TypeError("Files requires injected files and workspace services");
        }
        return { files: dependencies.files, workspace: dependencies.workspace };
    },
    requires: ["secrets.create", "secrets.get-metadata-by-name", "secrets.resolve", "secrets.rotate"].map(
        (capabilityId) => ({ contractId: "ulvia/cms.secrets", versionRange: "^1.0.0", capabilityId, optional: false }),
    ),
});
